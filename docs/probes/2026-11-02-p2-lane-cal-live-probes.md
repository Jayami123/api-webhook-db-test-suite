# P2 cal lane: live probes on harness v0.3.1 (2026-11-02)

Build-time measurements for `docs/plans/2026-11-02-p2-lane-cal.md`. Each entry names the run that produced it. Products were
started and stopped only with the harness (`node_modules/qa-portfolio-harness/scripts/up.mjs cal` and `down.mjs cal`).
Secrets were generated per run and never printed. Ids and emails are run-scoped and removed by the test cleanup.

Stack: Cal fork `c2b7ac4`, harness `v0.3.1` (`7d4a3ae`), API v2 `DATABASE_URL` from the harness (HR-4). Cold `up cal` 13 min 22 s,
warm `up cal` 28 s, `down cal` 2 s (plan section 2 timings reproduced).

## L1 API v2 health, auth and booking (run "probe-a")

| Request | Status | Body (head) |
|---|---|---|
| `GET /health` (5555) | 200 | `OK` |
| `GET /v2/health` | 404 | `Cannot GET /v2/health` (envelope) |
| `GET /v2/me` without key | 401 | `ApiAuthStrategy - No authentication` |
| `GET /v2/bookings` without key | 403 | `PermissionsGuard - no authentication` |
| `GET /v2/me` with lane key | 200 | `data.email` = `pro@example.com` (FC-2, DB-backed: HR-4 holds) |
| `GET /v2/slots` (30min, days 3 to 5, Europe/London) | 200 | `data` keyed by date, 25 slots (13 per day in this run) |
| `POST /v2/bookings` (first slot) | 201 | `status: success`, `data.uid` |
| same request again | 400 | BadRequest; one Booking row (`accepted`), so the unique key refuses the duplicate (not 409) |
| `POST /v2/bookings/{uid}/cancel` | 200 | row becomes `cancelled` |

## L2 recorded-daily-video route (runs "probe-b", "probe-c", suite)

| Request | Status | Body |
|---|---|---|
| unsigned `{"test":"test"}` | 200 | `Test request successful` (zero DB writes: DLY-003) |
| signed (canonical), Daily-shaped body `{"type":"recording.ready-to-download","payload":{"x":1}}` | 400 | `Invalid Payload` (route.ts:86-90: dispatch on `type`, then `recordingReadySchema`). Re-measured in the fix run; the plan's 400 was right |
| signed (canonical), body without `type` `{"triggerEvent":"RECORDING_READY",...}` | 200 | `Invalid type in /recorded-daily-video` (the final branch, route.ts:223-225). This was the earlier fixture's mistake, not a product behaviour to assert as the accepted-signature case |
| signed, unknown `type` `{"type":"unknown.event","payload":{}}` | 200 | `Invalid type in /recorded-daily-video` (observed contract, separate test) |
| tampered body, old signature | 403 | `Signature does not match` |
| raw-signed non-canonical body | 403 | `Signature does not match` |
| reserialised signature over a non-canonical body | 200 | `Invalid type in /recorded-daily-video` (the route verifies `JSON.stringify(parsed)`) |

## L3 cron routes (runs "probe-b" and suite)

| Request | Status |
|---|---|
| `GET /api/tasks/cron`, wrong bearer | 401 |
| `GET /api/tasks/cron`, right bearer | 200 |
| `POST /api/cron/webhookTriggers`, wrong key | 401 |
| `POST /api/cron/webhookTriggers`, right key | 200 |

## L4 webhook delivery (runs "probe-a", "probe-b", "probe-d", "probe-e")

- Direct path (`webhook/testTrigger`): one delivery, headers include `X-Cal-Signature-256` (hex), `x-cal-webhook-version`; body keys
  `triggerEvent`, `createdAt`, `payload`; HMAC over the raw bytes verifies.
- Trigger bodies (run "probe-e", BOOKING_CREATED, BOOKING_RESCHEDULED, BOOKING_CANCELLED): the 32 payload keys common to all three
  are the required set of `tests/fixtures/cal/webhook-payload.schema.json` (marked `x-derived`). All three validate.
- Tasker path (`GET /api/tasks/cron`): a booking queues one Task per subscribed webhook. A reschedule or cancel is delivered on the
  next tasker run, not at the action (the RESCHEDULED and CANCELLED deliveries appeared only after a run).

## L5 retry and concurrency (runs "probe-b", "probe-c", "probe-d", "probe-e", suite)

| Case | Measured |
|---|---|
| B2, receiver 500, tasker run 1 | 1 delivery; Task `attempts` 1, `succeeded` true, `lastError` null |
| B2, receiver 500, later runs | no further delivery; Task unchanged (no retry) |
| TASK-001, receiver reset | runs 1 to 3: deliveries attempts `[1]`, `[1,2]`, `[1,2,3]`; Task `attempts` 1, 2, 3, `succeeded` false, `lastError` `fetch failed`; run 4 adds nothing |
| TASK-002, reset then ok | run 1 attempts 1; run 2 attempts 2, `succeeded` true; run 3 unchanged |
| TASK-003 control, 5 bookings, one run | 5 deliveries; each Task attempts 1, succeeded |
| TASK-003 finding, two concurrent runs, receiver slow 1500 ms | 10 deliveries for 5 tasks in each of three rounds (B4) |
| SCH-002, two concurrent cron fires (three rounds, suite run) | round 1: 2 deliveries; round 2: 2 deliveries; round 3: 1 delivery. Intermittent: 2 of 3 rounds in the suite, 9 of 9 iterations in plan probe P6. PRODUCT BUG (intermittent race, D7), see the upstream drafts |

## L6 scheduled triggers (runs "probe-c" and suite)

- A MEETING_STARTED booking creates one `WebhookScheduledTriggers` row per subscribed hook (`startAfter` = the start time).
- Cancel removes the row for that booking.
- Control (`startAfter` moved to now minus 60 s, allow-listed `P2-CAL-SCH-002`): one fire gives 1 delivery and the row is gone.
- Stale row (`startAfter` now minus 2 days, `P2-CAL-SCH-003`): the fire deletes the row and sends nothing (silent purge, NOT A BUG).

## L7 slot cache (runs "probe-g" and "probe-h")

- The same query returns a booked slot for up to the cache TTL: `withSlotsCache` in the fork's `packages/platform/libraries/dist/slots.cjs`
  caches the result per query key with `DEFAULT_SLOTS_CACHE_TTL = 2e3` ms (overridable by `SLOTS_CACHE_TTL`).
- A query with a new key (timeZone UTC) does not list the booked slot. So availability is correct; the staleness is the cache TTL.
- Not a product bug. PROP-002 polls for the slot's removal within `SLOTS_CACHE_BUDGET_MS` (5 s, TTL plus margin); no sleep.

## L8 concurrency limits and throttle (run "probe-e")

- FC-3: 125 `GET /v2/me` calls on one key: 110 answered 200, 15 answered 429. The 429 is observed at the configured 120 per minute.

## L9 recurring booking (run "probe-f")

- `yoga-class` (recurring): one `POST /v2/bookings` answers 201 with `data` as an array of 12 occurrences, all `accepted`.
- Cancel one occurrence: 200; one row `cancelled`, 11 `accepted`; one BOOKING_CANCELLED delivery on the next tasker run (REC-002).

## L10 PENDING with confirmationPolicy (probe "probe-pend", then the suite)

- The first attempt (earlier run) sent `requiresConfirmation: true`. API v2 2024-06-14 does not take that field; its input is
  `confirmationPolicy` (`BaseConfirmationPolicy_2024_06_14` in `contracts/cal/openapi-v2.json`). Its ValidationPipe uses
  `whitelist: true`, so the unknown field was dropped silently, and bookings were ACCEPTED. That earlier "PENDING cut" was a probe bug.
- Re-measured with `confirmationPolicy: {"type":"always","blockUnconfirmedBookingsInBooker":false}`:
  - `POST /v2/event-types` (2024-06-14): 201; the `EventType` row has `requiresConfirmation = true` (qa_ro assertion).
  - first `POST /v2/bookings` (same slot, attendee): 201; Booking row status `pending`, one row.
  - second identical `POST /v2/bookings`: 201, the same booking uid, still one row (no duplicate PENDING).
  - cleanup: cancel 200; `DELETE /v2/event-types/{id}`: 200.
- Result: one PENDING row for the retry. No PENDING duplicate observed, so IDEM-001 PENDING closes (D9) with no finding.
  Covered by `tests/integration/cal/cal-idem.spec.ts` ("a PENDING retry creates at most one PENDING booking").

## L11 availability and timezones (probes "probe-d", "probe-prop3", and the suite)

- Pro user availability lives in `Availability` rows linked by `scheduleId` to the user's `Schedule` (`Schedule.userId`).
  `Availability.userId` is NULL for these rows (schema checked: `packages/prisma/schema.prisma`).
- Date-only bounds (earlier run, `start=<day3>&end=<day5>`): the five viewer zones returned different instant sets at the edges. The
  bounds were calendar dates, which the viewer's zone interprets. This is an observed behaviour of date-only input, recorded as a note,
  not a finding.
- Explicit UTC bounds (probe "probe-prop3", serial, no bookings in between): `start=<day3>T00:00:00Z`, `end=<day6>T00:00:00Z`,
  `eventTypeId` 3, `cal-api-version` 2024-09-04. Five requests, `timeZone` = Europe/London, America/New_York, Asia/Tokyo,
  Australia/Sydney, UTC. Each returned status 200 and 29 instants, first `2026-11-06T10:30:00Z`, last `2026-11-09T16:30:00Z`.
  The five sets are identical (no extra, no missing). So the OAS text ("Must be in UTC") holds for explicit bounds; no product or
  documentation bug (the date-only note above is a different input form).
- Observed counts differ by database state, so the test asserts a non-empty baseline, not a number. Local database: 29 instants per zone.
  CI (fresh database, run 41570521198): 32 instants per zone, identical across the five zones. The earlier hard-coded 29 was a test bug (see the PR body).
- Widened end (`end=<day6>T01:00:00Z`) returned 13 instants, not a superset of 29. Root cause (review A3, probe "probe-a3" on a fresh
  stack, section L15): the product maps a midnight end to 23:59:59 of that day (`adjustEndTime`, `slots-input.service.ts:140-151`
  at `c2b7ac4`), but a 01:00 end is an instant, which excludes every slot of that day after 01:00. The lane's negative control
  assumed a midnight end was an instant. This is a lane cause, not a product defect; the call was not malformed, the expectation was.
- PROP-003 is built with these explicit bounds and the negative control (`tests/integration/cal/cal-prop.spec.ts`). Its earlier
  HARD STOP is void: the property holds for the input the OAS specifies.

## L12 committed OpenAPI versus live responses (suite, CON-001/002/005)

- `GET /v2/slots`: the 200 schema describes the inner `data` map as the whole body; the live body and the document's own example are
  `{status, data}`. Schema validation fails (PB-CAL-OAS-1).
- `POST /v2/bookings`: the 201 schema requires strings and numbers where the live body has `null` (`rescheduledByEmail`, `rating`) and
  requires attendee `seatUid`, `bookingFieldsResponses` that the live body omits (PB-CAL-OAS-1).
- CON-005 crawl (55 GET operations, own key): 29 crawled, 12 answered 200, 43 UNCRAWLED with reasons: 26 with no value for a path
  parameter, 17 with a status the document does not list. Six 200 bodies fail validation: `/v2/bookings`, `/v2/bookings/{bookingUid}`,
  `/v2/bookings/{bookingUid}/calendar-links`, `/v2/bookings/{bookingUid}/references`, `/v2/calendars`, `/v2/webhooks` (PB-CAL-OAS-1).
  Two 404 answers (`/v2/slots` without a query, `/v2/schedules`) are caused by the crawl's version header and missing query parameters,
  not by the product.

## L13 harness and environment

- The API v2 spawn environment has `NODE_ENV=production` (`Cal API v2 env:` line of the harness log). B5 (exit when `NODE_ENV` is unset)
  therefore cannot be reached through the harness: recorded as code evidence only: `apps/api/v2/src/swagger/generate-swagger.ts:32` reads `NODE_ENV`, and `apps/api/v2/src/main.ts:71` calls `generateSwaggerForApp(app)` without `await`. The harness env sets `NODE_ENV=production` (`cal-api-env.ts:55`), so the path is not reached; not reproduced.
- The harness's default `PRODUCTS_ROOT` resolves inside `node_modules` (`node_modules/products`) when unset: the lane sets
  `PRODUCTS_ROOT=/home/user/products` in the environment (plan F-ENV-2, an environment note, not a harness change).
- Seed message P10 reproduced: `Error adding google credentials to DB: Unexpected end of JSON input` (not a failure of the seed).

## L14 rate-limit headers and scope (review A5; probe "probe-a5", fresh key)

- Headers on every API-key response: `x-ratelimit-limit-default` = 120, `x-ratelimit-remaining-default` (119 after the first call),
  `x-ratelimit-reset-default` = 60 (seconds). The names come from `apps/api/v2/src/lib/throttler-guard.ts:193-198` at `c2b7ac4`
  (`X-RateLimit-{Limit,Remaining,Reset}-<name>`; the name here is `default`).
- Burst: 120 GET `/v2/me` answered 200 and the 121st answered 429; `remaining` was 0 before the 429.
- The limit is per API key across endpoints (tracker `api_key_...`): `POST /v2/bookings` answered 429 `ThrottlerException` while the
  key was limited, and the Booking count was unchanged (433 before, 433 after).
- Observed scope: default, per key, not per route. FC-3 proves the 429 on the booking request (`cal-framework.spec.ts`).

## L15 PROP-003 widened-window root cause (review A3; probe "probe-a3", fresh stack)

| Request (timeZone UTC, eventTypeId 3) | Status | Count | First | Last | Dates in body |
|---|---|---|---|---|---|
| start `<day3>T00:00Z`, end `<day6>T00:00Z` (spec baseline) | 200 | 29 | `<day3>` 10:30Z | `<day6>` 16:30Z | 2 |
| same start, end `<day6>T01:00Z` (widened) | 200 | 13 | `<day3>` 10:30Z | `<day6>` 16:30Z | 1 |
| start `<day0>T00:00Z`, end `<day6>T00:00Z` | 200 | 70 | `<day0>` 09:00Z | `<day6>` 16:30Z | 5 |
| same start, end `<day6>T01:00Z` | 200 | 54 | `<day0>` 09:00Z | `<day6>` 16:30Z | 4 |

- The body has only `data` and `status`; no range clamp is reported.
- Pinned rules (c2b7ac4, `apps/api/v2/src/modules/slots/slots-2024-09-04/services/slots-input.service.ts`): a start that is not
  midnight is an instant (`adjustStartTime`, lines 126-137); an end at exactly 00:00:00 is end-of-day, set to 23:59:59 of that day
  (`adjustEndTime`, lines 140-151); any other end is an instant.
- Outcome: lane cause. The widened window excludes the last day's slots because they start after 01:00. No product finding.
  The fixed control is: start one minute after the first baseline instant must return exactly the baseline minus its first element.

## L16 contract identities (review A1; probe "probe-crawl2", fresh stack, one booking and one webhook seeded by the crawl)

- The crawl seeds one booking and one webhook (`webhookId`), so the identities do not move with the seed. Without the webhook,
  `/v2/webhooks` answers a valid 200 body (validity is data-dependent; measured), and `/v2/webhooks/{webhookId}` is not crawled.
- Crawled: 31 operations; no path value: 24 (reason `no-path-value`, the closed list); undocumented statuses: 18; invalid 200 bodies: 7.
- The pins live in `src/lanes/cal/contract-pins.ts`; each undocumented entry has its note. The CI run that confirms them on a clean
  runner is recorded in the PR body (review step 8).
- Invalid 200 bodies (PB-CAL-OAS-1, product documentation, proven): GET /v2/bookings, GET /v2/bookings/{bookingUid}, GET /v2/bookings/{bookingUid}/calendar-links, GET /v2/bookings/{bookingUid}/references, GET /v2/calendars, GET /v2/webhooks, GET /v2/webhooks/{webhookId}.
- Undocumented statuses (SPEC-CAL-UNDOC, each pinned; none filtered):
  - GET /v2/bookings/{bookingUid}/conferencing-sessions 404
  - GET /v2/bookings/{bookingUid}/recordings 404
  - GET /v2/bookings/{bookingUid}/transcripts 404
  - GET /v2/calendars/busy-times 400
  - GET /v2/calendars/ics-feed/check 400
  - GET /v2/event-types 404
  - GET /v2/event-types/{eventTypeId} 404
  - GET /v2/event-types/{eventTypeId}/private-links 404
  - GET /v2/event-types/{eventTypeId}/webhooks/{webhookId} 400
  - GET /v2/oauth-clients 401
  - GET /v2/schedules 404
  - GET /v2/schedules/default 404
  - GET /v2/slots 404
  - GET /v2/stripe/check 404
  - GET /v2/stripe/connect 400
  - GET /v2/stripe/save 400
  - GET /v2/verified-resources/emails 404
  - GET /v2/verified-resources/phones 404
- Crawled operations (31): GET /v2/bookings, GET /v2/bookings/{bookingUid}, GET /v2/bookings/{bookingUid}/attendees, GET /v2/bookings/{bookingUid}/calendar-links, GET /v2/bookings/{bookingUid}/conferencing-sessions, GET /v2/bookings/{bookingUid}/recordings, GET /v2/bookings/{bookingUid}/references, GET /v2/bookings/{bookingUid}/transcripts, GET /v2/calendars, GET /v2/calendars/busy-times, GET /v2/calendars/connections, GET /v2/calendars/ics-feed/check, GET /v2/conferencing, GET /v2/conferencing/default, GET /v2/event-types, GET /v2/event-types/{eventTypeId}, GET /v2/event-types/{eventTypeId}/private-links, GET /v2/event-types/{eventTypeId}/webhooks, GET /v2/event-types/{eventTypeId}/webhooks/{webhookId}, GET /v2/me, GET /v2/oauth-clients, GET /v2/schedules, GET /v2/schedules/default, GET /v2/slots, GET /v2/stripe/check, GET /v2/stripe/connect, GET /v2/stripe/save, GET /v2/verified-resources/emails, GET /v2/verified-resources/phones, GET /v2/webhooks, GET /v2/webhooks/{webhookId}.
- No-path-value operations (24): GET /v2/auth/oauth2/clients/{clientId}, GET /v2/bookings/by-seat/{seatUid}, GET /v2/bookings/{bookingUid}/attendees/{attendeeId}, GET /v2/calendars/connections/{connectionId}/events, GET /v2/calendars/connections/{connectionId}/events/{eventId}, GET /v2/calendars/connections/{connectionId}/freebusy, GET /v2/calendars/{calendar}/check, GET /v2/calendars/{calendar}/connect, GET /v2/calendars/{calendar}/event/{eventUid}, GET /v2/calendars/{calendar}/events, GET /v2/calendars/{calendar}/events/{eventUid}, GET /v2/calendars/{calendar}/freebusy, GET /v2/calendars/{calendar}/save, GET /v2/conferencing/{app}/oauth/auth-url, GET /v2/conferencing/{app}/oauth/callback, GET /v2/oauth-clients/{clientId}, GET /v2/oauth-clients/{clientId}/users, GET /v2/oauth-clients/{clientId}/users/{userId}, GET /v2/oauth-clients/{clientId}/webhooks, GET /v2/oauth-clients/{clientId}/webhooks/{webhookId}, GET /v2/schedules/{scheduleId}, GET /v2/slots/reservations/{uid}, GET /v2/verified-resources/emails/{id}, GET /v2/verified-resources/phones/{id}.

## L17 quiet window: basis and per-test budget (decision 6, revised; review A8)

- Window: `CAL_QUIET_WINDOW_MS` = one cron tick (`CAL_CRON_TICK_MS` = 60 s, the webhook-triggers cron is `* * * * *` at the pin
  c2b7ac4, `.github/workflows/cron-webhooks-triggers.yml` line 8) plus a margin (`CAL_TICK_MARGIN_MS` = 10 s, the scheduled-delivery
  budget `SLO.calWebhookDelivery`). Total 70 s, in `src/lanes/cal/quiet.ts`.
- Tick jitter: NOT MEASURED. The product cron runs on GitHub's schedulers, not on the lane stack, and the sandbox cannot reach
  them. The margin therefore rests on the stated policy bound, not a measured jitter. UNVERIFIED; the owner should decide whether
  a measured jitter (for example from the cron workflow's run history on the product fork) is required.
- Per-test budget: `CAL_QUIET_TEST_BUDGET_MS` = window (70 s) + setup bound (`CAL_SETUP_BUDGET_MS`, 15 s; the measured setup is
  about 2 s). 85 s, applied with `test.setTimeout` only to the three tests that hold a quiet window (SCH-002 control, SCH-003
  control, SCH-003 purge). The shared 60 s timeout in `playwright.config.ts` is unchanged.
- Why not 60 s + margin under the shared timeout: 70 s exceeds it, so the window needs the per-test budget above.
- Local live runs: Docker is down in this sandbox (`containerd` failed to start, see the dockerd log), so the quiet tests were
  verified in CI on the pushed head, not locally.

## L18 lane leak check in CI (review addendum)

- `src/lanes/cal/leak-check.ts` runs the cal leak rules (`rulesFor("cal")`, includeLeaks) for the run prefix and exits 1 on any
  violation, printing rule ids and counts only. CI sets `P2_RUN_ID` once (generate step) so the tests and the check share the prefix,
  and runs the check after the tests under `if: always()`, before the harness teardown.

## L19 CON-005 per-operation cal-api-version (2026-11-04, review C1)

Before: CON-005 sent `cal-api-version: 2024-08-13` to all 55 GET operations. After: each operation sends the version its own
OAS header parameter declares (the schema default in `contracts/cal/openapi-v2.json`), and no version where the OAS declares
none (`apiVersionFor` in `src/lanes/cal/oas-walk.ts`). The before column is the same spec with the header held at 2024-08-13
(a copy at the pre-change commit). Both are one fresh `up cal` each, the same Cal fork (c2b7ac4). The per-operation record is
`results/cal-con-005-crawl.json` (not committed; it holds the validation errors of each 200 body).

Result: the same 31 operations are crawled before and after. 9 identities changed and 22 did not. 7 operations now answer 200
(formerly 404 under the wrong header): 4 pass the committed spec (private-links, schedules, verified emails, verified phones)
and 3 are real deviations, recorded as KNOWN_INVALID. `/v2/event-types` and `/v2/event-types/{eventTypeId}` return
`bookingFields` items with `isDefault` as a boolean and no `label` or `placeholder`; `/v2/schedules/default` returns
`data: null`.

| Operation | version sent, before → after | status / body valid, before | status / body valid, after | disposition |
|---|---|---|---|---|
| `GET /v2/bookings` | 2024-08-13 → 2024-08-13 | 200 / false | 200 / false | unchanged |
| `GET /v2/bookings/{bookingUid}` | 2024-08-13 → 2024-08-13 | 200 / false | 200 / false | unchanged |
| `GET /v2/bookings/{bookingUid}/recordings` | 2024-08-13 → 2024-08-13 | 404 / - | 404 / - | unchanged |
| `GET /v2/bookings/{bookingUid}/transcripts` | 2024-08-13 → 2024-08-13 | 404 / - | 404 / - | unchanged |
| `GET /v2/bookings/{bookingUid}/calendar-links` | 2024-08-13 → 2024-08-13 | 200 / false | 200 / false | unchanged |
| `GET /v2/bookings/{bookingUid}/references` | 2024-08-13 → 2024-08-13 | 200 / false | 200 / false | unchanged |
| `GET /v2/bookings/{bookingUid}/conferencing-sessions` | 2024-08-13 → 2024-08-13 | 404 / - | 404 / - | unchanged |
| `GET /v2/bookings/{bookingUid}/attendees` | 2024-08-13 → none | 200 / true | 404 / - | 200 under the wrong header; the OAS declares no version, none is sent, and the product answers 404: new KNOWN_UNDOCUMENTED pin |
| `GET /v2/calendars/connections` | 2024-08-13 → none | 200 / true | 200 / true | unchanged |
| `GET /v2/calendars/ics-feed/check` | 2024-08-13 → none | 400 / - | 400 / - | unchanged |
| `GET /v2/calendars/busy-times` | 2024-08-13 → none | 400 / - | 400 / - | unchanged |
| `GET /v2/calendars` | 2024-08-13 → none | 200 / false | 200 / false | unchanged |
| `GET /v2/conferencing` | 2024-08-13 → none | 200 / true | 200 / true | unchanged |
| `GET /v2/conferencing/default` | 2024-08-13 → none | 200 / true | 200 / true | unchanged |
| `GET /v2/oauth-clients` | 2024-08-13 → none | 401 / - | 401 / - | unchanged |
| `GET /v2/event-types` | 2024-08-13 → 2024-06-14 | 404 / - | 200 / false | header caused the 404; the 200 body fails the committed schema (bookingFields items): new KNOWN_INVALID pin |
| `GET /v2/event-types/{eventTypeId}` | 2024-08-13 → 2024-06-14 | 404 / - | 200 / false | header caused the 404; the 200 body fails the committed schema (bookingFields items): new KNOWN_INVALID pin |
| `GET /v2/event-types/{eventTypeId}/webhooks` | 2024-08-13 → none | 200 / true | 200 / true | unchanged |
| `GET /v2/event-types/{eventTypeId}/webhooks/{webhookId}` | 2024-08-13 → none | 400 / - | 400 / - | unchanged |
| `GET /v2/event-types/{eventTypeId}/private-links` | 2024-08-13 → none | 404 / - | 200 / true | header caused the 404; 200 and valid: pin removed |
| `GET /v2/me` | 2024-08-13 → none | 200 / true | 200 / true | unchanged |
| `GET /v2/schedules` | 2024-08-13 → 2024-06-11 | 404 / - | 200 / true | header caused the 404; 200 and valid: pin removed |
| `GET /v2/schedules/default` | 2024-08-13 → 2024-06-11 | 404 / - | 200 / false | header caused the 404; the 200 body has data null and fails the schema: pin moved to KNOWN_INVALID |
| `GET /v2/slots` | 2024-08-13 → 2024-09-04 | 404 / - | 400 / - | 400 under the declared version (2024-09-04); the 404 was the wrong header: pin kept with status 400 (CON-001 test.fail stays red) |
| `GET /v2/stripe/connect` | 2024-08-13 → none | 400 / - | 400 / - | unchanged |
| `GET /v2/stripe/save` | 2024-08-13 → none | 400 / - | 400 / - | unchanged |
| `GET /v2/stripe/check` | 2024-08-13 → none | 404 / - | 404 / - | unchanged |
| `GET /v2/verified-resources/emails` | 2024-08-13 → none | 404 / - | 200 / true | header caused the 404; 200 and valid: pin removed |
| `GET /v2/verified-resources/phones` | 2024-08-13 → none | 404 / - | 200 / true | header caused the 404; 200 and valid: pin removed |
| `GET /v2/webhooks` | 2024-08-13 → none | 200 / false | 200 / false | unchanged |
| `GET /v2/webhooks/{webhookId}` | 2024-08-13 → none | 200 / false | 200 / false | unchanged |

Pins after C1: KNOWN_UNDOCUMENTED = 12 (was 18: 7 removed as caused by the wrong header, the attendees 404 added, slots kept with
status 400); KNOWN_INVALID = 10 (was 7: the 3 deviations above added).

Lane on the local stack (run "con005-after", cal-api + cal-serial): CON-005 passes. Two tests fail: P2-CAL-REC-002 and
the P2-CAL-WH-003 positive control, both at `Received length: 0` from `taskRowsFor`. The local run did not use a fresh
database: `down cal` does not remove the `qa-harness-cal_db_data` volume, so the same local volume was reused. The same two tests
also failed locally at the pre-change commit (4110f6d, CON-005 excluded), but that run also reused the volume. The CI run of
4110f6d on a clean runner (p2-cal run 41581943369) was green, so these two failures are not yet explained. The cause is not
established: the receiver delivery arrives, and `taskRowsFor` finds no Task row for the test receiver URL
(src/lanes/cal/tasks.ts, `payloadNamesTest`, commit 27caf79). CI on the new head is the check on a clean database.

## Open items (for the discovery round)

- Deterministic SCH-002 repro (not attempted this round, by decision).
- Measured cron tick jitter (UNVERIFIED; see L17).

## Escalation (review addendum)

- Plan meaning changed, CON-005: the plan's "every non-200 status is documented" was a tautology (review R1). It is replaced by
  identity pins: crawled set, no-path-value set, the undocumented (method, path, status) set and the invalid 200 set. The count
  checks (29, 12, 43, 26) are gone. The meaning of CON-005 is now "the pinned identities hold and every invalid 200 is the known bug".
- Plan meaning changed, PROP-003: the plan's negative control ("moving one bound by an hour changes the set") was a tautology and
  hid an anomaly (review R4). It is now a deterministic control derived from the baseline (start one minute after the first instant
  returns the baseline minus its first element). The meaning of PROP-003 is unchanged: the same instants for five viewer zones.
- Plan scope, quiet windows: the window is the scheduled-delivery budget (10 s, `SLO.calWebhookDelivery`), not the product cron
  interval, because the lane runs no cron and the shared 60 s test timeout cannot hold a 60 s window (`src/lanes/cal/quiet.ts`).
  - **Amendment (2026-11-04), supersedes the bullet above for the quiet window.** The window is 70 s: one cron tick (60 s) plus a
    10 s margin, under an 85 s per-test budget applied with `test.setTimeout` to the three SCH tests that hold it. Basis and
    numbers: `src/lanes/cal/quiet.ts` and section L17 of this record. The 60 s shared timeout is unchanged.

## Findings (review addendum)

- PB-CAL-OAS-1 (product documentation, proven): 200 bodies of the routes listed in L16 do not validate against the committed spec.
  The validity is data-dependent (a webhook changes two routes), so the crawl seeds its own data.
- SPEC-CAL-UNDOC (documentation, each entry pinned in `KNOWN_UNDOCUMENTED`): 18 non-200 answers the committed spec does not
  list. Some are the crawl's input (no query or path value); the cause is recorded per entry, and entries marked UNVERIFIED have no
  measured cause.
- A3 outcome: no product finding. The widened-window anomaly is a lane cause (L15).

## Upstream drafts (product bugs found by this lane)

Placed here (the lane's own probe record) because `docs/upstream/` is a shared path in `docs/lane-ownership.md`. Each draft is for
the Cal maintainers and quotes only the evidence above. Labels follow the lane rules.

### PB-CAL-OAS-1: committed OpenAPI does not describe the live 200 and 201 bodies (PRODUCT DOCUMENTATION BUG, proven)

- `GET /v2/slots` (200): the schema is the `data` map itself, while the response is `{status, data}` and the document's own example
  shows `{status, data}`. Validation of the live body fails at `/status` and `/data`.
- `POST /v2/bookings` (201): the schema requires `rescheduledByEmail` as a string and `rating` as a number; the live body returns
  `null` for both. Attendees require `seatUid` and `bookingFieldsResponses`, which the live body omits.
- CON-005 crawl: six more 200 bodies fail validation (`/v2/bookings`, `/v2/bookings/{bookingUid}`, `/calendar-links`, `/references`,
  `/v2/calendars`, `/v2/webhooks`).
- Evidence: `contracts/cal/openapi-v2.json` at `c2b7ac4` (sha256 in `contracts/cal/SOURCE.md`); the failing assertions are marked
  `test.fail` in `tests/contracts/cal/cal-con.spec.ts` and `cal-con-005.spec.ts`.

### B2: a receiver 500 is acknowledged as success and never retried (PRODUCT BUG, proven)

- Tasker mode. A `500` from the subscriber: the Task is marked succeeded with `attempts` 1 and `lastError` null. The next tasker run
  makes no attempt. The in-repo agent reference (`agents/skills/calcom-api/references/webhooks.md:320-328`) promises exponential retries.
- Code path: `packages/features/webhooks/lib/sendPayload.ts:324-327` (a 5xx is not thrown), `sendWebook.ts:21-27`,
  `task-processor.ts:23-25`.
- Evidence: L5 (B2 rows), `tests/webhooks/cal/cal-wh.spec.ts` (control passes; finding `test.fail`).

### B4: two concurrent tasker runs deliver each task twice (PRODUCT BUG, proven, three rounds)

- `getNextBatch` has no lock or claim (`packages/features/tasker/repository.ts:65-75`). Two runs started together deliver every task
  twice: 10 deliveries for 5 tasks, attempts `[1,1,2,2,2,2,2,1]`.
- Evidence: L5 (TASK-003 finding, three rounds, 10 deliveries each); `tests/serial/cal/cal-task.spec.ts` (control passes).
- SCH-002 is recorded in the drafts below, with no `test.fail` marker: it reproduces in 2 of 3 suite rounds (and 9 of 9 plan probes),
  so a marker would be flaky. The deterministic repro is an open item for the owner.

### SCH-002: concurrent cron fires deliver one due row twice (PRODUCT BUG, intermittent race, code and repro evidence)

- `handleWebhookScheduledTriggers.ts` reads the due rows with `findMany` (no claim), then for each row starts `fetch(...)` without
  awaiting it, and only then runs `webhookScheduledTriggers.delete({ where: { id } })` (lines 17 to 79). Two fires that read the same
  row both send it. The losing `delete` throws `P2025` (record not found) after its request was already sent (the same mechanism as
  plan D7, `getServerErrorFromUnknown.ts:207-208`).
- Repro evidence: suite rounds 1 and 2 (2 deliveries each), round 3 (1 delivery); plan probe P6 (9 of 9 iterations, 2 deliveries).
- Open item for the owner: a deterministic repro (none found: the race depends on the two fires' timing).
