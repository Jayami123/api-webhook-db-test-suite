import { test, expect } from "../../../src/fixtures/index.ts";
import { laneOf } from "../../../src/lanes/med/lane-client.ts";
import {
  buildPaymentEvent,
  openSessionFor,
  sendEvent,
} from "../../../src/lanes/med/webhook-flow.ts";
import {
  captureRowCount,
  orderCountForCart,
  paymentCapturedAt,
  paymentRowCount,
  paymentSession,
} from "../../../src/lanes/med/oracle.ts";
import { cleanupLabel } from "../../../src/lanes/med/cleanup.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";

const hasKey = Boolean(process.env["STRIPE_API_KEY"]);
test.skip(
  !hasKey,
  "STRIPE_API_KEY not set: the Stripe payment provider does not load without it (RD-19)",
);

/**
 * The webhook and the cart completion race (one round per test). The end state is the assertion:
 * one live order for the cart, one payment, one capture, and the session authorized (the payment module
 * never writes "captured" to a session; the payment row carries captured_at; probe P-MED-19). Lock: in-process
 * (MEDUSA_LOCK unset, medusa-env.ts:177).
 */
for (let run = 1; run <= 20; run++) {
  const nn = String(run).padStart(2, "0");
  const label = `race${nn}`;
  test(`P2-MED-WH-008 webhook and cart completion race, run ${nn} of 20`, async ({
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
      expect(await orderCountForCart(cartId), "live orders for the cart").toBe(1);
      expect(await paymentRowCount(sessionId), "payments for the session").toBe(1);
      expect(await captureRowCount(sessionId), "captures for the session").toBe(1);
    } finally {
      await cleanupLabel(lane, med, label);
    }
  });
}
