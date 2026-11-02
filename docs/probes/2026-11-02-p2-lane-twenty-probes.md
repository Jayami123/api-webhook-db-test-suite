# P2 Twenty lane: probe record (2026-11-02)

Written by the planning session for `docs/plans/2026-11-02-p2-lane-twenty.md`. One entry per probe. Nothing here was re-run
for another entry. Older probe files on main are history and were not edited (the foundation records are
`docs/probes/2026-11-01-*`).

**Gate result: the live probe stage did not run.** The harness version check failed (P0, CONTRADICTS): the installed
`qa-portfolio-harness` is `0.2.11`, while `package-lock.json:1609` pins `0.3.0` at `be86e0e`. A read-only fetch of the
`v0.3.0` tag was refused by the session's permission check; it was not retried and no other route to the harness was tried.
Per the lane rules (STOP: harness version is not 0.3.0), no stack was started with `up`. Every runtime probe below is therefore
UNPROBED, and the plan does not state any runtime behaviour as confirmed from this session.

Environment at the time of the record: 2026-11-02T09:56:57Z (UTC), Node `v22.23.3` (`/usr/local/bin/node`), `NODE24=/opt/node24/bin/node`,
Playwright `1.64.0` (`node_modules/@playwright/test`), Docker reachable with zero `qa-harness-*` containers, no product port listening.

---

### P0. Is the harness pinned and installed at 0.3.0 (gate for every probe)?
- Date (UTC): 2026-11-02T09:56:57Z
- Product commit: n/a (harness gate)
- Harness version: 0.2.11 (installed copy); expected 0.3.0
- Command: `node -p "require('./node_modules/qa-portfolio-harness/package.json').version"`; `grep -n -A3 '"node_modules/qa-portfolio-harness"' package-lock.json`
- Output (trimmed):
  ```text
  0.2.11
  1608:    "node_modules/qa-portfolio-harness": {
  1609:      "version": "0.3.0",
  1610:      "resolved": "git+ssh://git@github.com/Jayami123/qa-portfolio-harness.git#be86e0e608f7ae2ccbe973a57465d2cbe88fb752",
  ```
  A remote read of tag `v0.3.0` of the harness repository was refused by the session's permission check (not retried).
- Proves: the installed `node_modules` does not match the lock (`0.2.11` installed, `0.3.0` locked), so no live probe can run on the pinned harness from this VM.
- Citation: `package-lock.json:1608-1610`; `package.json` (`"qa-portfolio-harness": "github:Jayami123/qa-portfolio-harness#v0.3.0"`).
- Status: CONTRADICTS (installed 0.2.11 vs lock 0.3.0). The tag fetch: UNPROBED (refused by the permission check; re-run this probe in a session that can reach the tag).

### P0b. Is the base the one the plan names?
- Date (UTC): 2026-11-02T09:55Z (approx., same session)
- Product commit: n/a
- Harness version: n/a
- Command: `git fetch origin && git rev-parse origin/main && git merge-base --is-ancestor aa10ec1 origin/main`
- Output (trimmed): `origin/main = aa10ec11bada21b3e3e5803a948e33023d648505`; ancestor check passed.
- Proves: the base named in the brief is `origin/main`, or a descendant of it.
- Citation: git history of `origin/main`.
- Status: CONFIRMED.

### P0c. Are the product fork and the stacks at the pinned state?
- Date (UTC): 2026-11-02T09:56:57Z
- Product commit: `7cbdfec6f346b43715bc2056932f4fad5886f733` (`git -C ../products/twenty-CRM rev-parse HEAD`)
- Harness version: 0.2.11 (see P0)
- Command: `git -C ../products/twenty-CRM rev-parse HEAD`; `docker ps --format '{{.Names}}' | grep -cE '^qa-harness-'`; `ss -ltn | grep -E ':(3000|3001|5555|6380|6381|5433) '`
- Output (trimmed): fork HEAD equals `TWENTY_REF` in `scripts/bootstrap.sh`; the container count is `0`; the port filter returned no lines.
- Proves: the Twenty fork checkout is at the pinned ref, and no stack or foundation product port was up before any probe.
- Citation: `scripts/bootstrap.sh` (`TWENTY_REF`).
- Status: CONFIRMED.

### P0d. Is the local unit baseline the expected 277 on aa10ec1?
- Date (UTC): 2026-11-02T09:58Z (approx.)
- Product commit: n/a
- Harness version: 0.2.11
- Command: `npm run unit 2>&1 | grep -E '^# (tests|pass|fail|skipped)'`
- Output (trimmed):
  ```text
  # tests 249
  # pass 247
  # fail 2
  # Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'stripe' imported from .../src/webhooks/sign.ts
  # Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'stripe' imported from .../tests/unit/webhooks/sign.test.ts
  ```
- Proves: the installed `node_modules` predates the `stripe` dev dependency that main's `package.json` declares (Task 2), so this VM's unit baseline is 249/247/2, not 277. This is an ENV finding, not a product or test finding.
- Citation: `package.json` (`"stripe": "23.0.1"`); `src/webhooks/sign.ts:1-125` (imports `stripe`).
- Status: CONTRADICTS (expected 277 on `aa10ec1` per the brief). ENV. The builder re-measures at task start after a clean install.

### P0e. Does the Playwright API project list load?
- Date (UTC): 2026-11-02T09:58Z (approx.)
- Product commit: n/a
- Harness version: 0.2.11
- Command: `npx playwright test --list --pass-with-no-tests`
- Output (trimmed): `Error: Cannot find package 'stripe' imported from .../src/webhooks/verify.ts`; `Total: 0 tests in 0 files`.
- Proves: the Playwright list cannot load on this stale install (same cause as P0d). Listed test counts are UNMEASURED for this session.
- Citation: `playwright.config.ts:1-6`; `src/webhooks/verify.ts` (imports `stripe`).
- Status: CONTRADICTS (expected a non-zero list, see foundation index section 1, Task 5 21 listed tests). ENV.

---

The probes below were planned and **not run** (the P0 gate failed). The builder runs each one in its own task after the
gate passes, using the exact command in the entry. Each entry records its status as UNPROBED until then.

### P-TW-1. Signature: is the outbound HMAC `HMAC-SHA256(secret, "${timestamp}:${JSON.stringify(payload)}")` hex, and is the nonce unsigned?
- Date (UTC): not run
- Product commit: 7cbdfec6f346b43715bc2056932f4fad5886f733 (pinned)
- Harness version: 0.3.0 required (not reached)
- Command (for the builder): one `person.created` through a fresh webhook, receiver mode `ok`; recompute with `src/webhooks/sign.ts` `signTwenty` from the recorded body and the `X-Twenty-Webhook-Timestamp`; tamper the nonce header (must still verify) and one body byte (must fail).
- Output: not run.
- Proves: (not run). Code and a foundation record exist: `call-webhook.job.ts:38-47, 85-101`; foundation probe 4.3 (harness v0.2.18) confirmed the construction.
- Citation: `packages/twenty-server/src/engine/metadata-modules/webhook/jobs/call-webhook.job.ts:38-47, 85-101` (7cbdfec).
- Status: UNPROBED.

### P-TW-2. B1: does an event sent inside the memo window reach the receiver, and is a fresh webhook visible after one memo window?
- Date (UTC): not run
- Product commit: 7cbdfec6f346b43715bc2056932f4fad5886f733
- Harness version: 0.3.0 required (not reached)
- Command (for the builder): prime with one `person.created`; create a fresh webhook; immediately send event 1; record deliveries and the worker log lines `Outbound HTTP request` and `processed`; after `TWENTY_WEBHOOK_MEMO_MS + CANARY_MARGIN_MS`, send event 2 (the canary control) and record its delivery. Exactly one trigger per phase.
- Output: not run.
- Proves: (not run). Foundation record (v0.2.18): the first attempt delivered nothing and the worker logged a 16.81 ms job (foundation probe 4.4).
- Citation: `workspace-cache.service.ts:56` (MEMOIZER_TTL_MS = 10_000); `call-webhook-jobs.job.ts:46-59`; `call-webhook.job.ts:137-155`.
- Status: UNPROBED.

### P-TW-3. Timeout: attempts and job outcome at receiver `slow` 4 s and 6 s.
- Date (UTC): not run
- Command (for the builder): receiver `{kind:"slow", delayMs:4000}` then `6000`; count receiver deliveries per recordId after each quiet window; read the `webhook.response` row (table name from P-TW-11) for the 6 s case.
- Output: not run.
- Proves: (not run). Code: the axios call has `timeout: 5_000` (`call-webhook.job.ts:117`).
- Citation: `call-webhook.job.ts:112-119`.
- Status: UNPROBED.

### P-TW-4. Event identity: which fields are stable across two related deliveries, and is any retry path reusing them?
- Date (UTC): not run
- Command (for the builder): one `person.created`, then one `person.updated` on the same record; compare `webhookId`, `eventName`, `record.id`, `eventDate` in the two bodies; confirm one request per event (P-TW-3 and WH-004 counts).
- Output: not run.
- Proves: (not run). Code: the payload has no event id field (`transform-event-batch-to-webhook-events.ts:45-57`); `eventDate` is set once per batch (`:36`).
- Citation: `transform-event-batch-to-webhook-events.ts:36, 45-57`.
- Status: UNPROBED.

### P-TW-5. Rate-limit flag: can `IS_WEBHOOK_RATE_LIMIT_ENABLED` be enabled for the test workspace without a harness edit?
- Date (UTC): not run
- Command (for the builder): read the flag's storage (`core.featureFlag`, entity `feature-flag.entity.ts:15`) and the API that writes it; decide between an API route and a `qa_fixture` write (needs a `src/db/fixture-allowlist.ts` entry).
- Output: not run.
- Proves: (not run). Code: the flag is read per workspace (`webhook-rate-limit.service.ts:38-42`); `FeatureFlagService.isFeatureEnabled` (`feature-flag.service.ts:27`).
- Citation: `webhook-rate-limit.service.ts:38-46`; `feature-flag.service.ts:20-27`; `feature-flag.entity.ts:15`.
- Status: UNPROBED. Known: it is not an environment variable at the pinned ref.

### P-TW-6. Second workspace: how to create one through the API and remove it (TW-WH-009, TW-STR-002).
- Date (UTC): not run
- Command (for the builder): with `IS_MULTIWORKSPACE_ENABLED` on, find the workspace-creation route and its removal route; check whether the env flag can reach the server through the harness `up` environment (HR-5).
- Output: not run.
- Proves: (not run). Code: the variable defaults to `false` (`config-variables.ts:2113`).
- Citation: `packages/twenty-server/src/engine/core-modules/twenty-config/config-variables.ts:1173, 2113`.
- Status: UNPROBED.

### P-TW-7. Billing: are `IS_BILLING_ENABLED` and `BILLING_STRIPE_WEBHOOK_SECRET` set, and how does the handler order events? Live only with `STRIPE_API_KEY`.
- Date (UTC): not run
- Command (for the builder): post two subscription events out of order to `/webhooks/stripe` with the per-run secret; read the stored subscription row through `qa_ro`.
- Output: not run.
- Proves: (not run). Code: the route and its secret source (`billing-webhook.controller.ts:54-72`; `stripe-webhook.service.ts:18, 22, 28`); `IS_BILLING_ENABLED` defaults to `false` (`config-variables.ts:945`).
- Citation: `billing-webhook.controller.ts:54-72`; `billing-webhook-subscription.service.ts:160-200`.
- Status: UNPROBED.

### P-TW-8. Cache: does TW-CACHE-001 need two `server` replicas?
- Date (UTC): not run
- Command (for the builder): read the `twenty` compose service list at 0.3.0 (the installed 0.2.11 file has one `server`, `node_modules/qa-portfolio-harness/docker/twenty.compose.yml:14`); decide HR-4.
- Output: not run.
- Proves: (not run). The installed copy (0.2.11) has one server service; the 0.3.0 file is UNPROBED.
- Citation: `node_modules/qa-portfolio-harness/docker/twenty.compose.yml:7-50` (0.2.11 installed copy only).
- Status: UNPROBED.

### P-TW-9. Route trigger: which API creates a route trigger and a workflow that creates a record (TW-RT-001)?
- Date (UTC): not run
- Command (for the builder): read `route-trigger.controller.ts:25-53` and the metadata route for creating a logic-function route trigger; create one, POST to it, and read the workflow run.
- Output: not run.
- Proves: (not run). Code: the route controller is `@Controller(ApiPath.RouteTrigger)` with `@Post('*path')`.
- Citation: `packages/twenty-server/src/engine/metadata-modules/route-trigger/route-trigger.controller.ts:25-53`.
- Status: UNPROBED.

### P-TW-10. REST: the OAS URL and the pagination parameter names (TW-CON-001, TW-PAG-001/002).
- Date (UTC): not run
- Command (for the builder): `GET /rest/open-api/core` (parse as OAS 3.x); `GET /rest/people?limit=…` and the cursor parameter names from the OAS parameters.
- Output: not run.
- Proves: (not run).
- Citation: the master plan's TW OAS note (`docs/master-plan.html`, Twenty section) names `/rest/open-api/core`; no code citation yet.
- Status: UNPROBED.

### P-TW-11. Event log: the table and row shape of `webhook.response` (for TW-WH-005 and the B1 secondary check).
- Date (UTC): not run
- Command (for the builder): after a 6 s slow delivery, find the row through `qa_ro` (schema from `information_schema`, not guessed).
- Output: not run.
- Proves: (not run). Code: `WEBHOOK_RESPONSE_EVENT` (`call-webhook.job.ts:13`); an upstream integration test covers "one response row per webhook call, successful and failed alike" (`test/integration/graphql/suites/event-logs/webhook-response-write.integration-spec.ts:147`).
- Citation: as stated.
- Status: UNPROBED.

### P-TW-12. Test.fail semantics in Playwright 1.64.0 inside a serial describe (masking check).
- Date (UTC): not run
- Command (for the builder): a scratch spec under `/tmp/p2-lane-probes/` with a `test.fail()` placed after a failing `expect` that precedes the intended assertion; confirm the run reports the test as expected-fail even when the earlier expect is the failure.
- Output: not run.
- Proves: (not run). This decides OD-1 in the plan (two tests versus one).
- Citation: foundation index U17 (`docs/plans/2026-11-01-p2-foundation-index.md` section 6).
- Status: UNPROBED.

---

## Cleanup
No stack was started, so no `down` was needed. No file was written outside this record and the plan. No secret was read or
printed (the local `.env` was not opened).
