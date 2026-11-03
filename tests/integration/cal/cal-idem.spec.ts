import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { calBookingApi, attendeeEmailFor } from "../../../src/lanes/cal/booking.ts";
import { eventTypeIdBySlug } from "../../../src/lanes/cal/event-types.ts";
import {
  apiBase,
  bookingRowsForEmail,
  createConfirmationEventType,
  deleteEventType,
  PRO_EMAIL,
  PRO_SLUG_30,
  slotStartsAhead,
} from "../../../src/lanes/cal/cases.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";

const db = (): ReturnType<typeof readOnlyDb> => readOnlyDb("cal");

test.describe("P2-CAL-IDEM booking idempotency", () => {
  test("P2-CAL-IDEM-001 an identical ACCEPTED booking is refused by the unique key (positive control)", async ({
    request,
    calAuth,
  }) => {
    const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
    const starts = await slotStartsAhead(request, calAuth, eventTypeId);
    const api = calBookingApi({ request, apiBaseUrl: apiBase(), auth: calAuth });
    const email = attendeeEmailFor(currentRunPrefix(), "idem-1");
    const first = await api.create({
      eventTypeId,
      start: String(starts[6]),
      attendeeEmail: email,
      attendeeName: "idem",
    });
    try {
      expect(first.status).toBe(201);
      const second = await api.create({
        eventTypeId,
        start: String(starts[6]),
        attendeeEmail: email,
        attendeeName: "idem",
      });
      // Measured (docs/probes/2026-11-02-p2-lane-cal-live-probes.md L1): 400 BadRequest; the unique idempotency key refuses the duplicate (not 409).
      expect(second.status).toBe(400);
      const rows = await bookingRowsForEmail(db(), email);
      expect(rows.map((r) => r.uid)).toEqual(first.uids);
      expect(rows.map((r) => r.status)).toEqual(["accepted"]);
    } finally {
      for (const uid of first.uids) await api.cancel(uid, "P2 lane cleanup");
    }
  });

  test("P2-CAL-IDEM-001 a PENDING retry creates at most one PENDING booking", async ({
    request,
    calAuth,
  }) => {
    const slug = `p2-pend-${currentRunPrefix().slice(-8)}`;
    const typeId = await createConfirmationEventType(
      request,
      calAuth,
      slug,
      `p2 pending ${currentRunPrefix()}`,
    );
    const api = calBookingApi({ request, apiBaseUrl: apiBase(), auth: calAuth });
    const email = attendeeEmailFor(currentRunPrefix(), "idem-pending");
    let firstUid = "";
    try {
      // Setup, asserted first: the type requires confirmation, and the first booking is PENDING.
      expect(
        await db().select(`SELECT "requiresConfirmation" AS rc FROM "EventType" WHERE "id" = $1`, [
          typeId,
        ]),
      ).toEqual([{ rc: true }]);
      const starts = await slotStartsAhead(request, calAuth, typeId);
      const first = await api.create({
        eventTypeId: typeId,
        start: String(starts[0]),
        attendeeEmail: email,
        attendeeName: "pending",
      });
      expect(first.status).toBe(201);
      firstUid = first.uids[0] ?? "";
      expect(await bookingRowsForEmail(db(), email)).toEqual([
        { uid: firstUid, status: "pending" },
      ]);
      // Retry of the identical request: the API answers the same booking and no second row is created.
      const second = await api.create({
        eventTypeId: typeId,
        start: String(starts[0]),
        attendeeEmail: email,
        attendeeName: "pending",
      });
      // Measured (probe L10): the retry answers 201 with the same uid.
      expect(second.status).toBe(201);
      expect(second.uids).toEqual([firstUid]);
      // Every row for this email, unfiltered: no extra row of any status may hide behind a filter.
      expect(await bookingRowsForEmail(db(), email)).toEqual([
        { uid: firstUid, status: "pending" },
      ]);
    } finally {
      if (firstUid !== "") await api.cancel(firstUid, "P2 lane cleanup");
      expect(await deleteEventType(request, calAuth, typeId)).toBe(200);
    }
  });
});
