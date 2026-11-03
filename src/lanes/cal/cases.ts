import type { ReadOnlyDb } from "../../db/pg.ts";
import { apiBaseUrl, loadEnv } from "../../env.ts";
import { calBookingApi, type BookingRequest } from "./booking.ts";
import type { CalAuth } from "../../auth/cal.ts";
import type { ApiRequestLike } from "../../clients/base.ts";

/** The seeded pro user's 30-minute event type (seed: scripts/seed.ts, verified by probe P9). */
export const PRO_EMAIL = "pro@example.com";
export const PRO_SLUG_30 = "30min";

/** Web app base (login, tRPC, cron and Daily routes). No trailing slash. */
export const webBase = (): string => loadEnv().CAL_BASE_URL.replace(/\/$/, "");
/** API v2 base (5555). No trailing slash. */
export const apiBase = (): string => apiBaseUrl("cal").replace(/\/$/, "");

/** ISO date (YYYY-MM-DD, UTC) `n` days from now. */
export function isoDayFromNow(n: number, now: number = Date.now()): string {
  return new Date(now + n * 864e5).toISOString().slice(0, 10);
}

/** The slot list of the seeded 30-minute type for days 3 to 12 ahead (wide enough that earlier bookings never exhaust it), as ISO instants. */
export async function slotStartsAhead(
  request: ApiRequestLike,
  auth: CalAuth,
  eventTypeId: number,
  timeZone = "Europe/London",
): Promise<string[]> {
  const api = calBookingApi({ request, apiBaseUrl: apiBase(), auth });
  return api.slots({
    eventTypeId,
    fromIsoDate: isoDayFromNow(3),
    toIsoDate: isoDayFromNow(12),
    timeZone,
  });
}

/** Attendee rows of one email (the run prefix is in the email, so this finds only this run's bookings). */
export function bookingRowsForEmail(
  db: ReadOnlyDb,
  email: string,
): Promise<{ uid: string; status: string }[]> {
  return db.select<{ uid: string; status: string }>(
    `SELECT b."uid" AS uid, b."status"::text AS status FROM "Booking" b JOIN "Attendee" at ON at."bookingId" = b."id" WHERE at."email" = $1 ORDER BY b."id"`,
    [email],
  );
}

/** Count of all bookings of one event type (zero-writes checks). */
export async function bookingCountForEventType(
  db: ReadOnlyDb,
  eventTypeId: number,
): Promise<number> {
  const rows = await db.select<{ n: number }>(
    `SELECT count(*)::int AS n FROM "Booking" WHERE "eventTypeId" = $1`,
    [eventTypeId],
  );
  return rows[0]?.n ?? 0;
}

/** A booking request for the standard lane type, with a fixed attendee zone. */
export function standardBooking(
  eventTypeId: number,
  start: string,
  attendeeEmail: string,
  attendeeName = "P2 lane",
): BookingRequest {
  return { eventTypeId, start, attendeeEmail, attendeeName };
}

/**
 * Slot results are cached per query key for SLOTS_CACHE_TTL (default 2000 ms: `withSlotsCache` and
 * DEFAULT_SLOTS_CACHE_TTL in packages/platform/libraries/dist/slots.cjs, docs/probes/2026-11-02-p2-lane-cal-live-probes.md L7). A booked slot can
 * therefore still be listed for that long on the same query. Budget: the TTL plus a 3 s margin (policy bound).
 */
export const SLOTS_CACHE_BUDGET_MS = 5_000;

/** A value the test has just created or read. Absent means a broken setup: a labelled TEST BUG, never a silent default. */
export function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`TEST BUG: expected ${label}, found none`);
  return value;
}

/** A temporary event type that needs confirmation (API v2 2024-06-14 `confirmationPolicy`; the old `requiresConfirmation` field is dropped by whitelist). */
export async function createConfirmationEventType(
  request: ApiRequestLike,
  auth: CalAuth,
  slug: string,
  title: string,
): Promise<number> {
  const res = await request.fetch(`${apiBase()}/v2/event-types`, {
    method: "POST",
    headers: {
      "cal-api-version": "2024-06-14",
      authorization: auth.headerValue.reveal(),
      "content-type": "application/json",
    },
    data: JSON.stringify({
      title,
      slug,
      lengthInMinutes: 30,
      confirmationPolicy: { type: "always", blockUnconfirmedBookingsInBooker: false },
    }),
    failOnStatusCode: false,
  });
  const body = JSON.parse(await res.text()) as { data?: { id?: number } };
  return must(body.data?.id, `created event type (HTTP ${String(res.status())})`);
}

/** Deletes a temporary event type (`DELETE /v2/event-types/{id}`); returns the HTTP status. */
export async function deleteEventType(
  request: ApiRequestLike,
  auth: CalAuth,
  id: number,
): Promise<number> {
  const res = await request.fetch(`${apiBase()}/v2/event-types/${String(id)}`, {
    method: "DELETE",
    headers: { "cal-api-version": "2024-06-14", authorization: auth.headerValue.reveal() },
    failOnStatusCode: false,
  });
  return res.status();
}

/**
 * Slot instants (UTC, sorted) for explicit UTC bounds (`start`/`end` as `...Z` datetimes, which the OAS requires) and a viewer
 * timeZone. Date-only bounds are interpreted in the viewer's zone (probe L11); explicit bounds are not.
 */
export async function slotInstantsBetween(
  request: ApiRequestLike,
  auth: CalAuth,
  eventTypeId: number,
  startUtc: string,
  endUtc: string,
  timeZone: string,
): Promise<string[]> {
  const url = `${apiBase()}/v2/slots?eventTypeId=${String(eventTypeId)}&start=${encodeURIComponent(startUtc)}&end=${encodeURIComponent(endUtc)}&timeZone=${encodeURIComponent(timeZone)}`;
  const res = await request.fetch(url, {
    headers: { "cal-api-version": "2024-09-04", authorization: auth.headerValue.reveal() },
    failOnStatusCode: false,
  });
  const body = JSON.parse(await res.text()) as { data?: Record<string, { start: string }[]> };
  return Object.values(body.data ?? {})
    .flat()
    .map((s) => new Date(s.start).toISOString())
    .sort();
}
