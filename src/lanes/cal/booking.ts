import type { CalAuth } from "../../auth/cal.ts";
import type { ApiRequestLike } from "../../clients/base.ts";

export const SLOTS_VERSION = "2024-09-04";
export const BOOKINGS_VERSION = "2024-08-13";

export interface BookingRequest {
  readonly eventTypeId: number;
  /** An ISO instant returned by slots() (never invented). */
  readonly start: string;
  readonly attendeeEmail: string;
  readonly attendeeName: string;
}

export interface BookingResult {
  readonly status: number;
  /** Recurring event types answer an array of occurrences (P7). */
  readonly uids: readonly string[];
  readonly recurringSeriesLength: number;
  readonly bodyHead: string;
}

/** Headers for API v2. The key is revealed only into the request, never logged. */
export function apiHeaders(auth: CalAuth, version: string): Record<string, string> {
  return {
    "cal-api-version": version,
    authorization: auth.headerValue.reveal(),
    "content-type": "application/json",
  };
}

export function calBookingApi(input: {
  request: ApiRequestLike;
  apiBaseUrl: string;
  auth: CalAuth;
}) {
  const { request, apiBaseUrl, auth } = input;
  return {
    async slots(q: {
      eventTypeId: number;
      fromIsoDate: string;
      toIsoDate: string;
      timeZone: string;
    }): Promise<string[]> {
      const url = `${apiBaseUrl}/v2/slots?eventTypeId=${String(q.eventTypeId)}&start=${q.fromIsoDate}&end=${q.toIsoDate}&timeZone=${encodeURIComponent(q.timeZone)}`;
      const res = await request.fetch(url, {
        headers: apiHeaders(auth, SLOTS_VERSION),
        failOnStatusCode: false,
        timeout: 30_000,
      });
      const body = JSON.parse(await res.text()) as { data?: Record<string, { start: string }[]> };
      return Object.values(body.data ?? {})
        .flat()
        .map((s) => s.start);
    },
    async create(req: BookingRequest): Promise<BookingResult> {
      const res = await request.fetch(`${apiBaseUrl}/v2/bookings`, {
        method: "POST",
        headers: apiHeaders(auth, BOOKINGS_VERSION),
        data: JSON.stringify({
          start: req.start,
          eventTypeId: req.eventTypeId,
          attendee: { name: req.attendeeName, email: req.attendeeEmail, timeZone: "Europe/London" },
        }),
        failOnStatusCode: false,
        timeout: 30_000,
      });
      const text = await res.text();
      const body = JSON.parse(text || "{}") as { data?: unknown };
      const list = Array.isArray(body.data)
        ? (body.data as { uid?: string }[])
        : body.data
          ? [body.data as { uid?: string }]
          : [];
      return {
        status: res.status(),
        uids: list.map((x) => x.uid ?? "").filter((u) => u !== ""),
        recurringSeriesLength: Array.isArray(body.data) ? list.length : 0,
        bodyHead: text.slice(0, 80),
      };
    },
    async cancel(uid: string, reason: string): Promise<number> {
      const res = await request.fetch(`${apiBaseUrl}/v2/bookings/${uid}/cancel`, {
        method: "POST",
        headers: apiHeaders(auth, BOOKINGS_VERSION),
        data: JSON.stringify({ cancellationReason: reason }),
        failOnStatusCode: false,
        timeout: 30_000,
      });
      return res.status();
    },
  };
}

/** Attendee email for a run-scoped booking: the run prefix makes every row findable by the leak rules. */
export function attendeeEmailFor(runPrefix: string, label: string): string {
  if (!/^[a-z0-9-]{1,40}$/.test(label)) {
    throw new Error(
      `TEST BUG: attendee label must match [a-z0-9-]{1,40}, got ${JSON.stringify(label)}`,
    );
  }
  return `${runPrefix}-${label}@example.com`;
}

/** An instant as the API v2 wants it: ISO 8601 in UTC with a Z suffix. */
export function utcIso(instant: Date): string {
  if (Number.isNaN(instant.getTime())) throw new Error("TEST BUG: invalid Date");
  return instant.toISOString();
}
