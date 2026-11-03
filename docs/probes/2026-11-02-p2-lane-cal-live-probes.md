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
| SCH-002 finding, two concurrent cron fires (three rounds, suite) | round 1: 2 deliveries; round 2: 2 deliveries; round 3: 1 delivery. Not reproducible: see the STOP below |

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

## L11 availability and timezones (run "probe-d" and suite)

- Pro user availability lives in `Availability` rows linked by `scheduleId` to the user's `Schedule` (`Schedule.userId`).
  `Availability.userId` is NULL for these rows (schema checked: `packages/prisma/schema.prisma`).
- PROP-003 (same UTC instants for five `timeZone` values over day 3 to day 5): NOT HOLDING as written. Each zone's calendar-day window
  covers different instants at its edges (one extra instant, 14:00Z, appears in some sets). HARD STOP for PROP-003 (plan statement
  proven false for calendar-day windows); the case is not built. See the PR body.

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
- Not committed as a finding: the scheduled-trigger race (SCH-002) was not reproducible (2, 2, 1 deliveries across three rounds), so
  it is a hard stop and has no `test.fail` marker.
