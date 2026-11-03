import { test, expect } from "../../../src/fixtures/index.ts";
import { laneOf } from "../../../src/lanes/med/lane-client.ts";
import {
  buildPaymentEvent,
  openSessionFor,
  sendEvent,
} from "../../../src/lanes/med/webhook-flow.ts";
import { captureRowCount, paymentRowCount, paymentSession } from "../../../src/lanes/med/oracle.ts";
import { cleanupLabel } from "../../../src/lanes/med/cleanup.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";

const hasKey = Boolean(process.env["STRIPE_API_KEY"]);
test.skip(
  !hasKey,
  "STRIPE_API_KEY not set: the Stripe payment provider does not load without it (RD-19)",
);

test.describe("medusa parallel duplicate deliveries", () => {
  test("P2-MED-WH-002 five parallel deliveries of one signed event leave the end state of one delivery", async ({
    request,
    medAuth,
    med,
  }) => {
    const label = "wh002";
    const lane = laneOf({ request, medAuth });
    try {
      const { sessionId } = await openSessionFor(lane, label);
      const event = buildPaymentEvent({ label, sessionId });
      const statuses = await Promise.all(Array.from({ length: 5 }, () => sendEvent(med, event)));
      expect(statuses).toEqual([200, 200, 200, 200, 200]);
      await expect
        .poll(async () => (await paymentSession(sessionId))?.status, {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "parallel deliveries authorize the session",
        })
        .toBe("authorized");

      const marker = await openSessionFor(lane, `${label}m`);
      expect(
        await sendEvent(
          med,
          buildPaymentEvent({ label: `${label}m`, sessionId: marker.sessionId }),
        ),
      ).toBe(200);
      await expect
        .poll(async () => (await paymentSession(marker.sessionId))?.status, {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "drain marker authorized",
        })
        .toBe("authorized");

      expect(await paymentRowCount(sessionId), "payments after five deliveries").toBe(1);
      expect((await paymentSession(sessionId))?.status).toBe("authorized");
      expect(await captureRowCount(sessionId), "capture rows after five deliveries").toBe(1);
    } finally {
      await cleanupLabel(lane, med, label);
    }
  });
});
