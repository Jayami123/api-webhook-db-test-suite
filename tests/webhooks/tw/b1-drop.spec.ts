import { test, expect } from "../../../src/fixtures/index.ts";
import { deliveriesOf } from "../../../src/lanes/tw/visible.ts";
import { awaitCanary } from "../../../src/lanes/tw/waits.ts";
import { createFreshWebhook, type FreshWebhook } from "../../../src/lanes/tw/webhook-factory.ts";
import { quietState } from "../../../src/lanes/tw/quiet.ts";
import {
  POLL_INTERVALS,
  SLO,
  TW_QUIET_TIMEOUT_MS,
  TW_QUIET_WINDOW_MS,
} from "../../../src/lanes/tw/slo.ts";
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

/**
 * P2-TW-WH-010 (deterministic): a webhook created right after another webhook's delete receives the next event, and
 * the deleted URL receives nothing. Known bug P2-TW-BUG-003: the worker's webhook map is memoised for 10 s and the
 * server-side invalidation does not reach the worker (workspace-cache.service.ts:56). Evidence: the probe record,
 * section 3 (P2-TW-BUG-003; 5 of 5 repetitions). Setup is asserted first; the expected result is then marked
 * test.fail(), so the test passes while the bug stands and reports an unexpected pass once it is fixed.
 */
test("P2-TW-WH-010: a webhook created right after a delete receives the next event, and the deleted URL gets none", async ({
  tw,
  receiverHandle,
}) => {
  const keyA = receiverHandle.key("tw-bug3-a");
  const keyB = receiverHandle.key("tw-bug3-b");
  const hookA = await createFreshWebhook({
    tw,
    receiverHandle,
    testId: "tw-bug3-a",
    operations: ["person.created"],
  });
  const created: string[] = [];
  let hookAGone = false;
  let hookB: FreshWebhook | undefined;
  try {
    // Warm the worker's webhook map with A (A receives a canary).
    created.push(
      ...(
        await awaitCanary({
          tw,
          receiver: receiverHandle.receiver,
          key: keyA,
          createdAtMs: Date.now(),
        })
      ).personIds,
    );
    // Delete A, create B, then one event inside the memo window.
    await hookA.remove();
    hookAGone = true;
    hookB = await createFreshWebhook({
      tw,
      receiverHandle,
      testId: "tw-bug3-b",
      operations: ["person.created"],
    });
    const event = await tw.people.create(runScopedName("tw-bug3-event"));
    created.push(event);

    test.fail(
      true,
      "P2-TW-BUG-003: a webhook created after a delete misses the next event (probe record, section 3)",
    );

    // Oracle: B holds exactly one delivery of the event for the quiet window. Under the bug the count stays 0, so the
    // poll reports "changed:0" until its timeout.
    const startedMs = Date.now();
    await expect
      .poll(
        () =>
          quietState({
            count: deliveriesOf(receiverHandle.receiver, keyB, event).length,
            expected: 1,
            startedMs,
            nowMs: Date.now(),
            windowMs: TW_QUIET_WINDOW_MS,
          }),
        {
          timeout: TW_QUIET_TIMEOUT_MS,
          intervals: POLL_INTERVALS,
          message: "B receives the event",
        },
      )
      .toBe("quiet");
    // The deleted URL never receives the event.
    expect(deliveriesOf(receiverHandle.receiver, keyA, event)).toHaveLength(0);
  } finally {
    try {
      for (const id of created) await tw.people.remove(id);
    } finally {
      if (!hookAGone) await hookA.remove();
      if (hookB !== undefined) await hookB.remove();
    }
  }
});
