# P2 foundation: index of Tasks 2 to 6 (plan only, nothing built)

Date 2026-11-01. Plan branch `plan/2026-11-01-p2-foundation` (from `origin/main` = `fd554c901e82a7a936fb0074af42de6b26f56ab1`;
never merged, no PR). Task 1 is merged (PR #3 as `f166cda`; `main` = `fd554c9`). Unit tests on `main`: **102**.
**Revision 2** applies the senior review (required harness release, review IDs, reset mode, canary, reaper, caching). Its code and counts were edited, **not rebuilt**: every revision-2 number is UNPROBED until the build session runs it (section 2).

This foundation **replaces Tasks 2 to 7 of the 2026-10-20 roadmap** (`docs/plans/2026-10-20-p2-phase1-roadmap.md`).
The roadmap's product contract work (its Tasks 3 to 6: Medusa, Documenso, Twenty and Cal contracts) moves into the four
product lanes that start after Task 6; its Task 7 (closeout, drift job, README) moves to after the lanes. The roadmap
and the Task 1 plan are left untouched. Where the senior review and the roadmap disagree the review wins: roadmap D5
("no dedicated role") is replaced by `qa_ro` / `qa_fixture` (Task 3), and the loopback-only receiver by an explicit
bind list (Task 2).

## 1. The table

| Task | Plan file | Build branch (stacked on) | Depends on | Case IDs touched | Probed / unprobed | Open decisions | CI change | Harness or environment prerequisite | Unit tests after |
|---|---|---|---|---|---|---|---|---|---|
| 2 receiver + signers | `2026-11-01-p2-task2-receiver-signers.md` | `feat/<date>-p2-task2-receiver-signers` (cut from `origin/main`; PR base `main`) | 1 | kept: P2-CAL-WH-001/002, P2-CAL-SCH-002, P2-CAL-SCH-003 (new), P2-CAL-DLY-002, P2-DOC-WH-001/003..007 (006/007 new), P2-DOC-STR-001..003, P2-TW-WH-001/003, P2-TW-WH-007..009 (new), P2-TW-STR-001, P2-MED-WH-001/002/003/006, P2-MED-WH-008 (new); rewritten: P2-CAL-WH-003, P2-CAL-TASK-001/002, P2-DOC-WH-002, P2-TW-WH-004, P2-TW-WH-005/006; review IDs: P2-X-WH-001 (CUT IDs: index section 9) | 12 / 1 (U12) | OD-2, OD-3 (OD-1 closed) | none | none (adds the `stripe` 23.0.1 dev dependency; the `reset` mode is built here) | **175** (+73) |
| 3 roles + sweep | `2026-11-01-p2-task3-db-roles-invariants.md` | `feat/<date>-p2-task3-db-roles-invariants` (Task 2 head) | 1 (Task 2 only by branch order) | review ID P2-X-DB-001; prepares P2-CAL-SCH-002 (`startAfter`), P2-CAL-SCH-003, P2-CAL-TASK-001/002, P2-DOC-EXP-001/002, P2-DOC-REM-001/002 (`nextReminderAt`) | 10 / 1 (U17) | OD-1..OD-4 | none (the existing `db-guard` runs the new file: db-guard tests 8 -> **22**) | none; passwords from `npm run qa:passwords`; sweep asserts `workers === 1` | **214** (+39) |
| 4 clients + tokens | `2026-11-01-p2-task4-api-clients-tokens.md` | `feat/<date>-p2-task4-api-clients-tokens` (Task 3 head) | 1, 3 | prepares all CON, WH, DLY, STR, KEY cases the review keeps; the review's Twenty key case is CUT (section 9) | 9 / 4 (U3, U5, U15, U16) | OD-1..OD-6 | none | none (Documenso and Cal keys expire after 1 h; the reaper selector, wired in Task 5; Cal `/v2` needs HR-1) | **250** (+36) |
| 5 prerequisites + readiness | `2026-11-01-p2-task5-env-prereqs-readiness.md` | `feat/<date>-p2-task5-env-prereqs-readiness` (Task 4 head) | 2, 3, 4, **HR-1..3** | exercises P2-X-DB-001 and P2-X-WH-001 on all four products; the Twenty B1 test (lane, ID owner-assigned) | 16 / 9 (U1, U2, U6, U7, U8, U13, U14, U18, U19) | OD-1..OD-7 (OD-7 is decided in Task 6 D4) | none (21 Playwright tests are listed; Cal lists 6) | **harness release `v0.3.0` (HR-1, HR-2, HR-3), required and tagged before this task**; env table of Task 5 section 12; `npm run qa:passwords` from the Cursor `start` and the Claude hook | **265** (+15) |
| 6 CI foundation | `2026-11-01-p2-task6-ci-foundation.md` | `feat/<date>-p2-task6-ci-foundation` (Task 5 head) | 5 | prepares serial cases (cron, tasker, sweeps) | 6 / 1 (U9) | OD-1..OD-4 (OD-4 is decided in D4: build cache) | `api.yml`: new `specs` and `foundation` jobs, 4 serial projects, `db-guard` health command `pg_isready -h 127.0.0.1` | none | **277** (+12) |

`<date>` = the UTC day the builder starts that task (`date -u +%F`). Every build branch is cut from the previous task's
branch head and every PR targets that branch (GitHub retargets to `main` when the base merges and is deleted).

## 2. Build run order and independence

```text
main --- Task 2 --- Task 3 --- Task 4 --- Task 5 --- Task 6 --- (lanes: cal, doc, med, tw in parallel)
                                                        ^
                  HR-1, HR-2, HR-3 (harness repo, built alongside Tasks 2 to 4, tagged v0.3.0 before Task 5)
```

- One build session runs the tasks in this order with no owner input, using each plan's recommended defaults.
  **No open decision is BLOCKING.** The harness release is a required prerequisite, not a decision: Task 5 does not start
  until `v0.3.0` exists and its acceptance checks pass (section 8). A missing tag is a STOP (each plan's section 14).
- Independence: Task 2 and Task 3 do not use each other's code (the stack is only for a linear history). If Task 2 stops,
  Task 3 and Task 4 may be cut from `main` instead: the counts then become **141** (Task 3: 102 + 39) and **177**
  (Task 4: 141 + 36). Task 4 needs Task 3 only. **Tasks 5 and 6 need everything before them.** If any task stops, its
  dependants do not start.
- Counts (chain): main 102 -> Task 2 175 (+73) -> Task 3 214 (+39) -> Task 4 250 (+36) -> Task 5 265 (+15) -> Task 6 277 (+12).
  db-guard tests 8 (main) -> 22 (Task 3 onwards). Playwright projects 4 -> 8 (Task 6). Listed Playwright tests 0 -> 21 (Task 5).
- Verification status: revision 1 was built in a scratch copy of `main` (`npm run check` exit 0 at 172, 211, 245, 261 and
  273) and, for Tasks 3 to 5, run against the real products (section 3a). **Revision 2 changed code and counts without a
  rebuild.** Every revision-2 count and code block is UNPROBED until the build session runs it, and the readiness runs
  of section 3a are revision 1 on `v0.2.18`.
- Build environment: **Claude Code cloud** (attribution is off in `.claude/settings.json`). A Cursor build first needs the
  owner to turn off Cursor's commit attribution (section 9, item 4): Appendix A rule 6 forbids the `Co-authored-by` trailer
  that Cursor adds, so the build stops before its first push otherwise. Each plan's section 9 has the pre-push trailer grep.

## 3. Probe record

Every probe result (P1 to P7, per product) is written once in `docs/probes/2026-11-01-p2-foundation-probes.md`: date (Asia/Colombo),
pinned SHAs and harness tag, command, trimmed output, the fact, a citation and a status (CONFIRMED, UNPROBED, CONTRADICTS REVIEW).
The plans cite it. **Task 2 copies it unchanged into `main`** (its step 0b). Later lanes add new dated files in `docs/probes/` and
never edit an old one. Written up from what was recorded during the session; nothing was re-run for it.

## 3a. What was probed (live, 2026-11-01, one stack at a time, every run ended with `down`)

Claude Code cloud VM: Node 22.23.3 / 24.22.0, Docker 29.9.2, 4 cores, 15 GB RAM. Harness `v0.2.18` (`de561c5`) built
from a scratch clone; products at the pinned refs of `scripts/bootstrap.sh`.

- **P1 env reach**, **P2 stripe-mock reach**, **P3 receiver reach**, **P4 live webhook shapes**, **P5 per-run tokens**,
  **P6 roles**, **P7 base counts**: results in Task 5 section 2 (P1, P2, P5), Task 2 section 2 (P3, P4), Task 3 section 2
  (P6) and Task 2 section 1 (P7).
- All four readiness specs passed on the real stacks, each twice in a row (Medusa 5, Documenso 5, Cal 5 + 1 blocked,
  Twenty 5) (revision 1, `v0.2.18`; not re-run for revision 2). The first Medusa run failed three times for real reasons that are now in the code (a guest-customer leak
  found by the sweep, worker credentials flagged as leaks, a publishable key without a sales channel).

## 4. Review facts that the pinned code contradicts (expected, observed, `file:line`)

| # | Statement (source) | Observed at the pinned ref | Where recorded |
|---|---|---|---|
| C1 | "Harness `v0.2.18` adds `event-bus-redis` with `MEDUSA_REDIS=1`" (review 13) | already in `v0.2.11`: `src/adapters/medusa-env.ts:237-243`; `v0.2.13` added `MEDUSA_LOCK` instead (`CHANGELOG.md`) | Task 5 2.1 |
| C2 | "Private URLs blocked unless listed in `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS`" (review 3) | true at send time (`assert-webhook-url.ts:35-60`); the create-time zod check refuses a literal private host with no bypass (`packages/trpc/server/webhook-router/schema.ts:6-14`), live 400 | Task 5 2.2 |
| C3 | "Containers reach the receiver via `host.docker.internal` (host-gateway)" (review 7, master plan section 4) | Twenty's compose has no `extra_hosts`; the name does not resolve in its containers (`docker/twenty.compose.yml`); the network gateway IP works | Task 2 2.4, Task 5 2.1 |
| C4 | Cal immediate triggers retry on a receiver failure (review 1: "confirm the retry behaviour") | a receiver 500 is not retried and the tasker task succeeds: `sendPayload.ts:324-327` returns `{ok:false}` without throwing, `tasker/tasks/sendWebook.ts:21-27`. Affects P2-CAL-WH-003 and P2-CAL-TASK-001 as written | Task 2 2.1 |
| C5 | Cal scheduled-trigger time column `startTime` (master plan P2-CAL-SCH-002) | `startAfter`: `packages/prisma/schema.prisma:1318` | Task 3 2.2 |
| C6 | Documenso reminder column `lastReminderAt` (master plan P2-DOC-REM-001) | the sweep filters on `nextReminderAt`: `send-signing-reminders-sweep.handler.ts:13`, `schema.prisma:645` | Task 3 2.2 |
| C7 | Twenty receiver 500 -> "5 requests" baseline (master plan P2-TW-WH-004) | 1 request in 45 s: `call-webhook.job.ts` catch block returns, no retry configured (`secure-http-client.service.ts:62-70` only with `retries`) | Task 5 2.3 |
| C8 | `payment_intent.succeeded` -> "captured" (master plan, P2-MED-WH-001; the other captured case is CUT and moves to P5, section 9) | the session is **authorized** first and a payment row is created; capture needs payment data: `core-flows process-payment.js:96-117`, live | Task 5 2.4 |
| C9 | `P2-X-DB-001` / `P2-X-WH-001` as existing IDs (brief) | not in `docs/master-plan.html` (its framework sections are named `X-P2-CON`). They are **new review IDs**, not labels | Task 2 section 4; OD-1 closed |
| C10 | "Observed values go in annotations only": the Twenty webhook seen after 1 trigger | handled: the readiness spec annotates `triggers-needed`; assertions use named SLOs from code-defined timeouts | Task 5 D4 |

Confirmed unchanged: Cal `X-Cal-Signature-256` HMAC-SHA256 hex over the body (`sendPayload.ts:296-299`), scheduled triggers
are fire-and-delete (`handleWebhookScheduledTriggers.ts:9-12, 79-83`), Daily `computeSignature` and the header names
`x-webhook-timestamp` / `x-webhook-signature` (`recorded-daily-video/route.ts:40-45, 70-73`), Documenso plain secret header,
10 000 ms, `redirect: manual`, billing flag at `packages/lib/constants/app.ts:54`, Twenty headers, millisecond timestamp,
unsigned nonce, 5 000 ms, no effective retry, Stripe 300 s tolerance from the SDK, Medusa hook always 200 with delayed
verification.

## 5. PRODUCT BUG (SUSPECTED) and data findings

| # | Finding | Evidence | Label |
|---|---|---|---|
| B1 | Twenty drops a webhook event silently when it fires before the worker has re-read the webhook map (10 s memo): the job catches the SSRF error and returns, nothing is logged at warn level, nothing retries | `call-webhook.job.ts` catch block; `workspace-cache.service.ts:56`; live (v0.2.18, revision 1): the first attempt delivered nothing, the worker log shows a 16 ms job (Task 5 2.3) | PRODUCT BUG (SUSPECTED) - data loss on a freshly created webhook. **The foundation does not retry it.** The readiness test asserts a canary precondition and fires one real event (Task 5 D7). The **Twenty-lane B1 test** (ID owner-assigned) pins the failing "first event delivered" assertion with `test.fail`, after a positive control (Task 5 section 4) |
| B2 | Cal acknowledges a webhook task as succeeded when the subscriber answers 5xx, so the subscriber never gets a retry | `sendPayload.ts:324-327`, `tasker/tasks/sendWebook.ts:21-27`, `tasker/repository.ts:136-146` | PRODUCT BUG (SUSPECTED) - at-most-once delivery on a failing subscriber (may be intended; the Cal lane decides how to assert it; the `reset` mode of Task 2 exercises the thrown-error path) |
| B3 | Documenso dev seed: 333 of 333 seeded `COMPLETED` envelopes have `completedAt` NULL | live query (Task 3 2.4); `packages/prisma/seed/documents.ts:65,676` | SEED DATA inconsistency, not a runtime defect; the sweep is run-scoped so it does not flag it; report to the fork owner |
| B4 | Documenso accepts a webhook URL at send time that it refuses at create time (bypass list vs literal check) | C2 | design inconsistency; the foundation reaches the receiver by a hostname that resolves to 127.0.0.1 (Task 5 2.2) |

TEST BUGs found and fixed in the plans' code during the live runs: an already-aborted `AbortSignal` never settled (receiver),
`SELECT ... LEFT JOIN` orphan rule matched NULL parents (synthetic rule), unscoped consistency rules hit seed data, client helper
spread `auth` into anonymous callers (caught by a unit test).

## 6. UNPROBED items (with the reason)

| ID | Item | Reason | Settled by |
|---|---|---|---|
| U1 | Documenso `DANGEROUS_BYPASS_RATE_LIMITS=true` effect | the sandbox command classifier refused the command ("Safety Bypass Flag"); not worked around | a build session where the flag is allowed; not needed by the foundation |
| U2 | Twenty billing webhook (`/webhooks/stripe`) and its env | the harness passes no billing variables into the containers | HR-2, then a Twenty lane probe |
| U3 | Cal API key used against `/v2`; API v2 itself | the harness starts no API v2 (port 5555 refused) | HR-1 |
| U4 | (closed) Twenty per-workspace `person` rule | ran live inside the Task 5 readiness run: no `42703` | done |
| U5 | `x-p2-run-id` on POST and login routes | only GET health routes were checked with the header (all four 200) | the first lane request per product; a rejection removes the header for that route |
| U6 | Cursor cloud RAM and passwordless `sudo` at `start` | no Cursor VM available | the first Cursor build session |
| U7 | HTML and JUnit reporters contain no secret | planning ran the `list` reporter only; unit tests cover the scrubber and `trace: "off"` | the first CI run of Task 5 or a lane (secret scan of `playwright-report/`, `results/`) |
| U8 | Twenty `host.docker.internal` after HR-2 | needs the harness release | HR-2 |
| U9 | CI wall-clock of each job | no CI run during planning | the first CI run of Task 6 |
| U10 | Medusa EB-001/002 (a provider that throws) | needs a custom provider in the fork | Medusa lane |
| U11 | A portable multi-host bind unit test | macOS and Windows lack `127.0.0.2` | accepted (Task 2 D12) |
| U12 | Cal's retry on a **thrown** error (the `reset` mode, Task 2 D3) | the code path is not read in this plan; `sendPayload.ts:324-327` and `sendWebook.ts:21-27` show the 5xx path only | the lane, with the `reset` mode |
| U13 | The Twenty webhook payload's record-id field (`recordIdOf`, Task 5 section 8 step 5) | Task 2 section 2 does not record the field | the first Twenty run; absent field = STOP |
| U14 | `api.stripe.com` reachable from CI, expected `401` for an unauthenticated request | the sandbox proxy answers `CONNECT tunnel failed, response 403` (re-checked 2026-11-01 10:16Z, Task 5 2.5): an ENV finding of this sandbox | the first CI run (Task 5 OD-2) |
| U15 | Credential expiry inputs: Documenso `expirationDate` format, Cal `expiresAt` name | the probe recorded `expirationDate:null` and `neverExpires:true` only | the first live mint of each (Task 4 6.2) |
| U16 | Product list calls for the reaper (Documenso tokens, Cal keys, Medusa `GET /admin/api-keys`, Twenty `apiKeys`) | not probed | one request per product at Task 5 step 5b (Task 4 6.2b) |
| U17 | Playwright `test.fail` inside `test.describe.serial`; `testInfo.config.workers` on 1.64.0 | not probed | the lane (B1 test); Task 3 build |
| U18 | The harness release HR-1, HR-2, HR-3 and its acceptance checks (section 8) | not built; they are harness-repo work | the harness release, before Task 5 |
| U19 | Revision 2 code and counts (every number in the plans) | edited, not rebuilt | the build session, task by task |
| U20 | The Twenty worker reads `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS` from its environment at start (HR-2) | the design relies on it; the variable does not reach the containers today (Task 5 2.1) | the HR-2 acceptance check |

## 7. Open decisions (all have defaults; none is BLOCKING)

| Where | Decision | Default |
|---|---|---|
| T2 OD-1 | `P2-X-WH-001` / `P2-X-DB-001` are IDs or labels | **closed: review IDs.** The owner adds their master-plan rows (section 9, item 5) |
| T2 OD-3, T5 OD-3/OD-4 | cases whose expectation the code contradicts (C4, C7, C8) | the `reset` mode drives TASK-001/002; WH-003 is 1 attempt, no retry; the lanes record the code-defined baseline; the owner edits the case text |
| T3 OD-2 | P2-DOC-JOB-003 needs an `INSERT` | Documenso lane adds its own reviewed grant; not in the foundation |
| T4 OD-1 | worker-scoped credentials instead of setup/teardown projects | taken (Playwright runs them in different processes) |
| T4 OD-5 | keys expire after 1 h even if teardown never runs | taken: `CREDENTIAL_TTL_MS` = 1 h, above the 30 min job timeout; the reaper removes dead runs |
| T5 OD-1 | Twenty clean path needs HR-2 | **HR-2 required**; no admin-panel write (the admin-panel route is removed) |
| T5 OD-2 | Stripe-dependent rows (Documenso STR-002/003, Twenty STR, Medusa flow) | option (4): a Stripe test-mode key as CI and cloud secrets against `api.stripe.com`; the first CI run probes it (U14); fallback (c) unit-level only; stripe-mock and TLS interception rejected |
| T5 OD-5 | Cal `/v2` readiness | **HR-1 required**; a real test, no `test.fixme` |
| T5 OD-6 | Medusa region provider list | the flow always changes the US region and restores the exact list it read, asserted; an option-(4) region switch (the seed region linked to Stripe, no change) is not implemented here (UNPROBED follow-up) |
| T6 OD-1 | which check names to require | all six below |
| T6 D4 / T5 OD-7 | build caching | keyed on product, pinned SHA, harness tag, Node version and lockfile hash; the 10 GB cache limit noted; prebuilt harness images are the alternative |

## 8. Harness release and environment prerequisites

### 8a. Harness release (required, not optional)

Built in `qa-portfolio-harness` (its own repo, PR and tag) alongside Tasks 2 to 4, tagged **`v0.3.0`** before Task 5, which pins
it. Each item has an acceptance check; a failing check is a STOP. (The request cites "BACKLOG line 10" for this step; no BACKLOG
file exists in this repository, UNPROBED whether one exists elsewhere.)

| ID | Change in `qa-portfolio-harness` | Acceptance check (before the tag is used) | Needed for |
|---|---|---|---|
| **HR-1** | Start Cal API v2 (`apps/api/v2`, port 5555) with Redis in `up()`, health on `CAL_API_BASE_URL`, stop it in `down()` (process-group handling as for the web server) | `up cal`; `curl -sf "$CAL_API_BASE_URL/v2/health"` returns 200 (the path is UNPROBED, U18); after `down`, nothing listens on 5555 | every Cal `/v2` case (P2-CAL-CON-001..003, slots, bookings) and the Task 5 `/v2` test, which has no `test.fixme` |
| **HR-2** | In `docker/twenty.compose.yml` add `extra_hosts: ["host.docker.internal:host-gateway"]` to `server` and `worker`; pass `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS` and the billing variables from the environment; add them to the runtime-override allow-list | `getent hosts host.docker.internal` inside the server container resolves; `printenv OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS` shows the value given to `up`; the Task 5 Twenty spec passes with **no** admin-panel write | the Twenty webhook readiness (Task 5 D7), Twenty billing (STR) |
| **HR-3** | Apply a default `--max-old-space-size` to Documenso's build and start, and to Cal's, and **merge** it into an existing `NODE_OPTIONS` (today `calHeapEnv` skips its default when `NODE_OPTIONS` is set, and Documenso has none) | with `NODE_OPTIONS=--use-openssl-ca` preset and no heap variable exported by this repo, `node -e 'console.log(require("v8").getHeapStatistics().heap_size_limit >= 7e9)'` prints `true` under the harness environment, and the Documenso `up` build passes (exit 134 before, Task 5 2.1) | the root-cause fix of the heap trap; no global heap variable anywhere in this repo |

### 8b. Environment: automatic from the repo vs pasted by hand

Each task's section 12 has its own list; this is the summary.

| Environment | Automatic from the repo | Pasted by hand |
|---|---|---|
| Cursor cloud | `.cursor/environment.json` `start` runs `npm run qa:passwords` and `scripts/ensure-receiver-hostname.sh` (idempotent; a failure prints a WARNING); `AGENTS.md` lines (Tasks 3 and 5); `install` unchanged | Stripe test-mode secrets `STRIPE_API_KEY` and `STRIPE_WEBHOOK_SECRET` (option 4); the network entry `api.stripe.com` if the environment policy blocks it (UNPROBED); turn off Cursor commit attribution before a Cursor build (section 9, item 4) |
| Claude Code cloud | `.claude/hooks/session-start.sh` runs `npm run qa:passwords` and the hosts script, printing each script's output on failure as a WARNING (Task 5); no heap variable | Stripe test-mode secrets (option 4); the network entry `api.stripe.com` if blocked (UNPROBED) |
| GitHub Actions (CI) | the workflow (Task 6); CI generates DB-role passwords per job (Task 3) | repository secrets `STRIPE_API_KEY` and `STRIPE_WEBHOOK_SECRET` (option 4); the six required check names (section 9, item 1) |

The hosts line needs root or passwordless sudo: Claude Code cloud runs as root; Cursor cloud and the GitHub runners use sudo
(Task 5 section 6.6). Nothing else is required in any environment's settings.

## 9. Follow-ups for the owner

1. **Required checks for the Main ruleset (staging).** Now: `check` and `unit` (both already required). After Task 6 merges and two green `main` runs: `db-guard`, `specs`, `foundation`, `env-check`. `foundation` `needs` `db-guard` (Task 6 section 9), so `db-guard` is required with `foundation`. Lane checks join after their tasks. The request cites BACKLOG line 57; no BACKLOG file is in this repository (UNPROBED whether one exists elsewhere).
2. **Personal name in repo text** (listed, not edited; `AGENTS.md:16` is fixed by Task 3 because it edits `AGENTS.md`):
   `docs/master-plan.html` lines 57, 71, 112, 152, 302, 379; `docs/plans/2026-10-20-p2-phase1-roadmap.md` 115, 140, 272, 304;
   `docs/plans/2026-10-21-p2-phase1-task1-framework.md` 4, 7, 15, 41, 102, 103, 360, 381, 528, 2382, 2403, 2404, 2408, 2429,
   2640, 2646; `docs/reference/p1-plan-example-medusa.md` 9, 10, 13, 15, 142, 347, 357, 359, 566, 582, 600, 608, 612.
   The git URLs (`package.json:22`, `package-lock.json:9,1609`, `scripts/bootstrap.sh:31-34`) contain the repository
   owner's handle because it is part of the address; they cannot be reworded.
3. **Medusa `contract.spec.ts` from P1**: the brief asks to move it into P2. It lives in the P1 repository, which was
   not in this session's scope, so it was **not inspected**; the Medusa lane should take it as a starting point.
4. **Cursor commit attribution (pre-step for a Cursor build).** Cursor adds a `Co-authored-by` trailer; Appendix A rule 6 forbids it, and each plan's section 9 trailer grep stops the build before push. The owner turns off Cursor's commit attribution first. Claude Code cloud needs nothing (attribution is off in `.claude/settings.json`).
5. **Rewrite list (master-plan text -> code-defined text).** The owner edits `docs/master-plan.html`, adds the review IDs
   `P2-X-DB-001` and `P2-X-WH-001` as rows, and rewrites these cases to the code-defined text. Until then the lanes record the
   code-defined baseline:
   - P2-CAL-WH-003: 1 attempt, no retry (C4).
   - P2-CAL-TASK-001/002: driven by a connection reset (the `reset` mode, Task 2 D3).
   - P2-CAL-SCH-002/003: `startAfter` (C5).
   - P2-DOC-REM-001/002: `nextReminderAt` (C6).
   - P2-DOC-WH-002: 4 deliveries, no back-off.
   - P2-MED-WH-001/002/003: authorized; captured only with payment data (C8).
   - P2-TW-WH-004: 1 request (C7).
   - P2-TW-WH-005/006: rewrite (5 000 ms timeout boundary, stable event id).

   **CUT (17), in no lane. The CUT Medusa captured cases (MED-WH-004/005/007) move to P5.** These are the only places the
   CUT IDs are written in the plans:
   P2-CAL-CON-004, P2-CAL-DLY-001, P2-CAL-CACHE-001; P2-DOC-CONV-001, P2-DOC-I18N-003, P2-DOC-CON-002;
   P2-MED-LOC-001, P2-MED-WH-004, P2-MED-WH-005, P2-MED-WH-007, P2-MED-CSV-002, P2-MED-LOC18N-001;
   P2-TW-WH-002, P2-TW-JOB-001, P2-TW-DEL-001, P2-TW-AUD-001, P2-TW-KEY-001.
   The `P2-DOC-CON-002` leak rule is the afterEach invariant `P2-X-DB-001` (Task 3 section 6.3).

   **NEW (24).** Scope text is not in this repository. A NEW ID gets scope text only where the 2026-10-29 review quotes it
   (CAL-IDEM-001 is quoted below); the others read "scope: see 2026-10-29 review".
   - P2-CAL-IDEM-001: "PENDING booking client retry creates no duplicate" (oracle: at most 1 PENDING Booking per eventTypeId,
     startTime and attendee email). It is a booking case, not a receiver case; no receiver mode maps to it.
   - P2-CAL-TASK-003, P2-CAL-SCH-003, P2-CAL-DLY-003, P2-CAL-CON-005: scope: see 2026-10-29 review.
   - P2-DOC-JOB-004, P2-DOC-JOB-005, P2-DOC-WH-006, P2-DOC-WH-007, P2-DOC-EXP-003: scope: see 2026-10-29 review.
   - P2-MED-WH-008, P2-MED-MON-001, P2-MED-INV-001, P2-MED-ORD-001: scope: see 2026-10-29 review.
   - P2-TW-WH-007, P2-TW-WH-008, P2-TW-PAG-002, P2-TW-STR-002, P2-TW-WH-009: scope: see 2026-10-29 review.
   - P2-X-WH-001, P2-X-DB-001 (framework checks: the signed round trip and the afterEach sweep, Tasks 3 and 5),
     P2-X-ERR-001, P2-X-DRIFT-001, P2-X-MIG-001: scope: see 2026-10-29 review for the last three.
   The owner assigns the ID of the Twenty B1 test (Task 5 section 4).
6. The plan branch history contains the personal name in two early commits (a scan command in the Task 2 plan, since
   rewritten without it). The branch never merges; no history was rewritten.
7. **Twenty-lane B1 test:** the owner assigns its ID (Task 5 section 4) before the lane builds it.
8. Report the 333 inconsistent seeded Documenso envelopes (B3) to the fork owner.
