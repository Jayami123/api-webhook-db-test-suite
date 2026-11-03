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
  type BookingResult,
} from "../../../src/lanes/cal/booking.ts";
import { eventTypeIdBySlug } from "../../../src/lanes/cal/event-types.ts";
import { fireScheduledTriggersOnce } from "../../../src/lanes/cal/cron.ts";
import { CAL_QUIET_WINDOW_MS, quietState } from "../../../src/lanes/cal/quiet.ts";
import {
  moveStartAfter,
  scheduledRowsForBooking,
  scheduledRowsForHook,
} from "../../../src/lanes/cal/scheduled.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";
import type { CalAuth } from "../../../src/auth/cal.ts";
import type { ApiRequestLike } from "../../../src/clients/base.ts";
import type { CalClient } from "../../../src/clients/cal.ts";

const db = (): ReturnType<typeof readOnlyDb> => readOnlyDb("cal");
let writerHandle: ReturnType<typeof createFixtureWriter> | undefined;
const writer = (): ReturnType<typeof createFixtureWriter> =>
  (writerHandle ??= createFixtureWriter({
    product: "cal",
    logFile: defaultFixtureLogFile(currentRunPrefix()),
  }));
const cronKey = (): string => process.env["CRON_API_KEY"] ?? "";

test.afterAll(async () => {
  await writerHandle?.close();
});

interface Ctx {
  request: ApiRequestLike;
  calAuth: CalAuth;
  cal: CalClient;
  receiverHandle: ReceiverHandle;
}

/** One MEETING_STARTED webhook for this test's URL, then one booking. Cleanup is registered by the caller first. */
async function hookAndBooking(
  ctx: Ctx,
  testId: string,
  startIndex: number,
  track: { hookId?: string; uid?: string },
): Promise<{ rowIds: number[]; url: string; api: ReturnType<typeof calBookingApi> }> {
  const url = ctx.receiverHandle.urlFor(testId);
  track.hookId = await ctx.cal.webhooks.create({
    subscriberUrl: url,
    eventTriggers: ["MEETING_STARTED"],
    secret: randomSecret(),
  });
  const api = calBookingApi({ request: ctx.request, apiBaseUrl: apiBase(), auth: ctx.calAuth });
  const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
  const starts = await slotStartsAhead(ctx.request, ctx.calAuth, eventTypeId);
  const booked: BookingResult = await api.create({
    eventTypeId,
    start: String(starts[startIndex]),
    attendeeEmail: attendeeEmailFor(currentRunPrefix(), testId),
    attendeeName: "sch",
  });
  expect(booked.status).toBe(201);
  track.uid = booked.uids[0] ?? "";
  const rows = await scheduledRowsForHook(db(), track.uid, url);
  expect(rows).toHaveLength(1);
  return { rowIds: rows.map((r) => r.id), url, api };
}

async function cleanup(ctx: Ctx, track: { hookId?: string; uid?: string }): Promise<void> {
  const api = calBookingApi({ request: ctx.request, apiBaseUrl: apiBase(), auth: ctx.calAuth });
  if (track.uid !== undefined && track.uid !== "") await api.cancel(track.uid, "P2 lane cleanup");
  if (track.hookId !== undefined) await ctx.cal.webhooks.remove(track.hookId);
}

test.describe("P2-CAL-SCH scheduled triggers (serial)", () => {
  test("P2-CAL-SCH-001 a MEETING_STARTED row exists after booking and is removed on cancel", async ({
    request,
    calAuth,
    cal,
    receiverHandle,
  }) => {
    const ctx = { request, calAuth, cal, receiverHandle };
    const track: { hookId?: string; uid?: string } = {};
    try {
      const made = await hookAndBooking(ctx, "cal-sch-001", 6, track);
      expect(await made.api.cancel(track.uid ?? "", "P2 lane cancel")).toBe(200);
      await expect
        .poll(async () => (await scheduledRowsForBooking(db(), track.uid ?? "")).length, {
          timeout: SLO.calWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
          message: "scheduled row after cancel",
        })
        .toBe(0);
    } finally {
      await cleanup(ctx, track);
    }
  });

  test("P2-CAL-SCH-002 a due row is delivered once by one fire (positive control)", async ({
    request,
    calAuth,
    cal,
    receiverHandle,
  }) => {
    const ctx = { request, calAuth, cal, receiverHandle };
    const track: { hookId?: string; uid?: string } = {};
    const testId = "cal-sch-002c";
    const key = ctx.receiverHandle.key(testId);
    try {
      const made = await hookAndBooking(ctx, testId, 7, track);
      await moveStartAfter(
        writer(),
        must((await scheduledRowsForHook(db(), track.uid ?? "", made.url))[0], "scheduled row").id,
        60_000,
        "P2-CAL-SCH-002",
      );
      const firedAt = Date.now();
      expect(await fireScheduledTriggersOnce(ctx.request, webBase(), cronKey())).toBe(200);
      await expect
        .poll(() => ctx.receiverHandle.receiver.deliveries(key).length, {
          timeout: SLO.calWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
        })
        .toBe(1);
      await expect
        .poll(
          () =>
            quietState(
              ctx.receiverHandle.receiver.deliveries(key).length,
              1,
              firedAt,
              Date.now(),
              CAL_QUIET_WINDOW_MS,
            ),
          {
            timeout: CAL_QUIET_WINDOW_MS + 2_000,
            intervals: POLL_INTERVALS,
            message: "exactly one delivery, held through the quiet window",
          },
        )
        .toBe("quiet");
      await expect
        .poll(async () => (await scheduledRowsForHook(db(), track.uid ?? "", made.url)).length, {
          timeout: SLO.calWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
        })
        .toBe(0);
    } finally {
      await cleanup(ctx, track);
    }
  });

  test("P2-CAL-SCH-003 control: a row due a minute ago is delivered", async ({
    request,
    calAuth,
    cal,
    receiverHandle,
  }) => {
    const ctx = { request, calAuth, cal, receiverHandle };
    const track: { hookId?: string; uid?: string } = {};
    const testId = "cal-sch-003c";
    const key = ctx.receiverHandle.key(testId);
    try {
      const made = await hookAndBooking(ctx, testId, 9, track);
      await moveStartAfter(
        writer(),
        must((await scheduledRowsForHook(db(), track.uid ?? "", made.url))[0], "scheduled row").id,
        60_000,
        "P2-CAL-SCH-003",
      );
      const firedAt = Date.now();
      expect(await fireScheduledTriggersOnce(ctx.request, webBase(), cronKey())).toBe(200);
      await expect
        .poll(() => ctx.receiverHandle.receiver.deliveries(key).length, {
          timeout: SLO.calWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
        })
        .toBe(1);
      await expect
        .poll(
          () =>
            quietState(
              ctx.receiverHandle.receiver.deliveries(key).length,
              1,
              firedAt,
              Date.now(),
              CAL_QUIET_WINDOW_MS,
            ),
          {
            timeout: CAL_QUIET_WINDOW_MS + 2_000,
            intervals: POLL_INTERVALS,
            message: "exactly one delivery, held through the quiet window",
          },
        )
        .toBe("quiet");
    } finally {
      await cleanup(ctx, track);
    }
  });

  test("P2-CAL-SCH-003 a row whose startAfter is older than one day is purged with no delivery (silent purge, observed contract)", async ({
    request,
    calAuth,
    cal,
    receiverHandle,
  }) => {
    const ctx = { request, calAuth, cal, receiverHandle };
    const track: { hookId?: string; uid?: string } = {};
    const testId = "cal-sch-003p";
    const key = ctx.receiverHandle.key(testId);
    try {
      const made = await hookAndBooking(ctx, testId, 10, track);
      await moveStartAfter(
        writer(),
        must((await scheduledRowsForHook(db(), track.uid ?? "", made.url))[0], "scheduled row").id,
        2 * 864e5,
        "P2-CAL-SCH-003",
      );
      const firedAt = Date.now();
      expect(await fireScheduledTriggersOnce(ctx.request, webBase(), cronKey())).toBe(200);
      await expect
        .poll(async () => (await scheduledRowsForHook(db(), track.uid ?? "", made.url)).length, {
          timeout: SLO.calWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
          message: "stale row purged",
        })
        .toBe(0);
      await expect
        .poll(
          () =>
            quietState(
              ctx.receiverHandle.receiver.deliveries(key).length,
              0,
              firedAt,
              Date.now(),
              CAL_QUIET_WINDOW_MS,
            ),
          {
            timeout: CAL_QUIET_WINDOW_MS + 2_000,
            intervals: POLL_INTERVALS,
            message: "no delivery, held through the quiet window",
          },
        )
        .toBe("quiet");
    } finally {
      await cleanup(ctx, track);
    }
  });
});
