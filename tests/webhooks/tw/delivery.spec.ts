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
    try {
      for (const id of created) await tw.people.remove(id);
    } finally {
      await hook.remove();
    }
  }
});

for (const [name, delayMs] of [
  ["P2-TW-WH-005: a 4 s receiver delay is delivered once", 4_000],
  [
    "P2-TW-WH-005: a 6 s delay is one request; the 5000 ms timeout closes the call and nothing retries",
    6_000,
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
      try {
        for (const id of created) await tw.people.remove(id);
      } finally {
        await hook.remove();
      }
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
    expect(deliveriesOf(receiver, key, realId)).toHaveLength(1);
  } finally {
    try {
      for (const id of created) await tw.people.remove(id);
    } finally {
      await hook.remove();
    }
  }
});
