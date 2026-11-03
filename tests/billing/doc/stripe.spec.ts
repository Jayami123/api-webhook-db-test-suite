import type { APIRequestContext } from "@playwright/test";
import Stripe from "stripe";
import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import {
  hasStripeKey,
  signedStripeHeaders,
  stripeWebhookSecret,
} from "../../../src/lanes/doc/stripe.ts";
import {
  assertTestModeKey,
  productStatusFor,
  subscriptionEvent,
} from "../../../src/lanes/doc/stripe-fixture.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
import { stripeTest } from "../../fixtures/doc/stripe-run.ts";

/** Stripe webhook route of the fork (apps/remix/app/routes/api+/stripe.webhook.ts). */
const WEBHOOK = "/api/stripe/webhook";

const post = (request: APIRequestContext, headers: Record<string, string>, body: string) =>
  request.fetch(`${apiBaseUrl("documenso")}${WEBHOOK}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    data: body,
    maxRedirects: 0,
    failOnStatusCode: false,
  });

/** Row counts that a refused or unsynced event must leave unchanged (qa_ro). */
async function rowCounts(): Promise<string> {
  const db = readOnlyDb("documenso");
  const rows = await db.select<{ subs: number; orgs: number }>(
    `SELECT (SELECT COUNT(*) FROM "Subscription")::int AS subs, (SELECT COUNT(*) FROM "Organisation")::int AS orgs`,
  );
  return JSON.stringify(rows);
}

const eventBody = (type: string, customer: string | null): string =>
  JSON.stringify({
    id: `evt_p2_${currentRunPrefix()}`,
    object: "event",
    type,
    data: { object: { id: "obj_p2", object: "subscription", customer } },
  });

test("P2-DOC-STR-001 an unsigned Stripe event is refused with 400", async ({ request }) => {
  const res = await post(
    request,
    {},
    eventBody("customer.subscription.updated", "cus_p2_unsigned"),
  );
  expect(res.status()).toBe(400);
  expect(await res.text()).toContain("No signature found in request");
});

test("P2-DOC-STR-001 a bad or stale signature is refused with a non-2xx and changes no rows", async ({
  request,
}) => {
  const before = await rowCounts();
  const body = eventBody("charge.succeeded", "cus_p2_stale");
  const now = Math.floor(Date.now() / 1000);
  const stale = signedStripeHeaders(stripeWebhookSecret(process.env), body, now - 600); // outside the 300 s tolerance
  const res = await post(request, stale, body);
  expect(res.status()).toBeGreaterThanOrEqual(400); // OD-5: the catch-all answers 500 (P-DOC-7)
  expect(await rowCounts()).toBe(before);
});

test("P2-DOC-STR-001 a correctly signed event that is not synced is accepted (200) and changes no rows", async ({
  request,
}) => {
  const before = await rowCounts();
  // A type outside the product's SYNCED_EVENT_TYPES (handler.ts:18-25) is accepted without any sync. A synced type
  // with a customer Stripe does not know answers 500 (the sync calls Stripe), so it is not used here.
  const body = eventBody("charge.succeeded", `cus_p2_unsynced_${currentRunPrefix()}`);
  const now = Math.floor(Date.now() / 1000);
  const res = await post(
    request,
    signedStripeHeaders(stripeWebhookSecret(process.env), body, now),
    body,
  );
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("Webhook received");
  expect(await rowCounts()).toBe(before);
});

test.describe("STR-002 and STR-003 against the run's Stripe fixture", () => {
  test.describe.configure({ mode: "serial" });
  // Named skip: without the test-mode key these two cases do not run in this stack (OD-2).
  test.skip(
    !hasStripeKey(process.env),
    "P2-DOC-STR-002/003 need STRIPE_API_KEY (test mode): none in this run",
  );

  stripeTest(
    "P2-DOC-STR-002 a validly signed synced event is processed once against the run's subscription",
    async ({ request, stripeRun }) => {
      const db = readOnlyDb("documenso");
      const subsFor = () =>
        db.select<{ id: string; status: string }>(
          `SELECT "id" AS id, "status" AS status FROM "Subscription" WHERE "customerId" = $1 ORDER BY "id"`,
          [stripeRun.customerId],
        );
      const ts = Math.floor(Date.now() / 1000);
      const body = subscriptionEvent({
        id: `evt_${stripeRun.runId}_str002`,
        type: "customer.subscription.updated",
        customerId: stripeRun.customerId,
        subscriptionId: stripeRun.subscriptionId,
        status: "trialing",
        created: ts,
      });
      const headers = signedStripeHeaders(stripeWebhookSecret(process.env), body, ts);
      expect((await post(request, headers, body)).status()).toBe(200);
      const afterFirst = await subsFor();
      expect(afterFirst).toHaveLength(1); // the sync writes exactly one row for the run customer
      expect((await post(request, headers, body)).status()).toBe(200); // the identical signed event again
      expect(await subsFor()).toEqual(afterFirst);
    },
  );

  stripeTest(
    "P2-DOC-STR-003 out-of-order subscription events end in the live Stripe state",
    async ({ request, stripeRun }) => {
      const stripe = new Stripe(assertTestModeKey(process.env.STRIPE_API_KEY));
      const db = readOnlyDb("documenso");
      const live = (await stripe.subscriptions.retrieve(stripeRun.subscriptionId)).status;
      const t2 = Math.floor(Date.now() / 1000);
      const t1 = t2 - 60;
      const newer = subscriptionEvent({
        id: `evt_${stripeRun.runId}_t2`,
        type: "customer.subscription.updated",
        customerId: stripeRun.customerId,
        subscriptionId: stripeRun.subscriptionId,
        status: "trialing",
        created: t2,
      });
      const older = subscriptionEvent({
        id: `evt_${stripeRun.runId}_t1`,
        type: "customer.subscription.created",
        customerId: stripeRun.customerId,
        subscriptionId: stripeRun.subscriptionId,
        status: "canceled",
        created: t1,
      });
      const secret = stripeWebhookSecret(process.env);
      expect((await post(request, signedStripeHeaders(secret, newer, t2), newer)).status()).toBe(
        200,
      );
      expect((await post(request, signedStripeHeaders(secret, older, t1), older)).status()).toBe(
        200,
      );
      const rows = await db.select<{ status: string }>(
        `SELECT "status" AS status FROM "Subscription" WHERE "customerId" = $1`,
        [stripeRun.customerId],
      );
      expect(rows.map((r) => r.status)).toEqual([productStatusFor(live)]);
    },
  );
});
