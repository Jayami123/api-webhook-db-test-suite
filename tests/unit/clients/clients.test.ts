import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import type { APIRequestContext } from "@playwright/test";
import { clearSecretsForTests, SecretString } from "../../../src/auth/secret.ts";
import type { CalAuth } from "../../../src/auth/cal.ts";
import type { DocumensoAuth } from "../../../src/auth/documenso.ts";
import type { MedusaAuth } from "../../../src/auth/medusa.ts";
import type { TwentyAuth } from "../../../src/auth/twenty.ts";
import {
  ApiError,
  createCaller,
  RUN_ID_HEADER,
  type ApiRequestLike,
} from "../../../src/clients/base.ts";
import { calClient } from "../../../src/clients/cal.ts";
import { documensoClient } from "../../../src/clients/documenso.ts";
import { medusaClient } from "../../../src/clients/medusa.ts";
import { twentyClient } from "../../../src/clients/twenty.ts";
import config from "../../../playwright.config.ts";

afterEach(() => {
  clearSecretsForTests();
});

const RUN = "p2-qa-20261101t090000z-0a1b2c3d";
type FetchOptions = NonNullable<Parameters<ApiRequestLike["fetch"]>[1]>;
interface Seen {
  url: string;
  options: FetchOptions;
}

function fake(status: number, body: unknown): { request: ApiRequestLike; seen: Seen[] } {
  const seen: Seen[] = [];
  return {
    seen,
    request: {
      fetch: (url, options = {}) => {
        seen.push({ url, options });
        return Promise.resolve({
          status: () => status,
          headers: () => ({ "content-type": "application/json" }),
          text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
        });
      },
    },
  };
}

// Compile-time: a real Playwright APIRequestContext is accepted wherever ApiRequestLike is.
const assignable = (context: APIRequestContext): ApiRequestLike => context;

function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  assert.ok(item !== undefined, `item ${String(index)} exists`);
  return item;
}

test("a real Playwright APIRequestContext satisfies the structural request type", () => {
  assert.equal(typeof assignable, "function");
});

describe("createCaller", () => {
  // Built per test: afterEach clears the secret registry, so a shared instance would be forgotten.
  const mkAuth = (): { headerName: string; headerValue: SecretString } => ({
    headerName: "authorization",
    headerValue: new SecretString("Bearer s3cr3t-token-value"),
  });

  test("adds the run id, accept and auth headers, never follows redirects and never throws on status by itself", async () => {
    const { request, seen } = fake(200, { ok: true });
    const call = createCaller({ request, baseUrl: "http://x", runPrefix: RUN, auth: mkAuth() });
    const res = await call("GET", "/p");
    assert.deepEqual(res.body, { ok: true });
    const options = nth(seen, 0).options;
    assert.equal(nth(seen, 0).url, "http://x/p");
    assert.deepEqual(options.headers, {
      accept: "application/json",
      [RUN_ID_HEADER]: RUN,
      authorization: "Bearer s3cr3t-token-value",
    });
    assert.equal(options.maxRedirects, 0);
    assert.equal(options.failOnStatusCode, false);
  });

  test("JSON bodies get a content type; raw bodies are sent byte for byte", async () => {
    const { request, seen } = fake(201, {});
    const call = createCaller({ request, baseUrl: "http://x", runPrefix: RUN });
    await call("POST", "/j", { body: { a: 1 } });
    await call("POST", "/r", { rawBody: Buffer.from([0x7b, 0xff]) });
    assert.equal(nth(seen, 0).options.headers?.["content-type"], "application/json");
    assert.equal(nth(seen, 0).options.data, '{"a":1}');
    assert.ok(
      Buffer.isBuffer(nth(seen, 1).options.data) &&
        (nth(seen, 1).options.data as Buffer).equals(Buffer.from([0x7b, 0xff])),
    );
  });

  test("an unexpected status is an ApiError whose text is truncated and scrubbed of the token", async () => {
    const { request } = fake(500, `boom ${"x".repeat(300)} s3cr3t-token-value`);
    const call = createCaller({ request, baseUrl: "http://x", runPrefix: RUN, auth: mkAuth() });
    await assert.rejects(
      call("GET", "/p"),
      (e: unknown) =>
        e instanceof ApiError &&
        e.status === 500 &&
        !e.message.includes("s3cr3t-token-value") &&
        e.message.length < 260,
    );
    const secretInBody = fake(401, "Bearer s3cr3t-token-value rejected");
    await assert.rejects(
      createCaller({
        request: secretInBody.request,
        baseUrl: "http://x",
        runPrefix: RUN,
        auth: mkAuth(),
      })("GET", "/p"),
      (e: unknown) =>
        e instanceof Error && e.message.includes("<redacted>") && !e.message.includes("s3cr3t"),
    );
  });

  test("expect widens the accepted statuses; a non-JSON body is returned as text", async () => {
    const { request } = fake(404, "plain text");
    const res = await createCaller({ request, baseUrl: "http://x", runPrefix: RUN })("GET", "/p", {
      expect: [404],
    });
    assert.equal(res.body, "plain text");
  });
});

describe("product clients", () => {
  const secret = (v: string): SecretString => new SecretString(v);

  test("medusa: store calls carry the publishable key, admin calls the Basic header, the hook is anonymous", async () => {
    const auth = {
      product: "medusa",
      headerName: "authorization",
      headerValue: secret("Basic abc123def456"),
      publishableKey: secret("pk_0123456789"),
      label: "l",
    } as unknown as MedusaAuth;
    const { request, seen } = fake(200, { cart: { id: "cart_1" }, regions: [] });
    const med = medusaClient({ request, baseUrl: "http://m", runPrefix: RUN, auth });
    await med.admin.regions();
    assert.equal(await med.store.createCart("reg_1", "e@x.y"), "cart_1");
    await med.hooks.payment("stripe_stripe", '{"a": 1}', { "stripe-signature": "t=1,v1=ab" });
    assert.equal(nth(seen, 0).options.headers?.["authorization"], "Basic abc123def456");
    assert.equal(nth(seen, 1).options.headers?.["x-publishable-api-key"], "pk_0123456789");
    assert.equal(nth(seen, 2).url, "http://m/hooks/payment/stripe_stripe");
    assert.equal(nth(seen, 2).options.headers?.["authorization"], undefined);
    assert.equal(nth(seen, 2).options.data, '{"a": 1}', "the signed bytes are not re-serialised");
  });

  test("twenty: REST calls use the bearer; people and webhooks round-trip ids", async () => {
    const auth = {
      product: "twenty",
      headerName: "authorization",
      headerValue: secret("Bearer jwt-0123456789"),
      label: "l",
    } as unknown as TwentyAuth;
    const { request, seen } = fake(201, { id: "wh-1", data: { createPerson: { id: "p-1" } } });
    const tw = twentyClient({ request, baseUrl: "http://t", runPrefix: RUN, auth });
    assert.equal(await tw.people.create(`${RUN}-a`), "p-1");
    assert.equal(
      await tw.webhooks.create({
        targetUrl: "http://g/r",
        operations: ["person.created"],
        secret: "s",
        description: "d",
      }),
      "wh-1",
    );
    assert.equal(nth(seen, 0).options.headers?.["authorization"], "Bearer jwt-0123456789");
    assert.deepEqual(JSON.parse(String(nth(seen, 0).options.data)), {
      name: { firstName: `${RUN}-a`, lastName: "Qa" },
    });
  });

  test("documenso: envelopes use the token, tRPC calls the session cookie and team header", async () => {
    const auth = {
      product: "documenso",
      headerName: "authorization",
      headerValue: secret("api_0123456789abcdef"),
      sessionCookie: secret("sessionId=abc"),
      teamId: 3,
      label: "l",
    } as unknown as DocumensoAuth;
    const { request, seen } = fake(200, {
      id: "envelope_1",
      result: { data: { json: { id: "wh_1" } } },
    });
    const doc = documensoClient({ request, baseUrl: "http://d", runPrefix: RUN, auth });
    assert.equal(
      await doc.envelopes.create({
        title: `${RUN}-e`,
        pdf: Buffer.from("%PDF"),
        recipients: [{ email: "a@b.c", name: "A" }],
      }),
      "envelope_1",
    );
    assert.equal(
      await doc.webhooks.create({
        webhookUrl: "http://h/r",
        eventTriggers: ["DOCUMENT_CREATED"],
        secret: "s",
      }),
      "wh_1",
    );
    assert.equal(nth(seen, 0).options.headers?.["authorization"], "api_0123456789abcdef");
    const multipart = nth(seen, 0).options.multipart;
    assert.ok(multipart !== undefined && "files" in multipart);
    assert.equal(nth(seen, 1).options.headers?.["cookie"], "sessionId=abc");
    assert.equal(nth(seen, 1).options.headers?.["x-team-id"], "3");
    assert.deepEqual(JSON.parse(String(nth(seen, 1).options.data)), {
      json: {
        webhookUrl: "http://h/r",
        eventTriggers: ["DOCUMENT_CREATED"],
        secret: "s",
        enabled: true,
      },
    });
  });

  test("cal: webhook CRUD uses the session cookie; the cron call sends the key without Bearer and accepts 401", async () => {
    const auth = {
      product: "cal",
      headerName: "authorization",
      headerValue: secret("Bearer cal_0123456789"),
      sessionCookie: secret("next-auth.session-token=s"),
      label: "l",
    } as unknown as CalAuth;
    const { request, seen } = fake(200, [{ result: { data: { json: { id: "w1" } } } }]);
    const cal = calClient({ request, baseUrl: "http://c", runPrefix: RUN, auth });
    assert.equal(
      await cal.webhooks.create({
        subscriberUrl: "http://r/r",
        eventTriggers: ["BOOKING_CREATED"],
        secret: "s",
      }),
      "w1",
    );
    await cal.cronWebhookTriggers("cron-key-value");
    assert.equal(nth(seen, 0).url, "http://c/api/trpc/webhook/create?batch=1");
    assert.equal(nth(seen, 0).options.headers?.["cookie"], "next-auth.session-token=s");
    assert.equal(nth(seen, 1).options.headers?.["authorization"], "cron-key-value");
    assert.equal(nth(seen, 1).options.method, "POST");
  });
});

describe("secrets never reach traces or reports", () => {
  test("the API projects run with tracing off, because a trace records request headers", () => {
    assert.equal(config.use?.trace, "off");
    assert.equal(config.use.screenshot, undefined);
    assert.equal(config.use.video, undefined);
  });

  test("every error a client can raise is scrubbed of the credential it sent", async () => {
    const auth = {
      headerName: "authorization",
      headerValue: new SecretString("Basic zzzz-secret-zzzz"),
    };
    const { request } = fake(403, '{"echo":"Basic zzzz-secret-zzzz"}');
    const call = createCaller({ request, baseUrl: "http://x", runPrefix: RUN, auth });
    await assert.rejects(
      call("GET", "/p"),
      (e: unknown) =>
        !JSON.stringify(e, Object.getOwnPropertyNames(e)).includes("zzzz-secret-zzzz"),
    );
  });
});
