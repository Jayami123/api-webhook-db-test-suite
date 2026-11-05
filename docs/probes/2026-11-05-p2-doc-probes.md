# P2 Documenso probe (charter Task 2) — 2026-11-05

Times: Asia/Colombo (UTC+05:30). Branch `feat/2026-11-05-p2-discovery-probes`. Harness 0.3.1 (`PRODUCTS_ROOT=/home/user/products`, `NODE24=/opt/node24/bin/node`). One stack at a time; every stack was brought down through the harness and confirmed gone (`docker ps -a` count `qa-harness-*` = 0).

## Runs

| Run | Start to end | Command (trimmed) | Result |
|---|---|---|---|
| 1 | 23:54:22 up; 23:57:25 down | `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=p2-receiver.test ... up.mjs documenso`; `node scripts/db-roles.ts provision documenso`; `npx playwright test --project=doc-serial -g "P2-DOC-CONV"`; `npx playwright test --project=doc-api -g "P2-DOC-WH-005"`; `down.mjs documenso` | `UP_RC=0`, `PROVISION_RC=0`. CONV-002 and CONV-003 errored: `docker stop qa-harness-documenso-gotenberg` returned `No such container`. Cause: Gotenberg is opt-in in harness 0.3.1 (`documenso-env.ts:261-263`: only `DOCUMENSO_GOTENBERG=1` enables it). My run did not set it, so this is ENV, not a product result. WH-005 `✘` with `1 passed` (expected failure). |
| 2 | 23:58:35 up; 23:59:10 down | same with `DOCUMENSO_GOTENBERG=1`, `--no-deps`, `-g "P2-DOC-CONV"` | `GOTENBERG_PS=1` (container running). `PROVISION_RC=0`. CONV-002 `✘` but reported with `2 passed` (expected failure). CONV-003 `✓` (30.8 s). `DOWN_RC=0`, `PS_AFTER 0`. |

Notes on the run: `doc-serial` depends on `doc-api`, so run 1 also ran the full API project (readiness and webhook cases). Those results are not part of this record's verdicts. Run 2 used `--no-deps`.

Secrets: `P2_QA_RO_PASSWORD` and `P2_QA_FIXTURE_PASSWORD` were generated per run inside the shell; not printed. The scripts are in the session scratchpad, not committed.

## Evidence

Run 2 (trimmed):

```
UP_RC=0 2026-11-05T23:58:35+05:30
GOTENBERG_PS 1
PROVISION_RC=0
✘  1 [doc-serial] tests/serial/doc/conversion.spec.ts:64:1 P2-DOC-CONV-002 Gotenberg down: DOCX create answers 503 fast (P5-DOC-CONV-001: answered 400) (467ms)
✓  2 [doc-serial] tests/serial/doc/conversion.spec.ts:92:1 P2-DOC-CONV-003 Gotenberg restarts: DOCX create succeeds once the service is back (independent of CONV-002) (30.8s)
2 passed (32.4s)
CONV_RC=0 2026-11-05T23:59:09+05:30
DOWN_RC=0 2026-11-05T23:59:10+05:30
PS_AFTER 0
```

Run 1 WH-005 (trimmed):

```
✘  37 [doc-api] tests/webhooks/doc/payload.spec.ts:22:1 P2-DOC-WH-005 every delivered payload matches the schema and carries no recipient token (628ms)
1 passed (2.0s)   (isolated rerun, WH005_RC=0)
```

Caveat: the status of the CONV-002 create and the number of tokens in the captured payloads were not printed in these runs. The earlier record B-39 (`docs/probes/2026-11-02-p2-lane-documenso-probes.md:526`) observed HTTP 400 for DOCX creates with Gotenberg stopped, and B-38 (`:521`) observed each delivered body carrying both recipients' tokens (2 of 2). This run confirms the expected-failure outcome of both markers, not those exact values.

## Verdicts (charter rows)

| Row | Verdict | Basis |
|---|---|---|
| P2-DOC-CONV-003 | COVERED | Passes live on harness 0.3.1 with Gotenberg enabled (`conversion.spec.ts:92`, 30.8 s). |
| P2-DOC-CONV-002 | PRODUCT DEFECT (P5-DOC-CONV-001) | The `test.fail(P5_CONV_001)` oracle (503 expected) fails as expected in run 2. Status 400 observed earlier (B-39); this run did not re-capture it. Upstream issue: draft only. |
| P5-DOC-CONV-001 | PRODUCT DEFECT | Same evidence as CONV-002. |
| P2-DOC-WH-005 | PRODUCT DEFECT (P5-DOC-TOK-002) | `test.fail(true, …)` marker (`payload.spec.ts:22`, oracle `tokensInPayloads` toEqual `[]`) fails as expected; setup asserts run before the marker. Token count not captured this run; B-38 recorded 2 of 2 earlier. |
| P5-DOC-TOK-002 | PRODUCT DEFECT | As above. |
| P2-DOC-MAIL-002 | STILL BLOCKED | Row text not in the master plan (OD-12). Owner must supply the row text. Not run. |
| P2-DOC-JOB-004 (race half, OD-7) | STILL BLOCKED | Needs a PENDING row with signed recipients, which needs OD-4 (enum allow-list), still DEFERRED. Not run. |
| P2-DOC-JOB-005 and P-DOC-4c (seal-sweep window edges, OD-4) | STILL BLOCKED | Needs OD-4 approval. Only the 15-minute cadence is measured (RR-TICK). Not run. |
| P2-DOC-JOB-002 | STILL BLOCKED | Needs a harness-supported restart with a broken cert path; not offered by the harness. Not run. |
| P2-DOC-JOB-003 | STILL BLOCKED | Needs writes to `BackgroundJob.status` (allow-list is timestamp-only, `src/db/fixture-allowlist.ts:8-18`). OD-4. Not run. |
| P5-DOC-DEL-001 | STILL BLOCKED (not attempted) | The repro needs a PENDING delete racing the last signature. No deterministic trigger without an enum write exists yet. B-44 remains a code-read finding. |
| label-doc-organisation-soft-delete | STILL BLOCKED (not attempted) | Needs a read-only `information_schema` query against the running doc database. Not run this session; next doc stack run. |
| P2-DOC-STR-001, P2-DOC-SM-001 (OD-5, OD-6), UP-001 (OD-8) | Not re-run | Owner decisions on expected statuses; no new evidence needed this session. |

## Stack state

After run 2: `DOWN_RC=0`, `PS_AFTER 0`.
