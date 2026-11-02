import { test, expect } from "../../../src/fixtures/index.ts";
import { laneOf } from "../../../src/lanes/med/lane-client.ts";
import {
  buildPaymentEvent,
  openSessionFor,
  sendEvent,
} from "../../../src/lanes/med/webhook-flow.ts";
import { paymentRowCount, paymentSession } from "../../../src/lanes/med/oracle.ts";
import { cleanupLabel } from "../../../src/lanes/med/cleanup.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";

const hasKey = Boolean(process.env["STRIPE_API_KEY"]);
test.skip(
  !hasKey,
  "STRIPE_API_KEY not set: the Stripe payment provider does not load without it (RD-19)",
);

test.describe("medusa out-of-order payment events", () => {
  test("P2-MED-WH-003 succeeded before amount_capturable_updated ends authorized in the database", async ({
    request,
    medAuth,
    med,
  }) => {
    const label = "wh003";
    const lane = laneOf({ request, medAuth });
    try {
      // Sub-step 1: succeeded, then amount_capturable_updated (the order the title names).
      const first = await openSessionFor(lane, `${label}a`);
      expect(
        await sendEvent(
          med,
          buildPaymentEvent({
            label: `${label}a1`,
            sessionId: first.sessionId,
            type: "payment_intent.succeeded",
          }),
        ),
      ).toBe(200);
      await expect
        .poll(async () => (await paymentSession(first.sessionId))?.status, {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "succeeded authorizes the session",
        })
        .toBe("authorized");
      expect(
        await sendEvent(
          med,
          buildPaymentEvent({
            label: `${label}a2`,
            sessionId: first.sessionId,
            type: "payment_intent.amount_capturable_updated",
          }),
        ),
      ).toBe(200);
      const markerA = await openSessionFor(lane, `${label}am`);
      expect(
        await sendEvent(
          med,
          buildPaymentEvent({ label: `${label}am`, sessionId: markerA.sessionId }),
        ),
      ).toBe(200);
      await expect
        .poll(async () => (await paymentSession(markerA.sessionId))?.status, {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "drain marker after the capturable update",
        })
        .toBe("authorized");
      expect(
        (await paymentSession(first.sessionId))?.status,
        "after succeeded then capturable",
      ).toBe("authorized");
      expect(await paymentRowCount(first.sessionId)).toBe(1);

      // Sub-step 2: the reverse order, amount_capturable_updated first.
      const second = await openSessionFor(lane, `${label}b`);
      expect(
        await sendEvent(
          med,
          buildPaymentEvent({
            label: `${label}b1`,
            sessionId: second.sessionId,
            type: "payment_intent.amount_capturable_updated",
          }),
        ),
      ).toBe(200);
      await expect
        .poll(async () => (await paymentSession(second.sessionId))?.status, {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "capturable update authorizes the session",
        })
        .toBe("authorized");
      expect(
        await sendEvent(
          med,
          buildPaymentEvent({
            label: `${label}b2`,
            sessionId: second.sessionId,
            type: "payment_intent.succeeded",
          }),
        ),
      ).toBe(200);
      const markerB = await openSessionFor(lane, `${label}bm`);
      expect(
        await sendEvent(
          med,
          buildPaymentEvent({ label: `${label}bm`, sessionId: markerB.sessionId }),
        ),
      ).toBe(200);
      await expect
        .poll(async () => (await paymentSession(markerB.sessionId))?.status, {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "drain marker after succeeded",
        })
        .toBe("authorized");
      expect(
        (await paymentSession(second.sessionId))?.status,
        "after capturable then succeeded",
      ).toBe("authorized");
      expect(await paymentRowCount(second.sessionId)).toBe(1);
    } finally {
      await cleanupLabel(lane, med, label);
    }
  });
});
