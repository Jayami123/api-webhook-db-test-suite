import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { calBookingApi, attendeeEmailFor } from "../../../src/lanes/cal/booking.ts";
import { eventTypeIdBySlug } from "../../../src/lanes/cal/event-types.ts";
import {
  apiBase,
  bookingRowsForEmail,
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
});
