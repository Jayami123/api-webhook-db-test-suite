import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { calBookingApi, attendeeEmailFor } from "../../../src/lanes/cal/booking.ts";
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

const db = (): ReturnType<typeof readOnlyDb> => readOnlyDb("cal");
const SLOT_MS = 30 * 60_000;

/** Availability windows of the pro user's schedules (Availability.scheduleId -> Schedule.userId; schema checked: docs/probes/2026-11-02-p2-lane-cal-live-probes.md L11). */
type Window = {
  days: number[];
  startTime: string;
  endTime: string;
};
async function availabilityWindows(): Promise<Window[]> {
  return db().select<Window>(
    `SELECT a."days" AS days, to_char(a."startTime", 'HH24:MI') AS "startTime", to_char(a."endTime", 'HH24:MI') AS "endTime" FROM "Availability" a JOIN "Schedule" s ON s."id" = a."scheduleId" JOIN "users" u ON u."id" = s."userId" WHERE u."email" = $1`,
    [PRO_EMAIL],
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
  test("P2-CAL-PROP-001 every returned slot lies inside the seeded availability", async ({
    request,
    calAuth,
  }) => {
    const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
    const windows = await availabilityWindows();
    expect(windows.length).toBeGreaterThan(0);
    const starts = await slotStartsAhead(request, calAuth, eventTypeId, "Europe/London");
    expect(starts.length).toBeGreaterThan(0);
    for (const s of starts) {
      const at = new Date(s);
      const { weekday, hhmm } = localParts(at, "Europe/London");
      const inside = windows.some(
        (w) => w.days.includes(weekday) && hhmm >= w.startTime && hhmm < w.endTime,
      );
      expect(
        inside,
        `slot ${s} (London ${hhmm}, weekday ${String(weekday)}) outside availability`,
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
      for (const uid of booked.uids) await api.cancel(uid, "P2 lane cleanup");
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
    // Negative control: moving one bound by an hour changes the set, so the equality above can fail.
    const shifted = await slotInstantsBetween(
      request,
      calAuth,
      eventTypeId,
      startUtc,
      `${day(6)}T01:00:00Z`,
      "UTC",
    );
    expect(shifted).not.toEqual(baseline);
  });
});
