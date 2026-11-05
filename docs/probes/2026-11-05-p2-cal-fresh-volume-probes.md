# P2 Cal fresh-volume probe (charter Task 1, rows P2-CAL-REC-002, P2-CAL-WH-003, backlog-cal-volume-reset)

Date: 2026-11-05. Times: Asia/Colombo (UTC+05:30). Branch: `feat/2026-11-05-p2-discovery-probes`. Harness 0.3.1. Base `d90c4ac`.
Scope: one Cal stack, `up` and `down` through the harness only. No product, harness, `.env`, or `node_modules` edits. No test was changed.

## Question

Charter row P2-CAL-REC-002 asks whether the case passes on a fresh Postgres volume. Row P2-CAL-WH-003 asks the same for the positive control and the B2 `test.fail` retry marker. Row backlog-cal-volume-reset asks how the volume is reset (owner decision D3).

## Attempts

| Attempt | Start to up-end (Colombo) | What ran | Result | Cause |
|---|---|---|---|---|
| A (first `up cal`) | 23:31:53 to 23:42:44 | `timeout 1200 node node_modules/qa-portfolio-harness/scripts/up.mjs cal` with no per-run secrets in the shell | `UP_RC=0` (651 s cold, fresh volume: none existed, `docker volume ls` empty before) | n/a |
| B (targeted run, stack A up) | 23:42:58 | `npx playwright test --project=cal-serial -g "P2-CAL-(REC-002|WH-003)"` | 3 failed in 17 to 26 ms | ENV: `role "qa_ro" does not exist` (`src/db/pg.ts:55`). The roles had never been provisioned on this volume. |
| C (after `npm run db:roles:provision -- cal`, output `db-roles provision: cal ok`) | 23:43:13 to 23:43:37 | same run, same stack A | 3 failed in 17 to 459 ms | ENV: `TEST BUG: CRON_SECRET is not set in the up environment` (`src/lanes/cal/cron.ts:14`). Stack A was started without the per-run values that plan section 8.7 (`lane_up`) requires. |
| D (scripted, one shell) | 23:46:08 to 23:47:38 | `down cal`, `docker volume rm qa-harness-cal_db_data` (after `docker ps --filter volume=...` returned nothing), `up cal` with `CRON_SECRET`, `CRON_API_KEY`, `DAILY_WEBHOOK_SECRET` generated per run, `TASKER_ENABLE_WEBHOOKS=1`, health check on `127.0.0.1:5555/health`, `P2_QA_RO_PASSWORD` and `P2_QA_FIXTURE_PASSWORD` generated per run, `npm run db:roles:provision -- cal`, targeted run, `down cal` | `UP_RC=0` 81 s; `HEALTH_RC=0`; `PROVISION_RC=0`; targeted run `3 passed`, `TEST_RC=0`; `DOWN2_RC=0` | Clean (see verdicts) |

Secrets are generated inside the shell and never printed. The script lived in the session scratchpad and is not committed (per the repo convention for probe scripts). The command sequence is recorded above.

## Evidence (attempt D, trimmed)

```
DOWN1_RC=0
VOLUME_REMOVED qa-harness-cal_db_data
Cal seed presence check failed (relation "users" does not exist); running yarn db-seed.
UP_RC=0 2026-11-05T23:47:29+05:30
HEALTH_RC=0
PROVISION_RC=0
✓  1 [cal-api] tests/integration/cal/cal-rec.spec.ts:27:3 P2-CAL-REC-002 cancelling one occurrence ... (3.6s)
✓  2 [cal-api] tests/webhooks/cal/cal-wh.spec.ts:327:3 P2-CAL-WH-003 receiver 500 ... (positive control) (522ms)
✘  3 [cal-api] tests/webhooks/cal/cal-wh.spec.ts:352:3 P2-CAL-WH-003 a 500 is retried on the next tasker run (promised; finding) (374ms)
3 passed (6.1s)
TEST_RC=0 2026-11-05T23:47:36+05:30
DOWN2_RC=0 2026-11-05T23:47:38+05:30
```

Item 3 is listed as ✘ and counted as passed. The spec body (`cal-wh.spec.ts:352-380`) puts `test.fail()` after the setup asserts and the cleanup, so an error in setup would fail as a normal test. The only assertion left that can fail is `expect(afterSecondRun).toHaveLength(2)`, and that is the expected failure. The delivered count was not printed in this run, so the count is not recorded here.

## Stack state

`docker ps -a --format '{{.Names}}' | grep -c qa-harness` returned 0 after DOWN2 (checked in the same shell after DOWN2_RC=0). The named volume `qa-harness-cal_db_data` was removed at the start of attempt D and recreated by its `up`; it is removed again on the next run.

## Verdicts

| Row | Verdict | Basis |
|---|---|---|
| P2-CAL-REC-002 | NOT REPRODUCIBLE | Passes on a fresh volume (attempt D, 3.6 s). The earlier failures (`Received length: 0` in the L19 record) were a reused volume plus missing roles and secrets, not the product. |
| P2-CAL-WH-003 positive control (`cal-wh.spec.ts:327`) | NOT REPRODUCIBLE | Passes on a fresh volume (attempt D, 522 ms): one attempt, Task succeeded. |
| P2-CAL-WH-003 retry marker (`cal-wh.spec.ts:352`, finding B2) | PRODUCT DEFECT (evidence partial) | The `test.fail()` case reports as expected failure. The 500 is acknowledged and is not retried (finding B2, cal plan P4). The delivery count was not captured, so this label rests on the expected-failure outcome. Follow-up: record the length in a later run. |
| backlog-cal-volume-reset | COVERED (D3 applied) | `down cal` does not remove the volume; the script removed only `qa-harness-cal_db_data` after confirming no container used it. No harness edit. |

Also recorded: backlog Nov 4 said REC-002 and WH-003 failures were "not yet explained". On a fresh volume with the right roles and secrets they pass, so the earlier explanation is that the failures came from the environment, not from a product defect.

## Cold `up` timing (for the job deadline, charter label-cal-cold-bootstrap-timing)

Attempt A: 651 s (cold image and dependency pull). Attempt D: 81 s (warm images). Plan section 2 measured 802 s. Named constant `CAL_UP_TIMEOUT_S` = 1200 (plan `:706`) remains 1.5 times the measured cold value, so it stands.
