import { randomBytes } from "node:crypto";
import { isStripeTestKey, laneEnvGate } from "../../../src/lanes/med/env-gate.ts";
import { test, expect } from "../../../src/fixtures/index.ts";
import { laneOf } from "../../../src/lanes/med/lane-client.ts";
import {
  buildPaymentEvent,
  openSessionFor,
  sendEvent,
  STRIPE_PROVIDER,
} from "../../../src/lanes/med/webhook-flow.ts";
import { paymentSession } from "../../../src/lanes/med/oracle.ts";
import { redisHget, redisZrange } from "../../../src/lanes/med/redis.ts";
import { cleanupLabel } from "../../../src/lanes/med/cleanup.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";

const stripeGate = laneEnvGate("STRIPE_API_KEY", {
  isValid: isStripeTestKey,
  expectText: "a Stripe test-mode key (sk_test_)",
  reason: "the Stripe payment provider does not load without it (RD-19)",
});
test.skip(!stripeGate.ready, stripeGate.ready ? "" : stripeGate.reason);

const FAILED_SET = "RedisEventBusService:events-queue:failed";
const jobKey = (id: string): string => `RedisEventBusService:events-queue:${id}`;

/** The parked job whose stored headers carry this test's marker (its own signature value). */
async function parkedJobFor(
  marker: string,
): Promise<{ id: string; atm: string; ats: string; name: string } | undefined> {
  for (const id of await redisZrange(FAILED_SET)) {
    if ((await redisHget(jobKey(id), "data")).includes(marker)) {
      return {
        id,
        atm: await redisHget(jobKey(id), "atm"),
        ats: await redisHget(jobKey(id), "ats"),
        name: await redisHget(jobKey(id), "name"),
      };
    }
  }
  return undefined;
}

test.describe("medusa poison event", () => {
  test("P2-MED-EB-002 a poison event is parked after the configured attempts and the next valid event is still processed", async ({
    request,
    medAuth,
    med,
  }) => {
    const label = "eb002";
    const lane = laneOf({ request, medAuth });
    const marker = randomBytes(8).toString("hex");
    try {
      const bad = await openSessionFor(lane, `${label}b`);
      const badEvent = buildPaymentEvent({ label: `${label}b`, sessionId: bad.sessionId });
      // A signature that cannot verify: the subscriber throws, the event bus retries, then parks it.
      const badHeaders = { "stripe-signature": `t=1,v1=${marker}` };
      const bodyBytes = badEvent.body;
      expect((await med.hooks.payment(STRIPE_PROVIDER, bodyBytes, badHeaders)).status).toBe(200);

      const good = await openSessionFor(lane, `${label}g`);
      expect(
        await sendEvent(med, buildPaymentEvent({ label: `${label}g`, sessionId: good.sessionId })),
      ).toBe(200);
      await expect
        .poll(async () => (await paymentSession(good.sessionId))?.status, {
          timeout: SLO.medPoisonParked.ms,
          intervals: POLL_INTERVALS,
          message: "the valid event after the poison is processed",
        })
        .toBe("authorized");
      expect((await paymentSession(bad.sessionId))?.status, "poison session untouched").toBe(
        "pending",
      );

      // The parked job: name, attempts made, attempts configured. Waited for, not slept for.
      await expect
        .poll(async () => (await parkedJobFor(marker))?.id, {
          timeout: SLO.medPoisonParked.ms,
          intervals: POLL_INTERVALS,
          message: "the poison job is parked in the failed set",
        })
        .toBeDefined();
      const parked = await parkedJobFor(marker);
      expect(parked?.name).toBe("payment.webhook_received");
      expect(parked?.atm, "attempts made").toBe("3");
      expect(parked?.ats, "attempts configured").toBe("3");
    } finally {
      await cleanupLabel(lane, med, label);
    }
  });
});
