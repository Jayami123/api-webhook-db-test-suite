import { randomSecret } from "../../../src/readiness/checks.ts";
import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import {
  calBookingApi,
  attendeeEmailFor,
  cancelInCleanup,
} from "../../../src/lanes/cal/booking.ts";
import { runTaskerOnce } from "../../../src/lanes/cal/cron.ts";
import { taskRowsFor } from "../../../src/lanes/cal/tasks.ts";
import {
  apiBase,
  bookingRowsForEmail,
  PRO_EMAIL,
  slotStartsAhead,
  webBase,
  must,
} from "../../../src/lanes/cal/cases.ts";
import { eventTypeIdBySlug } from "../../../src/lanes/cal/event-types.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";
import { runAllThenRethrow } from "../../../src/shared/cleanup.ts";

const db = (): ReturnType<typeof readOnlyDb> => readOnlyDb("cal");

test.describe("P2-CAL-REC recurring bookings", () => {
  test("P2-CAL-REC-002 cancelling one occurrence cancels one row and sends one BOOKING_CANCELLED", async ({
    request,
    calAuth,
    cal,
    receiverHandle,
  }) => {
    const testId = "cal-rec-002";
    const key = receiverHandle.key(testId);
    const api = calBookingApi({ request, apiBaseUrl: apiBase(), auth: calAuth });
    const email = attendeeEmailFor(currentRunPrefix(), testId);
    // What the test has created so far: finally removes only what exists.
    const track: { hookId?: string; booked: boolean } = { booked: false };
    try {
      const yogaId = await eventTypeIdBySlug(db(), PRO_EMAIL, "yoga-class");
      track.hookId = await cal.webhooks.create({
        subscriberUrl: receiverHandle.urlFor(testId),
        eventTriggers: ["BOOKING_CANCELLED"],
        secret: randomSecret(),
      });
      const starts = await slotStartsAhead(request, calAuth, yogaId);
      // Set before the create: a create that throws after the product wrote rows still has them cancelled.
      track.booked = true;
      const series = await api.create({
        eventTypeId: yogaId,
        start: String(starts[0]),
        attendeeEmail: email,
        attendeeName: "rec",
      });
      expect(series.status).toBe(201);
      // Measured (docs/probes/2026-11-02-p2-lane-cal-live-probes.md L9): one request makes a 12-occurrence series, all ACCEPTED.
      expect(series.recurringSeriesLength).toBe(12);
      const rows = await bookingRowsForEmail(db(), email);
      expect(rows.map((r) => r.status)).toEqual(Array(12).fill("accepted"));
      expect(await api.cancel(must(rows[0], "recurring row").uid, "P2 lane one occurrence")).toBe(
        200,
      );
      expect(await runTaskerOnce(request, webBase(), process.env["CRON_SECRET"])).toBe(200);
      await expect
        .poll(() => receiverHandle.receiver.deliveries(key).length, {
          timeout: SLO.calWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
        })
        .toBe(1);
      const body = JSON.parse(
        must(receiverHandle.receiver.deliveries(key)[0], "delivery").rawBody.toString("utf8"),
      ) as { triggerEvent: string };
      expect(body.triggerEvent).toBe("BOOKING_CANCELLED");
      const after = await bookingRowsForEmail(db(), email);
      expect(after.map((r) => r.status)).toEqual([
        "cancelled",
        ...Array.from({ length: 11 }, () => "accepted"),
      ]);
      expect(await taskRowsFor(db(), currentRunPrefix(), testId)).toHaveLength(1);
    } finally {
      // Only accepted rows are cancelled: the occurrence the test cancelled is skipped, so every cancel expects 200.
      // The series rows are read by this run's attendee email, so the lookup runs only once a create was sent.
      const accepted = track.booked
        ? (await bookingRowsForEmail(db(), email)).filter((r) => r.status === "accepted")
        : [];
      const hookId = track.hookId;
      await runAllThenRethrow([
        ...accepted.map((r) => () => cancelInCleanup(api, r.uid, { cancelledByTest: false })),
        ...(hookId === undefined ? [] : [() => cal.webhooks.remove(hookId)]),
      ]);
    }
  });
});
