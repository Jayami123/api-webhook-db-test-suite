import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ageAtProcessing,
  paymentIntentEvent,
  runWebhookSecret,
  signAtAge,
} from "../../../../src/lanes/med/stripe-event.ts";
import { verifyStripe } from "../../../../src/webhooks/verify.ts";

interface EventShape {
  readonly type: string;
  readonly data: {
    readonly object: {
      readonly currency: string;
      readonly amount_received: number;
      readonly metadata: Record<string, string>;
    };
  };
}

const SECRET = "whsec_unit_test_secret_value_0000000000";

describe("stripe event builder (medusa lane)", () => {
  test("paymentIntentEvent includes metadata.session_id when a session id is given", () => {
    const body = JSON.parse(
      paymentIntentEvent({
        eventId: "evt_a1",
        type: "payment_intent.succeeded",
        sessionId: "payses_1",
        currency: "USD",
        amountMinor: 1000,
      }),
    ) as EventShape;
    assert.equal(body.data.object.metadata.session_id, "payses_1");
    assert.equal(body.data.object.currency, "usd");
    assert.equal(body.data.object.amount_received, 1000);
  });

  test("paymentIntentEvent omits session_id when undefined (NOT_SUPPORTED path)", () => {
    const body = JSON.parse(
      paymentIntentEvent({
        eventId: "evt_a2",
        type: "payment_intent.succeeded",
        sessionId: undefined,
        currency: "jpy",
        amountMinor: 1500,
      }),
    ) as EventShape;
    assert.deepEqual(body.data.object.metadata, {});
  });

  test("signAtAge timestamps the header at receipt time minus age", () => {
    const signed = signAtAge({
      payload: "{}",
      secret: SECRET,
      receiptNowSec: 1_800_000_000,
      ageAtReceiptSec: 290,
    });
    const header = String(signed.headers["Stripe-Signature"]);
    assert.match(header, /^t=1799999710,v1=[0-9a-f]{64}$/);
  });

  test("a header signed at receipt age 290 s verifies at processing age 295 s and is rejected at 305 s", () => {
    const receipt = 1_800_000_000;
    const signed = signAtAge({
      payload: "{}",
      secret: SECRET,
      receiptNowSec: receipt,
      ageAtReceiptSec: 290,
    });
    const t = receipt - 290;
    const atProcessing = (age: number) =>
      verifyStripe({
        secret: SECRET,
        rawBody: "{}",
        headers: signed.headers,
        nowMs: (t + age) * 1000,
      });
    assert.deepEqual(atProcessing(ageAtProcessing(290)), { ok: true });
    assert.deepEqual(atProcessing(305), { ok: false, reason: "stale-timestamp" });
  });

  test("a header signed at receipt age 299 s is rejected at processing age 304 s (documents the processing-time boundary)", () => {
    const receipt = 1_800_000_000;
    const signed = signAtAge({
      payload: "{}",
      secret: SECRET,
      receiptNowSec: receipt,
      ageAtReceiptSec: 299,
    });
    const processingAge = ageAtProcessing(299);
    assert.equal(processingAge, 304);
    const result = verifyStripe({
      secret: SECRET,
      rawBody: "{}",
      headers: signed.headers,
      nowMs: (receipt - 299 + processingAge) * 1000,
    });
    assert.deepEqual(result, { ok: false, reason: "stale-timestamp" });
  });

  test("runWebhookSecret throws a TEST BUG when STRIPE_WEBHOOK_SECRET is unset", () => {
    assert.throws(() => runWebhookSecret({}), /TEST BUG: STRIPE_WEBHOOK_SECRET is not set/);
    assert.equal(runWebhookSecret({ STRIPE_WEBHOOK_SECRET: "whsec_x" }), "whsec_x");
  });
});
