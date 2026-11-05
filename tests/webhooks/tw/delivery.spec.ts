import { test, expect } from "../../../src/fixtures/index.ts";
import { deliveriesOf } from "../../../src/lanes/tw/visible.ts";
import { awaitCanary } from "../../../src/lanes/tw/waits.ts";
import { createFreshWebhook } from "../../../src/lanes/tw/webhook-factory.ts";
import { quietState } from "../../../src/lanes/tw/quiet.ts";
import { bodyErrors } from "../../../src/lanes/tw/payload-schema.ts";
import {
  POLL_INTERVALS,
  SLO,
  TW_QUIET_TIMEOUT_MS,
  TW_QUIET_WINDOW_MS,
} from "../../../src/lanes/tw/slo.ts";
import { runScopedName } from "../../../src/run/prefix.ts";
import { runAllThenRethrow } from "../../../src/shared/cleanup.ts";
import { removeEach } from "../../../src/lanes/tw/cleanup-steps.ts";

test("P2-TW-WH-004: a receiver 500 gets exactly one request for the event (no retry)", async ({
  tw,
  receiverHandle,
}) => {
  const testId = "tw-500";
  const key = receiverHandle.key(testId);
  const receiver = receiverHandle.receiver;
  const createdAtMs = Date.now();
  const hook = await createFreshWebhook({
    tw,
    receiverHandle,
    testId,
    operations: ["person.created"],
  });
  const created: string[] = [];
  try {
    created.push(...(await awaitCanary({ tw, receiver, key, createdAtMs })).personIds);
    receiver.setMode(key, { kind: "500" });
    const realId = await tw.people.create(runScopedName("tw-500-real"));
    created.push(realId);
    const count = (): number => deliveriesOf(receiver, key, realId).length;
    await expect
      .poll(count, {
        timeout: SLO.twWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "one request arrived",
      })
      .toBe(1);
    // Setup, asserted: the receiver really answered 500 (a mis-keyed mode would answer 200 and still pass the count).
    expect(deliveriesOf(receiver, key, realId)[0]?.mode, "setup: receiver answered 500").toBe(
      "500",
    );
    // No retry: the call job catches the HTTP error and returns normally (call-webhook.job.ts:137-154, no rethrow), so
    // BullMQ does not retry it. The enqueue sets retryLimit 3 (call-webhook-jobs.job.ts:102-106), which applies only to a
    // thrown error (bullmq.driver.ts:417). The quiet window is therefore the same as the other cases (TW_QUIET_WINDOW_MS).
    const startedMs = Date.now();
    await expect
      .poll(
        () =>
          quietState({
            count: count(),
            expected: 1,
            startedMs,
            nowMs: Date.now(),
            windowMs: TW_QUIET_WINDOW_MS,
          }),
        {
          timeout: TW_QUIET_TIMEOUT_MS,
          intervals: POLL_INTERVALS,
          message: "no retry inside the quiet window",
        },
      )
      .toBe("quiet");
  } finally {
    await runAllThenRethrow([
      ...removeEach(created, (id) => tw.people.remove(id)),
      () => hook.remove(),
    ]);
  }
});

/**
 * The product's outbound timeout (call-webhook.job.ts:117, `timeout: 5_000`). The two cases sit one second either side of it.
 * Measured on the worker log (`CallWebhookJob processed … in N ms`, probe record section 9, A2): the 4 s delivery took
 * about 4 010 ms and the 6 s delivery 5 006.85 ms, which is the timeout firing. The test does not assert those durations:
 * the only place they appear is the container log, which the test cannot read through the harness.
 */
const CALL_TIMEOUT_MS = 5_000;

for (const [name, delayMs] of [
  [
    `P2-TW-WH-005: a slow receiver (${(CALL_TIMEOUT_MS - 1_000) / 1_000} s) gets one request for the event`,
    CALL_TIMEOUT_MS - 1_000,
  ],
  [
    `P2-TW-WH-005: a slow receiver (${(CALL_TIMEOUT_MS + 1_000) / 1_000} s) gets one request for the event, and no retry`,
    CALL_TIMEOUT_MS + 1_000,
  ],
] as const) {
  test(name, async ({ tw, receiverHandle }) => {
    const testId = `tw-slow-${delayMs}`;
    const key = receiverHandle.key(testId);
    const receiver = receiverHandle.receiver;
    const createdAtMs = Date.now();
    const hook = await createFreshWebhook({
      tw,
      receiverHandle,
      testId,
      operations: ["person.created"],
    });
    const created: string[] = [];
    try {
      created.push(...(await awaitCanary({ tw, receiver, key, createdAtMs })).personIds);
      receiver.setMode(key, { kind: "slow", delayMs });
      const realId = await tw.people.create(runScopedName(`tw-slow-real-${delayMs}`));
      created.push(realId);
      const count = (): number => deliveriesOf(receiver, key, realId).length;
      await expect
        .poll(count, {
          timeout: SLO.twWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
          message: "the slow request arrived",
        })
        .toBe(1);
      // Setup, asserted: the receiver took the slow path for this delivery.
      expect(deliveriesOf(receiver, key, realId)[0]?.mode, "setup: receiver answered slow").toBe(
        "slow",
      );
      const startedMs = Date.now();
      await expect
        .poll(
          () =>
            quietState({
              count: count(),
              expected: 1,
              startedMs,
              nowMs: Date.now(),
              windowMs: TW_QUIET_WINDOW_MS,
            }),
          {
            timeout: TW_QUIET_TIMEOUT_MS,
            intervals: POLL_INTERVALS,
            message: "no retry inside the quiet window",
          },
        )
        .toBe("quiet");
    } finally {
      await runAllThenRethrow([
        ...removeEach(created, (id) => tw.people.remove(id)),
        () => hook.remove(),
      ]);
    }
  });
}

test("P2-TW-WH-006: the delivered body carries the created webhook id, the event name and the created person id, and one request is sent per event", async ({
  tw,
  receiverHandle,
}) => {
  const testId = "tw-identity";
  const key = receiverHandle.key(testId);
  const receiver = receiverHandle.receiver;
  const createdAtMs = Date.now();
  const hook = await createFreshWebhook({
    tw,
    receiverHandle,
    testId,
    operations: ["person.created"],
  });
  const created: string[] = [];
  try {
    created.push(...(await awaitCanary({ tw, receiver, key, createdAtMs })).personIds);
    const realId = await tw.people.create(runScopedName("tw-identity-real"));
    created.push(realId);
    await expect
      .poll(() => deliveriesOf(receiver, key, realId).length, {
        timeout: SLO.twWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "P2-TW-WH-006 delivery",
      })
      .toBe(1);
    // One request per event: the count holds at exactly one for the whole quiet window (not only at this instant).
    const startedMs = Date.now();
    await expect
      .poll(
        () =>
          quietState({
            count: deliveriesOf(receiver, key, realId).length,
            expected: 1,
            startedMs,
            nowMs: Date.now(),
            windowMs: TW_QUIET_WINDOW_MS,
          }),
        {
          timeout: TW_QUIET_TIMEOUT_MS,
          intervals: POLL_INTERVALS,
          message: "no second request in the quiet window",
        },
      )
      .toBe("quiet");
    const delivery = deliveriesOf(receiver, key, realId)[0];
    if (delivery === undefined) throw new Error("TEST BUG: delivery vanished after the poll");
    const body = JSON.parse(delivery.rawBody.toString("utf8")) as {
      webhookId: string;
      eventName: string;
      record: { id: string };
    };
    expect(body).toMatchObject({
      webhookId: hook.id,
      eventName: "person.created",
      record: { id: realId },
    });
    expect(Object.keys(body)).toEqual(
      expect.arrayContaining([
        "targetUrl",
        "eventName",
        "objectMetadata",
        "workspaceId",
        "webhookId",
        "eventDate",
        "record",
      ]),
    );
    expect(bodyErrors(body)).toEqual([]);
  } finally {
    await runAllThenRethrow([
      ...removeEach(created, (id) => tw.people.remove(id)),
      () => hook.remove(),
    ]);
  }
});
