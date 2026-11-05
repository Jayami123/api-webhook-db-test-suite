# P2 discovery charter and risk register (Task 0)

Status: plan only. No build, no product, no Docker stack was started to write this file.

| Field | Value |
|---|---|
| Date | 2026-11-05 |
| Base (verified) | `d90c4ac` (Documenso lane merge, PR #14). `git merge-base --is-ancestor d90c4ac origin/main` succeeded; `origin/main` is `d90c4ac`. |
| Plan branch | `plan/2026-11-05-p2-discovery-charter` (from `origin/main`) |
| Deliverable | this file only: `docs/plans/2026-11-05-p2-discovery-charter.md` |
| Next | Tasks 1 to 4 (section 4). Tasks 5 and 6 (new case IDs) come later, in their own plan. |

## 0. Read this first (junior engineer)

You are not writing tests in this charter. Task 0 is the register: every open item from the four lane plans and the pasted backlog, with its status and what evidence closes it. Your work starts at Task 1 (section 4).

Rules that override everything else in this file:

1. Never invent a case ID. Use only IDs already in the plans or probe records. If a backlog item has no ID, use a label such as `backlog-cal-volume-reset`.
2. Never edit product forks, the harness package (`node_modules/qa-portfolio-harness`), any `.env` file, or `node_modules`. The repo `.env` exists on this checkout and is git-ignored (`.gitignore:2`); do not read it or commit it.
3. The harness owns starting and stopping products. Never start or stop a product by hand.
4. Stop when a STOP condition in section 4.5 applies. Do not work around it.
5. A plan's status is not automatically current. Section 3 lists where the plans disagree with `main` or with the installed harness. When they disagree, the file on `main` decides whether a case exists, and the owner decides what the plan's status means.

### Status legend (every row uses one of these three)

- **DEFERRED**: held for a named gate: an owner decision, a harness release, or a missing approval. The gate is named in the row.
- **BLOCKED**: a concrete missing prerequisite (environment, product configuration, a harness passthrough, or an external account capability) stops the case. The row names it.
- **UNBUILT**: no verified, explained passing state exists on `main` yet. This covers planned probes not yet run (UNPROBED), gated cases not built, built cases whose clean-run result or root cause is not recorded, and product findings whose upstream issue is not filed.

### Citation grade legend

- **CONFIRMED**: the cited plan ID, probe ID, or `file:line` was opened on this checkout (`d90c4ac`). Product-fork lines quoted inside a probe record are CONFIRMED as quoted; the fork itself was not re-read.
- **UNVERIFIED**: the item comes only from the pasted backlog, or the cited path is not on this checkout. The row says which file would confirm it.

## 1. Task 0 verification log

Read-only checks run for this charter. Nothing was built, installed, or started.

| Check | Command (read-only) | Result |
|---|---|---|
| Base ancestry | `git fetch origin && git merge-base --is-ancestor d90c4ac origin/main` | ancestor; `origin/main` = `d90c4ac` |
| Plan branch | `git checkout -b plan/2026-11-05-p2-discovery-charter origin/main` | created at `d90c4ac`; tree clean |
| Backlog SHA `fc353dd` (PR #14 per backlog) | `git cat-file -t fc353dd`; `git log --all --oneline \| grep -i fc353` | not found in any ref. Probe B-44 is at `f4105e4` (see R11). |
| Backlog SHA `1cdb059` (PR #13 per backlog) | `git log -1 --format='%h %s' 1cdb059` | on `origin/main`: `docs(cal): state that the local L19 lane run reused a database volume` |
| Harness version | `node -p "require('./node_modules/qa-portfolio-harness/package.json').version"` | `0.3.1` (`package.json:26` pins `v0.3.1`) |
| Harness passthrough list | read `node_modules/qa-portfolio-harness/src/adapters/twenty-passthrough.ts` | six names; `LOGIC_FUNCTION_TYPE` absent |
| Harness volume flags | grep `*_DOWN_VOLUMES` in harness `src` | only `TWENTY_DOWN_VOLUMES` (`twenty.adapter.ts:182`) and `MEDUSA_DOWN_VOLUMES` (`medusa.adapter.ts:1282`); none for cal |
| Spec files on `main` | `ls tests/serial/doc tests/webhooks/doc tests/integration/tw tests/webhooks/tw tests/webhooks/med tests/serial/cal` | conversion, payload, cache, tenant, billing, race-completion specs exist (section 3) |
| Missing referenced paths | `test -e` on three paths (section 3, R15) | all three absent |
| Product path | `ls -ld /home/user/products` | exists (root-owned, 6 entries) |
| Playwright timeouts | `grep timeout playwright.config.ts` | test `60_000` ms (line 39); expect `10_000` ms (line 40) |
| Workflows | `ls .github/workflows` | `api.yml`, `env-check.yml`, `p2-cal.yml`, `p2-doc.yml`, `p2-med.yml`, `p2-tw.yml`, `tw-study.yml` (no `ci.yml`) |
| Docker | `command -v docker` | CLI present. No `docker` command was run against a daemon. |

## 2. Risk register

Columns follow the brief. "Belongs to" uses P2 / P5 / P6 / harness / foundation. P6 is not used in this register.

### 2.1 Cal

| ID or label | Source | Product | Probe question | Belongs to | Status | Evidence that would close it | Citation grade |
|---|---|---|---|---|---|---|---|
| P2-CAL-REC-002 | cal plan `:110`, `:171`; `tests/integration/cal/cal-rec.spec.ts:27`; cal live probes `:274-279`; backlog Nov 4 | cal | On a fresh Postgres volume, does cancelling one occurrence cancel one row and send one BOOKING_CANCELLED, and does `taskRowsFor` find the receiver's Task row? | P2 | UNBUILT | Green on a fresh volume in the cal serial/API run, or a recorded root cause (file:line plus label: PRODUCT BUG, TEST BUG, ENV, NOT A BUG) in a new cal probe record | CONFIRMED |
| P2-CAL-WH-003 | cal plan `:114`, `:155-156`, `:667`; `tests/webhooks/cal/cal-wh.spec.ts:327,352`; retry marker `:379` (`test.fail`, finding B2); cal live probes `:274-279`; backlog Nov 4 | cal | On a fresh volume, does a receiver 500 give one attempt and Task `succeeded` (positive control), and does the B2 `test.fail` still fail as expected? | P2 (finding B2 goes to P5 as a decision) | UNBUILT | Control green and the B2 marker reproducing on a fresh volume; the `Received length 0` root cause recorded | CONFIRMED |
| backlog-cal-volume-reset | backlog Nov 4; cal live probes `:275-276` (`down cal` keeps `qa-harness-cal_db_data`); harness `*_DOWN_VOLUMES` grep (section 1) | cal, harness | Can the cal stack's DB volume be removed through a harness-supported path before a fresh-volume run? | harness (default: owner decision D3) | BLOCKED | A harness release with a cal volume flag (v0.3.2 candidate), or owner approval of the named-volume removal in D3 | CONFIRMED |
| P2-CAL-DST-001, P2-CAL-DST-002, P2-CAL-REC-001 (OD-DST) | cal plan `:102-103`, `:109`, `:225`, `:958` | cal | Does the product expose an API path to set the organiser timezone, so DST slots and recurrence can be asserted? | P2 | UNBUILT | L3 step 0 finds the path (then build +3 cases), or the rows stay recorded as UNBUILT with the reason | CONFIRMED |
| P2-CAL-SRVTZ-001, P2-CAL-SRVTZ-002 (OD-SRVTZ) | cal plan `:104-105`, `:962`, `:1081` (P14 still UNPROBED) | cal | Does a second cal stack with `TZ=Asia/Colombo` change any slot or booking result? | P2 (second CI job `cal-api-tz`) | DEFERRED | The second job green after L5 (+2 tests when approved) | CONFIRMED |
| P2-CAL-AUD-001 (OD-AUD) | cal plan `:125`, `:961` (`qa_fixture` is timestamp-only) | cal | Can an organisation with `booking-audit` (TeamFeatures) be created through a supported product path? | P2 (allow-list decision is foundation) | DEFERRED | An owner-approved product path, or a foundation decision on the fixture allow-list; re-check the seed (0 rows) | CONFIRMED |
| P2-CAL-RR-001 (OD-RR) | cal plan `:111`, `:225`, `:959`, `:84` (D15) | cal | Is a seeded round-robin team available, so 200 bookings spread over four keys stay inside the 120/min budget? | P2 | DEFERRED | L3 step 0 finds the seeded team; otherwise it stays deferred | CONFIRMED |
| label-cal-cold-bootstrap-timing | cal plan `:998` (UNPROBED, estimate 10 to 15 min); cal plan `:55` (foundation index: about 12 min) | cal | How long does a cold cal `up` take on this VM? | P2 (job deadline) | UNBUILT | A timed cold `up` recorded; the cal job deadline set from the measurement, not the estimate | CONFIRMED |

### 2.2 Documenso (doc)

| ID or label | Source | Product | Probe question | Belongs to | Status | Evidence that would close it | Citation grade |
|---|---|---|---|---|---|---|---|
| P-DOC-4c (OD-4) | doc plan `:52`, `:1011`; doc probes `:109-118` (window edges not measured); RR-TICK `:408-426` (15-minute cadence) | doc | Do the seal-sweep window edges act correctly on an envelope whose last signature sits on the edge? | P2 (needs owner approval of OD-4) | DEFERRED | OD-4 approved (enum allow-list kind), then the window test green in `doc-serial`. Until then only the cadence is measured. | CONFIRMED |
| P2-DOC-JOB-005 | doc plan `:166`, `:1011`; doc probes `:118` (builder command not run) | doc | Same window edges, through a PENDING envelope with all recipients signed. | P2 | DEFERRED | OD-4 approval and a fixture path that creates that state | CONFIRMED |
| P2-DOC-JOB-002 | doc plan `:163`, `:1011` | doc | Does a restart with a broken signing-cert path make the seal job fail and retry without changing rows? | harness (restart fault) and P2 | DEFERRED | A harness-supported restart with a broken cert path, plus OD-4 | CONFIRMED |
| P2-DOC-JOB-003 | doc plan `:164`, `:1011`; `src/db/fixture-allowlist.ts:8-18` (timestamp kinds only) | doc | Does writing `BackgroundJob.status` to a terminal value stop a replay? | foundation (allow-list), then P2 | DEFERRED | OD-4 with an enum allow-list kind approved by the owner | CONFIRMED |
| P2-DOC-JOB-004 (race part; OD-7) | doc plan `:165`, `:1014`; `tests/serial/doc/jobs.spec.ts:48` (sequential replay built); probe B-23 `:506` | doc | Do three simultaneous signed dispatches on one PENDING row produce one completion and no duplicate? | P2 (needs OD-4) | DEFERRED | A PENDING row with signed recipients (OD-4), then a deterministic concurrent trigger | CONFIRMED |
| P2-DOC-CONV-002 | doc plan `:128`, `:212`, OD-9 `:1016`, HR-5 `:975`; probe B-39 `:526`; `tests/serial/doc/conversion.spec.ts:64-88` (built; `test.fail(P5_CONV_001)`) | doc | With Gotenberg stopped on harness 0.3.1, does a DOCX create answer 503 (the spec's oracle) rather than 400? | P2 (the 400 goes to P5) | DEFERRED | A live run on harness 0.3.1 with the Gotenberg overlay. Reconcile R2 first. | CONFIRMED |
| P2-DOC-CONV-003 | doc plan `:129`; probe B-41 `:532`; `tests/serial/doc/conversion.spec.ts:92` | doc | After Gotenberg restarts, does a DOCX create succeed? | P2 | DEFERRED | A live run on harness 0.3.1. Reconcile R2 first. | CONFIRMED |
| P5-DOC-CONV-001 | `tests/serial/doc/conversion.spec.ts:16`, `:88` (expected 503, observed 400); probe B-39 `:526` | doc | Should a dependency outage answer 503 instead of 400? | P5 | UNBUILT | An upstream decision (not filed) and a re-run that still shows 400 | CONFIRMED |
| P2-DOC-WH-005 | doc plan `:137`, `:196`, OD-11 `:1018`; `tests/webhooks/doc/payload.spec.ts:22` (built) | doc | Does every delivered payload match the schema and carry no recipient token? | P2 | DEFERRED | The owner supplies the row text (OD-11, not in master plan) and a clean run of the spec. Reconcile R3. | CONFIRMED |
| P5-DOC-TOK-002 | probe B-38 `:521`; `tests/webhooks/doc/payload.spec.ts:20`, `:82-87` (`test.fail`); `docs/master-plan.html` (ID listed) | doc | Do webhook bodies for a multi-recipient envelope expose every recipient's token to the endpoint? | P5 | UNBUILT | An upstream issue decision (draft in B-38, not filed). The spec stays `test.fail` until the product fixes it. | CONFIRMED |
| P5-DOC-DEL-001 | probe B-44 `:535` (trace at `f4105e4`); backlog Nov 4 cites PR #14 `fc353dd` (SHA not in this repo, R11); no test on `main` | doc | Does a delete that races the last signature answer 500 and leave the envelope live? | P5 | UNBUILT | A live repro on the doc stack (PENDING delete while the last signature lands), then an upstream decision (draft not filed) | CONFIRMED |
| P2-DOC-MAIL-002 (OD-12) | doc plan `:159`, `:1019` (master plan lists MAIL-001 only) | doc | What does MAIL-002 check? | P2 (owner supplies text) | DEFERRED | The owner supplies the row text | CONFIRMED |
| label-doc-organisation-soft-delete | `docs/lane-ownership.md` (Documenso item 1); doc plan (UNPROBED) | doc | Does `Organisation` have a `deletedAt` column? | P2 | UNBUILT | A read-only `information_schema` query on the running doc database (`qa_ro`), recorded before any leak rule is written | CONFIRMED |
| P2-DOC-STR-001, P2-DOC-SM-001 (OD-5, OD-6) | doc plan `:87`, `:98`, `:1012-1013`; `sign-field-with-token.ts:100`, `send-document.ts:125` (as cited) | doc | Should a bad Stripe signature (500 today) and a precondition refusal (500 in two routes) answer 400? | P5 (owner may pin 400) | UNBUILT | Owner decision. The current specs assert non-2xx only. | CONFIRMED |
| UP-001 (OD-8) | doc plan `:1015`; P-DOC-12 | doc | Does a zero-byte upload answer 4xx? (`test.fail` marker today) | P5 (owner may change the marker to non-2xx) | UNBUILT | Owner decision; the marker is removed when the product fix lands | CONFIRMED |

### 2.3 Medusa (med)

| ID or label | Source | Product | Probe question | Belongs to | Status | Evidence that would close it | Citation grade |
|---|---|---|---|---|---|---|---|
| P2-MED-WH-008 (race part; P-MED-4) | med plan `:56`, `:187` (`race-completion.spec.ts`, 20 runs), `:205`; backlog Nov 3 (completion-first only) | med | Can a deterministic trigger make the webhook and the cart completion overlap, with no product config edit? | P2 | UNBUILT | A probe record with the trigger (candidate: issue the completion inside the product's own webhook emit delay, MED_RACE_WEBHOOK_DELAY_MS, section 4.2) and one order and one payment in each overlapped run | CONFIRMED |
| backlog-med-webhook-200-before-verify | backlog Nov 3; med plan `:62` (P-MED-10), `:65` (P-MED-12b arithmetic), `:76-77` (P-MED-2/2b live), `:126` (RD-21), `:233` (`webhook_delay` 5000 ms); route path `route.js:21-22` not on this checkout (`docs/lane-ownership.md` Medusa item 1) | med | Does the payment route answer 200 before it verifies the signature, and does a valid event stop being accepted after the processing window? | P5 | UNBUILT | Read the route at the pinned fork (Task 3 step 1), record path and lines, then an upstream decision. No probe on this checkout shows an event dropped permanently. | UNVERIFIED |
| P2-MED-EB-002 (P-MED-10) | med plan `:62`, `:151` (EB-001 merged, OD-3); `tests/integration/med/poison-event.spec.ts:46` (built) | med | Does a bad signature make the subscriber throw, retry to `attempts`, then park the job? | P2 | UNBUILT | A live run of the spec, with the parked-job row read through `qa_ro`; the `medPoisonParked` budget set from that run | CONFIRMED |
| P2-MED-WH-006 (OD-17; 299 s receipt age) | med plan `:76-77` (live: receipt 299 s pending), `:126` (RD-21), OD-17 `:1328` | med | Should a receipt aged 299 s be accepted, given the processing window is 295 s? | P5 (decision) | UNBUILT | Owner decision. OD-17 says no `test.fail` until decided. | CONFIRMED |
| P-MED-3 | med plan `:55` (UNPROBED; earlier record on a plan branch, not on `main`) | med | Does a repeated delivery of one event id leave one authorized session and one payment? | P2 | UNBUILT | A live probe with a repeat delivery, recorded on the probe branch | CONFIRMED |
| P-MED-6 (FC-MED-A) | med plan `:58`, `:169`, `:707`; OD-16 `:1327` (bearer cart id) | med | Does a cross-customer store call leave the other customer's rows unchanged? | P5 (verdict), P2 (end state) | UNBUILT | A live run of `framework-cross-customer.spec.ts` with end-state rows, and the P5 verdict recorded | CONFIRMED |
| P-MED-8 | med plan `:60`, `:407`, `:430-439`, `:813-865` (all table and column names UNPROBED) | med | What are the real payment, order, cart and inventory table and column names through `qa_ro`? | P2 | UNBUILT | A read-only schema query recorded in a probe; the query constants replaced by the real names | CONFIRMED |
| label-med-order-total-conservation (lane rule) | `docs/lane-ownership.md` Medusa item 2; med plan section 6.1 | med | Does the SQL for `med-order-total-conservation` match the real order-total columns? | P2 (`src/invariants/lanes/medusa.ts`) | UNBUILT | The rule added only after P-MED-8 and an invariant run green | CONFIRMED |
| P-MED-13 (CSV-001) | med plan `:66`, `:88`, `:786` (bad-row refusal CONFIRMED; 100-row good file UNPROBED) | med | On a 100-row CSV with row 50 bad, does the import refuse all rows or some? | P2 | UNBUILT | Probe with the 100-row file, recorded beside the bad-row result | CONFIRMED |
| P-MED-15 (OD-2, RD-17) | med plan `:68`, `:90`, `:738` (path `contracts/medusa/store.openapi.yaml`); `contracts/med/` on `main` (contents `upstream/`) | med | Does the running store serve an OpenAPI document, and which snapshot does the lane commit? | P2 | UNBUILT | A committed snapshot at the path the spec loads (path mismatch, R16, to be decided) | CONFIRMED |
| P-MED-16 (OD-8) | med plan `:69`, `:568`, `:790` | med | Do admin and store request shapes match the lane client? | P2 | UNBUILT | The L0 probe records each shape before a spec uses it | CONFIRMED |
| P-MED-14 (RD-16, OD-9) | med plan `:67`, `:122` | med | Does any Medusa case need a product-wide serial job? | P2 | UNBUILT | L0 check; `tests/serial/med/` stays empty unless one is found | CONFIRMED |
| P-MED-18 (OD-18, KWD via Stripe) | med plan `:128` (RD-23), OD-18 `:1329`, `:685` | med | Does this Stripe test account accept KWD? (Today: `Invalid currency: kwd`.) | P2 (ENV) | BLOCKED | The account accepts KWD. This is outside the repo and outside P2. Until then the case stays a skip with its reason. | CONFIRMED |
| P2-MED-CACHE-001 (HR-4; OD-13) | med plan `:113` (RD-7), `:191`, `:648`, OD-13 `:1323`; `tests/integration/med/cache-visibility.spec.ts:22` (built, gated); harness 0.3.1 `src/adapters/medusa-env.ts:184-194, 282-293` | med | With `MEDUSA_FF_CACHING=true` and `MEDUSA_REDIS=1`, does an admin price change show on the next store read inside `PW_EXPECT_TIMEOUT_MS`? | P2 | DEFERRED | A live run with the flag on the 0.3.1 harness. The HR-4 gate is stale on disk (R5); the probe decides. | CONFIRMED |
| FC-MED-B (rate limit) | med plan `:170` (checked at 0.3.0 only) | med | Does the store apply any rate limit in this harness? | P2 | UNBUILT | Re-check against harness 0.3.1 and record the result | CONFIRMED |
| OD-14 (lock provider) | med plan `:1324`; CR-9 (`process-payment.js:85-88` as cited) | med | Is the Medusa lock held in memory on this harness? | P2 | UNBUILT | L0 record; decides whether WH-002 and WH-008 can run in one process | CONFIRMED |
| label-med-budgets-pending-probe | `docs/lane-ownership.md` Medusa item 3 (`medPriceListBoundary`, `medCacheVisibility`, `medPoisonParked`) | med | Which budgets can be written from probe values? | P2 (`src/slo/medusa.ts`) | UNBUILT | The three budgets added only after the probes they cite | CONFIRMED |
| label-med-payment-route-citation | `docs/lane-ownership.md` Medusa item 1; med plan `:249-251` (`route.js:21-22`, `:22`) | med | Where is the real payment route at the pinned fork `f677db4`? | P2 | UNBUILT | The path and lines recorded in the Medusa probe record before any budget cites them | CONFIRMED |

### 2.4 Twenty (tw)

| ID or label | Source | Product | Probe question | Belongs to | Status | Evidence that would close it | Citation grade |
|---|---|---|---|---|---|---|---|
| P2-TW-STR-001 | tw plan `:132`; `tests/integration/tw/billing.spec.ts:6-20` (gate skip); probes B-P22 `:43`, B-P23 `:44` | tw | Do two out-of-order subscription events leave the newest one stored? | P2 (ENV: proxy CA in the server container) | BLOCKED | `billing:sync-plans-data` runs in the server container with TLS verification on (proxy CA added to the container trust store, verification never disabled), then the billing job passes. Reconcile R9. | CONFIRMED |
| P2-TW-STR-002 | tw plan `:141`, `:158` (DEFERRED, HR-5); probe addendum `:158` (HARD STOP) | tw | Does a billing-state change keep the right workspace activation when billing and a second workspace share a stack? | P2 (owner decision) | DEFERRED | Owner decision that billing and multi-workspace may share one stack. The probe says billing changes activation for an active workspace (HARD STOP). Reconcile R10. | CONFIRMED |
| P2-TW-RT-001 | tw plan `:134`, `:159`, OD-13 `:1128`; P-TW-13 `:82` | tw | Does a POST to a route trigger run its workflow and create one record? | harness (driver environment) and P2 | BLOCKED | A workflow-webhook probe that gets past 404 `TRIGGER_NOT_FOUND` and a driver that is not disabled | CONFIRMED |
| backlog-harness-v032-logic-function-type | backlog Nov 3; harness 0.3.1 `src/adapters/twenty-passthrough.ts:9-15` (six names, no `LOGIC_FUNCTION_TYPE`); tw plan `:82` | tw, harness | Does forwarding `LOGIC_FUNCTION_TYPE` by name (server and worker) let the route trigger run locally? | harness | DEFERRED | The Task 4 probe shows RT-001 cannot run without it, then a harness release (P2 never edits the harness). The ADR wording is UNVERIFIED (not on this checkout) and is not needed to close the row. | CONFIRMED |
| backlog-harness-v032-server2-passthrough | backlog Nov 3; harness 0.3.1 `docker/twenty.replicas.compose.yml` (server-2 env copied by hand: no `IS_BILLING_ENABLED` or `BILLING_STRIPE_*` lines; `IS_MULTIWORKSPACE_ENABLED: "false"` at `:42`) | tw, harness | Should server-2 get the same passthrough, and can a two-replica stack also run billing or multi-workspace? | harness (owner decision) | DEFERRED | Owner decision (D6) and a harness v0.3.2 release. Until then no stack combines replicas with billing. | CONFIRMED |
| P2-TW-CACHE-001 (HR-4) | tw plan `:78`, `:139`, `:164` (built, fix step 7), `:1089`, OD-8 `:1123` (DEFERRED); `tests/integration/tw/cache.spec.ts:27-33` (gate); harness 0.3.1 `src/adapters/twenty-replicas.ts` | tw | Does a custom field added on replica A show on replica B inside the measured budget? | P2 | DEFERRED | A live run of the `@replicas` job (tw-cache). Reconcile R1. | CONFIRMED |
| P2-TW-WH-009 (HR-5) | tw plan `:1090`, `:1122` (DEFERRED), `:37` (built); `tests/webhooks/tw/tenant.spec.ts:55`; harness 0.3.1 `src/adapters/twenty-passthrough.ts:12` (`IS_MULTIWORKSPACE_ENABLED`) | tw | Does a second workspace receive only its own webhook events? | P2 | DEFERRED | A live run of the `@multiws` job (tw-multiws). Reconcile R1. | CONFIRMED |
| P2-TW-BUG-003 | tw probes `:112-127` (PROVEN 5 of 5); backlog Nov 3 | tw | After a webhook is deleted, does its URL keep receiving events for up to 10 s? | P5 | UNBUILT | An upstream decision (not filed). The 10 s is the memo window the probe measured (`:121`, `:127`). | CONFIRMED |
| P2-TW-BUG-004 | tw probes B-P16 `:38`, `:130-134` (PROVEN 2 of 2; off-plan, no marker); backlog Nov 3 | tw | Does deleting a PENDING_CREATION workspace answer a clean 4xx without the raw constraint name? | P5 | UNBUILT | An upstream decision. Add a `test.fail` only if the owner accepts it; none on `main` today. The CWE-209 label appears only in the backlog (UNVERIFIED). | CONFIRMED |
| P2-TW-BUG-001 | tw probes `:77-83` (REST and GraphQL PROVEN); tw plan CUR-001 known-bug marker | tw | Are amounts above 2^53-1 rounded silently? | P5 | UNBUILT | An upstream decision (not filed); the known-bug marker stays | CONFIRMED |
| P2-TW-BUG-002 | tw probes `:95` (PROVEN 3 of 3); tw plan CON-001 known-bug marker | tw | Does the published OAS disagree with live list responses? | P5 | UNBUILT | An upstream decision (not filed); the known-bug marker stays | CONFIRMED |
| backlog-tw-study-timeout | tw plan `:991`, `:995` (1350 s worst case = 22.5 min; `timeout-minutes: 30`) | tw | What is the wall clock of the first scheduled `tw-study` run, and should the 30 min job timeout change? | P2 | UNBUILT | The first scheduled run measured; the timeout resized from that number (named constant TW_STUDY_JOB_TIMEOUT_MIN, section 4.2) | CONFIRMED |

### 2.5 Shared, harness, foundation and track-only

| ID or label | Source | Product | Probe question | Belongs to | Status | Evidence that would close it | Citation grade |
|---|---|---|---|---|---|---|---|
| backlog-oas-max-errors | backlog Nov 3; `src/contracts/oas.ts:32`, `:119-127`; `tests/contracts/tw/rest-oas.spec.ts:94-98` (guard) | shared, tw | Can a violation list longer than 10 hide a violation from the report? | foundation | UNBUILT | A test on a fixture with more than 10 violations asserting the `… and N more` line and the count. The backlog's "no total count" is contradicted at `oas.ts:127` (R12). | CONFIRMED |
| backlog-harness-products-root-default | backlog Nov 3; harness 0.3.1 `src/config.ts:151` (default `node_modules/products`), `:137` (message names `.env`), `:11` (loads only the harness package's own `.env`); repo `scripts/bootstrap.sh:46-50` | harness | With `PRODUCTS_ROOT` unset, does the harness fail with a message that points at a file it never reads? | harness | DEFERRED | Harness v0.3.2 fix. Until then the workaround in section 4.3 (`PRODUCTS_ROOT=/home/user/products`, path exists on this VM). | CONFIRMED |
| label-harness-v031-medusa-version-gate | med plan `:970` (step 4 requires `0.3.0`), `:23`; `package.json:26` pins `v0.3.1`; installed harness 0.3.1 | med, foundation | Does the Medusa Task 3 build stop at its own step 4 on this checkout? | P2 (plan step change, D2) | BLOCKED | Decision D2 applied: plan step 4 accepts `0.3.1` with the fork HEAD check kept. Reconcile R6. | CONFIRMED |
| label-env-prereqs-runbook-missing | AGENTS.md cites `docs/plans/2026-11-01-p2-task5-env-prereqs-readiness.md` (section 8); path absent on `main` (R15) | foundation | Which readiness steps apply to a cloud session without the runbook? | foundation | UNBUILT | The runbook restored, or the readiness steps moved into a plan that exists on `main` (owner decision) | CONFIRMED |
| label-discovery-round-scope | backlog Nov 3 (discovery round itself) | P2 (foundation scope) | Which risky API, webhook and DB cases do the lane plans miss? | P2 | UNBUILT | Probe records from Tasks 1 to 4; new IDs only in Tasks 5 and 6 (a later plan, not in this charter) | UNVERIFIED (backlog only; the confirming file is the Task 5 plan, not yet written) |
| label-ci-yml-gate-pr (track only) | backlog Nov 3 (single `ci.yml` gate PR); `.github/workflows/` on `main`: `api.yml`, `env-check.yml`, `p2-*.yml`, `tw-study.yml` (no `ci.yml`) | foundation | Should one gate workflow replace the per-lane checks? | foundation | DEFERRED | A separate task. Out of discovery scope. | UNVERIFIED (`ci.yml` appears only in the backlog; `api.yml` is CONFIRMED) |
| label-readme-claude-cloud-setup (track only) | backlog Nov 3; `README.md` (12 lines, no cloud block) | foundation | Does the README need a Claude cloud setup block? | foundation | DEFERRED | A separate docs task. Out of discovery scope. | CONFIRMED |
| label-cron-tick-nightly (track only) | backlog Nov 3; doc probes RR-TICK `:408-426` (15-minute cadence) | foundation | Should the 15-minute cron tick move to a nightly run? | foundation | DEFERRED | A separate task. Out of discovery scope. | CONFIRMED |
| label-upstream-issue-filing (track only) | backlog Nov 3 to 4; probes B-38 and B-44 ("not filed"); tw probes `:134` | P5 | Which P5 drafts become upstream issues? | P5 | DEFERRED | An owner decision per item (non-goal in this charter, section 5) | CONFIRMED |

## 3. Reconciliation (plans vs `main` vs harness 0.3.1)

Where the sources disagree, this section records the facts and the default. Nothing here edits a plan; the owner corrects the plans.

| # | Conflict | Evidence | Default in this charter |
|---|---|---|---|
| R1 | Twenty CACHE-001 and WH-009: "built (review fix step 7)" versus "DEFERRED (HR-4, HR-5)" and OD-7/OD-8 DEFERRED | tw plan `:37`, `:139`, `:164` (built) against `:1089-1090` and `:1122-1123` (DEFERRED). On `main`: `tests/integration/tw/cache.spec.ts`, `tests/webhooks/tw/tenant.spec.ts`. Harness 0.3.1 has the replicas adapter and `IS_MULTIWORKSPACE_ENABLED` in the passthrough. | The spec files exist and are gated. Their live status is UNBUILT until the Task 4 jobs run clean. |
| R2 | Documenso CONV-002 and CONV-003: DEFERRED until harness v0.3.1 | doc plan `:128-129`, OD-9 `:1016`, HR-5 `:975` against `tests/serial/doc/conversion.spec.ts` on `main` (built; `test.fail(P5_CONV_001)`). Harness 0.3.1 has `docker/documenso.gotenberg.compose.yml`. | The spec exists. Live status UNBUILT. Task 2 step 5 decides. |
| R3 | Documenso WH-005: DEFERRED (OD-11, row text not in master plan) | doc plan `:137`, `:196`, OD-11 `:1018` against `tests/webhooks/doc/payload.spec.ts:22` (built; WH-005 `test.fail` on P5-DOC-TOK-002). `docs/master-plan.html` has no WH-005 row. | The spec exists. The row text is still missing (D8). |
| R4 | Documenso HR-4 (export the mail API URL) | doc plan HR-4 `:974`; harness 0.3.1 exports `documensoMailApiUrl` (`src/config.ts:14`, `src/index.ts:23`) | Closed on disk. Not carried as open (section 7). |
| R5 | Medusa cache module (HR-4, F3, RD-7, OD-13): DEFERRED | med plan `:113`, `:1323`, written against 0.3.0. Harness 0.3.1 `src/adapters/medusa-env.ts:184-194, 282-293` registers the caching module on the Redis switch. | Probe decides (Task 3). The plan's deferral is stale on disk. |
| R6 | Medusa plan section 8.0 step 4 requires harness `0.3.0` | med plan `:970`; `package.json:26` pins `v0.3.1`; installed 0.3.1 (section 1) | Blocking for Task 3 until D2 is applied. |
| R7 | Medusa P-MED-2: UNPROBED in the pre-probe table, CONFIRMED live later | med plan `:54` (UNPROBED) against `:76-77` (CONFIRMED live) | The live results table is current. |
| R8 | Medusa product paths (`route.js:21-22`, `process-payment.js:85-88`) are not on this checkout | `docs/lane-ownership.md` Medusa item 1; med plan `:249-251` | Any claim that rests on them is UNVERIFIED until Task 3 step 1 reads the pinned fork. |
| R9 | Twenty STR-001: skip with a named reason (OD-10) versus BLOCKED (ENV) | tw plan OD-10 (no-key skip; "not BLOCKING") against row `:132` (BLOCKED, ENV, B-P23) | Register uses BLOCKED. The skip is the no-key behaviour; the ENV block is the real stop. |
| R10 | Twenty STR-002: DEFERRED (HR-5) versus HARD STOP | tw plan `:158` against probe addendum `:158` (billing changes workspace activation) | Register uses DEFERRED with the HARD STOP noted. Do not build without D5. |
| R11 | Backlog SHA for PR #14 `fc353dd` | `git cat-file -t fc353dd` fails; not in any ref. The probe B-44 record is at `f4105e4` (doc probes `:535`). PR #14's merge commit on `main` is `d90c4ac`. | Use `f4105e4` for the probe and `d90c4ac` for the merge. The backlog SHA is UNVERIFIED. |
| R12 | Backlog: "OAS truncates at 10 with no total count" | `src/contracts/oas.ts:119-127` keeps all errors and prints `… and N more`; the guard at `tests/contracts/tw/rest-oas.spec.ts:94-98` exists | Reclassified as a test gap (backlog-oas-max-errors). |
| R13 | Cal REC-002 and WH-003 "not explained yet" | cal live probes `:274-279` attribute the local failure to a reused volume and say the cause is not established; `1cdb059` on `main` | Fresh-volume run still needed. No status conflict. |
| R14 | Backlog CI gate named `ci.yml` | `.github/workflows/` has `api.yml` (the gate named in `docs/lane-ownership.md`); no `ci.yml` | Use `api.yml` as the gate name in any later text. |
| R15 | Referenced paths missing on `main` | `docs/plans/2026-10-11-phase-2e-task3-2fa.md` (the format reference named in the brief) is absent, so this charter follows the 2026-11-02 lane plans instead. `docs/plans/2026-11-01-p2-task5-env-prereqs-readiness.md` (AGENTS.md section 8) is absent. `docs/probes/2026-11-02-p2-lane-medusa-probes.md` (cited by the Medusa plan) is absent; the real file is `docs/probes/2026-11-02-p2-medusa-l0-probes.md`. | Use the real paths in this charter. The missing runbook is row `label-env-prereqs-runbook-missing`. |
| R16 | Medusa store OpenAPI path | med plan `:738` (`contracts/medusa/store.openapi.yaml`); RD-17 says `main` has no `contracts/` directory, but `main` now has `contracts/cal`, `contracts/doc`, `contracts/med` (`upstream/`) | Decide the path and the snapshot source in Task 3 (D10 applies to the 299 s case; the path is part of P-MED-15). |
| R17 | Cal throttle 429 "UNPROBED" | cal plan `:1079`: 15 of 125 calls answered 429 (configured limit) | Closed (section 7). |
| R18 | Cal volume: `down cal` keeps the volume | cal live probes `:276`; harness 0.3.1 has no `CAL_DOWN_VOLUMES` (section 1) | Blocking for a fresh-volume claim (D3). |

## 4. Tasks 1 to 4: order, steps, probe safety, STOP

### 4.0 Order and rules

Run in this order: Task 1 (Cal), Task 2 (Documenso), Task 3 (Medusa), Task 4 (Twenty). Each task starts from a clean `origin/main` (`d90c4ac` or a descendant) on its own branch, one product stack at a time, and finishes with that product's `down`.

Branch names for probe work (the charter's default; the owner may rename): `probe/2026-11-05-p2-<product>-<topic>`. Commit with a lowercase conventional message, explicit paths only (`git add <path>`), and push with `git push -u origin <branch>`. Do not open a PR, merge, tag, or dispatch a workflow. Probe records go in `docs/probes/` as new files for that date.

### 4.1 Probe safety rules (copied from the Task 0 brief)

* Bind only to `127.0.0.1` (never `localhost` as a listen address where the project forbids it).
* The harness owns product start and stop; never start/stop products by hand.
* Kill only PIDs this session started.
* Never edit product forks, the harness package, `.env` files, or `node_modules`.
* `PRODUCTS_ROOT=/home/user/products` in Claude Code cloud and Cursor cloud.
* Docker note: in P2 cloud sessions Docker is not managed by systemd; if the standard start times out on containerd, start containerd and then dockerd directly as root, then re-check `docker info`.

### 4.2 Named constants (every timeout in this charter)

| Constant | Value | Basis |
|---|---|---|
| CAL_UP_TIMEOUT_S | 1200 | cal plan `:706` and `:911` (`timeout 1200` around `up.mjs cal`); about twice the 12-minute cold estimate in the foundation index (cal plan `:55`) |
| CAL_DOWN_TIMEOUT_S | 900 | cal plan `:710` (`timeout 900` around `down.mjs cal`) |
| PW_TEST_TIMEOUT_MS | 60000 | `playwright.config.ts:39` |
| PW_EXPECT_TIMEOUT_MS | 10000 | `playwright.config.ts:40`; the medCacheVisibility budget equals it (med plan `:250`) |
| TW_STUDY_JOB_TIMEOUT_MIN | 30 | tw plan `:991-995`: 22.5 min worst case plus 7.5 min margin; resized only from the first scheduled run |
| MED_RACE_WEBHOOK_DELAY_MS | 5000 | med plan `:233` (route emits with `webhook_delay` 5000 ms); a candidate window for the simultaneous-race trigger, not yet probed |
| MED_TOLERANCE_PROCESSING_WINDOW_S | 295 (accepted) and 305 (rejected) | P-MED-2b live (med plan `:77`) |
| DOC_SEAL_CRON_CADENCE_MIN | 15 | doc probes RR-TICK (`:408-426`); code `*/15` as cited in the doc plan |

No retry, sleep, or raised timeout is part of any step. Use `expect.poll` with an explicit deadline, and root-cause any failure with file:line and a label (PRODUCT BUG, TEST BUG, ENV, NOT A BUG).

### 4.3 Environment steps (none applied in Task 0)

Task 0: **No environment change.**

Tasks 1 to 4 need `PRODUCTS_ROOT=/home/user/products` (the workaround for backlog-harness-products-root-default). Apply only when the task starts and only with owner approval:

* **Cursor cloud:** add `PRODUCTS_ROOT=/home/user/products` to the cloud environment's variables for this repository (non-secret). Verify with `echo "$PRODUCTS_ROOT"` in the cloud shell.
* **Claude Code cloud:** call `update_environment` with `set_environment_variables: {"PRODUCTS_ROOT": "/home/user/products"}`. Its approval prompt shows the change. Verify the same way.
* **Docker:** the Claude Code session-start hook starts Docker in cloud sessions (AGENTS.md). If `docker info` fails, use the Docker note in 4.1 and re-check.
* **Secrets:** the Stripe test-mode key is never typed or printed. It reaches the run only through the existing secret path.

### 4.4 Task steps

#### Task 1: Cal fresh-volume explanation

Files to read first (read only): `docs/plans/2026-11-02-p2-lane-cal.md` (`:110`, `:114`, `:155-156`, `:667`, `:958`, `:961`, `:962`); `docs/probes/2026-11-02-p2-lane-cal-live-probes.md` (section "L19 CON-005 per-operation cal-api-version", `:223-282`); `tests/integration/cal/cal-rec.spec.ts`; `tests/webhooks/cal/cal-wh.spec.ts`; `src/lanes/cal/` (confirm the `tasks.ts` the probe cites exists before using it).

1. Confirm the base: `git fetch origin && git rev-parse origin/main` must be `d90c4ac` or a descendant. Otherwise STOP.
2. Confirm the environment: `export PATH="/usr/local/bin:$PATH"` and `PRODUCTS_ROOT=/home/user/products`. Confirm `node -p "require('./node_modules/qa-portfolio-harness/package.json').version"` prints `0.3.1`. Confirm the test project names with `npm run list:api`.
3. Take the stack down with the volume reset (D3): `timeout 900 node node_modules/qa-portfolio-harness/scripts/down.mjs cal`. Then `docker volume ls` and confirm exactly `qa-harness-cal_db_data` exists and no running container uses it. Remove only that named volume. Do not remove other volumes.
4. Bring it up fresh: `timeout 1200 node node_modules/qa-portfolio-harness/scripts/up.mjs cal` (CAL_UP_TIMEOUT_S). If `up` fails, record the output and STOP after one retry of the same command (the retry is a diagnosis step, not a fix).
5. Run the two cases on the fresh volume: `npx playwright test --project=cal-serial -g "P2-CAL-REC-002"` and `npx playwright test --project=cal-serial -g "P2-CAL-WH-003"`. Use the project names from step 2. Also run the cal API project to check CON-005 still passes on the same volume.
6. If a case is red: read the `qa_ro` Task rows for the test receiver URL (read only), record the row count and the receiver URL, and check whether `payloadNamesTest` matches. Write the root cause with file:line and a label. Do not change assertions, add waits, or add retries.
7. Always finish: `timeout 900 node node_modules/qa-portfolio-harness/scripts/down.mjs cal`.
8. Probe record: a new file `docs/probes/2026-11-05-p2-cal-fresh-volume-probes.md` with the commands, results, and the root cause or the pass. Commit that file only.
9. Then, if the Cal plan still marks OD-DST, OD-AUD, or OD-SRVTZ as UNBUILT, run only their L3 step 0 probes (the product path check). Do not build them here.

Done: both cases pass on a fresh volume, or the root cause is recorded with a label. The register rows `P2-CAL-REC-002` and `P2-CAL-WH-003` move only on that evidence.

#### Task 2: Documenso seal sweep, concurrent CAS, and conversion

Files to read first: `docs/plans/2026-11-02-p2-lane-documenso.md` (`:52`, `:128-129`, `:137`, `:163-166`, `:975`, `:1011-1019`); `docs/probes/2026-11-02-p2-lane-documenso-probes.md` (`:109-118`, `:408-426`, `:506`, `:521`, `:526`, `:532`, `:535`); `tests/serial/doc/conversion.spec.ts`; `tests/serial/doc/jobs.spec.ts`; `tests/webhooks/doc/payload.spec.ts`; `src/db/fixture-allowlist.ts` (read only). Harness, read only: `node_modules/qa-portfolio-harness/docker/documenso.gotenberg.compose.yml`.

1. Base and environment as in Task 1 step 1 to 2, plus `"$NODE24"` (AGENTS.md Node 24 rule). Confirm `"$NODE24" -v` prints a 24.x version.
2. P-DOC-4c (window edges) and P2-DOC-JOB-005: these need OD-4 owner approval. If not approved, record "not measured, reason: OD-4 not approved" and do not change the allow-list (`src/db/fixture-allowlist.ts` is foundation's). Do not build either case.
3. Race half of P2-DOC-JOB-004 (OD-7): needs a PENDING row with signed recipients, which needs OD-4. If not approved, record it as DEFERRED and keep the sequential replay as it is.
4. P2-DOC-JOB-002 needs a harness-supported restart with a broken cert path. If the harness cannot do that, record DEFERRED. Do not restart containers by hand.
5. CONV-002 and CONV-003 (R2): bring the Documenso stack up with `"$NODE24" node_modules/qa-portfolio-harness/scripts/up.mjs documenso`. Confirm a Gotenberg container is running (`docker ps`, name from `documenso.gotenberg.compose.yml`) before the run. Then `npx playwright test --project=doc-serial -g "P2-DOC-CONV"`. Expected: CONV-002's oracle is the 503 expectation marked `test.fail`; record what the product actually answers.
6. Finish: `"$NODE24" node_modules/qa-portfolio-harness/scripts/down.mjs documenso`.
7. Probe record: `docs/probes/2026-11-05-p2-doc-probes.md`.

Done: P-DOC-4c and JOB-005 measured or recorded as blocked by OD-4; the race half of JOB-004 recorded; CONV-002 and CONV-003 run once on harness 0.3.1 with the result recorded. P5-DOC-CONV-001 is not filed here.

#### Task 3: Medusa simultaneous race and the 200-before-verify question

Files to read first: `docs/plans/2026-11-02-p2-lane-medusa.md` (`:54-77`, `:126`, `:187`, `:205`, `:233`, `:970`, `:1316`, `:1328`); `docs/lane-ownership.md` (Medusa items 1 to 3); `tests/webhooks/med/race-completion.spec.ts`; `tests/webhooks/med/tolerance.spec.ts`; `tests/integration/med/poison-event.spec.ts`; harness 0.3.1 `src/adapters/medusa-env.ts` (read only).

1. D2 first. Plan step 4 (`:970`) requires `0.3.0`. Apply D2 (accept `0.3.1` with the fork HEAD check) as an approved change to that plan step, in this task's branch. Without the approval, STOP at step 4.
2. Find the real payment route on the pinned fork (`f677db4`, read only, under `$PRODUCTS_ROOT`). Record the path and lines. Do not edit the fork. If the route is not found, record it and STOP for the 200-before-verify question.
3. Candidate race trigger (UNPROBED; design only): the payment route defers processing by `webhook_delay` (5000 ms, `:233`). Issue the cart completion during that window, so the two overlap without any product config edit. Record the timing used, the order count, and the payment count. If the window cannot be targeted reliably, record that as the finding; do not add a sleep to force an overlap.
4. Bring the Medusa stack up with `up.mjs medusa` (one stack at a time), run the race probe, then the tolerance cases only if needed for the record (299 s is already CONFIRMED live, so do not rebuild it), then `down.mjs medusa`.
5. 200-before-verify (backlog, UNVERIFIED): record in the probe whether the route verifies the signature before it responds, from the code read in step 2. Do not file an upstream issue.
6. Probe record: `docs/probes/2026-11-05-p2-med-race-probes.md`.

Done: the race probe is recorded with a deterministic trigger or a stated reason it cannot be deterministic; the route path is recorded; the 200-before-verify claim is marked CONFIRMED or still UNVERIFIED with the reason.

#### Task 4: Twenty billing, route trigger, replicas, and study timing

Files to read first: `docs/plans/2026-11-02-p2-lane-twenty.md` (`:37`, `:78`, `:82`, `:132-141`, `:158-159`, `:991-995`, `:1089-1090`, `:1122-1128`); `docs/probes/2026-11-03-p2-lane-tw-probes.md` (`:38`, `:43-44`, `:112-134`, `:151`, `:158`); `tests/integration/tw/billing.spec.ts`; `tests/integration/tw/cache.spec.ts`; `tests/webhooks/tw/tenant.spec.ts`; harness 0.3.1 `src/adapters/twenty-passthrough.ts` and `docker/twenty.replicas.compose.yml` (read only).

1. Use the Twenty stack name the harness lists. Confirm the exact `up.mjs` and `down.mjs` argument for Twenty first (`node node_modules/qa-portfolio-harness/scripts/up.mjs --help` or the adapter list); this command name is UNVERIFIED on this checkout.
2. STR-001 (BLOCKED): read the proxy trust documentation (`/root/.ccr/README.md`, per the session environment notes) before changing anything. The only acceptable fix is to add the proxy CA to the server container's trust store through a supported mechanism. Never disable TLS verification, never unset `HTTPS_PROXY`. If no supported mechanism exists, STOP and report ENV.
3. STR-002 (DEFERRED, HARD STOP): do not build. Record the probe addendum (`:158`) and the owner decision needed (D5).
4. RT-001 (BLOCKED): run the workflow-webhook probe only. If it still gets 404 `TRIGGER_NOT_FOUND` with the driver disabled, record it, and note that `LOGIC_FUNCTION_TYPE` is not forwarded in harness 0.3.1. The harness request (backlog-harness-v032-logic-function-type) is a decision for the harness owner (D7); P2 does not edit the harness.
5. CACHE-001 (`@replicas`, job tw-cache) and WH-009 (`@multiws`, job tw-multiws): run each on its own stack, one at a time, only after the owner confirms R1. Each run ends with its `down`. Do not combine replicas with billing (see server-2 row, D6).
6. Study timing (backlog-tw-study-timeout): read the first scheduled `tw-study` run's wall clock from the workflow run record when it exists. Do not change `timeout-minutes` until that number exists.

Done: STR-001 passes with verification on, or the ENV stop is reported; STR-002 recorded as HARD STOP; RT-001 recorded with its evidence; CACHE-001 and WH-009 run clean or their gates recorded.

### 4.5 General STOP conditions (apply to every task)

* The base is not `d90c4ac` or a descendant on `origin/main`.
* The harness version is not `0.3.1` (except as D2 changes Medusa's step 4).
* A blocked host (proxy 403, `ENOTFOUND`, or TLS failure): stop and report it as ENV. Do not work around it (AGENTS.md).
* `up` fails twice on the same command, or `down` fails: record the output, stop, and report.
* A fix needs an edit to a fork, the harness, a `.env`, or `node_modules`.
* A fix needs a sleep, a retry, a weakened assertion, a raised timeout, or a skipped test to go green.
* A fix needs an allow-list change without owner approval (OD-4).
* A fix needs billing and multi-workspace in one stack (STR-002 HARD STOP).
* A PID that this session did not start would need to be killed.
* Any secret would have to be printed.

## 5. Non-goals

* Filing upstream issues (the drafts in B-38 and B-44 and the P5 items stay drafts).
* Implementing harness v0.3.2 or any other harness change.
* The single `ci.yml` gate PR (the gate today is `api.yml`).
* Inventing case IDs, or renumbering any existing ID.
* Writing or changing any test in this session.
* Starting any product, Docker stack, or `npm ci` in this session.

## 6. Open decisions

Each row has a default. D2 and D3 are BLOCKING for their task; the rest are not.

| # | Decision | Evidence | Recommended default | Blocking? |
|---|---|---|---|---|
| D1 | Which status stands for the plan-versus-`main` conflicts R1, R2, R3 | section 3 | `main` decides whether the file exists; its live status is UNBUILT until a clean run. The owner corrects the plan tables. | No |
| D2 | Accept harness `0.3.1` in Medusa plan step 4 | R6; `:970`; `package.json:26` | Accept `0.3.1` with the fork HEAD check kept (plan change in the Task 3 branch) | **Yes, for Task 3** |
| D3 | Remove the cal named volume `qa-harness-cal_db_data` after the harness `down` | backlog-cal-volume-reset; R18 | Yes, but only after `docker volume ls` confirms that name and no running container uses it. No harness edit. | **Yes, for Task 1** (a fresh-volume claim needs it) |
| D4 | OD-4 enum allow-list kind (JOB-002, JOB-003, JOB-005, the race half, P-DOC-4c) | doc plan `:1011`; `src/db/fixture-allowlist.ts:8-18` | Not approved; these stay DEFERRED | No |
| D5 | Billing and multi-workspace in one Twenty stack (STR-002) | probe addendum `:158` | No; HARD STOP | No |
| D6 | Server-2 passthrough (billing variables) | backlog-harness-v032-server2-passthrough | No change; no stack combines replicas with billing | No |
| D7 | Harness request to forward `LOGIC_FUNCTION_TYPE` | backlog-harness-v032-logic-function-type | Run the workflow-webhook probe first; file the request to the harness owner only if the probe proves it is needed | No |
| D8 | Row text for WH-005 and MAIL-002 (OD-11, OD-12) | doc plan `:1018-1019`; master plan has neither row | Keep DEFERRED until the owner supplies the text | No |
| D9 | Upstream issues for P5 items (DEL-001, TOK-002, CONV-001, BUG-001 to BUG-004, the Medusa 200-before-verify point, OD-5, OD-6, UP-001) | sections 2.2 to 2.4 | None filed by P2; the owner decides each | No (non-goal) |
| D10 | Medusa 299 s receipt-age behaviour (OD-17) and the store OpenAPI path (R16) | med plan `:1328`, `:738` | Keep as a design finding with no `test.fail`; choose the `contracts/med/` path in Task 3 | No |
| D11 | Harness `PRODUCTS_ROOT` default | backlog-harness-products-root-default | Use the section 4.3 workaround until harness v0.3.2 | No |

**BLOCKING now:** D2 (Task 3 stops at its own step 4 without it) and D3 (Task 1's fresh-volume claim needs the owner's OK for the volume step). Neither blocks Task 0.

## 7. Closed by evidence (do not re-probe)

* Documenso HR-4, mail API URL export: harness 0.3.1 exports `documensoMailApiUrl` (`src/config.ts:14`, `src/index.ts:23`).
* Cal P13, 429 under the 120/min key: observed, 15 of 125 calls answered 429 (cal plan `:1079`).
* Cal D9 and P7 non-recurring PENDING duplicate: no duplicate; no finding (cal plan `:1071`).
* Twenty OD-11 (closed by OD-6), OD-14 (baseline 285), OD-12 (applied): see tw plan section 14.2.
* Twenty WH-008 (rate-limit drops): cut by owner decision (tw plan `:143`, OD-6).
* Medusa OD-3, OD-4, OD-9 (decided 2026-11-02; med plan `:1313-1319`); OD-7 (KWD gap is a finding); OD-16 (bearer cart id).

## 8. Summary counts (this file)

Counted mechanically from the rows in section 2 (Task 0 check, 2026-11-05).

| Group | Rows |
|---|---|
| 2.1 Cal | 8 |
| 2.2 Documenso | 15 |
| 2.3 Medusa | 18 |
| 2.4 Twenty | 12 |
| 2.5 Shared, harness, foundation, track-only | 9 |
| **Total** | **62** |

| Citation grade | Rows |
|---|---|
| CONFIRMED | 59 |
| UNVERIFIED | 3 (backlog-med-webhook-200-before-verify, label-discovery-round-scope, label-ci-yml-gate-pr) |

| Status | Rows |
|---|---|
| UNBUILT | 34 |
| DEFERRED | 23 |
| BLOCKED | 5 |

Reconciliation items (section 3): 18. Open decisions (section 6): 11, of which 2 are BLOCKING for their task (D2, D3).

## 9. Verdicts (Tasks 1 to 5, recorded 2026-11-05 to 2026-11-06)

Verdict labels: `CONFIRMED-GAP`, `COVERED` (cite the existing spec), `PRODUCT DEFECT` (evidence), `NOT REPRODUCIBLE`, `STILL BLOCKED` (exact blocker), and `NOT ATTEMPTED` (driven by the plan, not run this session; reason given). Every probe record is in `docs/probes/` (dated 2026-11-05 or 2026-11-06, times Asia/Colombo).

| Row (section 2) | Verdict | Evidence / reason |
|---|---|---|
| P2-CAL-REC-002 | NOT REPRODUCIBLE | Passes on a fresh volume (`2026-11-05-p2-cal-fresh-volume-probes.md`, attempt D, 3.6 s). |
| P2-CAL-WH-003 (positive control) | NOT REPRODUCIBLE | Passes on a fresh volume (same record, 522 ms). |
| P2-CAL-WH-003 (B2 retry marker) | PRODUCT DEFECT | Expected failure reproduces (`cal-wh.spec.ts:352`); delivery count not captured. |
| backlog-cal-volume-reset | COVERED | D3 applied: harness `down`, then `docker volume rm qa-harness-cal_db_data` after confirming no container used it. |
| P2-CAL-DST-001/002, P2-CAL-REC-001 (OD-DST) | NOT ATTEMPTED | Needs the L3 step 0 product-path probe; not run. |
| P2-CAL-SRVTZ-001/002 (OD-SRVTZ) | NOT ATTEMPTED | Needs a second stack with `TZ=Asia/Colombo`; not run. |
| P2-CAL-AUD-001 (OD-AUD) | NOT ATTEMPTED | Needs an organisation with `booking-audit`; not run. |
| P2-CAL-RR-001 (OD-RR) | NOT ATTEMPTED | Needs a seeded round-robin team; not run. |
| label-cal-cold-bootstrap-timing | COVERED | Cold `up` 651 s (attempt A), warm 81 s (attempt D). `CAL_UP_TIMEOUT_S` 1200 unchanged. |
| P-DOC-4c (OD-4) | STILL BLOCKED | OD-4 not approved; window edges not measured. |
| P2-DOC-JOB-005 (OD-4) | STILL BLOCKED | Needs OD-4 and a PENDING fixture path. |
| P2-DOC-JOB-002 | STILL BLOCKED | Harness has no restart-with-broken-cert-path. |
| P2-DOC-JOB-003 (OD-4) | STILL BLOCKED | Needs enum writes; allow-list is timestamp-only. |
| P2-DOC-JOB-004 race (OD-7) | STILL BLOCKED | Needs a PENDING row with signed recipients (OD-4). Sequential replay is built. |
| P2-DOC-CONV-002 | PRODUCT DEFECT | Expected-failure marker passes (`conversion.spec.ts:64`, `P5_CONV_001`), run with `DOCUMENSO_GOTENBERG=1`. |
| P2-DOC-CONV-003 | COVERED | Passes live (`conversion.spec.ts:92`, 30.8 s). |
| P5-DOC-CONV-001 | PRODUCT DEFECT | As CONV-002 (400 observed in B-39; status not re-captured). |
| P2-DOC-WH-005 | COVERED (expected failure) | Marker `payload.spec.ts:22` passes as expected failure. |
| P5-DOC-TOK-002 | PRODUCT DEFECT | As WH-005. Upstream draft only. |
| P5-DOC-DEL-001 | STILL BLOCKED | No deterministic trigger for a PENDING delete racing the last signature (needs OD-4). |
| P2-DOC-MAIL-002 (OD-12) | STILL BLOCKED | Row text missing from the master plan. |
| label-doc-organisation-soft-delete | NOT ATTEMPTED | Needs a read-only query on a running doc stack; not run. |
| P2-DOC-STR-001 / P2-DOC-SM-001 (OD-5, OD-6) | NOT ATTEMPTED | Owner decision; no new evidence needed. |
| UP-001 (OD-8) | NOT ATTEMPTED | Owner decision. |
| P2-MED-WH-008 (simultaneous overlap, P-MED-4) | STILL BLOCKED | Sequential orderings are covered (see next rows); a deterministic overlap is not yet shown. |
| P2-MED-WH-008 (completion before the delayed webhook, 20 runs) | COVERED | `race-completion.spec.ts:42`, 20 of 20 pass (med record, run 4). |
| P2-MED-WH-008b (webhook first) | COVERED | `race-completion.spec.ts:86` passes. |
| backlog-med-webhook-200-before-verify | PRODUCT DEFECT (P5, design) | Route code read: `route.js:17-29` emits with `delay: 5000` and returns 200 without verification. The cited path is confirmed under the installed `@medusajs/medusa` 2.21.2 package. |
| P2-MED-EB-002 | COVERED | `poison-event.spec.ts:46` passes (9.1 s). |
| P2-MED-WH-006 (OD-17, 299 s) | STILL BLOCKED | Owner decision D10; live result already on record (`med plan :76-77`). |
| P-MED-3 | NOT ATTEMPTED | Not run this session. |
| P-MED-6 / FC-MED-A | NOT ATTEMPTED | Not run; the P5 verdict is open. |
| P-MED-8 | NOT ATTEMPTED | Schema-name probe not run; the lane's query names are used by passing cases, which is indirect evidence only. |
| med order-total conservation rule | NOT ATTEMPTED | Depends on P-MED-8. |
| P-MED-13 (CSV) | NOT ATTEMPTED | Not run. |
| P-MED-15 (OpenAPI snapshot) | NOT ATTEMPTED | Not run. |
| P-MED-16 | NOT ATTEMPTED | Not run. |
| P-MED-14 | NOT ATTEMPTED | Not run. |
| P-MED-18 (KWD via Stripe) | STILL BLOCKED | Account refuses KWD (earlier evidence, med plan `:128`); not re-run. |
| P2-MED-CACHE-001 (HR-4) | COVERED | `cache-visibility.spec.ts:22` passes on harness 0.3.1 with `MEDUSA_FF_CACHING=true` and `MEDUSA_REDIS=1`. |
| FC-MED-B (rate limit) | NOT ATTEMPTED | Not run against 0.3.1. |
| OD-14 (lock provider) | NOT ATTEMPTED | Not run. |
| med budgets (3) | NOT ATTEMPTED | Budgets wait on probes above. |
| label-med-payment-route-citation | COVERED | Route found at the installed package path; lines 21-22 match the plan. |
| P2-TW-STR-001 | STILL BLOCKED | Billing sync fails `SELF_SIGNED_CERT_IN_CHAIN` inside the server container. Needs a harness mechanism to pass the proxy CA into that container. Verification was not disabled. |
| P2-TW-STR-002 | STILL BLOCKED (HARD STOP) | Not built (probe addendum). D5. |
| P2-TW-RT-001 | STILL BLOCKED (harness) | Fork disables execution unless `LOGIC_FUNCTION_TYPE` is set; harness does not forward it. |
| backlog-harness-v032-logic-function-type | CONFIRMED-GAP (harness) | Needed for RT-001. Harness owner decision (D7). |
| backlog-harness-v032-server2-passthrough | CONFIRMED-GAP (harness) | Server-2 overlay has no billing passthrough. Not exercised (D6). |
| P2-TW-CACHE-001 | COVERED | `cache.spec.ts:27` passes on the replicas stack (1.6 s). |
| P2-TW-WH-009 | COVERED | `tenant.spec.ts:55` passes with `TWENTY_BASE_URL=http://localhost:3002`. Default `127.0.0.1` fails the exchange (B-P13). CI config gap, not a product defect. |
| P2-TW-BUG-001, -002, -003, -004 | PRODUCT DEFECT | Earlier proofs on record (tw probes `:77-134`); not re-run. |
| backlog-tw-study-timeout | STILL BLOCKED | Needs a first scheduled `tw-study` run. |
| backlog-oas-max-errors | NOT ATTEMPTED | Needs a >10-violation fixture; not run. |
| backlog-harness-products-root-default | COVERED (workaround) | `PRODUCTS_ROOT=/home/user/products` used in every stack run; harness v0.3.2 fix still pending. |
| label-harness-v031-medusa-version-gate (D2) | COVERED | D2 applied; harness 0.3.1 accepted with the fork HEAD check (`f677db4`). |
| label-env-prereqs-runbook-missing | STILL BLOCKED | `docs/plans/2026-11-01-p2-task5-env-prereqs-readiness.md` still absent. |
| label-discovery-round-scope | COVERED (partial) | This session's probes; the cross-product sweep is listed as follow-up (cross-probes record). |
| label-ci-yml-gate-pr, label-readme-claude-cloud-setup, label-cron-tick-nightly, label-upstream-issue-filing | NOT ATTEMPTED | Track-only (out of scope; upstream filing is a non-goal). |

Counts of verdicts in section 9: COVERED or NOT REPRODUCIBLE 17 (including workaround and D2 closures), PRODUCT DEFECT 8, CONFIRMED-GAP 3 (two harness, one coverage), STILL BLOCKED 22, NOT ATTEMPTED 20. Counted by hand from the table above.

## 10. Proposed case IDs (PROPOSED, for owner approval)

Only `CONFIRMED-GAP` rows that are product-facing get an ID. Harness gaps are not P2 cases.

| PROPOSED ID | Assertion (one line) | Oracle | test.fail candidate |
|---|---|---|---|
| **P2-MED-WH-009** (PROPOSED) | A payment webhook and a cart completion that land in the same window leave exactly one order, one payment, and one capture. | `qa_ro`: order count for the run's cart, payment rows, capture rows, all equal to 1 (table and column names per P-MED-8, not yet probed). | None. No defect evidence yet. Becomes a candidate only if the overlap shows a duplicate. |

Not proposed: the Medusa 200-before-verify point (PRODUCT DEFECT, P5 design) and the Twenty `LOGIC_FUNCTION_TYPE` and server-2 passthrough gaps (harness). They go to P5 and the harness owner respectively.

## 11. Stale plan rows (for owner approval; plans not edited in this session)

| Plan path and line | Current text | Correction (evidence) |
|---|---|---|
| `docs/plans/2026-11-02-p2-lane-twenty.md:1089-1090` | HR-4 and HR-5 DEFERRED | Stale. Harness 0.3.1 has the replicas adapter and multi-workspace passthrough; `CACHE-001` and `WH-009` pass (Twenty record). |
| `docs/plans/2026-11-02-p2-lane-twenty.md:1122-1123` | OD-7 and OD-8 DEFERRED | Applied and passing (same evidence). |
| `docs/plans/2026-11-02-p2-lane-twenty.md:10xx` (`OD-10`) and `:132` | OD-10 "not BLOCKING" versus row BLOCKED | Reconcile to BLOCKED: billing sync needs the CA in the server container (Twenty record, billing stage). |
| `docs/plans/2026-11-02-p2-lane-twenty.md:793` (up command) | No base URL for the multi-workspace job | Add `TWENTY_BASE_URL=http://localhost:3002` for the `@multiws` job (B-P13; WH-009 passes only with it). |
| `docs/plans/2026-11-02-p2-lane-documenso.md:128-129` | CONV-002 and CONV-003 DEFERRED | Stale. Specs on `main`; CONV-003 passes; CONV-002 expected failure. Run with `DOCUMENSO_GOTENBERG=1` (harness 0.3.1). |
| `docs/plans/2026-11-02-p2-lane-documenso.md:137`, `:1018` | WH-005 DEFERRED (OD-11) | Spec exists; expected-failure marker verified. Row text still missing (D8). |
| `docs/plans/2026-11-02-p2-lane-documenso.md:956-958` (run recipe) | No `DOCUMENSO_GOTENBERG=1`; `doc-serial` runs `doc-api` too | Add `DOCUMENSO_GOTENBERG=1` for CONV cases; use `--no-deps` when only the serial project is wanted. |
| `docs/plans/2026-11-02-p2-lane-medusa.md:970` (step 4) | harness must print `0.3.0` | Accept `0.3.1` with the fork HEAD check (D2). |
| `docs/plans/2026-11-02-p2-lane-medusa.md:1050`, `:1174` | Seed after each `up` | Already correct; the run recipe in this session missed it. No plan change; note for runners. |
| `docs/plans/2026-11-02-p2-lane-medusa.md:113`, `:1323` | HR-4 CACHE-001 DEFERRED | Stale on 0.3.1. Passes. |
| `docs/plans/2026-11-02-p2-lane-medusa.md:54` | P-MED-2 UNPROBED | Superseded by the live result at `:76-77` (CONFIRMED). |
| `docs/plans/2026-11-02-p2-lane-cal.md:912` (provision after `up`) | Correct as written | No change. The D3 volume reset and the same-shell secrets (`:700-713`) are the runbook for fresh-volume runs. |
