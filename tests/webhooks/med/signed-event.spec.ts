import { test, expect } from "../../../src/fixtures/index.ts";
import { isStripeTestKey, laneEnvGate } from "../../../src/lanes/med/env-gate.ts";
import { laneOf } from "../../../src/lanes/med/lane-client.ts";
import {
  buildPaymentEvent,
  openSessionFor,
  sendEvent,
} from "../../../src/lanes/med/webhook-flow.ts";
import {
  captureRowCount,
  paymentCapturedAt,
  paymentRowCount,
  paymentSession,
} from "../../../src/lanes/med/oracle.ts";
import { cleanupLabel } from "../../../src/lanes/med/cleanup.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";

// Stripe provider needs the key to load (RD-19). Without it the rows skip with this reason.
// Evaluated when the tests start, never at collection: `playwright test --list` must not throw.
test.beforeAll(() => {
  const stripeGate = laneEnvGate("STRIPE_API_KEY", {
    isValid: isStripeTestKey,
    expectText: "a Stripe test-mode key (sk_test_)",
    reason: "the Stripe payment provider does not load without it (RD-19)",
  });
  test.skip(!stripeGate.ready, stripeGate.ready ? "" : stripeGate.reason);
});

test.describe("medusa signed payment event", () => {
  test("P2-MED-WH-001 the same signed payment_intent.succeeded twice leaves one authorized session and one payment", async ({
    request,
    medAuth,
    med,
  }) => {
    const label = "wh001";
    const lane = laneOf({ request, medAuth });
    try {
      const { sessionId } = await openSessionFor(lane, label);
      const event = buildPaymentEvent({ label, sessionId });
      expect(await sendEvent(med, event), "first delivery answers").toBe(200);
      await expect
        .poll(async () => (await paymentSession(sessionId))?.status, {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "first delivery authorizes the session",
        })
        .toBe("authorized");

      // The payment is captured (process-payment.js:110-114, autocapture on succeeded; probe P-MED-19).
      await expect
        .poll(() => paymentCapturedAt(sessionId), {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "the payment is captured",
        })
        .toEqual(expect.any(String));

      // Repeat delivery: the same signed bytes.
      expect(await sendEvent(med, event), "repeat delivery answers").toBe(200);

      // Drain marker (plan 6.9): a valid event for a second session, polled to authorized, proves the
      // subscriber has processed the repeat before the count is read. Events run one at a time.
      const marker = await openSessionFor(lane, `${label}m`);
      const markerEvent = buildPaymentEvent({ label: `${label}m`, sessionId: marker.sessionId });
      expect(await sendEvent(med, markerEvent)).toBe(200);
      await expect
        .poll(async () => (await paymentSession(marker.sessionId))?.status, {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "drain marker authorized",
        })
        .toBe("authorized");

      expect(await paymentRowCount(sessionId), "payments after the repeat").toBe(1);
      expect(await captureRowCount(sessionId), "capture rows after the repeat").toBe(1);
      expect(await paymentCapturedAt(sessionId), "captured_at after the repeat").toEqual(
        expect.any(String),
      );
      expect((await paymentSession(sessionId))?.status).toBe("authorized");
    } finally {
      await cleanupLabel(lane, med, label);
    }
  });
});
