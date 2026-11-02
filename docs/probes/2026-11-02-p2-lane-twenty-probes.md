# P2 Twenty lane: probe record (2026-11-02)

Written by the planning session for `docs/plans/2026-11-02-p2-lane-twenty.md`. One entry per probe. This file was first written
with the live stage blocked (the harness gate failed); the second pass (below) ran the probes on the pinned harness after
`npm ci`. Earlier entries are kept as history and marked SUPERSEDED where a later entry replaces them. No older probe file on
main was edited.

Environment for the live entries: Node `v22.23.3` (`/usr/local/bin/node`), Playwright `1.64.0`, Docker 29.x, harness
`qa-portfolio-harness@0.3.0` (`node_modules/qa-portfolio-harness/package.json`), product fork `twenty-CRM` at
`7cbdfec6f346b43715bc2056932f4fad5886f733` (`git -C ../products/twenty-CRM rev-parse HEAD`, equal to `TWENTY_REF` in
`scripts/bootstrap.sh`). Products root passed on the command line as `PRODUCTS_ROOT=/home/user/products` (the `.env` file was not
edited). The probe harness is throwaway and never committed: `/tmp/p2-lane-probes/` (`playwright.config.ts`, `specs/*.spec.ts`,
`out/*.json`). Probe specs use the foundation fixtures, the Twenty client (`src/clients/twenty.ts`), the receiver
(`src/webhooks/receiver.ts`), the verifier and signer (`src/webhooks/verify.ts`, `src/webhooks/sign.ts`), the read-only DB
(`src/db/pg.ts`, `qa_ro`) and the OAS loader (`src/contracts/oas.ts`). Waits are bounded polls with explicit deadlines; no probe
retries an action, and each probe made one attempt (extra attempts are separate entries).

Stacks run (one at a time; each ended with `down`, and afterwards zero `qa-harness-*` containers and no product port listening):

| Stack | `up` | Env given to `up` | Seed | Roles | `down` |
|---|---|---|---|---|---|
| S1 | 10:18:29Z start, exit 0, 191 s (cold: no Twenty image was present, the pull is inside) | `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS=host.docker.internal,172.17.0.1` | `scripts/harness-seed.mjs twenty` ok, 85 s | provision ok | rc 0 |
| S2 | exit 0, 110 s | as S1 plus `IS_BILLING_ENABLED=true`, `BILLING_STRIPE_API_KEY` (from the environment, not printed), `BILLING_STRIPE_WEBHOOK_SECRET` (generated per run, not printed) | seed ok | provision ok | rc 0 |

The first `up` attempt in S1 failed in 1 s with `Cal product root does not exist` (`PRODUCTS_ROOT` unset; the harness default is
`node_modules/products`). It was retried with `PRODUCTS_ROOT` set on the command line; this is recorded, not hidden.

---

## Entries from the planning pass (history)

### P0. Is the harness installed at 0.3.0? (SUPERSEDED by P0-r2)
- Date (UTC): 2026-11-02T09:56:57Z
- Product commit: n/a (harness gate)
- Harness version: 0.2.11 (installed copy, before `npm ci`); expected 0.3.0
- Command: `node -p "require('./node_modules/qa-portfolio-harness/package.json').version"`; `grep -n -A3 '"node_modules/qa-portfolio-harness"' package-lock.json`
- Output (trimmed): `0.2.11`; lock line `"version": "0.3.0"`, `"resolved": "git+ssh://git@github.com/Jayami123/qa-portfolio-harness.git#be86e0e…"`.
- Proves: the installed copy did not match the lock before the install.
- Citation: `package-lock.json:1608-1610`.
- Status: CONTRADICTS at that time. Superseded by P0-r2.

### P0b. Base is the one the plan names. (CONFIRMED)
- Date (UTC): 2026-11-02T09:55Z (approx.)
- Command: `git fetch origin && git rev-parse origin/main && git merge-base --is-ancestor aa10ec1 origin/main`
- Output (trimmed): `origin/main = aa10ec11bada21b3e3e5803a948e33023d648505`; ancestor check passed.
- Status: CONFIRMED.

### P0c. Fork at the pinned ref; no stack up. (CONFIRMED)
- Date (UTC): 2026-11-02T09:56:57Z
- Product commit: `7cbdfec6f346b43715bc2056932f4fad5886f733`
- Command: `git -C ../products/twenty-CRM rev-parse HEAD`; `docker ps --format '{{.Names}}' | grep -cE '^qa-harness-'`; a bash `/dev/tcp` connect test on 3000 3001 3002 4317 5434 5555 6380 6381 5433 5450 5451.
- Output (trimmed): fork HEAD equals `TWENTY_REF`; 0 containers; every port refused. (The first port check used `ss`, which is not on this PATH; its empty output was not evidence, so it was redone with `/dev/tcp`.)
- Status: CONFIRMED.

### P0d / P0e. Unit baseline 277 and the Playwright list. (SUPERSEDED: stale `node_modules`, then 285 on a clean install; see P0-r2)

---

## Second pass (live, after `npm ci`)

### P0-r2. Harness version, stripe, unit baseline after a clean install.
- Date (UTC): 2026-11-02T10:14Z (approx.)
- Product commit: `7cbdfec6f346b43715bc2056932f4fad5886f733`
- Harness version: `0.3.0`
- Command: `npm ci` (exit 0; 138 packages added); `node -p "require('./node_modules/qa-portfolio-harness/package.json').version"`; `node -p "require('./node_modules/stripe/package.json').version"`; `node -p "require('./node_modules/@playwright/test/package.json').version"`; `npm run unit` (Node 22.23.3) and `/opt/node24/bin/node --test "tests/unit/**/*.test.ts"` (Node 24.22.0).
- Output (trimmed): `0.3.0`; `23.0.1`; `1.64.0`; Node 22: `# tests 285 / # pass 285 / # fail 0`; Node 24: `ℹ tests 285 / ℹ pass 285 / ℹ fail 0`.
- Proves: the pinned harness and stripe are installed; the unit baseline on `aa10ec1` is 285 (not 277), the same on both Node versions.
- Citation: `package-lock.json:1608-1610`; `package.json` (`stripe` 23.0.1; `@playwright/test` 1.64.0).
- Status: CONFIRMED.

### P0-r2b. Unit tests per file (attribution of the count to files).
- Date (UTC): 2026-11-02T10:17Z (approx.)
- Command: for each `tests/unit/**/*.test.ts`: `node --test <file>`; sum.
- Output (trimmed; count and file):
  ```text
  59 select-guard   21 oas   23 receiver   21 verify   17 sign   16 engine   15 flows   13 roles   11 clients
  10 env   10 fixture   9 reach   8 secret   8 prefix   7 workflow   7 pg   5 reaper-revoke   5 validate-specs
  5 canary   5 docker-net   4 redact   4 checks   2 reaper        (total 285 over 23 files)
  ```
  Full list in `/tmp/p2-unit-per-file.txt`.
- Proves: the 285 is the sum of the per-file counts on `aa10ec1` with the docs-only branch. The index does not give per-file
  counts, so the 8 tests above the planned 277 cannot be attributed to a task from the index; they are attributed here by file.
- Status: CONFIRMED (counts); attribution to tasks: UNPROBED (index has no per-file numbers).

---

## Live probes (stack S1 unless marked)

### P-TW-1. Signature: HMAC over `${ts}:${JSON.stringify(payload)}`; nonce unsigned; body tamper fails. (CONFIRMED)
- Date (UTC): 2026-11-02T10:24Z (S1)
- Product commit: `7cbdfec6f346b43715bc2056932f4fad5886f733`; Harness: `0.3.0`
- Command: spec `specs/live.spec.ts` › `P-TW-1`: one webhook (`person.created`, per-run secret); after the memo window one person; the received request is verified by `verifyTwenty` as received, with the nonce replaced, and with one body byte flipped; the HMAC is recomputed by `createHmac` over `${ts}:` + raw bytes.
- Output (trimmed):
  ```text
  headers: content-type, x-twenty-webhook-timestamp (13 digits), x-twenty-webhook-signature, x-twenty-webhook-nonce
  body keys: targetUrl, eventName, objectMetadata, workspaceId, webhookId, eventDate, record
  jsonRoundTripIdentical: true; recomputedMatchesHeader: true; signTwentyMatchesHeader: true
  verifyAsReceived: {ok:true}; verifyNonceReplaced: {ok:true}; verifyBodyFlipped: {ok:false, reason:"signature-mismatch"}
  ```
- Proves: the signature is HMAC-SHA256 over the millisecond timestamp, the colon, and the exact body bytes; the nonce is not signed.
- Citation: `packages/twenty-server/src/engine/metadata-modules/webhook/jobs/call-webhook.job.ts:38-47` (generateSignature), `:85-101` (headers, nonce).
- Status: CONFIRMED.

### P-TW-2. B1: fresh webhook, one event inside the memo window, then one canary after the window. (NOT REPRODUCED)
- Date (UTC): 2026-11-02T10:24:42Z (S1)
- Product commit: `7cbdfec6…`; Harness: `0.3.0`
- Command: `specs/live.spec.ts` › `P-TW-2`: one person (prime); webhook `person.created` created 0.13 s later; one person 0.06 s later (inside the 10 s memo); wait until create + 10.5 s; one person (canary); waits for the canary delivery.
- Output (trimmed):
  ```text
  webhookCreateAt 10:24:42.790Z; firstSentMsAfterCreate 116 ms; firstArrival 10:24:42.998Z (delivered)
  firstDeliveriesAfterWindow: 1; firstDeliveriesAtEnd: 1; canaryAt 10:24:53.358Z; secondDelivered: true
  worker: Processing job 195 CallWebhookJobsJob ... processed in 71.17ms; job 196 CallWebhookJob
          "Outbound HTTP request: POST http://host.docker.internal:4317/r/…/p2-b1-drop"; processed in 28.25ms
  ```
- Proves: this first attempt delivered the first event inside the window, so the B1 drop is NOT reproduced by this sequence on this build.
- Citation: `call-webhook-jobs.job.ts:46-59` (map read and early return), `workspace-cache.service.ts:56` (memo), `call-webhook.job.ts:57-59` and `:137-155`.
- Status: NOT REPRODUCED (1 of 1 for this sequence). The B1 test is therefore a regression check, not a `test.fail()` case (see the B1 summary below).

### P-TW-2r. B1 repeat of P-TW-2, same sequence, second attempt on S1. (NOT REPRODUCED)
- Date (UTC): 2026-11-02T10:27Z (S1)
- Command: `specs/extra.spec.ts` › `P-TW-2r` (prime then webhook then one event then canary).
- Output (trimmed): `prime: true; firstSentMsAfterCreate 85; firstDeliveredInWindowPoll 1; firstDeliveriesAtEnd 1; canaryDelivered 1`
- Status: NOT REPRODUCED.

### P-TW-2n. B1 without the priming event, started about 1 s after P-TW-2r's canary, on S1. (REPRODUCED ONCE)
- Date (UTC): 2026-11-02T10:27:4xZ (S1)
- Command: `specs/extra.spec.ts` › `P-TW-2n` (no prime; webhook; one event; canary).
- Output (trimmed):
  ```text
  prime: false; firstSentMsAfterCreate 77; firstDeliveredInWindowPoll 0; firstDeliveriesAtEnd 0; canaryDelivered 1
  worker, between 10:27:41.83Z and 10:27:53.41Z: no CallWebhookJobsJob and no Outbound HTTP line for the first event;
  10:27:53.41Z: Processing job 216 CallWebhookJobsJob (3.93ms), job 217 CallWebhookJob "Outbound … p2-b1-noprime" (7.16ms)
  ```
  The job at 10:27:53 is the canary (sent about 10.5 s after the webhook). The first event produced no job log at all in the
  window, and the receiver recorded no delivery for it.
- Proves: one drop in this attempt. The first event was not delivered and left no fan-out job in the worker log. The drop
  happened right after an earlier event of the same run (inside the memo window of the previous fan-out).
- Citation: `call-webhook-jobs.job.ts:46-59`; `workspace-cache.service.ts:56`.
- Status: REPRODUCED ONCE (intermittent). Not repeated in the timed set below.

### P-TW-2a/b/c. B1 timed attempts with a 12 s idle gap before each. (NOT REPRODUCED, 3 of 3)
- Date (UTC): 2026-11-02T10:29:21Z to 10:30:17Z (S1)
- Command: `specs/b1.spec.ts` (three tests in sequence: A no prime; B prime; C no prime; each after a 12 s idle gap; absolute times and worker lines recorded per attempt in `out/P-TW-2-<name>.json`).
- Output (trimmed):
  ```text
  A-noprime: webhookCreateAt 10:29:21.324Z; firstSentAt 10:29:21.377Z; firstArrivalAt 10:29:21.400Z; firstDeliveriesAtEnd 1; canaryDeliveries 1
  B-prime:   webhookCreateAt 10:29:44.315Z; firstSentAt 10:29:44.352Z; firstArrivalAt 10:29:44.384Z; firstDeliveriesAtEnd 1; canaryDeliveries 1
  C-noprime: webhookCreateAt 10:30:07.330Z; firstSentAt 10:30:07.367Z; firstArrivalAt 10:30:07.379Z; firstDeliveriesAtEnd 1; canaryDeliveries 1
  ```
- B1 summary across this stack: the first event was not delivered in 1 of 6 attempts (P-TW-2n), and delivered in 5 of 6. The drop
  occurred only in the attempt that followed a previous attempt inside the same memo window. No attempt needed a retry.
- Status: NOT REPRODUCED under idle gaps (3 of 3). Intermittent drop observed once (P-TW-2n). Not a confirmed product bug:
  the rule for `test.fail()` needs a reproduction the test can rely on, and this one is not reliable.

### P-TW-3. Timeout: receiver `slow` 4 s then 6 s on one webhook. (CONFIRMED)
- Date (UTC): 2026-11-02T10:25:15Z (S1)
- Command: `specs/live.spec.ts` › `P-TW-3`: webhook; after the memo window; receiver mode `slow 4000`, one person; wait 12 s; then mode `slow 6000`, one person; wait 12 s; counts per record id and worker job lines.
- Output (trimmed):
  ```text
  slow4: requestsAtEnd 1; firstArrivalMsAfterSend 22; worker "Job 202 CallWebhookJob processed in 4018.00ms"
  slow6: requestsAtEnd 1; firstArrivalMsAfterSend 7;  worker "Job 204 CallWebhookJob processed in 5006.60ms"
  ```
- Proves: one request per event at 4 s (the call succeeded in 4.0 s) and at 6 s (the call was cut at the 5.0 s timeout, and the receiver saw exactly one request, so no retry happened within 12 s).
- Citation: `call-webhook.job.ts:112-119` (`timeout: 5_000` at `:117`), `:137-155` (catch).
- Status: CONFIRMED. The `webhook.response` row for the 6 s case is not checkable (P-TW-11).

### P-TW-4. Identity: created then updated; body fields; request counts. (CONFIRMED)
- Date (UTC): 2026-11-02T10:25:51Z (S1)
- Command: `specs/live.spec.ts` › `P-TW-4`: webhook for `person.created` and `person.updated`; one person; then `PATCH /rest/people/{id}` (bearer, the same API key as the suite).
- Output (trimmed):
  ```text
  updateStatus 200; requestsForRecord 2
  attempt 1: eventName person.created; webhookId 0232461f…; recordId c4c32e87…; eventDate 10:25:51.094Z; keys: targetUrl,eventName,objectMetadata,workspaceId,webhookId,eventDate,record
  attempt 1 (same): nonce 749ab5e5…; signature header present
  attempt 2: eventName person.updated; webhookId 0232461f… (same); recordId c4c32e87… (same); eventDate 10:25:51.241Z; keys + updatedFields
  attempt 2 (same): nonce 78e8e376… (different)
  ```
- Proves: the identity of the record and the webhook is stable across the two events; there is NO event id in the body; `eventDate` differs per event; the nonce differs per request.
- Citation: `transform-event-batch-to-webhook-events.ts:36, 45-57`; `call-webhook.job.ts:98-100`.
- Status: CONFIRMED. Consequence: TW-WH-006 is rewritten to the identity tuple (plan OD-4 default, applied).

### P-TW-5. Rate-limit flag: env reach, feature-flag storage. (CONFIRMED: absent by default; enabling path UNPROBED)
- Date (UTC): 2026-11-02T10:24Z (S1), 10:27Z (S1, 5b)
- Command: `docker exec <server> printenv …`; `qa_ro` reads of `information_schema.columns` and `core."featureFlag"`; the pass-through lists `twenty-passthrough.ts`, `twenty-rate-limits.ts` (installed 0.3.0).
- Output (trimmed):
  ```text
  env IS_WEBHOOK_RATE_LIMIT_ENABLED: UNSET; env IS_MULTIWORKSPACE_ENABLED: false; env IS_BILLING_ENABLED: UNSET (S1)
  core.featureFlag columns: id:uuid, key:text, workspaceId:uuid, value:boolean, createdAt, updatedAt
  distinct keys: 10; rows with key IS_WEBHOOK_RATE_LIMIT_ENABLED: 0
  CLICKHOUSE_URL: UNSET
  TWENTY_RATE_LIMIT_ENV: API_RATE_LIMITING_* and APPLICATION_API_RATE_LIMITING_* only (twenty-rate-limits.ts:7-13)
  ```
- Proves: the rate-limit flag is a per-workspace row in `core.featureFlag`, absent by default; it is not an environment variable and
  is not in the harness pass-through lists. Setting it needs a row write (a `qa_fixture` allow-list entry, or an API route not probed here).
- Citation: `webhook-rate-limit.service.ts:38-46`; `core` entity `feature-flag.entity.ts:15`; `twenty-rate-limits.ts:7-13` (installed 0.3.0).
- Status: CONFIRMED (absent by default; `featureFlagService` default not read here). The write route: UNPROBED.

### P-TW-6. Second workspace and multi-workspace flag. (PARTIAL)
- Date (UTC): 2026-11-02T10:24Z (S1)
- Output (trimmed): `IS_MULTIWORKSPACE_ENABLED=false` in the server environment; not in `TWENTY_PASSTHROUGH_ENV` (`twenty-passthrough.ts:9-15`); `core.workspace` rows: 2 (`workspaceCount 2`) after the seed, which created two workspace rows.
- Proves: the multi-workspace flag is off and the harness does not pass it; the seed already created a second workspace row. The API route to create a workspace while the flag is on was not probed (the flag is off).
- Status: PARTIAL (flag: CONFIRMED off and not passed; route creation: UNPROBED). TW-WH-009 and TW-STR-002 stay DEFERRED (HR-5), per the owner's decision; no workaround is planned.

### P-TW-7. Billing: env, route answer, ordering. (PARTIAL: signature checks CONFIRMED; ordering BLOCKED by a missing billing schema)
- Date (UTC): 2026-11-02T10:26Z (S1, billing off); 10:33Z (S2, billing on)
- S1 output (billing off): `IS_BILLING_ENABLED UNSET`; `BILLING_STRIPE_*` UNSET; unsigned `POST /webhooks/stripe` → `500 BILLING_UNHANDLED_ERROR "Cannot read properties of undefined (reading 'webhooks')"`.
- S2 env (billing on, values not printed): `IS_BILLING_ENABLED set`, `BILLING_STRIPE_WEBHOOK_SECRET set`, `BILLING_STRIPE_API_KEY set`, `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS set` (all four reached the server through `up`).
- S2 route (secret read in memory from the server environment, not stored):
  ```text
  unsigned:            400 StripeError "No stripe-signature header value was provided."
  wrong secret:        400 StripeError "No signatures found matching the expected signature for payload…"
  signed, product.updated (newer name first):  500 BILLING_UNHANDLED_ERROR 'relation "core.billingProduct" does not exist'
  signed, product.updated (older name second): 500 same
  billing-like tables in the database: none; core table count 77
  ```
- Proves: the signature check runs (unsigned and wrong secret are refused); on this image (`twentycrm/twenty:v2.44.0`) the
  billing tables are not created, so no billing row can be read and the handler cannot store an event. Ordering (last arrival
  wins) is therefore UNPROBED on this image; the code path is `billing-webhook-product.service` upsert on `stripeProductId`
  (no ordering check) and `billing-webhook-subscription.service.ts:160-200`.
- Citation: `billing-webhook.controller.ts:54-72`; `stripe-webhook.service.ts:18, 22, 28`; `config-variables.ts:945`.
- Status: PARTIAL. Stripe-backed rows (STR-001, STR-002) are BLOCKED: the image has no billing schema (ENV/product image,
  not an HR item). Owner decision needed (plan OD-10 default: unit-only fallback).

### P-TW-8. Cache: server replicas under `up`. (CONFIRMED: one server replica)
- Date (UTC): 2026-11-02T10:24Z (S1)
- Output (trimmed): containers `qa-harness-twenty-server-1` (healthy), `-worker-1`, `-db-1`, `-redis-1`, `-mailpit-1`; server count 1.
- Proves: the harness starts one server, so two-replica cache cases need HR-4 (DEFERRED).
- Citation: installed harness compose (`node_modules/qa-portfolio-harness/docker/twenty.compose.yml`, service `server`).
- Status: CONFIRMED.

### P-TW-9. Route trigger: which API creates it. (PARTIAL: path identified; workflow case UNPROBED)
- Date (UTC): 2026-11-02T10:25Z (S1)
- Output (trimmed): `/metadata` introspection, status 200, 254 mutations; the route-related ones are `createOneLogicFunction`, `executeOneLogicFunction`, `updateOneLogicFunction`, `deleteOneLogicFunction`. Types with route fields: `LogicFunction.httpRouteTriggerSettings`; `CreateLogicFunctionFromSourceInput.httpRouteTriggerSettings` and `.serverRouteTriggerSettings`; `UpdateLogicFunctionFromSourceInputUpdates.httpRouteTriggerSettings`. No type is named like `RouteTrigger`.
- Proves: a route trigger is part of a logic function (created with `createOneLogicFunction`/`from source`), not a separate mutation. A workflow with a create-record action (the RT-001 setup) was not built or run.
- Citation: `packages/twenty-server/src/engine/metadata-modules/route-trigger/route-trigger.controller.ts:25-53` (the public route).
- Status: PARTIAL. RT-001 execution: UNPROBED (needs the logic-function source input and a runnable executor).

### P-TW-10. REST OAS: URL, auth, people paths, list parameters, loader. (CONFIRMED)
- Date (UTC): 2026-11-02T10:25Z (S1), 10:27Z (10b, 10c)
- Output (trimmed):
  ```text
  unauthenticated GET /rest/open-api/core: 403
  authenticated (API key bearer):          200; openapi 3.1.1; 362 paths
  /people GET parameters (components refs): orderBy, filter, limit, depth, startingAfter, endingBefore
  paths containing people: /people, /batch/people, /people/{id}, /people/duplicates, /people/{id}/restore, /people/restore
  loadSpec(URL) without auth: REJECTED (Unable to resolve $ref pointer … 403 body)
  loadSpec(saved authenticated JSON file): ACCEPTED
  ```
- Proves: the OAS is not public; the contract tests must save the authenticated document to a file and load that file (the loader
  takes a file, not a header). The cursor parameters are `startingAfter` and `endingBefore`, not `starting_after`.
- Citation: `src/contracts/oas.ts:282-292` (loader); `node_modules/qa-portfolio-harness` not involved.
- Status: CONFIRMED. The plan's CON-001 and PAG cases use `startingAfter`, and the document is fetched with the bearer.

### P-TW-11. Event log: where `webhook.response` rows are stored. (CONFIRMED: not in Postgres)
- Date (UTC): 2026-11-02T10:27Z (S1)
- Output (trimmed): `core` tables matching event or webhook: `core.webhook` only; `core."eventLog"` absent; workspace schemas present (2 listed).
- Citation: `packages/twenty-server/src/engine/core-modules/event-logs/event-logs.service.ts:37` (`ClickHouseService`), `:52` (`getClickHouseTableName`); `CLICKHOUSE_NOT_CONFIGURED` in `event-logs-graphql-api-exception-handler.util.ts:18`; `CLICKHOUSE_URL` UNSET on S1.
- Proves: the event-log rows (including `webhook.response`) live in ClickHouse, which this harness does not start. The TW-WH-005 secondary oracle (the response row) is therefore UNAVAILABLE in this harness; the receiver stays the oracle.
- Status: CONFIRMED. (The index's upstream test `webhook-response-write.integration-spec.ts:147` uses that store.)

### P-TW-12. `test.fail()` masking and serial behaviour in Playwright 1.64.0. (CONFIRMED)
- Date (UTC): 2026-11-02T10:33Z (no stack)
- Command: `npx playwright test -c pwfail/playwright.config.ts` with `pwfail/masking.spec.ts` (S1 control broken inside `test.fail()`; S2 a real failure in a serial group; S3 after it; S4 `test.fail()` on a passing assertion; S5 control passes and product wrong inside `test.fail()`).
- Output (trimmed):
  ```text
  S1 control broken, wrapped in test.fail        -> passed (expected failure)
  S2 real failure, no test.fail                  -> failed
  S3 after S2 (serial)                           -> did not run
  S4 test.fail on an assertion that passes       -> failed: "Expected to fail, but passed."
  S5 control passes, product assertion wrong      -> passed (expected failure)
  2 passed, 2 failed, 1 did not run
  ```
- Proves: `test.fail()` covers the whole test body: a broken positive control inside it is reported as the expected failure and
  hides the break. An unexpected pass is reported as a failure. A failure in a serial group skips the rest of the group.
- Status: CONFIRMED. Supports OD-1 (the control is its own serial test) and makes the rule "no test.fail() without a reliable reproduction" binding.

---

## Contradictions with earlier records and the index

| # | Earlier statement | This pass | Entry |
|---|---|---|---|
| C-1 | Plan R7: "creating a webhook does not invalidate the worker cache (no invalidate call found in the webhook service)" | The migration runner invalidates and recomputes the workspace cache after a metadata change: `workspace-migration-runner.service.ts:101-123` (`invalidateAndRecompute`). The search was incomplete. | P-TW-2 family |
| C-2 | Index B1: "event dropped silently; nothing logged; nothing retried" | The drop was seen once, with no fan-out job logged for the first event; it is intermittent and not reproduced under idle gaps. The `webhook.response` row of the failure path is in ClickHouse, not Postgres (C-4). | P-TW-2n |
| C-3 | Plan TW-WH-006: "stable event id" | The body has no event id; the identity is `webhookId` + `eventName` + `record.id`, with `eventDate` per event and a per-request nonce. | P-TW-4 |
| C-4 | Plan TW-WH-005 secondary oracle: the `webhook.response` row | Event-log rows are in ClickHouse, not started by the harness. | P-TW-11 |
| C-5 | Plan CON-001: OAS fetched by URL | The document needs the bearer (403 otherwise), and the loader takes a file. | P-TW-10 |
| C-6 | Plan STR-001 "live with STRIPE_API_KEY" | With the key and billing on, the image has no billing tables; the handler returns 500. | P-TW-7 |

## Cleanup
Both stacks ended with `down` (rc 0). After S2, `docker ps -a` lists no `qa-harness-*` container, and ports 3002, 4317, 5434
refuse connections. Probe data: each probe removed the people and webhooks it created through the API (`people.remove`,
`webhooks.remove`) in its own cleanup path; I did not inspect the stack's volumes after `down`, so any row a probe failed to
remove is unverified. No billing row was written (the billing schema is absent on this image). No secret value was printed or
written to disk: the per-run billing secret lived in the server environment and in the probe's memory only.
