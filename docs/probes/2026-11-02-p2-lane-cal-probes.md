# P2 Cal lane probe record, 2026-11-02

Immutable record. Written by the Cal planning session (plan branch `plan/2026-11-02-p2-lane-cal`). Later probes go into new
dated files; this file is not edited after it lands. Scratch scripts live in `/tmp/p2-lane-probes/` and are not committed.
Secrets are never printed: test secrets were generated per stack and passed only through the environment of `up` and of the
probe process. Seeded login values are the harness seed defaults, not secrets.

- Date (UTC): 2026-11-02, 09:54 to 10:19.
- Base: `origin/main` = `aa10ec11bada21b3e3e5803a948e33023d648505` (ancestor check passed).
- Product commit (all stacks): `c2b7ac44c66f24ffef1662b276f0653988a609a3` = `scripts/bootstrap.sh` `CAL_REF` (checked with
  `git -C /home/user/products/cal rev-parse HEAD`).
- Harness: `qa-portfolio-harness` **0.3.0** (lock `be86e0e608f7ae2ccbe973a57465d2cbe88fb752`, tag `v0.3.0`).
- Host: Claude Code cloud VM, Node 22.23.3 (`/usr/local/bin`), Docker up, Playwright 1.64.0. `ss` is not installed here, so
  the port check is a Node `net` connect (`/tmp/p2-lane-probes/preflight.sh`).
- Stacks: four `up cal` runs, each ended with `down cal` (rc 0). One stack at a time, every time.

Status vocabulary: **CONFIRMED** (observed in a probe on this record), **UNPROBED** (not run; reason and settling probe
given), **CONTRADICTS** (observed value differs from the named source; the source is named).

Index: P0 environment | P1 API v2 health and OAS | P2 signature and headers (direct path) | P3 failure modes (direct path) |
P4 tasker path, 500 and reset | P5 concurrent tasker | P6 scheduled triggers and concurrent cron | P7 booking idempotency |
P8 Daily route | P9 database roles, seed, fixture writes | P10 seed message and B5 | P11 API v2 database URL (ENV) |
P12 API v2 authentication answers | P13 API v2 throttle | P14 server timezone | P15 Stripe key for API v2 start

---

### P0. Is the installed harness the pinned release?
- Date (UTC): 2026-11-02T09:55Z
- Product commit: n/a
- Harness version: 0.2.11 before, 0.3.0 after `npm ci`
- Command: `node -p "require('./node_modules/qa-portfolio-harness/package.json').version"`; then `npm ci` (repo root)
- Output (trimmed): before: `0.2.11` (stale `node_modules`, lock says `0.3.0`); after `npm ci`: `added 138 packages`, then `0.3.0`
- Proves: a stale `node_modules` is installed; `npm ci` restores the locked harness (`package-lock.json:1608-1610`).
- Citation: `package-lock.json:1608-1610`; `package.json` `qa-portfolio-harness` `#v0.3.0`
- Status: CONFIRMED

### P1. API v2 health, OAS location and version
- Date (UTC): 2026-11-02T10:08:54Z
- Product commit: `c2b7ac4`
- Harness version: 0.3.0
- Command: `node --experimental-strip-types p1-api-up.mts` (`ctx.fetch` to `http://127.0.0.1:5555` paths `/health`, `/v2/health`, `/docs-json`, `/docs`, `/api/docs-json`)
- Output (trimmed):
  ```text
  /health -> 200 OK
  /v2/health -> 404 {"error":{"code":"NotFoundException","message":"Cannot GET /v2/health"}}
  /docs-json -> 404 ... /docs -> 404 ... /api/docs-json -> 404
  ```
  Committed OAS at the pinned ref: `openapi 3.0.0`, `info.version 1.0.0`, 82 paths, 55 GET operations, `servers: []`.
  Without the version header: `GET /v2/slots` -> 404 "Cannot GET /v2/slots"; `GET /v2/bookings` without auth -> 403
  (PermissionsGuard); `GET /v2/me` without auth -> 401 (ApiAuthStrategy).
- Proves: API v2 readiness is `GET /health` (200, body `OK`); there is no `/v2/health`; no runtime OAS is served in production mode.
- Citation: `apps/api/v2/src/main.ts:69-71` (Swagger generated only when `env.type === "development"`);
  `apps/api/v2/src/swagger/generate-swagger.ts:21-32`; `docs/api-reference/v2/openapi.json` (committed);
  harness `src/adapters/cal.adapter.ts:445,561` (`/health`).
- Status: CONFIRMED. **CONTRADICTS** the foundation index HR-1 acceptance example (`curl .../v2/health`); the index's own
  note said the path was UNPROBED (U18), and this probe settles it as `/health`.

### P2. Webhook signature and headers, direct path (`webhook/testTrigger` -> `sendPayload`)
- Date (UTC): 2026-11-02T10:05Z (run 1) and 10:10Z (run 2, with return values captured)
- Product commit: `c2b7ac4`; harness 0.3.0
- Command: `node --experimental-strip-types p2-webhook-direct.mts` (foundation `mintCal`, `calClient`, `startReceiver` on `127.0.0.1:4317`, `verifyCal`)
- Output (trimmed, run 2):
  ```text
  P2_ok   deliveries 1  attempts [1]  signatureVerifies {ok:true}  signature hex length 64
          headers: content-type, x-cal-signature-256, x-cal-webhook-version (2021-10-20), user-agent
          body keys: triggerEvent, createdAt, payload   triggerEvent BOOKING_CREATED
          testTrigger returned {ok:true,status:200}
  ```
- Proves: the immediate path signs the raw body with HMAC-SHA256 hex in `X-Cal-Signature-256` and sends no timestamp and no nonce.
  The payload has no event id field.
- Citation: `packages/features/webhooks/lib/sendPayload.ts:296-299, 312-322` (headers), `:296` (`createWebhookSignature`);
  `packages/trpc/server/routers/viewer/webhook/testTrigger.handler.ts:57-63`.
- Status: CONFIRMED

### P3. Failure modes, direct path (receiver modes 500, reset, redirect 302, timeout)
- Date (UTC): 2026-11-02T10:10Z (run 2)
- Product commit: `c2b7ac4`; harness 0.3.0
- Command: `node --experimental-strip-types p2-webhook-direct.mts` (same run as P2)
- Output (trimmed, run 2):
  ```text
  P3_500      deliveries during step 1 (attempt 2 overall), testTrigger returned {ok:false,status:500}; no second request in 4 s
  P3_reset    deliveries during step 1, testTrigger returned {ok:false,status:500} (the thrown error is caught)
  P3_redirect302  deliveries 1 (only the original path, no follow to /redirected), returned {ok:false,status:302}
  P3_timeout  receiver pendingResponses 1 after 20 s: the product call is still open (no client timeout)
  ```
- Proves: a 5xx, a reset and a 3xx are each one request with no retry on the direct path; `sendPayload` has no request timeout;
  `redirect: "manual"` is in effect. The 4 s observation window is a probe window, not a proof of "never": the direct path has
  no queue, so the code gives no retry (see P4 for the queued path).
- Citation: `sendPayload.ts:319` (`redirect: "manual"`), `:312-322` (no timeout); `testTrigger.handler.ts:58-63`.
- Status: CONFIRMED (no retry observed; retry absence on the direct path also follows from code, `sendPayload.ts:324-327`).

### P4. Tasker path: booking -> Task row, receiver 500, receiver reset (TASK-001 / TASK-002 mechanism, B2)
- Date (UTC): 2026-11-02T10:13Z (stack 2: `TASKER_ENABLE_WEBHOOKS=1`, `CRON_SECRET` and `DATABASE_URL` in the `up` environment)
- Product commit: `c2b7ac4`; harness 0.3.0
- Command: `node --experimental-strip-types p3-tasker.mts` (`GET /api/tasks/cron` with `Authorization: Bearer <CRON_SECRET>`; API v2 `POST /v2/bookings`; qa_ro reads of `"Task"`)
- Output (trimmed):
  ```text
  booking 201; Task after booking: attempts 0, maxAttempts 3, succeeded false, scheduledAt <= now true
  receiver 500, cron run 1 -> 200; Task: attempts 1, succeeded TRUE, lastError null; deliveries 1 (mode 500)
  cron run 2 -> 200; Task unchanged; deliveries still 1
  receiver reset: cron run 1: attempts 1, succeeded false, lastError "fetch failed", deliveries [1]
                  cron run 2: attempts 2, deliveries [1,2]
                  cron run 3: attempts 3, deliveries [1,2,3]
                  cron run 4: attempts 3 (no further attempt), deliveries [1,2,3]
  ```
- Proves: (a) a 5xx from the subscriber marks the Task succeeded after one attempt (B2 at the tasker); (b) a thrown error retries
  on each cron run, with `attempts` counted up to `maxAttempts` = 3 and `lastError` set; (c) no back-off: `scheduledAt` is not moved.
- Citation: `packages/features/tasker/task-processor.ts:23-31` (success and retry), `:37` (allSettled);
  `packages/features/tasker/tasks/sendWebook.ts:21-27`; `packages/features/tasker/repository.ts:65-75` (no row lock, `take 1000`);
  `packages/prisma/schema.prisma` Task `attempts` default 0 (`:1838`), `maxAttempts` default 3 (`:1839`);
  `packages/features/tasker/tasks/index.ts:27-36` (`tasksConfig` keys are `createCRMEvent` and `webhookDelivery`; the webhook task
  type is `sendWebhook`, `:10`, so no `minRetryIntervalMins` applies); `packages/features/webhooks/lib/service/WebhookService.ts:45-58`.
- Status: CONFIRMED. The 500 result is the B2 product fact on the queued path. The `tasksConfig` key mismatch is a finding (F7),
  not a behaviour the probe contradicts.

### P5. Concurrent tasker runs: exactly 5 deliveries? (TASK-003, NEW)
- Date (UTC): 2026-11-02T10:15Z (run 1), 10:18Z (runs 2 and 3, same stack)
- Product commit: `c2b7ac4`; harness 0.3.0
- Command: `node --experimental-strip-types p7-concurrency.mts` (5 bookings; receiver `slow` 1500 ms; `Promise.all` of two `GET /api/tasks/cron`)
- Output (trimmed, all three runs identical):
  ```text
  bookings 5, Task rows 5
  both cron calls 200; deliveries 10 (each of the 5 bodies twice; bodySha256 equal in pairs)
  Task rows: attempts 2, succeeded true (for all 5)
  ```
- Proves: the tasker has no claim: two concurrent runs both take the same due tasks and both deliver them. The duplicate carries an
  identical body (same sha256). This is the TASK-003 expectation failing.
- Citation: `packages/features/tasker/repository.ts:65-75` (`getNextBatch` is a plain `findMany`, no lock);
  `packages/features/tasker/task-processor.ts:10-25`.
- Status: CONFIRMED (3 of 3 runs, one stack)

### P6. Scheduled triggers: row creation, cancel removal, cron once, purge, and concurrent cron (SCH-001/002/003, NEW)
- Date (UTC): 2026-11-02T10:13Z (sequential, stack 2); 10:15Z and 10:18Z (concurrent, stacks 3 and 4)
- Product commit: `c2b7ac4`; harness 0.3.0
- Command: `node --experimental-strip-types p4-sched.mts` (MEETING_STARTED webhook; booking via API v2; `qa_fixture` update of
  `WebhookScheduledTriggers.startAfter` under `P2-CAL-SCH-002`; `POST /api/cron/webhookTriggers` with `Authorization: <CRON_API_KEY>`);
  `node --experimental-strip-types p7-concurrency.mts` (concurrent part)
- Output (trimmed):
  ```text
  sequential: row count 11 after booking B (10 rows came with the webhook/booking, not attributed: UNPROBED);
              cancel of booking A: count 11 -> 10
              fixture set startAfter to now-60 s (outcome applied); cron 1 -> 200 {"ok":true}; deliveries 1; row for B gone
              delivery headers: x-cal-webhook-version, x-cal-signature-256 (64 hex); triggerEvent MEETING_STARTED
              cron 2 -> 200; deliveries still 1
              purge: fixture set startAfter to now-2 days on booking C's row; cron -> 200; row gone; deliveries unchanged (no delivery)
  concurrent (3 bookings, one due row each, two cron calls at once, 3 repeats in 2 further runs):
              deliveries 2 per due row (identical body hash); statuses [200, 404]
  ```
- Proves: (a) a due row is delivered once by a sequential cron and then deleted; (b) a row whose `startAfter` is more than one day old
  is deleted with no delivery (silent purge, NEW ID SCH-003); (c) two concurrent cron calls deliver one due row twice (SCH-002).
- Citation: `packages/features/webhooks/lib/handleWebhookScheduledTriggers.ts:9-12` (purge, `lte` now minus 1 day), `:17-21` (due rows),
  `:64` (signature header), `:67` (fetch before the delete), `:79-82` (delete per row, after the fetch starts), `:86` (`allSettled` not awaited);
  `packages/features/bookings/lib/service/RegularBookingService.ts:2394-2411` (rows created at booking time, `startAfter` = startTime / endTime);
  `packages/features/bookings/lib/handleCancelBooking.ts:489` (rows removed on cancel);
  `packages/prisma/schema.prisma:1313` (model), `startAfter` (`:1318`);
  The 404 on the second concurrent call: `apps/web/app/api/defaultResponderForAppDir.ts:40-70`
  and `packages/lib/server/getServerErrorFromUnknown.ts:207-208` (Prisma `P2025` -> 404): the second run's `delete` finds the row gone
  after its `fetch` has already been sent. This mechanism is read from code and matched by the 404 and the duplicate body hash; it is not
  separately instrumented.
- Status: CONFIRMED for (a), (b) and (c) (c: 9 of 9 iterations across three runs). Attribution of the 10 extra rows: UNPROBED.

### P7. Booking idempotency: ACCEPTED duplicate and PENDING duplicates (IDEM-001, NEW)
- Date (UTC): 2026-11-02T10:15Z (stack 3)
- Product commit: `c2b7ac4`; harness 0.3.0
- Command: `node --experimental-strip-types p5-idem.mts` (`POST /v2/bookings` twice sequentially and twice concurrently; event types `30min` (accepted) and `tennis-class` (requiresConfirmation true, recurring); qa_ro reads of `"Booking"`)
- Output (trimmed):
  ```text
  ACCEPTED 30min, identical request twice: 201 then 400; 1 Booking row, idempotencyKey set
  PENDING tennis-class, sequential x2: 201 (10 occurrences each, all pending); 20 pending rows
  PENDING tennis-class, concurrent x2: 201 (10 occurrences each, all pending); 20 pending rows
  ```
- Proves: an ACCEPTED duplicate is refused by the unique `idempotencyKey` (400, not 409); a PENDING duplicate is NOT refused: each
  identical request creates a new series. The non-recurring PENDING case is UNPROBED (no seeded non-recurring event type requires
  confirmation; see the plan, L3 probe step).
- Citation: `packages/prisma/extensions/booking-idempotency-key.ts:28-37` (key only for ACCEPTED), `packages/prisma/schema.prisma:855`
  (`idempotencyKey String? @unique`); `packages/features/bookings/repositories/BookingRepository.ts:1932-1955`.
- Status: CONFIRMED for the recurring PENDING and ACCEPTED cases. **CONTRADICTS** the NEW ID scope "at most 1 PENDING Booking per
  eventTypeId, startTime and attendee email" for the recurring event type.

### P8. Daily recording route (DLY-002, DLY-003, replay)
- Date (UTC): 2026-11-02T10:13Z (stack 2, `DAILY_WEBHOOK_SECRET` in the `up` environment)
- Product commit: `c2b7ac4`; harness 0.3.0
- Command: `node --experimental-strip-types p6-daily.mts`
- Output (trimmed):
  ```text
  unsigned {"test":"test"}             -> 200 "Test request successful"; qa-ro counts before == after (bookings 66, tasks 3, scheduled 0, users 41)
  unsigned invalid body                -> 403 "Signature does not match"
  raw-signed invalid body              -> 400 "Invalid Payload"            (signature accepted)
  spaced body signed over re-serialised JSON -> 400 "Invalid Payload"      (accepted)
  spaced body signed over raw bytes    -> 403                              (refused: the route verifies JSON.stringify(body))
  tampered body with old signature     -> 403
  valid signature, timestamp 1000 (1970) -> 400 "Invalid Payload"          (accepted: no freshness check)
  ```
- Proves: the test-request body bypasses the signature check and writes nothing (DLY-003 expectation met); signed bodies are verified
  over `${timestamp}.${JSON.stringify(parsed)}`, so raw-byte signatures of non-canonical JSON fail; a timestamp is not checked for age.
- Citation: `apps/web/app/api/recorded-daily-video/route.ts:40-45` (`computeSignature`), `:57` (test request returns before the check),
  `:62` (`testMode` from `NEXT_PUBLIC_IS_E2E` / `INTEGRATION_TEST_MODE`), `:71-73` (compare); `apps/web/lib/daily-webhook/schema.ts:61-63`.
- Status: CONFIRMED. The unsigned test-request bypass is a P5 security item; P2 records the observed fact only.

### P9. Database roles, seed facts, fixture writes, read guard
- Date (UTC): 2026-11-02T09:58Z (provision), 10:05Z (seed reads)
- Product commit: `c2b7ac4`; harness 0.3.0
- Command: `node scripts/db-roles.ts provision cal`; `node --experimental-strip-types p-db-seed.mts`
- Output (trimmed):
  ```text
  db-roles provision: cal ok
  counts: bookings 30, tasks 0, webhooks 0, scheduled 0, audits 0, TeamFeatures 0, Team 17
  pro event types: 30min, 60min, multiple-duration, paid, in-person, zoom, daily, google-meet, yoga-class (requiresConfirmation false), tennis-class (true)
  fixture write WebhookScheduledTriggers.startAfter (P2-CAL-SCH-002): outcome applied
  read guard: an alias named `start` is refused: ReadOnlyGuardError forbidden-keyword START (select-guard.ts:135)
  ```
- Proves: the qa_ro and qa_fixture roles work; the seed has no team feature rows (so no organisation has `booking-audit` enabled);
  the read guard is over-broad for a column alias named `start` (TEST BUG in the foundation guard, see F9).
- Citation: `src/db/select-guard.ts:135`; `packages/features/booking-audit/lib/service/BookingAuditTaskConsumer.ts:274-298`;
  `packages/features/flags/features.repository.ts:398-411`.
- Status: CONFIRMED

### P10. Seed message and B5
- Date (UTC): 2026-11-02T09:59Z (stack 1 log)
- Product commit: `c2b7ac4`; harness 0.3.0
- Command: `grep -n "Error adding google" /tmp/p2-lane-probes/up-cal.log` (stack 1 log, no values)
- Output (trimmed): `@calcom/prisma:db-seed: Error adding google credentials to DB: Unexpected end of JSON input`
- Proves: the seed prints this line when `GOOGLE_API_CREDENTIALS` is unset: `JSON.parse("")` throws and the `catch` prints the message.
  No lane case needs Google credentials except CAL-PUSH-001 (see the plan, OD-PUSH).
- Citation: `scripts/seed-app-store.ts:109-124` (`try` at 109, `console.error` at 124).
- Status: CONFIRMED (ENV / NOT A BUG). B5 (`main.ts:71` un-awaited `generateSwaggerForApp`, `generate-swagger.ts:32` `getEnv("NODE_ENV")`):
  code reading only, runtime UNPROBED; the harness sets `NODE_ENV=production` (`src/adapters/cal-api-env.ts:52`), so `up` does not reach it.

### P11. API v2 database URL (ENV finding; stack 1 vs stacks 2 to 4)
- Date (UTC): 2026-11-02T10:10Z (stack 1) and 10:12Z (stack 2)
- Product commit: `c2b7ac4`; harness 0.3.0
- Command: `node --experimental-strip-types p5-idem.mts` on stack 1 (no `DATABASE_URL` in the `up` environment); the same on stack 2 with `DATABASE_URL=postgresql://postgres:@127.0.0.1:5450/calendso` in the `up` environment
- Output (trimmed):
  ```text
  stack 1: POST /v2/bookings -> 500 INTERNAL; API log: "Can't reach database server at 127.0.0.1:5432" (PrismaExceptionFilter, eventType.findUniqueOrThrow)
  stack 2: POST /v2/bookings -> 201
  ```
- Proves: the API v2 process reaches its database through the shared Prisma client, which reads `DATABASE_URL`
  (`packages/prisma/index.ts:10`). The harness passes only the no-fallback keys to the API (`src/adapters/cal-api-env.ts:20-60`),
  so with no `DATABASE_URL` in `up`'s environment the client falls back to `localhost:5432`, where nothing listens (the harness
  Postgres is host port 5450). `/health` still answers 200, so the harness readiness check does not see it.
- Citation: `packages/prisma/index.ts:10`; `apps/api/v2/src/modules/prisma/prisma-read.service.ts:19`; harness `src/adapters/cal.adapter.ts:531,542` (API spawn env is `{...calHeapEnv(process.env), ...apiEnv}`); harness `src/adapters/cal-api-env.ts:12-20` (no-fallback list, no `DATABASE_URL`).
- Status: CONFIRMED (harness wiring). A `DATABASE_URL` value in the `up` environment was used only to run stacks 2 to 4 of this session. The plan does not use it: HR-4 (harness v0.3.1) is required.

### P12. API v2 authentication and error answers (input for CON-003)
- Date (UTC): 2026-11-02T10:08Z
- Product commit: `c2b7ac4`; harness 0.3.0
- Command: `curl` of the unauthenticated GETs in P1 (`/v2/bookings`, `/v2/me`, `/v2/event-types`)
- Output (trimmed): `/v2/bookings` 403 PermissionsGuard; `/v2/me` 401 ApiAuthStrategy; `/v2/event-types` 403 PermissionsGuard; duplicate ACCEPTED booking 400 (P7)
- Proves: the refusal status is not uniform (401 on `/v2/me`, 403 on the others); a duplicate booking is 400, not 409.
- Citation: the response text names the guard (`PermissionsGuard`, `ApiAuthStrategy`); harness API log `node_modules/qa-portfolio-harness/.harness/cal-api.log`.
- Status: CONFIRMED

### P13. API v2 throttle (rate limit)
- Date (UTC): all stacks
- Product commit: `c2b7ac4`
- Command: none (code reading); no 429 observed in about 150 API v2 calls over four stacks
- Output: n/a
- Proves: the throttle is ON by default: 120 requests per 60 s per API key (`RATE_LIMIT_DEFAULT_LIMIT_API_KEY`, default 120), Redis storage.
  No 429 was observed in this session; a throttled run has not been produced (UNPROBED runtime).
- Citation: `apps/api/v2/src/lib/throttler-guard.ts:34-39`; `apps/api/v2/src/app.module.ts:40-54`.
- Status: CONFIRMED for the configuration; runtime 429 UNPROBED.

### P14. Server timezone
- Date (UTC): not probed.
- Product commit: `c2b7ac4`
- Command: none
- Output: the product `.env` sets `TZ=UTC` (line 464, "Force Node.js to use UTC as process timezone"); the harness spawn env is `{...process.env, ...options.env}` (`src/internal/spawn-detached.ts:46`), so a `TZ` in the `up` environment reaches the web and API processes. The effect on booking times is UNPROBED.
- Proves: nothing yet; the plan makes the server-TZ differential a build step (L3 probe, then SRVTZ rows).
- Citation: product `.env` line 464 (name and value only); `node_modules/qa-portfolio-harness/src/internal/spawn-detached.ts:46`.
- Status: UNPROBED

### P15. Stripe key needed to start API v2
- Date (UTC): 2026-11-02T09:59Z
- Product commit: `c2b7ac4`
- Command: none (code reading) and the stack 1 log line `Cal API v2 env: ... STRIPE_API_KEY=<redacted> ...`
- Output (trimmed): API env printed with `STRIPE_API_KEY` present (value never printed).
- Proves: `STRIPE_API_KEY` is a "no fallback" key: `buildCalApiEnv` throws naming the key when it is missing, so `up cal` cannot start API v2 without it (no Stripe-backed row is needed in this lane).
- Citation: `node_modules/qa-portfolio-harness/src/adapters/cal-api-env.ts:12-20` (no-fallback list), `:46` and `:82` (`buildCalApiEnv` throws naming the missing key); `apps/api/v2/src/config/app.ts:39-40`.
- Status: CONFIRMED (code and log)

---

## Stack timings (for the CI deadline)

| Stack | Command | rc | Seconds | Notes |
|---|---|---|---|---|
| 1 (cold) | `up cal` with `PRODUCTS_ROOT` set, no lane env | 0 | 802 | web `next build` (about 2 min compile, then type check and page data), API `build:docker` plus `build` (about 1 min 6 s vite plus packaging); first `up` attempt without `PRODUCTS_ROOT` failed in 1 s (see F-ENV-2) |
| 2 (warm) | `up cal` with lane env | 0 | 28 | web build skipped (marker matches `c2b7ac4`), API build skipped (marker matches) |
| 3, 4 (warm) | same | 0 | 28 | |
| all | `down cal` | 0 | 2 | |

## Findings that are not probes (labels in the plan's section 14)

- F-ENV-1 (= P11): API v2 database URL. ENV; HR-4 proposed.
- F-ENV-2: every harness call needs `PRODUCTS_ROOT`; the error text says "set it in .env", but `scripts/bootstrap.sh` writes `PRODUCTS_ROOT` to `.env` only in its fallback path (`scripts/bootstrap.sh`, `resolve_products_root`). ENV note.
- F-ENV-3: `ss` is not installed on this VM; use the Node connect check. ENV note.
- F-ENV-4: a `node_modules` from before the lock bump keeps harness 0.2.11 until `npm ci` (P0). ENV note.
- F-ENV-5: one product `.env` read was refused by the sandbox classifier (credential materialisation). Nothing was read beyond the names and the non-secret `TZ` line. Not worked around. The remaining `.env` facts are UNPROBED: `TASKER_ENABLE_WEBHOOKS` value and `CRON_SECRET` presence (`CRON_SECRET` is absent from `.env.example`, so the lane must set it).
- F-ENV-6: `STRIPE_API_KEY` is present in this session's environment by name; `STRIPE_WEBHOOK_SECRET` is in the product `.env`.
- F9: the `select-guard` keyword check refuses the alias `start` (P9). TEST BUG in the foundation (`src/db/select-guard.ts:135`).
- F7: `tasksConfig` keys do not match the webhook task type (P4). Dead configuration, behaviour matches the tasker README.
- F10 (P5 handoff, not exercised): `apps/web/app/api/tasks/cron/route.ts` -> `packages/features/tasker/api/cron.ts:8` compares `Bearer ${process.env.CRON_SECRET}`; if `CRON_SECRET` is unset the expected value is `Bearer undefined`. Not exercised; P5 owns the verdict.
