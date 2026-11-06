import { test, expect, type ReceiverHandle } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { createFixtureWriter, defaultFixtureLogFile } from "../../../src/db/fixture.ts";
import { randomSecret } from "../../../src/readiness/checks.ts";
import {
  apiBase,
  PRO_EMAIL,
  PRO_SLUG_30,
  slotStartsAhead,
  webBase,
  must,
} from "../../../src/lanes/cal/cases.ts";
import {
  calBookingApi,
  attendeeEmailFor,
  cancelInCleanup,
} from "../../../src/lanes/cal/booking.ts";
import { eventTypeIdBySlug } from "../../../src/lanes/cal/event-types.ts";
import { runTaskerOnce } from "../../../src/lanes/cal/cron.ts";
import { taskRowsFor } from "../../../src/lanes/cal/tasks.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
import type { CalAuth } from "../../../src/auth/cal.ts";
import type { ApiRequestLike } from "../../../src/clients/base.ts";
import type { CalClient } from "../../../src/clients/cal.ts";
import { runAllThenRethrow } from "../../../src/shared/cleanup.ts";
import { expectedDefect } from "../../../src/ci/known-defect.ts";

const db = (): ReturnType<typeof readOnlyDb> => readOnlyDb("cal");
let writerHandle: ReturnType<typeof createFixtureWriter> | undefined;
const writer = (): ReturnType<typeof createFixtureWriter> =>
  (writerHandle ??= createFixtureWriter({
    product: "cal",
    logFile: defaultFixtureLogFile(currentRunPrefix()),
  }));
const cronSecret = (): string => process.env["CRON_SECRET"] ?? "";

test.afterAll(async () => {
  await writerHandle?.close();
});

interface Ctx {
  request: ApiRequestLike;
  calAuth: CalAuth;
  cal: CalClient;
  receiverHandle: ReceiverHandle;
}

/** A BOOKING_CREATED webhook for this test and `count` bookings from the standard type (starts from `from`). */
async function webhookAndBookings(
  ctx: Ctx,
  testId: string,
  from: number,
  count: number,
  track: { hookId?: string; uids: string[] },
): Promise<void> {
  track.hookId = await ctx.cal.webhooks.create({
    subscriberUrl: ctx.receiverHandle.urlFor(testId),
    eventTriggers: ["BOOKING_CREATED"],
    secret: randomSecret(),
  });
  const api = calBookingApi({ request: ctx.request, apiBaseUrl: apiBase(), auth: ctx.calAuth });
  const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
  const starts = await slotStartsAhead(ctx.request, ctx.calAuth, eventTypeId);
  for (let i = from; i < from + count; i += 1) {
    const booked = await api.create({
      eventTypeId,
      start: String(starts[i]),
      attendeeEmail: attendeeEmailFor(currentRunPrefix(), `${testId}-${String(i)}`),
      attendeeName: "task",
    });
    expect(
      booked.status,
      `booking at slot ${String(i)} (${String(starts[i])}): ${booked.bodyHead}`,
    ).toBe(201);
    track.uids.push(booked.uids[0] ?? "");
  }
}

async function cleanup(ctx: Ctx, track: { hookId?: string; uids: string[] }): Promise<void> {
  const api = calBookingApi({ request: ctx.request, apiBaseUrl: apiBase(), auth: ctx.calAuth });
  const hookId = track.hookId;
  await runAllThenRethrow([
    ...track.uids
      .filter((uid) => uid !== "")
      .map((uid) => () => cancelInCleanup(api, uid, { cancelledByTest: false })),
    ...(hookId === undefined ? [] : [() => ctx.cal.webhooks.remove(hookId)]),
  ]);
}

const rowsOf = (testId: string) => taskRowsFor(db(), currentRunPrefix(), testId);

test.describe("P2-CAL-TASK tasker (serial)", () => {
  test("P2-CAL-TASK-001 a thrown delivery is retried once per tasker run up to maxAttempts, then stops", async ({
    request,
    calAuth,
    cal,
    receiverHandle,
  }) => {
    const testId = "cal-task-001";
    const key = receiverHandle.key(testId);
    const track: { hookId?: string; uids: string[] } = { uids: [] };
    const ctx = { request, calAuth, cal, receiverHandle };
    try {
      await webhookAndBookings(ctx, testId, 0, 1, track);
      receiverHandle.receiver.setMode(key, { kind: "reset" });
      const expectations: [number[], number, string | null][] = [
        [[1], 1, "fetch failed"],
        [[1, 2], 2, "fetch failed"],
        [[1, 2, 3], 3, "fetch failed"],
        [[1, 2, 3], 3, "fetch failed"],
      ];
      for (const [attemptsSeen, attempts, lastError] of expectations) {
        expect(await runTaskerOnce(request, webBase(), cronSecret())).toBe(200);
        expect(receiverHandle.receiver.deliveries(key).map((d) => d.attempt)).toEqual(attemptsSeen);
        expect(await rowsOf(testId)).toMatchObject([{ attempts, succeeded: false, lastError }]);
      }
    } finally {
      receiverHandle.receiver.setMode(key, { kind: "ok" });
      await cleanup(ctx, track);
    }
  });

  test("P2-CAL-TASK-001 a Task scheduled in the future is not run until it is due (fixture role)", async ({
    request,
    calAuth,
    cal,
    receiverHandle,
  }) => {
    const testId = "cal-task-001f";
    const key = receiverHandle.key(testId);
    const track: { hookId?: string; uids: string[] } = { uids: [] };
    const ctx = { request, calAuth, cal, receiverHandle };
    try {
      await webhookAndBookings(ctx, testId, 1, 1, track);
      const [task] = await rowsOf(testId);
      expect(task).toMatchObject({ attempts: 0, succeeded: false });
      await writer().update({
        table: "Task",
        column: "scheduledAt",
        pk: must(task, "task row").id,
        value: new Date(Date.now() + 3_600_000),
        caseId: "P2-CAL-TASK-001",
      });
      expect(await runTaskerOnce(request, webBase(), cronSecret())).toBe(200);
      expect(receiverHandle.receiver.deliveries(key)).toHaveLength(0);
      expect(await rowsOf(testId)).toMatchObject([{ attempts: 0, succeeded: false, due: false }]);
      await writer().update({
        table: "Task",
        column: "scheduledAt",
        pk: must(task, "task row").id,
        value: new Date(Date.now() - 1_000),
        caseId: "P2-CAL-TASK-001",
      });
      expect(await runTaskerOnce(request, webBase(), cronSecret())).toBe(200);
      expect(receiverHandle.receiver.deliveries(key)).toHaveLength(1);
      expect(await rowsOf(testId)).toMatchObject([{ attempts: 1, succeeded: true }]);
    } finally {
      await cleanup(ctx, track);
    }
  });

  test("P2-CAL-TASK-002 a retry that succeeds marks the task done and no later run retries it", async ({
    request,
    calAuth,
    cal,
    receiverHandle,
  }) => {
    const testId = "cal-task-002";
    const key = receiverHandle.key(testId);
    const track: { hookId?: string; uids: string[] } = { uids: [] };
    const ctx = { request, calAuth, cal, receiverHandle };
    try {
      await webhookAndBookings(ctx, testId, 2, 1, track);
      receiverHandle.receiver.setMode(key, { kind: "reset" });
      expect(await runTaskerOnce(request, webBase(), cronSecret())).toBe(200);
      expect(await rowsOf(testId)).toMatchObject([{ attempts: 1, succeeded: false }]);
      receiverHandle.receiver.setMode(key, { kind: "ok" });
      expect(await runTaskerOnce(request, webBase(), cronSecret())).toBe(200);
      expect(await rowsOf(testId)).toMatchObject([{ attempts: 2, succeeded: true }]);
      expect(await runTaskerOnce(request, webBase(), cronSecret())).toBe(200);
      expect(await rowsOf(testId)).toMatchObject([{ attempts: 2, succeeded: true }]);
      expect(receiverHandle.receiver.deliveries(key)).toHaveLength(2);
    } finally {
      receiverHandle.receiver.setMode(key, { kind: "ok" });
      await cleanup(ctx, track);
    }
  });

  test("P2-CAL-TASK-003 control: one tasker run delivers each of 5 tasks exactly once", async ({
    request,
    calAuth,
    cal,
    receiverHandle,
  }) => {
    const testId = "cal-task-003c";
    const key = receiverHandle.key(testId);
    const track: { hookId?: string; uids: string[] } = { uids: [] };
    const ctx = { request, calAuth, cal, receiverHandle };
    try {
      await webhookAndBookings(ctx, testId, 3, 5, track);
      receiverHandle.receiver.setMode(key, { kind: "ok" });
      expect(await runTaskerOnce(request, webBase(), cronSecret())).toBe(200);
      expect(receiverHandle.receiver.deliveries(key)).toHaveLength(5);
      const rows = await rowsOf(testId);
      expect(rows).toHaveLength(5);
      expect(rows.every((r) => r.attempts === 1 && r.succeeded)).toBe(true);
    } finally {
      await cleanup(ctx, track);
    }
  });

  // Finding B4 (TASK-003; probe record L5, plan P5): two concurrent taskers deliver each task twice.
  // Three named repetitions show reproducibility (plan 8.5 step 3). Each: positive control, then test.fail.
  for (const round of [1, 2, 3]) {
    test(`P2-CAL-TASK-003 two concurrent taskers deliver each of 5 tasks exactly once (finding, round ${String(round)})`, async ({
      request,
      calAuth,
      cal,
      receiverHandle,
    }) => {
      const testId = `cal-task-003-r${String(round)}`;
      const key = receiverHandle.key(testId);
      const track: { hookId?: string; uids: string[] } = { uids: [] };
      const ctx = { request, calAuth, cal, receiverHandle };
      let deliveriesPerTask: number[] | undefined;
      try {
        await webhookAndBookings(ctx, testId, 4 + round * 5, 5, track);
        receiverHandle.receiver.setMode(key, { kind: "slow", delayMs: 1500 });
        const statuses = await Promise.all([
          runTaskerOnce(request, webBase(), cronSecret()),
          runTaskerOnce(request, webBase(), cronSecret()),
        ]);
        expect(statuses).toEqual([200, 200]);
        // Per task, from each delivered body (the booking uid is in the payload): the positive control is that every
        // booked task was delivered at least once, and the delivered uids are exactly these bookings (not 5 copies of one).
        const perUid = new Map<string, number>();
        for (const d of receiverHandle.receiver.deliveries(key)) {
          const body = JSON.parse(d.rawBody.toString("utf8")) as { payload: { uid: string } };
          perUid.set(body.payload.uid, (perUid.get(body.payload.uid) ?? 0) + 1);
        }
        expect([...perUid.keys()].sort()).toEqual([...track.uids].sort());
        deliveriesPerTask = [...track.uids].map((uid) => perUid.get(uid) ?? 0);
      } finally {
        receiverHandle.receiver.setMode(key, { kind: "ok" });
        await cleanup(ctx, track);
      }
      // Finding B4 (per task): each booked task is delivered exactly once. The marker is called only after the setup
      // asserts and the cleanup have finished, so a cleanup failure is a normal test failure, never the expected one.
      expectedDefect(
        "B4: two concurrent tasker runs deliver each task twice (docs/probes/2026-11-02-p2-lane-cal-live-probes.md:346)",
      );
      expect(deliveriesPerTask).toEqual([1, 1, 1, 1, 1]);
    });
  }
});
