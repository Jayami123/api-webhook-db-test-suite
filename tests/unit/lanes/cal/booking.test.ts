import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BOOKINGS_VERSION,
  CAL_ALREADY_CANCELLED_STATUS,
  SLOTS_VERSION,
  apiHeaders,
  attendeeEmailFor,
  calBookingApi,
  cancelInCleanup,
  utcIso,
} from "../../../../src/lanes/cal/booking.ts";
import type { ApiRequestLike } from "../../../../src/clients/base.ts";
import type { CalAuth } from "../../../../src/auth/cal.ts";
import { SecretString } from "../../../../src/auth/secret.ts";

const fakeAuth = {
  headerValue: new SecretString("Bearer cal_0123456789abcdef0123456789abcdef"),
} as unknown as CalAuth;

test("the attendee email carries the run prefix and the label", () => {
  assert.equal(
    attendeeEmailFor("p2-qa-20261102t180000z-deadbeef", "booking-1"),
    "p2-qa-20261102t180000z-deadbeef-booking-1@example.com",
  );
  assert.throws(() => attendeeEmailFor("p2-qa", "Bad Label"), /TEST BUG: attendee label/);
});

test("utcIso returns an ISO 8601 instant in UTC with a Z suffix", () => {
  assert.equal(utcIso(new Date("2026-11-05T10:30:00.000+01:00")), "2026-11-05T09:30:00.000Z");
  assert.throws(() => utcIso(new Date("not a date")), /TEST BUG: invalid Date/);
});

test("slots use cal-api-version 2024-09-04 and bookings use 2024-08-13", () => {
  assert.equal(SLOTS_VERSION, "2024-09-04");
  assert.equal(BOOKINGS_VERSION, "2024-08-13");
  assert.equal(apiHeaders(fakeAuth, SLOTS_VERSION)["cal-api-version"], "2024-09-04");
  assert.equal(apiHeaders(fakeAuth, BOOKINGS_VERSION)["cal-api-version"], "2024-08-13");
});

/** A fake booking API whose cancel answers `status`. */
const cancelling = (status: number) => ({ cancel: () => Promise.resolve(status) });

test("cancelInCleanup: 200 resolves, whether or not the test cancelled first", async () => {
  await cancelInCleanup(cancelling(200), "uid-1", { cancelledByTest: false });
  await cancelInCleanup(cancelling(200), "uid-1", { cancelledByTest: true });
});

test("cancelInCleanup: the already-cancelled status is accepted only after the test's own cancel", async () => {
  await cancelInCleanup(cancelling(CAL_ALREADY_CANCELLED_STATUS), "uid-2", {
    cancelledByTest: true,
  });
  await assert.rejects(
    cancelInCleanup(cancelling(CAL_ALREADY_CANCELLED_STATUS), "uid-2", { cancelledByTest: false }),
    /cleanup: cancel booking uid-2 answered 400 \(expected 200\)/,
  );
});

test("cancelInCleanup: any other status throws, with or without the test's cancel", async () => {
  for (const status of [401, 404, 500])
    for (const cancelledByTest of [false, true])
      await assert.rejects(
        cancelInCleanup(cancelling(status), "uid-3", { cancelledByTest }),
        new RegExp(`answered ${String(status)}`),
      );
});

test("slots() throws on a non-200 instead of returning an empty list", async () => {
  const request: ApiRequestLike = {
    fetch: () =>
      Promise.resolve({
        status: () => 400,
        headers: () => ({}),
        text: () => Promise.resolve(JSON.stringify({ status: "error" })),
      }),
  };
  const api = calBookingApi({ request, apiBaseUrl: "http://fake.invalid", auth: fakeAuth });
  await assert.rejects(
    api.slots({
      eventTypeId: 1,
      fromIsoDate: "2026-11-05",
      toIsoDate: "2026-11-06",
      timeZone: "UTC",
    }),
    /slots answered 400 for 2026-11-05..2026-11-06 \(UTC\)/,
  );
});
