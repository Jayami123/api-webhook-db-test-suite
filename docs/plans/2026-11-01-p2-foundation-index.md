# P2 foundation: index of Tasks 2 to 6 (plan only, nothing built)

Date 2026-11-01. Plan branch `plan/2026-11-01-p2-foundation` (from `origin/main` = `fd554c901e82a7a936fb0074af42de6b26f56ab1`;
never merged, no PR). Task 1 is merged (PR #3 as `f166cda`; `main` = `fd554c9`). Unit tests on `main`: **102**.

This foundation **replaces Tasks 2 to 7 of the 2026-10-20 roadmap** (`docs/plans/2026-10-20-p2-phase1-roadmap.md`).
The roadmap's product contract work (its Tasks 3 to 6: Medusa, Documenso, Twenty and Cal contracts) moves into the four
product lanes that start after Task 6; its Task 7 (closeout, drift job, README) moves to after the lanes. The roadmap
and the Task 1 plan are left untouched. Where the senior review and the roadmap disagree the review wins: roadmap D5
("no dedicated role") is replaced by `qa_ro` / `qa_fixture` (Task 3), and the loopback-only receiver by an explicit
bind list (Task 2).

## 1. The table

| Task | Plan file | Build branch (stacked on) | Depends on | Case IDs touched | Probed / unprobed | Open decisions | CI change | Harness or environment prerequisite | Unit tests after |
|---|---|---|---|---|---|---|---|---|---|
| 2 receiver + signers | `2026-11-01-p2-task2-receiver-signers.md` | `feat/<date>-p2-task2-receiver-signers` (cut from `origin/main`; PR base `main`) | 1 | prepares P2-CAL-WH-001..003, P2-CAL-DLY-001/002, P2-CAL-SCH-002, P2-CAL-TASK-001/002, P2-DOC-WH-001..005, P2-DOC-STR-001..003, P2-MED-WH-001..007, P2-TW-WH-001..006, P2-TW-STR-001; label P2-X-WH-001 | 12 / 1 (U12) | OD-1 (labels), OD-2, OD-3 | none | none (adds the `stripe` 23.0.1 dev dependency) | **172** (+70) |
| 3 roles + sweep | `2026-11-01-p2-task3-db-roles-invariants.md` | `feat/<date>-p2-task3-db-roles-invariants` (Task 2 head) | 1 (Task 2 only by branch order) | label P2-X-DB-001; prepares P2-CAL-SCH-002, P2-CAL-TASK-001/002, P2-DOC-EXP-001/002, P2-DOC-REM-001/002 | 10 / 0 | OD-1..OD-4 | none (the existing `db-guard` runs the new file: db-guard tests 8 -> **22**) | none; passwords from `npm run qa:passwords` | **211** (+39) |
| 4 clients + tokens | `2026-11-01-p2-task4-api-clients-tokens.md` | `feat/<date>-p2-task4-api-clients-tokens` (Task 3 head) | 1, 3 | prepares all CON, WH, DLY, STR, KEY cases; P2-TW-KEY-001 is cut | 9 / 2 (U3, U5) | OD-1..OD-6 | none | none (HR-1 limits the Cal key to web use) | **245** (+34) |
| 5 prerequisites + readiness | `2026-11-01-p2-task5-env-prereqs-readiness.md` | `feat/<date>-p2-task5-env-prereqs-readiness` (Task 4 head) | 2, 3, 4 | exercises P2-X-DB-001 and P2-X-WH-001 on all four products | 16 / 5 (U1, U2, U6, U7, U8) | OD-1..OD-7 | none (21 Playwright tests are listed, not run in CI yet) | harness pin `v0.2.18`; env table of Task 5 section 2.1; HR-1 (Cal API v2) and HR-2 (Twenty) named | **261** (+16) |
| 6 CI foundation | `2026-11-01-p2-task6-ci-foundation.md` | `feat/<date>-p2-task6-ci-foundation` (Task 5 head) | 5 | prepares serial cases (cron, tasker, sweeps) | 6 / 1 (U9) | OD-1..OD-4 | `api.yml`: new `specs` and `foundation` jobs, 4 serial projects; required checks below | none | **273** (+12) |

`<date>` = the UTC day the builder starts that task (`date -u +%F`). Every build branch is cut from the previous task's
branch head and every PR targets that branch (GitHub retargets to `main` when the base merges and is deleted).

## 2. Build run order and independence

```text
main --- Task 2 --- Task 3 --- Task 4 --- Task 5 --- Task 6 --- (lanes: cal, doc, med, tw in parallel)
```

- One build session runs the tasks in this order with no owner input, using each plan's recommended defaults.
  **No open decision is BLOCKING.** Each task has its own STOP conditions (Appendix of every plan).
- Independence: Task 2 and Task 3 do not use each other's code (the stack is only for a linear history). If Task 2
  stops, Task 3 and Task 4 may be cut from `main` instead (unit counts then drop by 70). Task 4 needs Task 3 only.
  **Tasks 5 and 6 need everything before them.** If any task stops, its dependants do not start.
- Counts: db-guard tests 8 (main) -> 22 (Task 3 onwards). Playwright projects 4 -> 8 (Task 6). Listed Playwright
  tests 0 -> 21 (Task 5).
- Each plan was verified by building its code in a scratch copy of `main` outside the repo (`npm run check` exit 0 at
  every step: 172, 211, 245, 261, 273) and, for Tasks 3 to 5, against the real products (below).

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
  Twenty 5). The first Medusa run failed three times for real reasons that are now in the code (a guest-customer leak
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
| C8 | `payment_intent.succeeded` -> "captured" (master plan P2-MED-WH-001/007) | the session is **authorized** first and a payment row is created; capture needs payment data: `core-flows process-payment.js:96-117`, live | Task 5 2.4 |
| C9 | `P2-X-DB-001` / `P2-X-WH-001` as existing IDs (brief) | not in `docs/master-plan.html` (its framework sections are named `X-P2-CON`); used as labels | Task 2 OD-1 |
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
| B1 | Twenty drops a webhook event silently when it fires before the worker has re-read the outbound allow-list or the new webhook: the job catches the SSRF error and returns, nothing is logged at warn level, and nothing retries | `call-webhook.job.ts` catch block, `webhook-cache` 10 s memo, config refresh every 15 s; live: first attempt delivered nothing, worker log shows a 16 ms job | PRODUCT BUG (SUSPECTED) - data loss on a freshly created webhook; the foundation works around it (bounded re-trigger) and does not hide it |
| B2 | Cal acknowledges a webhook task as succeeded when the subscriber answers 5xx, so the subscriber never gets a retry | `sendPayload.ts:324-327`, `tasker/tasks/sendWebook.ts:21-27`, `tasker/repository.ts:136-146` | PRODUCT BUG (SUSPECTED) - at-most-once delivery on a failing subscriber (may be intended; the Cal lane decides how to assert it) |
| B3 | Documenso dev seed: 333 of 333 seeded `COMPLETED` envelopes have `completedAt` NULL | live query (Task 3 2.4); `packages/prisma/seed/documents.ts:65,676` | SEED DATA inconsistency, not a runtime defect; the sweep is run-scoped so it does not flag it; report to the fork owner |
| B4 | Documenso accepts a webhook URL at send time that it refuses at create time (bypass list vs literal check) | C2 | design inconsistency, test-environment workaround documented |

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

## 7. Open decisions (all have defaults; none is BLOCKING)

| Where | Decision | Default |
|---|---|---|
| T2 OD-1 | `P2-X-WH-001` / `P2-X-DB-001` are labels, not master-plan IDs | keep as labels; owner may add two master-plan rows |
| T2 OD-3, T5 OD-3/OD-4 | cases whose expectation the code contradicts (C4, C7, C8) | lanes record the code-defined baseline and the owner edits the case text |
| T3 OD-2 | P2-DOC-JOB-003 needs an `INSERT` | Documenso lane adds its own reviewed grant; not in the foundation |
| T4 OD-1 | worker-scoped credentials instead of setup/teardown projects | taken (Playwright runs them in different processes) |
| T5 OD-1 | Twenty clean path needs HR-2 | keep the admin-panel workaround |
| T5 OD-2 | Stripe-API-dependent rows (Documenso STR-002/003, Twenty STR) | unit-level only; owner decides later |
| T5 OD-5 | Cal `/v2` readiness is `test.fixme` until HR-1 | taken |
| T6 OD-1 | which check names to require | all six below |

## 8. Harness-release and environment prerequisites (separate harness PRs; never built here)

| ID | Change requested in `qa-portfolio-harness` (own repo, own PR and tag, then a pin bump here) | Needed for | Blocks the foundation? |
|---|---|---|---|
| **HR-1** | Start Cal API v2 (`apps/api/v2`, port 5555) with Redis in `up()`, health on `CAL_API_BASE_URL`, stop it in `down()` (process-group handling as for the web server) | every Cal `/v2` case (P2-CAL-CON-001..004, slots, bookings) and the Cal key's real use | no: Task 5 marks the check `test.fixme`; blocks Cal CON cases |
| **HR-2** | In `docker/twenty.compose.yml` add `extra_hosts: ["host.docker.internal:host-gateway"]` to `server` and `worker`, pass `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS` (and the billing variables) from the environment, add them to the runtime-override allowlist | Twenty hostname-based receiver URL, no admin-panel call and no 15 s warm-up, Twenty billing cases | no (workaround in Task 5); optional quality fix; needed for Twenty STR |
| HR-3 (optional) | Apply a default `--max-old-space-size` to Documenso's build and start and merge it with an existing `NODE_OPTIONS` instead of replacing it | removes the OOM trap (exit 134) | no (repo scripts and the hook set it) |

Environment changes are all in the repo: `scripts/qa-passwords.sh` (Task 3), `scripts/ensure-receiver-hostname.sh`,
`scripts/harness-seed.mjs`, the SessionStart hook and `.cursor/environment.json` `start` (Task 5). Nothing has to be pasted
into the Cursor or Claude Code environment settings.

## 9. Follow-ups for the owner

1. **Required checks for the Main ruleset** (after Task 6 merges and two green `main` runs): `check`, `unit`, `db-guard`,
   `specs`, `foundation`, `env-check`.
2. **Personal name in repo text** (listed, not edited; `AGENTS.md:16` is fixed by Task 3 because it edits `AGENTS.md`):
   `docs/master-plan.html` lines 57, 71, 112, 152, 302, 379; `docs/plans/2026-10-20-p2-phase1-roadmap.md` 115, 140, 272, 304;
   `docs/plans/2026-10-21-p2-phase1-task1-framework.md` 4, 7, 15, 41, 102, 103, 360, 381, 528, 2382, 2403, 2404, 2408, 2429,
   2640, 2646; `docs/reference/p1-plan-example-medusa.md` 9, 10, 13, 15, 142, 347, 357, 359, 566, 582, 600, 608, 612.
   The git URLs (`package.json:22`, `package-lock.json:9,1609`, `scripts/bootstrap.sh:31-34`) contain the repository
   owner's handle because it is part of the address; they cannot be reworded.
3. **Medusa `contract.spec.ts` from P1**: the brief asks to move it into P2. It lives in the P1 repository, which was
   not in this session's scope, so it was **not inspected**; the Medusa lane should take it as a starting point.
4. Report the 333 inconsistent seeded Documenso envelopes (B3) to the fork owner.
5. Decide whether the master plan gets rows for `P2-X-DB-001` and `P2-X-WH-001`, and edit the case text for C4, C7, C8,
   C5 and C6.
6. The plan branch history contains the personal name in two early commits (a scan command in the Task 2 plan, since
   rewritten without it). The branch never merges; no history was rewritten.
