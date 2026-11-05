import type { CalAuth } from "../../auth/cal.ts";
import type { ApiRequestLike } from "../../clients/base.ts";

export const SLOTS_VERSION = "2024-09-04";
export const BOOKINGS_VERSION = "2024-08-13";

/**
 * Per-request timeout for the API v2 slot, booking and cancel calls. Basis: Playwright's own default request timeout
 * (30 s, APIRequestContext), stated here so the bound is visible, and half the shared 60 s test timeout
 * (playwright.config.ts), so a hung call fails with its own request error inside the test rather than as a test timeout.
 * A policy bound, not a measured latency.
 */
export const CAL_API_REQUEST_TIMEOUT_MS = 30_000;

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
        timeout: CAL_API_REQUEST_TIMEOUT_MS,
      });
      const text = await res.text();
      // Like slotInstantsBetween (cases.ts): a non-200 is a failure, never an empty slot list.
      if (res.status() !== 200) {
        throw new Error(
          `slots answered ${String(res.status())} for ${q.fromIsoDate}..${q.toIsoDate} (${q.timeZone}); body ${String(text.length)} chars`,
        );
      }
      const body = JSON.parse(text) as { data?: Record<string, { start: string }[]> };
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
        timeout: CAL_API_REQUEST_TIMEOUT_MS,
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
        timeout: CAL_API_REQUEST_TIMEOUT_MS,
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

/**
 * Status of `POST /v2/bookings/{uid}/cancel` for a booking that is already cancelled, by a cancel or by a reschedule.
 * Measured: 400, 3 of 3 repeats and once after a reschedule (docs/probes/2026-11-02-p2-lane-cal-live-probes.md, L20; the
 * v2 check is input.service.ts:789 at the pin).
 */
export const CAL_ALREADY_CANCELLED_STATUS = 400;

/**
 * Cancels a booking in cleanup and throws on any status it does not expect. 200 is the only success, except where the test
 * itself cancelled the booking first (a cancel, or a reschedule, which cancels the original): there the measured
 * already-cancelled status is accepted too. Pass `cancelledByTest: true` only for that booking, and only once the test's
 * own cancel or reschedule succeeded.
 */
export async function cancelInCleanup(
  api: { cancel(uid: string, reason: string): Promise<number> },
  uid: string,
  options: { readonly cancelledByTest: boolean },
): Promise<void> {
  const status = await api.cancel(uid, "P2 lane cleanup");
  if (status === 200) return;
  if (options.cancelledByTest && status === CAL_ALREADY_CANCELLED_STATUS) return;
  throw new Error(
    `cleanup: cancel booking ${uid} answered ${String(status)} (expected 200${options.cancelledByTest ? ` or ${String(CAL_ALREADY_CANCELLED_STATUS)}, already cancelled by the test` : ""})`,
  );
}
