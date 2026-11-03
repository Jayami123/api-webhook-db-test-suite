/**
 * Pinned identities for the CON-005 OAS crawl (plan section 4.2; review A1). Every value is a MEASURED identity from the
 * crawl on the pinned stack (docs/probes/2026-11-02-p2-lane-cal-live-probes.md, section L12). Counts are never pinned:
 * the crawl seeds one booking and one webhook of its own, so these identities do not move with the seed.
 * The crawl input is fixed by this file; a change here is a reviewed change, never a silent one.
 */

/** Operations the crawl called and got a status for (the crawl input supplied every path value). */
export const CRAWLED_OPERATIONS: readonly string[] = [
  "GET /v2/bookings",
  "GET /v2/bookings/{bookingUid}",
  "GET /v2/bookings/{bookingUid}/attendees",
  "GET /v2/bookings/{bookingUid}/calendar-links",
  "GET /v2/bookings/{bookingUid}/conferencing-sessions",
  "GET /v2/bookings/{bookingUid}/recordings",
  "GET /v2/bookings/{bookingUid}/references",
  "GET /v2/bookings/{bookingUid}/transcripts",
  "GET /v2/calendars",
  "GET /v2/calendars/busy-times",
  "GET /v2/calendars/connections",
  "GET /v2/calendars/ics-feed/check",
  "GET /v2/conferencing",
  "GET /v2/conferencing/default",
  "GET /v2/event-types",
  "GET /v2/event-types/{eventTypeId}",
  "GET /v2/event-types/{eventTypeId}/private-links",
  "GET /v2/event-types/{eventTypeId}/webhooks",
  "GET /v2/event-types/{eventTypeId}/webhooks/{webhookId}",
  "GET /v2/me",
  "GET /v2/oauth-clients",
  "GET /v2/schedules",
  "GET /v2/schedules/default",
  "GET /v2/slots",
  "GET /v2/stripe/check",
  "GET /v2/stripe/connect",
  "GET /v2/stripe/save",
  "GET /v2/verified-resources/emails",
  "GET /v2/verified-resources/phones",
  "GET /v2/webhooks",
  "GET /v2/webhooks/{webhookId}",
];

/** Operations the crawl did not call; the reason is from the closed list `UncrawledReason`. */
export const NO_VALUE_OPERATIONS: readonly string[] = [
  "GET /v2/auth/oauth2/clients/{clientId}",
  "GET /v2/bookings/by-seat/{seatUid}",
  "GET /v2/bookings/{bookingUid}/attendees/{attendeeId}",
  "GET /v2/calendars/connections/{connectionId}/events",
  "GET /v2/calendars/connections/{connectionId}/events/{eventId}",
  "GET /v2/calendars/connections/{connectionId}/freebusy",
  "GET /v2/calendars/{calendar}/check",
  "GET /v2/calendars/{calendar}/connect",
  "GET /v2/calendars/{calendar}/event/{eventUid}",
  "GET /v2/calendars/{calendar}/events",
  "GET /v2/calendars/{calendar}/events/{eventUid}",
  "GET /v2/calendars/{calendar}/freebusy",
  "GET /v2/calendars/{calendar}/save",
  "GET /v2/conferencing/{app}/oauth/auth-url",
  "GET /v2/conferencing/{app}/oauth/callback",
  "GET /v2/oauth-clients/{clientId}",
  "GET /v2/oauth-clients/{clientId}/users",
  "GET /v2/oauth-clients/{clientId}/users/{userId}",
  "GET /v2/oauth-clients/{clientId}/webhooks",
  "GET /v2/oauth-clients/{clientId}/webhooks/{webhookId}",
  "GET /v2/schedules/{scheduleId}",
  "GET /v2/slots/reservations/{uid}",
  "GET /v2/verified-resources/emails/{id}",
  "GET /v2/verified-resources/phones/{id}",
];

export type UncrawledReason = "no-path-value";

/**
 * Each status a documented-or-not response answered that the committed OAS does not list for that operation (not 200).
 * Each is a finding (SPEC-CAL-UNDOC, classified per entry). None is filtered out; a new entry turns the test red.
 */
export const KNOWN_UNDOCUMENTED: readonly {
  readonly operation: string;
  readonly status: number;
  readonly note: string;
}[] = [
  // the booking has no conferencing session; the route is not in the committed OAS
  {
    operation: "GET /v2/bookings/{bookingUid}/conferencing-sessions",
    status: 404,
    note: "the booking has no conferencing session; the route is not in the committed OAS",
  },
  // the booking has no recording; the route is not in the committed OAS
  {
    operation: "GET /v2/bookings/{bookingUid}/recordings",
    status: 404,
    note: "the booking has no recording; the route is not in the committed OAS",
  },
  // the booking has no transcript; the route is not in the committed OAS
  {
    operation: "GET /v2/bookings/{bookingUid}/transcripts",
    status: 404,
    note: "the booking has no transcript; the route is not in the committed OAS",
  },
  // the crawl sends no query (date range, calendars); 400 is the input check
  {
    operation: "GET /v2/calendars/busy-times",
    status: 400,
    note: "the crawl sends no query (date range, calendars); 400 is the input check",
  },
  // the crawl sends no query; the 400 is the input check (classify when the crawl supplies params)
  {
    operation: "GET /v2/calendars/ics-feed/check",
    status: 400,
    note: "the crawl sends no query; the 400 is the input check (classify when the crawl supplies params)",
  },
  // 404 on the list route for this key; 404 on this crawl input; the cause is not measured (UNVERIFIED)
  {
    operation: "GET /v2/event-types",
    status: 404,
    note: "404 on the list route for this key; 404 on this crawl input; the cause is not measured (UNVERIFIED)",
  },
  // 404 on this crawl input; the cause is not measured (UNVERIFIED)
  {
    operation: "GET /v2/event-types/{eventTypeId}",
    status: 404,
    note: "404 on this crawl input; the cause is not measured (UNVERIFIED)",
  },
  // the event type has no private links; the route is not in the committed OAS
  {
    operation: "GET /v2/event-types/{eventTypeId}/private-links",
    status: 404,
    note: "the event type has no private links; the route is not in the committed OAS",
  },
  // 400 on this crawl input; the cause is not measured (UNVERIFIED)
  {
    operation: "GET /v2/event-types/{eventTypeId}/webhooks/{webhookId}",
    status: 400,
    note: "400 on this crawl input; the cause is not measured (UNVERIFIED)",
  },
  // 401 on this crawl input; the cause is not measured (UNVERIFIED)
  {
    operation: "GET /v2/oauth-clients",
    status: 401,
    note: "401 on this crawl input; the cause is not measured (UNVERIFIED)",
  },
  // 404 on this crawl input; the cause is not measured (UNVERIFIED)
  {
    operation: "GET /v2/schedules",
    status: 404,
    note: "404 on this crawl input; the cause is not measured (UNVERIFIED)",
  },
  // 404 on this crawl input; the cause is not measured (UNVERIFIED)
  {
    operation: "GET /v2/schedules/default",
    status: 404,
    note: "404 on this crawl input; the cause is not measured (UNVERIFIED)",
  },
  // the crawl sends no eventTypeId, start or end; 404 is the crawl input (CON-001 covers the positive case)
  {
    operation: "GET /v2/slots",
    status: 404,
    note: "the crawl sends no eventTypeId, start or end; 404 is the crawl input (CON-001 covers the positive case)",
  },
  // 404: no Stripe account on the seed; the route is not in the committed OAS
  {
    operation: "GET /v2/stripe/check",
    status: 404,
    note: "404: no Stripe account on the seed; the route is not in the committed OAS",
  },
  // 400 without Stripe connect params; the route is not in the committed OAS
  {
    operation: "GET /v2/stripe/connect",
    status: 400,
    note: "400 without Stripe connect params; the route is not in the committed OAS",
  },
  // 400 without Stripe params; the route is not in the committed OAS
  {
    operation: "GET /v2/stripe/save",
    status: 400,
    note: "400 without Stripe params; the route is not in the committed OAS",
  },
  // 404: no verified emails on the seed; the route is not in the committed OAS
  {
    operation: "GET /v2/verified-resources/emails",
    status: 404,
    note: "404: no verified emails on the seed; the route is not in the committed OAS",
  },
  // 404: no verified phones on the seed; the route is not in the committed OAS
  {
    operation: "GET /v2/verified-resources/phones",
    status: 404,
    note: "404: no verified phones on the seed; the route is not in the committed OAS",
  },
];

/**
 * Operations whose 200 body fails the committed spec (PB-CAL-OAS-1, product documentation). Measured with one booking and one
 * webhook present. Validity is data-dependent (/v2/webhooks is valid with no webhook), so the crawl always seeds the same data.
 */
export const KNOWN_INVALID: readonly string[] = [
  "GET /v2/bookings",
  "GET /v2/bookings/{bookingUid}",
  "GET /v2/bookings/{bookingUid}/calendar-links",
  "GET /v2/bookings/{bookingUid}/references",
  "GET /v2/calendars",
  "GET /v2/webhooks",
  "GET /v2/webhooks/{webhookId}",
];
