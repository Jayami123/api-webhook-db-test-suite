import { test, expect } from "../../../src/fixtures/index.ts";
import { isStripeTestKey, laneEnvGate } from "../../../src/lanes/med/env-gate.ts";
import { cleanupLabel, laneOf } from "../../../src/lanes/med/lane-client.ts";
import {
  buildPaymentEvent,
  openSessionFor,
  sendEvent,
} from "../../../src/lanes/med/webhook-flow.ts";
import {
  captureRowCount,
  liveOrderIdsForCart,
  liveOrdersLinkedToCart,
  liveOrdersViaSoftDeletedLinks,
  paymentCapturedAt,
  paymentRowCount,
  paymentSession,
} from "../../../src/lanes/med/oracle.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";

// Evaluated when the tests start, never at collection: `playwright test --list` must not throw.
test.beforeAll(() => {
  const stripeGate = laneEnvGate("STRIPE_API_KEY", {
    isValid: isStripeTestKey,
    expectText: "a Stripe test-mode key (sk_test_)",
    reason: "the Stripe payment provider does not load without it (RD-19)",
  });
  test.skip(!stripeGate.ready, stripeGate.ready ? "" : stripeGate.reason);
});

/**
 * Completion before the delayed webhook, one round per test. The route emits with a 5000 ms delay
 * (@medusajs/medusa dist/api/hooks/payment/[provider]/route.js:21), so a completion sent with the webhook
 * lands first; this case proves the end state, not a simultaneous race (the true race is UNPROBED, see
 * P-MED-WH-008b in the probe record). The end state is the assertion:
 * one live order for the cart, one payment, one capture, and the session authorized (the payment module
 * never writes "captured" to a session; the payment row carries captured_at; probe P-MED-19). Lock: in-process
 * (MEDUSA_LOCK unset, medusa-env.ts:177).
 */
for (let run = 1; run <= 20; run++) {
  const nn = String(run).padStart(2, "0");
  const label = `race${nn}`;
  test(`P2-MED-WH-008 completion before the delayed webhook (product webhook_delay 5000 ms), run ${nn} of 20`, async ({
    request,
    medAuth,
    med,
  }) => {
    const lane = laneOf({ request, medAuth });
    try {
      const { cartId, sessionId } = await openSessionFor(lane, label);
      const event = buildPaymentEvent({ label, sessionId });
      const [hook, complete] = await Promise.all([
        sendEvent(med, event),
        lane.rawPost(`/store/carts/${cartId}/complete`, {}),
      ]);
      expect(hook, "webhook answer").toBe(200);
      expect(complete.status, "completion answer").toBe(200);

      await expect
        .poll(async () => (await paymentSession(sessionId))?.status, {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "the race ends with the session authorized",
        })
        .toBe("authorized");
      await expect
        .poll(() => paymentCapturedAt(sessionId), {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "the payment is captured",
        })
        .toEqual(expect.any(String));
      expect(await liveOrdersLinkedToCart(cartId), "live orders through any link").toBe(1);
      expect(
        await liveOrdersViaSoftDeletedLinks(cartId),
        "live orders behind a soft-deleted link",
      ).toBe(0);
      expect(await paymentRowCount(sessionId), "payments for the session").toBe(1);
      expect(await captureRowCount(sessionId), "captures for the session").toBe(1);
    } finally {
      await cleanupLabel(lane, med, label);
    }
  });
}

test.describe("medusa webhook first, then the client completes the same cart", () => {
  test("P2-MED-WH-008b webhook first, then the client completes the same cart: one order, one payment, one capture", async ({
    request,
    medAuth,
    med,
  }) => {
    const label = "race8b";
    const lane = laneOf({ request, medAuth });
    try {
      const { cartId, sessionId } = await openSessionFor(lane, label);
      const event = buildPaymentEvent({ label, sessionId });
      expect(await sendEvent(med, event), "webhook answer").toBe(200);
      // The webhook completes the cart itself (process-payment.js:180-190, completeCartAfterPaymentStep).
      await expect
        .poll(async () => (await liveOrderIdsForCart(cartId)).length, {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "the webhook created the order",
        })
        .toBe(1);
      const [webhookOrder] = await liveOrderIdsForCart(cartId);

      // The client completes the same cart afterwards. Observed (probe P-MED-WH-008b): 200, type order,
      // the SAME order id the webhook created.
      const complete = await lane.rawPost(`/store/carts/${cartId}/complete`, {});
      expect(complete.status, "client completion answer").toBe(200);
      expect((complete.body as { type: string }).type).toBe("order");
      expect(
        (complete.body as { order: { id: string } }).order.id,
        "the completion returns the webhook order",
      ).toBe(webhookOrder);

      expect(await liveOrderIdsForCart(cartId), "live orders for the cart").toEqual([webhookOrder]);
      expect(await liveOrdersLinkedToCart(cartId), "live orders through any link").toBe(1);
      expect(
        await liveOrdersViaSoftDeletedLinks(cartId),
        "live orders behind a soft-deleted link",
      ).toBe(0);
      await expect
        .poll(() => paymentCapturedAt(sessionId), {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "the payment is captured",
        })
        .toEqual(expect.any(String));
      expect(await paymentRowCount(sessionId), "payments").toBe(1);
      expect(await captureRowCount(sessionId), "captures").toBe(1);
    } finally {
      await cleanupLabel(lane, med, label);
    }
  });
});
