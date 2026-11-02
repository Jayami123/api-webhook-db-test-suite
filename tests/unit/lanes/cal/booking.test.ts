import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BOOKINGS_VERSION,
  SLOTS_VERSION,
  apiHeaders,
  attendeeEmailFor,
  utcIso,
} from "../../../../src/lanes/cal/booking.ts";
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
