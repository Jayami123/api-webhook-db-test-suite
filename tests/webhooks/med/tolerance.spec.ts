import { test, expect } from "../../../src/fixtures/index.ts";
import { laneOf } from "../../../src/lanes/med/lane-client.ts";
import {
  buildPaymentEvent,
  openSessionFor,
  sendEvent,
} from "../../../src/lanes/med/webhook-flow.ts";
import { paymentSession } from "../../../src/lanes/med/oracle.ts";
import { cleanupLabel } from "../../../src/lanes/med/cleanup.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";

// Processing-time window (observed 2026-11-02, P-MED-2b): the product verifies five seconds after
// receipt, so receipt age 290 s is processing age 295 s (accepted) and receipt age 300 s is
// processing age 305 s (rejected). The SDK tolerance is 300 s (stripe-base.js:511-519).
const hasKey = Boolean(process.env["STRIPE_API_KEY"]);
test.skip(
  !hasKey,
  "STRIPE_API_KEY not set: the Stripe payment provider does not load without it (RD-19)",
);

test.describe("medusa webhook tolerance", () => {
  test("P2-MED-WH-006 processing age 295 s is accepted", async ({ request, medAuth, med }) => {
    const label = "wh006a";
    const lane = laneOf({ request, medAuth });
    try {
      const { sessionId } = await openSessionFor(lane, label);
      // Receipt age 290 s, verified 5 s later: processing age 295 s.
      const event = buildPaymentEvent({ label, sessionId, ageAtReceiptSec: 290 });
      expect(await sendEvent(med, event)).toBe(200);
      await expect
        .poll(async () => (await paymentSession(sessionId))?.status, {
          timeout: SLO.medWebhookProcessing.ms,
          intervals: POLL_INTERVALS,
          message: "accepted at processing age 295 s",
        })
        .toBe("authorized");
    } finally {
      await cleanupLabel(lane, med, label);
    }
  });

  test("P2-MED-WH-006 processing age 305 s is rejected", async ({ request, medAuth, med }) => {
    const label = "wh006r";
    const lane = laneOf({ request, medAuth });
    try {
      const rejected = await openSessionFor(lane, label);
      // Receipt age 300 s, verified 5 s later: processing age 305 s, outside the 300 s tolerance.
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

  test("P2-MED-WH-006 a tampered body is rejected", async ({ request, medAuth, med }) => {
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
