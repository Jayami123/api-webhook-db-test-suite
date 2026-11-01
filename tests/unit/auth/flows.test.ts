import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { loadAuthEnv } from "../../../src/auth/env.ts";
import { mintCal } from "../../../src/auth/cal.ts";
import { mintDocumenso } from "../../../src/auth/documenso.ts";
import {
  AuthError,
  CookieJar,
  type HttpPort,
  type HttpRequest,
  type HttpResponse,
} from "../../../src/auth/http.ts";
import { mintMedusa } from "../../../src/auth/medusa.ts";
import { clearSecretsForTests } from "../../../src/auth/secret.ts";
import { mintTwenty } from "../../../src/auth/twenty.ts";

afterEach(() => {
  clearSecretsForTests();
});

const RUN = "p2-qa-20261101t090000z-0a1b2c3d";
const name = (label: string): string => `${RUN}-${label}`;
const reply = (status: number, body: unknown, setCookies: string[] = []): HttpResponse => ({
  status,
  headers: {},
  setCookies,
  text: typeof body === "string" ? body : JSON.stringify(body),
});

/** Records every request and answers from `route(request)` (first matching string key wins). */
function port(route: (r: HttpRequest) => HttpResponse): { http: HttpPort; calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];
  return {
    calls,
    http: (r) => {
      calls.push(r);
      return Promise.resolve(route(r));
    },
  };
}
const where = (r: HttpRequest): string => `${r.method} ${new URL(r.url).pathname}`;

describe("auth env", () => {
  test("defaults are the public seed accounts; Medusa admin has none", () => {
    const env = loadAuthEnv({});
    assert.deepEqual(
      [env.P2_DOC_USER_EMAIL, env.P2_CAL_USER_EMAIL, env.TWENTY_EMAIL],
      ["example@documenso.com", "pro@example.com", "jane.austen@apple.dev"],
    );
    assert.equal(env.MEDUSA_ADMIN_EMAIL, undefined);
    assert.equal(loadAuthEnv({ P2_CAL_USER_EMAIL: "  " }).P2_CAL_USER_EMAIL, "pro@example.com");
  });
});

describe("medusa mint and revoke", () => {
  const route =
    (revokedKeys: Set<string>) =>
    (r: HttpRequest): HttpResponse => {
      const key = where(r);
      if (key === "POST /auth/user/emailpass")
        return reply(200, { token: "jwt-token-value-123456" });
      if (key === "POST /admin/api-keys") {
        const body = JSON.parse(r.body ?? "{}") as { type: string };
        return reply(200, {
          api_key: { id: `apk_${body.type}`, token: `${body.type}-key-token-123456` },
        });
      }
      if (/^POST \/admin\/api-keys\/apk_\w+\/revoke$/.test(key)) {
        revokedKeys.add(key.split("/")[3] ?? "");
        return reply(200, { api_key: {} });
      }
      if (/^DELETE \/admin\/api-keys\/apk_\w+$/.test(key)) return reply(200, { deleted: true });
      if (key === "GET /admin/sales-channels") {
        return reply(200, {
          sales_channels: [
            { id: "sc_other", name: "Other" },
            { id: "sc_default", name: "Default Sales Channel" },
          ],
        });
      }
      if (key === "POST /admin/api-keys/apk_publishable/sales-channels")
        return reply(200, { api_key: {} });
      if (key === "GET /admin/regions") return reply(revokedKeys.has("apk_secret") ? 401 : 200, {});
      return reply(404, "no route");
    };

  test("logs in, creates a run-scoped secret and publishable key, uses Basic auth with the secret key", async () => {
    const { http, calls } = port(route(new Set()));
    const auth = await mintMedusa({
      baseUrl: "http://m",
      email: "a@b.c",
      password: "pw-pw-pw-pw",
      name,
      http,
    });
    assert.deepEqual(calls.map(where), [
      "POST /auth/user/emailpass",
      "POST /admin/api-keys",
      "POST /admin/api-keys",
      "GET /admin/sales-channels",
      "POST /admin/api-keys/apk_publishable/sales-channels",
    ]);
    assert.deepEqual(
      calls.slice(1, 3).map((c) => JSON.parse(c.body ?? "{}") as unknown),
      [
        { title: `${RUN}-admin-key`, type: "secret" },
        { title: `${RUN}-store-key`, type: "publishable" },
      ],
    );
    assert.deepEqual(JSON.parse(calls[4]?.body ?? "{}"), { add: ["sc_default"] });
    assert.deepEqual(auth.titles, [`${RUN}-admin-key`, `${RUN}-store-key`]);
    assert.equal(
      auth.headerValue.reveal(),
      `Basic ${Buffer.from("secret-key-token-123456:").toString("base64")}`,
    );
    assert.equal(auth.publishableKey.reveal(), "publishable-key-token-123456");
    assert.equal(auth.label, `${RUN}-admin-key`);
    assert.ok(await auth.isAccepted());
  });

  test("revoke revokes then deletes both keys, once, and the product then rejects the key", async () => {
    const { http, calls } = port(route(new Set()));
    const auth = await mintMedusa({
      baseUrl: "http://m",
      email: "a@b.c",
      password: "pw-pw-pw-pw",
      name,
      http,
    });
    calls.length = 0;
    await auth.revoke();
    await auth.revoke();
    assert.deepEqual(calls.map(where), [
      "POST /admin/api-keys/apk_secret/revoke",
      "DELETE /admin/api-keys/apk_secret",
      "POST /admin/api-keys/apk_publishable/revoke",
      "DELETE /admin/api-keys/apk_publishable",
    ]);
    assert.equal(await auth.isAccepted(), false);
  });

  test("a failed login throws an AuthError without the password", async () => {
    const { http } = port(() => reply(401, { message: "bad pw-pw-pw-pw" }));
    await assert.rejects(
      mintMedusa({ baseUrl: "http://m", email: "a@b.c", password: "pw-pw-pw-pw", name, http }),
      (e: unknown) =>
        e instanceof AuthError && e.status === 401 && !e.message.includes("pw-pw-pw-pw"),
    );
  });

  test("if the second key cannot be created the first one is revoked again", async () => {
    let created = 0;
    const revoked = new Set<string>();
    const base = route(revoked);
    const { http, calls } = port((r) => {
      if (where(r) === "POST /admin/api-keys" && (created += 1) === 2) return reply(500, "nope");
      return base(r);
    });
    await assert.rejects(
      mintMedusa({ baseUrl: "http://m", email: "a@b.c", password: "pw-pw-pw-pw", name, http }),
      /medusa create publishable key/,
    );
    assert.ok(calls.map(where).includes("DELETE /admin/api-keys/apk_secret"));
  });
});

describe("twenty mint and revoke", () => {
  function twentyRoute(state: { revoked: boolean; logins: number; failFirstRevoke?: boolean }) {
    return (r: HttpRequest): HttpResponse => {
      const key = where(r);
      if (key === "GET /rest/people")
        return state.revoked
          ? reply(403, { messages: ["This API Key is revoked"] })
          : reply(200, {});
      const query = (JSON.parse(r.body ?? "{}") as { query: string }).query;
      if (query.includes("signIn")) {
        state.logins += 1;
        return reply(200, {
          data: {
            signIn: {
              availableWorkspaces: {
                availableWorkspacesForSignIn: [
                  {
                    loginToken: "login-token-1",
                    workspaceUrls: { subdomainUrl: "http://127.0.0.1:3002/" },
                  },
                ],
              },
            },
          },
        });
      }
      if (query.includes("getAuthTokensFromLoginToken"))
        return reply(200, {
          data: {
            getAuthTokensFromLoginToken: {
              tokens: {
                accessOrWorkspaceAgnosticToken: {
                  token: `access-token-${String(state.logins)}-value`,
                },
              },
            },
          },
        });
      if (query.includes("getRoles"))
        return reply(200, {
          data: {
            getRoles: [
              { id: "r-member", label: "Member" },
              { id: "r-admin", label: "Admin" },
            ],
          },
        });
      if (query.includes("createApiKey"))
        return reply(200, { data: { createApiKey: { id: "key-1" } } });
      if (query.includes("generateApiKeyToken"))
        return reply(200, { data: { generateApiKeyToken: { token: "api-key-jwt-value-123" } } });
      if (query.includes("revokeApiKey")) {
        if (state.failFirstRevoke) {
          state.failFirstRevoke = false;
          return reply(200, { errors: [{ message: "token expired" }] });
        }
        state.revoked = true;
        return reply(200, { data: { revokeApiKey: { id: "key-1" } } });
      }
      return reply(404, "no route");
    };
  }
  const mint = (state: { revoked: boolean; logins: number; failFirstRevoke?: boolean }) => {
    const { http, calls } = port(twentyRoute(state));
    return {
      calls,
      promise: mintTwenty({
        baseUrl: "http://t",
        email: "jane@x.dev",
        password: "pw-pw-pw-pw",
        name,
        http,
        now: () => new Date("2026-11-01T09:00:00.000Z"),
        ttlMs: 3_600_000,
      }),
    };
  };

  test("signs in through the workspace loginToken, picks the Admin role and mints a bearer", async () => {
    const state = { revoked: false, logins: 0 };
    const { calls, promise } = mint(state);
    const auth = await promise;
    const bodies = calls
      .filter((c) => c.method === "POST")
      .map(
        (c) => JSON.parse(c.body ?? "{}") as { query: string; variables: Record<string, unknown> },
      );
    assert.deepEqual(
      bodies.map(
        (b) =>
          b.query.match(
            /(signIn|getAuthTokensFromLoginToken|getRoles|createApiKey|generateApiKeyToken)/,
          )?.[1],
      ),
      ["signIn", "getAuthTokensFromLoginToken", "getRoles", "createApiKey", "generateApiKeyToken"],
    );
    assert.deepEqual(bodies[3]?.variables, {
      i: { name: `${RUN}-tw-key`, expiresAt: "2026-11-01T10:00:00.000Z", roleId: "r-admin" },
    });
    assert.equal(calls[1]?.headers?.["authorization"], undefined, "signIn is anonymous");
    assert.equal(calls[3]?.headers?.["authorization"], "Bearer access-token-1-value");
    assert.equal(auth.headerValue.reveal(), "Bearer api-key-jwt-value-123");
    assert.ok(await auth.isAccepted());
  });

  test("revoke makes the key answer 403 and is idempotent", async () => {
    const state = { revoked: false, logins: 0 };
    const auth = await mint(state).promise;
    await auth.revoke();
    await auth.revoke();
    assert.equal(await auth.isAccepted(), false);
  });

  test("revoke signs in again once when the 30-minute access token has expired", async () => {
    const state = { revoked: false, logins: 0, failFirstRevoke: true };
    const auth = await mint(state).promise;
    await auth.revoke();
    assert.equal(state.logins, 2);
    assert.equal(state.revoked, true);
  });
});

describe("documenso mint and revoke", () => {
  function route(state: { deleted: boolean }) {
    return (r: HttpRequest): HttpResponse => {
      const key = where(r);
      if (key === "GET /api/auth/csrf")
        return reply(200, { csrfToken: "csrf-1" }, ["csrfToken=csrf-1; Path=/"]);
      if (key === "POST /api/auth/email-password/authorize")
        return reply(201, {}, ["sessionId=sess-1; Path=/; HttpOnly"]);
      if (key === "POST /api/trpc/apiToken.create")
        return reply(200, { result: { data: { json: { id: 7, token: "api_0123456789abcdef" } } } });
      if (key === "POST /api/trpc/apiToken.delete") {
        state.deleted = true;
        return reply(200, { result: { data: { json: null } } });
      }
      if (key === "GET /api/v2/envelope") return reply(state.deleted ? 401 : 200, {});
      return reply(404, "no route");
    };
  }

  test("logs in with the csrf token and cookie, creates a named token for the user's team", async () => {
    const state = { deleted: false };
    const { http, calls } = port(route(state));
    const auth = await mintDocumenso({
      baseUrl: "http://d",
      email: "e@x.y",
      password: "pw-pw-pw-pw",
      name,
      teamId: () => Promise.resolve(3),
      http,
    });
    assert.deepEqual(JSON.parse(calls[1]?.body ?? "{}"), {
      email: "e@x.y",
      password: "pw-pw-pw-pw",
      csrfToken: "csrf-1",
    });
    assert.equal(calls[1]?.headers?.["cookie"], "csrfToken=csrf-1");
    assert.deepEqual(JSON.parse(calls[2]?.body ?? "{}"), {
      json: { teamId: 3, tokenName: `${RUN}-doc-token`, expirationDate: "ONE_HOUR" },
    });
    assert.equal(calls[2]?.headers?.["x-team-id"], "3");
    assert.equal(auth.headerValue.reveal(), "api_0123456789abcdef");
    assert.equal(auth.teamId, 3);
    assert.equal(auth.sessionCookie.reveal(), "csrfToken=csrf-1; sessionId=sess-1");
    assert.ok(await auth.isAccepted());
  });

  test("revoke deletes the token by id and team, and the product then answers 401", async () => {
    const state = { deleted: false };
    const { http, calls } = port(route(state));
    const auth = await mintDocumenso({
      baseUrl: "http://d",
      email: "e@x.y",
      password: "pw-pw-pw-pw",
      name,
      teamId: () => Promise.resolve(3),
      http,
    });
    await auth.revoke();
    await auth.revoke();
    assert.deepEqual(JSON.parse(calls.at(-1)?.body ?? "{}"), { json: { id: 7, teamId: 3 } });
    assert.equal(calls.filter((c) => where(c) === "POST /api/trpc/apiToken.delete").length, 1);
    assert.equal(await auth.isAccepted(), false);
  });

  test("a login without a session cookie is a failure", async () => {
    const { http } = port((r) =>
      where(r) === "GET /api/auth/csrf" ? reply(200, { csrfToken: "c" }) : reply(201, {}),
    );
    await assert.rejects(
      mintDocumenso({
        baseUrl: "http://d",
        email: "e",
        password: "pw-pw-pw-pw",
        name,
        teamId: () => Promise.resolve(1),
        http,
      }),
      /documenso authorize/,
    );
  });
});

describe("cal mint and revoke", () => {
  function route() {
    return (r: HttpRequest): HttpResponse => {
      const key = where(r);
      if (key === "GET /api/auth/csrf")
        return reply(200, { csrfToken: "csrf-1" }, ["next-auth.csrf-token=c%7Ch; Path=/"]);
      if (key === "POST /api/auth/callback/credentials")
        return reply(200, {}, ["next-auth.session-token=sess-1; Path=/; HttpOnly"]);
      if (key === "POST /api/trpc/apiKeys/create")
        return reply(200, [{ result: { data: { json: "cal_0123456789abcdef0123" } } }]);
      if (key === "POST /api/trpc/apiKeys/delete")
        return reply(200, [{ result: { data: { json: { id: "k1" } } } }]);
      return reply(404, "no route");
    };
  }

  test("logs in with the credentials form and creates a key whose note carries the run prefix", async () => {
    const { http, calls } = port(route());
    const auth = await mintCal({
      baseUrl: "http://c",
      email: "pro@example.com",
      password: "pw-pw-pw-pw",
      name,
      keyId: () => Promise.resolve("k1"),
      now: () => new Date("2026-11-01T10:00:00.000Z"),
      http,
    });
    const form = new URLSearchParams(calls[1]?.body);
    assert.deepEqual(
      [form.get("email"), form.get("json"), form.get("csrfToken")],
      ["pro@example.com", "true", "csrf-1"],
    );
    assert.deepEqual(JSON.parse(calls[2]?.body ?? "{}"), {
      0: {
        json: {
          note: `${RUN}-cal-key`,
          neverExpires: false,
          expiresAt: "2026-11-01T11:00:00.000Z",
        },
        meta: { values: { expiresAt: ["Date"] } },
      },
    });
    assert.equal(auth.headerValue.reveal(), "Bearer cal_0123456789abcdef0123");
    assert.ok(auth.sessionCookie.reveal().includes("next-auth.session-token=sess-1"));
  });

  test("revoke deletes the row found by note; isPresent follows the read-only lookup", async () => {
    const { http, calls } = port(route());
    let present: string | undefined = "k1";
    const auth = await mintCal({
      baseUrl: "http://c",
      email: "e",
      password: "pw-pw-pw-pw",
      name,
      keyId: (note) => {
        assert.equal(note, `${RUN}-cal-key`);
        return Promise.resolve(present);
      },
      http,
    });
    assert.equal(await auth.isPresent(), true);
    await auth.revoke();
    present = undefined;
    assert.equal(await auth.isPresent(), false);
    assert.deepEqual(JSON.parse(calls.at(-1)?.body ?? "{}"), { 0: { json: { id: "k1" } } });
  });

  test("a key that does not look like cal_ is refused", async () => {
    const { http } = port((r) =>
      where(r).endsWith("apiKeys/create")
        ? reply(200, [{ result: { data: { json: "oops" } } }])
        : route()(r),
    );
    await assert.rejects(
      mintCal({
        baseUrl: "http://c",
        email: "e",
        password: "pw-pw-pw-pw",
        name,
        keyId: () => Promise.resolve(undefined),
        http,
      }),
      /cal apiKeys\/create/,
    );
  });
});

describe("cookie jar", () => {
  test("keeps the latest value per cookie and ignores attributes", () => {
    const jar = new CookieJar();
    jar.absorb(["a=1; Path=/; HttpOnly", "b=2; Secure"]);
    jar.absorb(["a=3; Path=/"]);
    assert.equal(jar.header(), "a=3; b=2");
    assert.ok(jar.has("b") && !jar.has("c"));
  });
});
