import { test, expect } from "../../../src/fixtures/index.ts";
import { isStripeTestKey, laneEnvGate } from "../../../src/lanes/med/env-gate.ts";
import { cleanupLabel, laneOf } from "../../../src/lanes/med/lane-client.ts";
import {
  buildPaymentEvent,
  openSessionFor,
  sendEvent,
} from "../../../src/lanes/med/webhook-flow.ts";
import { paymentSession } from "../../../src/lanes/med/oracle.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";

/*
 * Tolerance, stated by receipt age. Processing age is INFERRED, never observed: the verify time is the
 * subscriber run, which is the receipt time + the route's emit delay + queue lag.
 * - The route emits with delay webhook_delay || 5000 ms (@medusajs/medusa dist/api/hooks/payment/[provider]/route.js:21).
 * - The SDK verifies with tolerance 300 s by default (stripe@23.0.1 cjs/Webhooks.js:15, 23): an event whose
 *   age exceeds 300 s at verification is rejected.
 * - The accepted case's receipt age is derived from the processing budget, not chosen: 300 - 5 - ceil(budget),
 *   so the queue lag may use the whole budget (SLO.medWebhookProcessing) before the event goes stale.
 */
const EMIT_DELAY_S = 5;
const TOLERANCE_S = 300;
const ACCEPT_RECEIPT_AGE_S =
  TOLERANCE_S - EMIT_DELAY_S - Math.ceil(SLO.medWebhookProcessing.ms / 1000); // 270

// Evaluated when the tests start, never at collection: `playwright test --list` must not throw.
test.beforeAll(() => {
  const stripeGate = laneEnvGate("STRIPE_API_KEY", {
    isValid: isStripeTestKey,
    expectText: "a Stripe test-mode key (sk_test_)",
    reason: "the Stripe payment provider does not load without it (RD-19)",
  });
  test.skip(!stripeGate.ready, stripeGate.ready ? "" : stripeGate.reason);
});

test.describe("medusa webhook tolerance", () => {
  test(`P2-MED-WH-006 receipt age ${String(ACCEPT_RECEIPT_AGE_S)} s is accepted (margin = the processing budget)`, async ({
    request,
    medAuth,
    med,
  }) => {
    const label = "wh006a";
    const lane = laneOf({ request, medAuth });
    try {
      const { sessionId } = await openSessionFor(lane, label);
      const event = buildPaymentEvent({ label, sessionId, ageAtReceiptSec: ACCEPT_RECEIPT_AGE_S });
      expect(await sendEvent(med, event)).toBe(200);
      await expect
        .poll(async () => (await paymentSession(sessionId))?.status, {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "accepted within the processing budget",
        })
        .toBe("authorized");
    } finally {
      await cleanupLabel(lane, med, label);
    }
  });

  // DESIGN FINDING (route to P5; no test.fail: no published contract is broken). Receipt age 299 s is
  // processing age 304 s: the subscriber verifies after the SDK tolerance, so a valid event that waits in
  // the queue past about 295 s is dropped for good (the route answered 200 before verifying, and Medusa's
  // retries replay the same stale signature; Stripe itself would send a fresh one on a retry).
  // Observed on the pin: probe P-MED-2 (299 s rejected, control authorized).
  test("P2-MED-WH-006 receipt age 299 s is rejected (design finding: route to P5)", async ({
    request,
    medAuth,
    med,
  }) => {
    const label = "wh006f";
    const lane = laneOf({ request, medAuth });
    try {
      const stale = await openSessionFor(lane, label);
      expect(
        await sendEvent(
          med,
          buildPaymentEvent({ label, sessionId: stale.sessionId, ageAtReceiptSec: 299 }),
        ),
      ).toBe(200);
      const control = await openSessionFor(lane, `${label}c`);
      expect(
        await sendEvent(
          med,
          buildPaymentEvent({ label: `${label}c`, sessionId: control.sessionId }),
        ),
      ).toBe(200);
      await expect
        .poll(async () => (await paymentSession(control.sessionId))?.status, {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "control processed after the 299 s event",
        })
        .toBe("authorized");
      expect((await paymentSession(stale.sessionId))?.status, "299 s receipt rejected").toBe(
        "pending",
      );
    } finally {
      await cleanupLabel(lane, med, label);
    }
  });

  test("P2-MED-WH-006 receipt age 300 s is rejected", async ({ request, medAuth, med }) => {
    const label = "wh006r";
    const lane = laneOf({ request, medAuth });
    try {
      const rejected = await openSessionFor(lane, label);
      const stale = buildPaymentEvent({
        label,
        sessionId: rejected.sessionId,
        ageAtReceiptSec: 300,
      });
      expect(await sendEvent(med, stale), "the route answers 200 before it verifies").toBe(200);

      // Positive control: a valid event for a second session is processed after the stale one.
      const control = await openSessionFor(lane, `${label}c`);
      expect(
        await sendEvent(
          med,
          buildPaymentEvent({ label: `${label}c`, sessionId: control.sessionId }),
        ),
      ).toBe(200);
      await expect
        .poll(async () => (await paymentSession(control.sessionId))?.status, {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "control processed after the stale event",
        })
        .toBe("authorized");
      expect((await paymentSession(rejected.sessionId))?.status, "stale event rejected").toBe(
        "pending",
      );
    } finally {
      await cleanupLabel(lane, med, label);
    }
  });

  test("P2-MED-WH-006 tampered body is rejected (receipt age 0)", async ({
    request,
    medAuth,
    med,
  }) => {
    const label = "wh006t";
    const lane = laneOf({ request, medAuth });
    try {
      const target = await openSessionFor(lane, label);
      const signed = buildPaymentEvent({ label, sessionId: target.sessionId });
      // Same header, one changed byte in the body: the signature no longer matches.
      const tampered = Buffer.from(
        signed.body.toString("utf8").replace('"amount":1000,', '"amount":1001,'),
      );
      expect(tampered.equals(signed.body), "the body was changed").toBe(false);
      expect(await sendEvent(med, { ...signed, body: tampered })).toBe(200);

      const control = await openSessionFor(lane, `${label}c`);
      expect(
        await sendEvent(
          med,
          buildPaymentEvent({ label: `${label}c`, sessionId: control.sessionId }),
        ),
      ).toBe(200);
      await expect
        .poll(async () => (await paymentSession(control.sessionId))?.status, {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "control processed after the tampered event",
        })
        .toBe("authorized");
      expect((await paymentSession(target.sessionId))?.status, "tampered body rejected").toBe(
        "pending",
      );
    } finally {
      await cleanupLabel(lane, med, label);
    }
  });
});
