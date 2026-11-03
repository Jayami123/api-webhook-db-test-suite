import { test, expect } from "../../../src/fixtures/index.ts";
import { deliveriesOf } from "../../../src/lanes/tw/visible.ts";
import { awaitCanary } from "../../../src/lanes/tw/waits.ts";
import { createFreshWebhook } from "../../../src/lanes/tw/webhook-factory.ts";
import { bodyErrors } from "../../../src/lanes/tw/payload-schema.ts";
import { softRemovePerson } from "../../../src/lanes/tw/soft-delete.ts";
import { quietState } from "../../../src/lanes/tw/quiet.ts";
import {
  POLL_INTERVALS,
  SLO,
  TW_QUIET_TIMEOUT_MS,
  TW_QUIET_WINDOW_MS,
} from "../../../src/lanes/tw/slo.ts";
import { runScopedName } from "../../../src/run/prefix.ts";
import type { Delivery } from "../../../src/webhooks/receiver.ts";

const eventOf = (d: Delivery): string =>
  (JSON.parse(d.rawBody.toString("utf8")) as { eventName: string }).eventName;

test("P2-TW-WH-003: person.created, person.updated and person.deleted each arrive once and match the body schema", async ({
  tw,
  receiverHandle,
}) => {
  const testId = "tw-payload";
  const key = receiverHandle.key(testId);
  const createdAtMs = Date.now();
  const hook = await createFreshWebhook({
    tw,
    receiverHandle,
    testId,
    operations: ["person.created", "person.updated", "person.deleted"],
  });
  const created: string[] = [];
  try {
    created.push(
      ...(await awaitCanary({ tw, receiver: receiverHandle.receiver, key, createdAtMs })).personIds,
    );
    const realId = await tw.people.create(runScopedName("tw-pay-real"));
    created.push(realId);
    const eventsOfReal = (): Delivery[] => deliveriesOf(receiverHandle.receiver, key, realId);
    const countOf = (name: string): number =>
      eventsOfReal().filter((d) => eventOf(d) === name).length;

    await expect
      .poll(() => countOf("person.created"), {
        timeout: SLO.twWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "created arrived",
      })
      .toBe(1);
    await tw.people.update(realId, runScopedName("tw-pay-upd"));
    await expect
      .poll(() => countOf("person.updated"), {
        timeout: SLO.twWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "updated arrived",
      })
      .toBe(1);
    // Soft delete (soft_delete=true): the event is person.deleted, and the row stays with deletedAt set. The id stays
    // in the cleanup list, so the hard delete in finally removes the row.
    const del = await softRemovePerson(tw, realId);
    expect(del.status, "soft delete is 200").toBe(200);
    await expect
      .poll(() => countOf("person.deleted"), {
        timeout: SLO.twWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "deleted arrived",
      })
      .toBe(1);

    // Quiet window: a second copy of any of the three would change the total.
    const startedMs = Date.now();
    await expect
      .poll(
        () =>
          quietState({
            count: eventsOfReal().length,
            expected: 3,
            startedMs,
            nowMs: Date.now(),
            windowMs: TW_QUIET_WINDOW_MS,
          }),
        {
          timeout: TW_QUIET_TIMEOUT_MS,
          intervals: POLL_INTERVALS,
          message: "no duplicate event inside the quiet window",
        },
      )
      .toBe("quiet");

    for (const d of eventsOfReal()) {
      expect(bodyErrors(JSON.parse(d.rawBody.toString("utf8")))).toEqual([]);
    }
    expect(eventsOfReal().map(eventOf).sort()).toEqual([
      "person.created",
      "person.deleted",
      "person.updated",
    ]);
  } finally {
    try {
      for (const id of created) await tw.people.remove(id);
    } finally {
      await hook.remove();
    }
  }
});
