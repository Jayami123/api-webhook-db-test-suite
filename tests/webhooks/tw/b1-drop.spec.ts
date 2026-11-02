import { test, expect } from "../../../src/fixtures/index.ts";
import { deliveriesOf } from "../../../src/lanes/tw/visible.ts";
import { awaitCanary } from "../../../src/lanes/tw/waits.ts";
import { createFreshWebhook } from "../../../src/lanes/tw/webhook-factory.ts";
import { POLL_INTERVALS, SLO } from "../../../src/lanes/tw/slo.ts";
import { runScopedName } from "../../../src/run/prefix.ts";

/**
 * B1 positive control (one test, normal lane). It shows that a fresh webhook delivers an event sent after one memo
 * window (P-TW-2a/b/c). It makes no drop claim: the drop rate is a measurement in the serial study (P2-TW-WH-010).
 */
test("B1 control: a fresh webhook delivers an event sent after one memo window", async ({
  tw,
  receiverHandle,
}) => {
  const testId = "tw-b1-control";
  const key = receiverHandle.key(testId);
  const createdAtMs = Date.now();
  const hook = await createFreshWebhook({
    tw,
    receiverHandle,
    testId,
    operations: ["person.created"],
  });
  const created: string[] = [];
  try {
    created.push(
      ...(await awaitCanary({ tw, receiver: receiverHandle.receiver, key, createdAtMs })).personIds,
    );
    const afterWindow = await tw.people.create(runScopedName("tw-b1-after"));
    created.push(afterWindow);
    await expect
      .poll(() => deliveriesOf(receiverHandle.receiver, key, afterWindow).length, {
        timeout: SLO.twWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "B1 control delivered",
      })
      .toBe(1);
  } finally {
    try {
      for (const id of created) await tw.people.remove(id);
    } finally {
      await hook.remove();
    }
  }
});
