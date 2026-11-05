import {
  resolveEventTypeSchedule,
  dateOverridesInWindow,
} from "../../../src/lanes/cal/availability.ts";
import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import {
  calBookingApi,
  attendeeEmailFor,
  cancelInCleanup,
} from "../../../src/lanes/cal/booking.ts";
import { eventTypeIdBySlug } from "../../../src/lanes/cal/event-types.ts";
import {
  apiBase,
  bookingRowsForEmail,
  PRO_EMAIL,
  PRO_SLUG_30,
  SLOTS_CACHE_BUDGET_MS,
  slotInstantsBetween,
  slotStartsAhead,
} from "../../../src/lanes/cal/cases.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS } from "../../../src/slo.ts";
import { runAllThenRethrow } from "../../../src/shared/cleanup.ts";

const db = (): ReturnType<typeof readOnlyDb> => readOnlyDb("cal");
const SLOT_MS = 30 * 60_000;

/** Weekly availability rows of one schedule (Availability.scheduleId; date overrides are asserted absent by the test). */
type Window = { days: number[]; startTime: string; endTime: string };
async function availabilityWindows(scheduleId: number): Promise<Window[]> {
  return db().select<Window>(
    `SELECT a."days" AS days, to_char(a."startTime", 'HH24:MI') AS "startTime", to_char(a."endTime", 'HH24:MI') AS "endTime" FROM "Availability" a WHERE a."scheduleId" = $1 AND a."date" IS NULL`,
    [scheduleId],
  );
}

/** Local weekday (0 = Sunday) and HH:MI of an instant in a zone. */
function localParts(instant: Date, zone: string): { weekday: number; hhmm: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    weekday: weekdays.indexOf(map["weekday"] ?? ""),
    hhmm: `${map["hour"] ?? ""}:${map["minute"] ?? ""}`,
  };
}

test.describe("P2-CAL-PROP slot properties", () => {
  test("P2-CAL-PROP-001 every returned slot lies inside the event type's own schedule (in its zone)", async ({
    request,
    calAuth,
  }) => {
    const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
    // Setup, asserted first: the schedule and zone the product uses for this event type, read from the rows (A4).
    const resolved = await resolveEventTypeSchedule(db(), PRO_EMAIL, PRO_SLUG_30);
    expect(resolved.scheduleId).toBeGreaterThan(0);
    expect(() => new Intl.DateTimeFormat("en-GB", { timeZone: resolved.timeZone })).not.toThrow();
    const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    expect(await dateOverridesInWindow(db(), resolved.scheduleId, day(3), day(12))).toBe(0);
    const windows = await availabilityWindows(resolved.scheduleId);
    expect(windows.length, "weekly availability rows of the resolved schedule").toBeGreaterThan(0);
    // The oracle is this schedule and this zone only (never another schedule, never a hard-coded zone).
    const starts = await slotStartsAhead(request, calAuth, eventTypeId, resolved.timeZone);
    expect(starts.length).toBeGreaterThan(0);
    for (const s of starts) {
      const at = new Date(s);
      const { weekday, hhmm } = localParts(at, resolved.timeZone);
      const inside = windows.some(
        (w) => w.days.includes(weekday) && hhmm >= w.startTime && hhmm < w.endTime,
      );
      expect(
        inside,
        `slot ${s} (${resolved.timeZone} ${hhmm}, weekday ${String(weekday)}) outside schedule ${String(resolved.scheduleId)}`,
      ).toBe(true);
      expect(at.getUTCMinutes() % 30).toBe(0);
    }
  });

  test("P2-CAL-PROP-002 no returned slot overlaps a booked interval", async ({
    request,
    calAuth,
  }) => {
    const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
    const starts = await slotStartsAhead(request, calAuth, eventTypeId);
    const api = calBookingApi({ request, apiBaseUrl: apiBase(), auth: calAuth });
    const email = attendeeEmailFor(currentRunPrefix(), "prop-2");
    const booked = await api.create({
      eventTypeId,
      start: String(starts[8]),
      attendeeEmail: email,
      attendeeName: "prop",
    });
    try {
      expect(booked.status).toBe(201);
      const bookedStart = Date.parse(String(starts[8]));
      // The booked start leaves the listing once the per-query slot cache expires (SLOTS_CACHE_BUDGET_MS).
      await expect
        .poll(
          async () =>
            (await slotStartsAhead(request, calAuth, eventTypeId)).includes(String(starts[8])),
          {
            timeout: SLOTS_CACHE_BUDGET_MS,
            intervals: POLL_INTERVALS,
            message: "booked slot still listed after the slot cache budget",
          },
        )
        .toBe(false);
      const after = await slotStartsAhead(request, calAuth, eventTypeId);
      for (const s of after) {
        const t = Date.parse(s);
        const overlaps = t < bookedStart + SLOT_MS && t + SLOT_MS > bookedStart;
        expect(overlaps, `slot ${s} overlaps the booking`).toBe(false);
      }
      expect((await bookingRowsForEmail(db(), email)).map((r) => r.status)).toEqual(["accepted"]);
    } finally {
      await runAllThenRethrow(
        booked.uids.map((uid) => () => cancelInCleanup(api, uid, { cancelledByTest: false })),
      );
    }
  });

  test("P2-CAL-PROP-003 the result set is invariant under the viewer timeZone (fixed UTC bounds)", async ({
    request,
    calAuth,
  }) => {
    const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
    const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    const startUtc = `${day(3)}T00:00:00Z`;
    const endUtc = `${day(6)}T00:00:00Z`;
    const zones = ["Europe/London", "America/New_York", "Asia/Tokyo", "Australia/Sydney", "UTC"];
    const sets: string[][] = [];
    for (const z of zones)
      sets.push(await slotInstantsBetween(request, calAuth, eventTypeId, startUtc, endUtc, z));
    // Setup, asserted before the property: the UTC baseline (first zone) is non-empty. The count is database state, not a constant.
    const baseline = sets[0];
    expect(baseline?.length ?? 0).toBeGreaterThan(0);
    // Property: every viewer zone returns the same UTC instants as the baseline (same instants, not only the same count).
    for (const set of sets) expect(set).toEqual(baseline);
    // Deterministic control, derived from the baseline. A start that is not midnight is an instant (slots-input.service.ts:126-133
    // at c2b7ac4), so starting one minute after the first baseline instant must drop exactly that instant.
    const firstInstant = baseline?.[0] ?? "";
    const shiftedStart = new Date(Date.parse(firstInstant) + 60_000).toISOString();
    const shifted = await slotInstantsBetween(
      request,
      calAuth,
      eventTypeId,
      shiftedStart,
      endUtc,
      "UTC",
    );
    expect(shifted).toEqual((baseline ?? []).slice(1));
  });
});
