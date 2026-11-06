# P2 run summary and nightly Documenso serial: plan, revision 2 (plan only, nothing built)

Written 2026-11-06. Revision 2 answers the review of revision 1 (commit `6c03c43`). Every blocking fix from
that review is applied in the section named in section 1.2. This page is a guide for a junior engineer.
Nothing in this session builds, opens a PR, merges, tags or dispatches a workflow.

## 1. Header

### 1.1 Identity

| Item | Value |
|---|---|
| Repository | this repository (the P2 test suite) |
| Base | `47c507e275a2c11a0836c8d3f5c54227986e492d` (merge of PR #20). `origin/main` is this sha at revision time. `git merge-base --is-ancestor 47c507e origin/main` exits 0. |
| Plan branch | `plan/2026-11-06-p2-run-summary-nightly` |
| Build branch (later) | `feat/2026-11-06-p2-run-summary-nightly`, from `origin/main` at build time. Stop if `origin/main` moved (section 14, S1). |
| Build PR | one PR into `main`, opened by the build session. The owner merges with a merge commit. |
| Ruleset | unchanged. `gate` is the required check. |
| Node floor | `>=22.22.0` (`package.json` `engines.node`). Native `.ts` script execution needs this floor, not any v22. |

### 1.2 Review fixes applied in this revision

| Review item | Where it is fixed |
|---|---|
| Blocker 1: Medusa description, evidence-bearing migration strings | 2.3, 2.4 (migration table), 4.4, 7.2 K6 |
| Blocker 2: missing lane wiring (section 4.5) | 4.5 (new) |
| Blocker 3: workflow-checker incompatibilities | 5.3, 7.3 |
| Blocker 4: probes before implementation; actionlint mandatory | 4.6 (probe), 9 steps 2 and 13 |
| Blocker 5: syntax-aware bare-call guard | 4.4, 7.2 K1 to K4 |
| Blocker 6: dispatch semantics and the serial STOP contradiction | 5.6, 14.1 R2, 14.3 S3 |
| Blocker 7: real source blocks in the serial skeleton | 5.3 |
| OD-1 to OD-4 and the approval contradiction | 3 (one place, one rule) |
| Non-blocking nits | 4.3 (escaping, fail-fast, one report per call), 10 (green commits), 6 (doc set), 13 (Node floor) |

### 1.3 Citation corrections (authority for the build; checked against base `47c507e`)

Where a line number elsewhere in this plan differs from this table, this table wins. Match by YAML node
(job id, step name), not by stale line alone.

| File (base `47c507e`) | Node | Correct lines |
|---|---|---|
| `p2-doc.yml` | job id `doc-api:` | 39 |
| `p2-doc.yml` | comment "One stack for the API project ..." | 40 |
| `p2-doc.yml` | `name: doc-api and doc-serial` (rename to `name: doc-api`) | 41 |
| `p2-doc.yml` | same-repo guard `if:` (unchanged) | 42 |
| `p2-doc.yml` | job `timeout-minutes: 120` (replaced by 30) | 44 |
| `p2-doc.yml` | step "API project" | 110-113 |
| `p2-doc.yml` | step "Serial project ..." (removed) | 115-125 (comment 115-116, step 117-125) |
| `p2-doc.yml` | step "Billing project ..." | 238-243 |
| `p2-cal.yml` | step "Lane tests (cal-api, then cal-serial)" | 91-98 |
| `p2-cal.yml` | step "Lane leak check ..." | 99-102 |
| `p2-cal.yml` | step "Upload report, JUnit and receiver and fixture logs" (starts) | 103-115 (`path:` 109-113) |
| `p2-med.yml` | job `env:` block | 22-23 |
| `p2-med.yml` | step "Run the lane (med-api)" | 120-124 |
| `p2-med.yml` | step "Upload the report, junit and logs" (starts) | 126 |

## 2. Facts checked

### 2.1 Verified on `origin/main` at `47c507e`

| Fact | Where |
|---|---|
| Reporter: list, JUnit, HTML only (CI branch). No JSON reporter. | `playwright.config.ts:42-53` |
| Workers 1, retries 0 | `playwright.config.ts:35-37` |
| Serial projects depend on their API project | `playwright.config.ts:28-30`, `:67-70` |
| The sweep annotation is pushed in the fixture after the test body (teardown) | `src/invariants/fixture.ts:38-41` |
| `SWEEP_ANNOTATION_TYPE` = `invariant-sweep`; description `<product>: <N> rules, <V> violations` | `src/invariants/after-test.ts:30-41` |
| Documenso `doc-api` job: id 38, name 40, guard 41, `timeout-minutes: 120` 44 | `.github/workflows/p2-doc.yml:38-44` |
| Documenso top level: `concurrency` 21-23, `defaults` 25-27, `env` 29-35 | `.github/workflows/p2-doc.yml` |
| Documenso source blocks used by the serial skeleton: PDF tools 62-72, install 73-75, Node 24 setup 77-84, bootstrap with env 86-91, receiver hostname 93-95, passwords 97-99, harness up 101-103, roles 105-108 | `.github/workflows/p2-doc.yml` |
| API project step: `"$NODE22" node_modules/@playwright/test/cli.js test --project=doc-api` | `.github/workflows/p2-doc.yml:110-115` |
| Serial step: `if: always()`, `timeout-minutes: 60`, `P2_JUNIT_FILE` and `P2_HTML_DIR` env, `--project=doc-serial --no-deps` | `.github/workflows/p2-doc.yml:117-125` |
| Documenso results upload includes `playwright-report-serial/` | `.github/workflows/p2-doc.yml:138-144` |
| Billing job `doc-billing-api` (its own harness and billing secret) | `.github/workflows/p2-doc.yml:146-261` |
| Cal: one step runs `--project=cal-api --project=cal-serial`; leak check; upload paths `results/junit.xml`, `playwright-report/`, `receiver-logs/`, `fixture-logs/` (artifact `cal-api-report`) | `.github/workflows/p2-cal.yml:92-116` |
| Cal Node: `setup-node` with `node-version-file: .nvmrc` | `.github/workflows/p2-cal.yml:33-42` |
| Med: run step `--project=med-api`; upload `playwright-report/` and `results/` (artifact `med-api-artifacts`). `results/` already covers a JSON file. | `.github/workflows/p2-med.yml:121-139` |
| Tw `tw-api`: run 73-75 (`--project=tw-api --grep-invert "@multiws|@replicas"`); upload 76-84 (artifact `tw-lane`; paths `results/junit.xml`, `playwright-report/`) | `.github/workflows/p2-tw.yml:73-84` |
| Tw `tw-multiws`: run 144-146 (`--grep "@multiws"`); upload 147-155 (artifact `tw-multiws`) | `.github/workflows/p2-tw.yml:144-155` |
| Tw `tw-cache`: run 209-211 (`--grep "@replicas"`); upload 212-220 (artifact `tw-cache`) | `.github/workflows/p2-tw.yml:209-220` |
| Tw Node: `setup-node` with `node-version-file: .nvmrc` | `.github/workflows/p2-tw.yml:45-50` |
| Documenso classifier regex `re_doc` (no serial file yet) | `scripts/ci-changes.sh:11` |
| Workflow checker: `schedule` allowed only in `tw-study.yml`; callable-only loop excludes only `tw-study.yml`; timeout regexes match a line ending at the number | `tests/unit/ci/workflow.test.ts` (review citations 153-157, 196-210, 242-249) |
| Documenso unit test: the serial assertion targets `p2-doc.yml` | `tests/unit/lanes/doc/ci.test.ts:47-53`; timeout count `:65-72`; guard count `:75-78`; config names `:81-88` |
| `ci.yml` calls `p2-doc.yml` with `secrets: inherit` | `.github/workflows/ci.yml` |
| `scratch/` is not git-ignored | `git check-ignore` on the base |
| `actionlint` is not installed in this session | `command -v actionlint` |
| `typescript` 6.0.3 is a dev dependency | `package.json` |
| `@playwright/test` 1.64.0 | `package.json` |
| `tsconfig.json`: `erasableSyntaxOnly: true`, `verbatimModuleSyntax: true` | `tsconfig.json` |

### 2.2 Measured timings (run `42081000668`, head `c754999`)

Times in UTC from the run-jobs API step records.

| Job | Step | Start | End | Duration |
|---|---|---|---|---|
| `p2-doc / doc-api and doc-serial` (job `127434555892`) | whole job | 18:07:47 | 18:45:38 | 37 min 51 s |
| same | Install locked dependencies | 18:08:01 | 18:08:41 | 40 s |
| same | Clone and install Documenso | 18:08:42 | 18:09:42 | 60 s |
| same | Start the Documenso stack | 18:09:42 | 18:13:36 | 3 min 54 s |
| same | API project | 18:13:36 | 18:16:27 | 2 min 51 s |
| same | Serial project | 18:16:27 | 18:45:34 | 29 min 07 s |
| `p2-cal / cal-api` (job `127434555904`) | whole job | 18:07:48 | 18:23:44 | 15 min 56 s |
| same | Bootstrap the Cal product | 18:08:34 | 18:12:38 | 4 min 4 s |
| same | Harness up (cal) | 18:12:38 | 18:19:39 | 7 min 1 s |
| same | Lane tests (cal-api, then cal-serial) | 18:19:39 | 18:23:40 | 4 min 1 s |

What these numbers show: the Documenso job minus its serial step is 8 min 44 s. That is a counterfactual
subtraction, not a separately measured API-only job. The PR gate waits for its slowest lane, so the serial
step is why doc is the critical path. The numbers do not prove that every slow minute is a cron wait, and
they are not a promise of future timing.

### 2.3 Expected-failure inventory (16 executable call sites in 11 files)

Re-verified on the base during review: all 11 files read, their 16 call sites present (5 bare, 11
annotated). This verifies the inventory, not an exhaustive repository search for aliases. Section 7.2 K1 to
K4 is the guard for the rest.

**Bare `test.fail()` (5 sites):**

| File:line | Test ID | Comment in code | Defect ID (existing record) |
|---|---|---|---|
| `tests/webhooks/cal/cal-wh.spec.ts:379` | `P2-CAL-WH-003` | "Finding B2" | `B2` |
| `tests/contracts/cal/cal-con.spec.ts:39` | `P2-CAL-CON-001` | "PB-CAL-OAS-1" | `PB-CAL-OAS-1` |
| `tests/contracts/cal/cal-con.spec.ts:117` | `P2-CAL-CON-002` | "PB-CAL-OAS-1" | `PB-CAL-OAS-1` |
| `tests/contracts/cal/cal-con-005.spec.ts:197` | `P2-CAL-CON-005` | "PB-CAL-OAS-1" | `PB-CAL-OAS-1` |
| `tests/serial/cal/cal-task.spec.ts:248` | `P2-CAL-TASK-003` (each round) | "Finding B4" | `B4` |

Existing probe headings, in `docs/probes/2026-11-02-p2-lane-cal-live-probes.md` (confirmed in review and re-read here):

- `### PB-CAL-OAS-1: committed OpenAPI does not describe the live 200 and 201 bodies (PRODUCT DOCUMENTATION BUG, proven)` at line 325.
- `### B2: a receiver 500 is acknowledged as success and never retried (PRODUCT BUG, proven)` at line 338.
- `### B4: two concurrent tasker runs deliver each task twice (PRODUCT BUG, proven, three rounds)` at line 346.

**Annotated call sites (11):**

| File:line | Description today | Defect ID | Evidence record (existing) |
|---|---|---|---|
| `tests/integration/tw/currency.spec.ts:97` | `P2-TW-BUG-001: 9007199254740993 is accepted (201) and stored as 9007199254740992` | `P2-TW-BUG-001` | `docs/probes/2026-11-03-p2-lane-tw-probes.md:77` |
| `tests/integration/tw/currency.spec.ts:184` | `P2-TW-BUG-001 (GraphQL): 9007199254740993 is accepted and stored as 9007199254740992` | `P2-TW-BUG-001` | same, `:77` |
| `tests/webhooks/doc/payload.spec.ts:85` | `P5-DOC-TOK-002: every document payload carries every recipient's token (webhook-payload.ts:22-29, :84)` | `P5-DOC-TOK-002` | `docs/probes/2026-11-02-p2-lane-documenso-probes.md:521` (row B-38: both recipients' token values in each delivered body) |
| `tests/webhooks/tw/b1-drop.spec.ts:101` | `P2-TW-BUG-003: a webhook created after a delete misses the next event (probe record, section 3)` | `P2-TW-BUG-003` | `docs/probes/2026-11-03-p2-lane-tw-probes.md:112` |
| `tests/contracts/doc/upload.spec.ts:77, 92, 107, 142` (4 sites) | constant `PB_DOC_001` (line 12) = `PB-DOC-001: files.ts:56-57 answers 500 for any upload error (P-DOC-12, RR-UP)` | `PB-DOC-001` | `docs/probes/2026-11-02-p2-lane-documenso-probes.md:478` |
| `tests/contracts/tw/rest-oas.spec.ts:114` | `P2-TW-BUG-002: OAS 3.1.1 declares non-nullable fields that the live responses return as null` | `P2-TW-BUG-002` | `docs/probes/2026-11-03-p2-lane-tw-probes.md:95` |
| `tests/contracts/med/product-contract.spec.ts:140` | `P2-MED-CON-PRODUCT known product deviations: store responses omit keys the published contract requires (deviation register, class PRODUCT)` | `P2-MED-CON-PRODUCT` | **no probe record exists for this ID.** Evidence: the deviation register, `src/lanes/med/contract.ts:7`. This family is linked to code, not to a probe. |
| `tests/serial/doc/conversion.spec.ts:88` | constant `P5_CONV_001` (lines 16-17) = `P5-DOC-CONV-001: conversion outage answered 400, not 503 (hono-trpc-open-api.ts:27)` | `P5-DOC-CONV-001` | `docs/probes/2026-11-02-p2-lane-documenso-probes.md:526` (row B-39, CONV-002 live probe) |

Rule: the ID is the identifier that already appears in the description or in the record. No new ID is
invented. Where a record does not exist, the evidence says so.

### 2.4 Migration strings (one per executable call site)

These replace the 16 call sites in section 4.4. Each one parses under the rule in 4.4: the ID is the text
before the first colon, it matches `^[A-Za-z0-9][A-Za-z0-9-]*$`, and the evidence is not empty.

| File:line (base) | Replacement argument |
|---|---|
| `tests/webhooks/cal/cal-wh.spec.ts:379` | `"B2: a receiver 500 is acknowledged as success and never retried (docs/probes/2026-11-02-p2-lane-cal-live-probes.md:338)"` |
| `tests/contracts/cal/cal-con.spec.ts:39` | `"PB-CAL-OAS-1: GET /v2/slots 200 body does not validate against the committed OpenAPI (docs/probes/2026-11-02-p2-lane-cal-live-probes.md:325)"` |
| `tests/contracts/cal/cal-con.spec.ts:117` | `"PB-CAL-OAS-1: POST /v2/bookings 201 body does not validate against the committed OpenAPI (docs/probes/2026-11-02-p2-lane-cal-live-probes.md:325)"` |
| `tests/contracts/cal/cal-con-005.spec.ts:197` | `"PB-CAL-OAS-1: the 200 bodies of the crawled routes do not validate against the committed OpenAPI (docs/probes/2026-11-02-p2-lane-cal-live-probes.md:325)"` |
| `tests/serial/cal/cal-task.spec.ts:248` | `"B4: two concurrent tasker runs deliver each task twice (docs/probes/2026-11-02-p2-lane-cal-live-probes.md:346)"` |
| `tests/integration/tw/currency.spec.ts:97` | `"P2-TW-BUG-001: 9007199254740993 is accepted (201) and stored as 9007199254740992 (docs/probes/2026-11-03-p2-lane-tw-probes.md:77)"` |
| `tests/integration/tw/currency.spec.ts:184` | `"P2-TW-BUG-001: (GraphQL) 9007199254740993 is accepted and stored as 9007199254740992 (docs/probes/2026-11-03-p2-lane-tw-probes.md:77)"` |
| `tests/webhooks/doc/payload.spec.ts:85` | `"P5-DOC-TOK-002: every document payload carries every recipient's token (webhook-payload.ts:22-29, :84) (docs/probes/2026-11-02-p2-lane-documenso-probes.md:521)"` |
| `tests/webhooks/tw/b1-drop.spec.ts:101` | `"P2-TW-BUG-003: a webhook created after a delete misses the next event (docs/probes/2026-11-03-p2-lane-tw-probes.md:112)"` |
| `tests/contracts/doc/upload.spec.ts` (4 sites) | the existing constant `PB_DOC_001`, unchanged. Its text already holds the ID, colon and evidence. Record: `docs/probes/2026-11-02-p2-lane-documenso-probes.md:478`. |
| `tests/contracts/tw/rest-oas.spec.ts:114` | `"P2-TW-BUG-002: OAS 3.1.1 declares non-nullable fields that the live responses return as null (docs/probes/2026-11-03-p2-lane-tw-probes.md:95)"` |
| `tests/contracts/med/product-contract.spec.ts:140` | `"P2-MED-CON-PRODUCT: known product deviations: store responses omit keys the published contract requires (deviation register, class PRODUCT; src/lanes/med/contract.ts:7)"` |
| `tests/serial/doc/conversion.spec.ts:88` | the existing constant `P5_CONV_001`, unchanged. Record: `docs/probes/2026-11-02-p2-lane-documenso-probes.md:526`. |

Notes:

- The Medusa text is the review's exact replacement. The only change to the existing words is the colon after
  `P2-MED-CON-PRODUCT`. The ID is the one that already appears.
- The constants keep their text. Their evidence text is the constant itself. Migration audit K6 checks that
  each one parses, and the paths above are the records they cite.

### 2.5 Reference implementation (P6 and P1), read by line

P6 head read at `0533e61391b9a64159b32edbeddbbc8b39892997` in review.

| Reference | Takes from it |
|---|---|
| P6 `scripts/write-ci-job-summary.ts` (80 lines) | CLI shape: read the JSON, build markdown, print it, append to `$GITHUB_STEP_SUMMARY` (`:70-80`). Missing report: warning, exit 0 (`:47-50`). Zero-test or invalid report: exit 1 (`:52-56`, `:77-79`). |
| P6 `src/ci/playwright-json-summary.ts` (208 lines) | Parser `:93-150`; status mapping `:113-147` (`skipped`, `flaky`, `unexpected` = failed, `expected` with `expectedStatus=failed` = expected failure, `expected` = passed); the `issue` annotation read `:41-58`, `:130-141`; `issueIdFromDescription` `:35-39`; `requireTests` `:179-183`; `formatPlaywrightJobSummary` `:185-208`. |
| P6 `tests/unit/playwright-json-summary.test.ts` (207 lines) | Regressions the P2 module keeps: "counts passed, failed, flaky, expected failures and skipped" (`:101`); "does not list an expected failure that unexpectedly passed" (`:131`); "ignores annotations whose type is not issue" (`:191`); "rejects a non-object root" (`:195`); "requireTests throws on zero tests and names the path" (`:199`). The multi-report dedup test (`:184`) is not carried over, because the P2 CLI takes one report (4.3). |
| P1 `scripts/write-ci-job-summary.mts`, `src/core/playwright-json-summary.ts`, `.github/workflows/e2e.yml` `:256-261` | Same design. The summary step is `if: ${{ !cancelled() }}` with `timeout-minutes: 2`. |

### 2.6 Evidence still missing, and what settles it

| ID | Item | Settled by |
|---|---|---|
| V1 | Playwright's JSON reporter gives every test node `projectName` and the statuses P6 maps. | Probe A (section 4.6). The output is the parser fixture. |
| V2 | An `issue` annotation pushed mid-test survives a failed assertion in the JSON. | Probe A (`xfail` case). |
| V3 | `test.fail(true, description)` also writes a `fail` annotation. | Probe A (`xfail` case). |
| V4 | The invariant-sweep annotation, pushed after the body, reaches the JSON of a **real** lane. The synthetic probe proves only the reporter mechanics. | Evidence E6, on a real lane run, before merge. |
| V5 | The serial project passes alone, without the API project run earlier in the same job. | Evidence E4: a pre-merge serial-only run on a fresh harness-owned stack (section 5.6). |
| V6 | Dispatch and ref behaviour for a new workflow. | Section 5.6 states the documented behaviour. The post-merge run is E5. |
| V7 | Workflow YAML validity. | `actionlint`, pinned, section 9 step 13. Prettier and the string checker are not Actions validation. |
| V8 | The P2 module matches P6 on the regressions in 2.5. | Unit tests S7 to S10 (section 7.1). |

## 3. Decisions (one place, one rule)

### 3.1 Accepted (review recommendation accepted by the owner)

| ID | Decision | Consequence in this plan |
|---|---|---|
| OD-1 | The gate roll-up table is deferred to a later design. The current `gate` is a local bash/jq aggregation. | Not in this change. No `download-artifact` in `gate`. The gate's pass and fail logic does not change. |
| OD-2 | Migrate all 16 call sites in one change, with the lane-owned test files. Preserve assertion, setup, cleanup order and placement. | **Build may start only after the maintainer records approval** in the PR body or a comment (owner step 1, section 12). |
| OD-3 | Keep `B2` and `B4` as the defect IDs. Record the probe path and line beside them (2.3, 2.4). | No replacement IDs are created. |
| OD-4 | Include failing test titles on the summary, capped at 20, with a count of any omitted. Escape Markdown. | Section 4.3. |

### 3.2 Rule

Build starts when every decision in 3.1 has its recorded answer, and when owner step 1 (section 12) is done.
Nothing else is a precondition. This removes the earlier contradiction: revision 1 said OD approval came
"before build" in one place, "after green" in another, and "none blocks" in a third. OD-2 is the only
decision that gates a build.

## 4. Design A: run summary

### 4.1 What the summary shows (per lane job)

1. Heading `## P2 <label>: run summary`.
2. Per-project table: passed, failed, skipped, expected failures, flaky, and a total row.
3. Expected-failures table: test ID, title, defect ID, evidence. Only the `issue` annotation feeds it.
   A row with no ID or evidence shows `**NO DEFECT ID**` (the lint should prevent this).
4. Unexpected failures: titles only, capped at 20. When more exist, the summary says how many were omitted.
5. Invariant sweep: one line per product, `<product>: <N> rules, <V> violations (<T> tests swept)`. When the
   JSON has no sweep annotation at all, the section says `not reported`. It is never silently omitted.
6. Run link: `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`. Artifacts are at the
   foot of that page.

Markup safety: test titles and evidence are arbitrary text. The formatter turns newlines into spaces, escapes
`|`, and escapes `<` and `>`. Evidence prose is kept even when it contains a path. A link is added next to the
text, never in place of it.

### 4.2 Reporter isolation: per Playwright invocation

The isolation unit is **one Playwright invocation (one step)**. Each invocation writes one JSON file.

- One invocation can contain several projects. Cal runs `cal-api` and `cal-serial` in one command, so its one
  JSON file has two project rows. That is correct and intended.
- Separate jobs have separate runners and workspaces, so their JSON paths do not collide. Their artifact names
  must still stay distinct (the table below keeps every existing name).
- Two steps in one job must not share a path. The Documenso serial work moves to its own job (section 5), so no
  job has two Playwright steps that write to one file.

Change `playwright.config.ts`, in the CI reporter list (`:42-53`), between the JUnit and HTML entries:

```ts
        ["json", { outputFile: process.env["P2_JSON_FILE"] ?? "results/playwright.json" }],
```

| Workflow (job) | Invocation | `P2_JSON_FILE` | Summary label | Artifact (existing name) |
|---|---|---|---|---|
| `p2-cal.yml` (`cal-api`) | `--project=cal-api --project=cal-serial` (one step) | `results/playwright-cal.json` | `cal` | `cal-api-report` |
| `p2-doc.yml` (`doc-api`) | `--project=doc-api` | `results/playwright-doc-api.json` | `doc-api` | `p2-doc-api-results` |
| `p2-doc.yml` (`doc-billing-api`) | `--project=doc-billing-api` | `results/playwright-doc-billing.json` | `doc-billing` | `p2-doc-billing-results` |
| `p2-doc-serial.yml` (`doc-serial`) | `--project=doc-serial --no-deps` | `results/playwright-doc-serial.json` | `doc-serial` | `p2-doc-serial-results` (new) |
| `p2-med.yml` (`med-api`) | `--project=med-api` | `results/playwright-med.json` | `med` | `med-api-artifacts` |
| `p2-tw.yml` (`tw-api`) | `--project=tw-api --grep-invert "@multiws|@replicas"` | `results/playwright-tw-api.json` | `tw-api` | `tw-lane` |
| `p2-tw.yml` (`tw-multiws`) | `--project=tw-api --grep "@multiws"` | `results/playwright-tw-multiws.json` | `tw-multiws` | `tw-multiws` |
| `p2-tw.yml` (`tw-cache`) | `--project=tw-api --grep "@replicas"` | `results/playwright-tw-cache.json` | `tw-cache` | `tw-cache` |

Paths: Cal and Twenty list their paths explicitly, so each gets its JSON path added (4.5). Medusa and
Documenso upload the whole `results/` directory, so their JSON is already included.

### 4.3 The parser and the CLI (full skeletons)

**Decision (review, multi-report):** the CLI takes **one** report per call. Each invocation writes one file
(4.2), so there is nothing to merge. The CLI rejects any other argument count. The P6 dedup test is therefore
not carried over (2.5).

`src/ci/playwright-json-summary.ts` (new). A port of P6's module with P2 additions. It is pure: it takes parsed
JSON and returns data, and it has no file system access.

```ts
// Ported from https://github.com/Jayami123/k6-load-concurrency-suite, src/ci/playwright-json-summary.ts (P6),
// itself a port of the P1 module. P2 changes: per-project totals (projectName), invariant-sweep rows,
// unexpected-failure titles, markup escaping, fail-fast on unknown statuses, one report per call.
// Keep in sync by hand. erasableSyntaxOnly: no enums, no parameter properties, no namespaces.

export interface ProjectTotals {
  readonly project: string;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly expectedFailures: number;
  readonly flaky: number;
}

export interface ExpectedFailureRow {
  readonly testId: string; // "" when the title has no ID
  readonly title: string;
  readonly defectId: string; // "" when there is no issue annotation
  readonly evidence: string;
}

export interface SweepRow {
  readonly product: string;
  readonly rules: number;
  readonly violations: number;
  readonly tests: number;
}

export interface JobSummary {
  readonly label: string;
  readonly projects: readonly ProjectTotals[];
  readonly expectedFailures: readonly ExpectedFailureRow[];
  readonly unexpectedFailures: readonly string[];
  readonly sweeps: readonly SweepRow[] | undefined; // undefined = no sweep annotation in the report
}

const ISSUE = "issue";
const SWEEP = "invariant-sweep";
const KNOWN_STATUSES = ["expected", "unexpected", "flaky", "skipped"] as const;
const TEST_ID = /^(P[0-9]?-[A-Z0-9]+(?:-[A-Z0-9]+)+)/;
const SWEEP_TEXT = /^(.+?): (\d+) rules, (\d+) violations$/;
const LIST_CAP = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The description of the first annotation of this type, or undefined. Other types are ignored (P6 :191). */
export function annotationOf(annotations: unknown, type: string): string | undefined {
  if (!Array.isArray(annotations)) return undefined;
  for (const annotation of annotations) {
    if (!isRecord(annotation) || annotation["type"] !== type) continue;
    const description = annotation["description"];
    if (typeof description === "string" && description.trim() !== "") return description;
  }
  return undefined;
}

/** "B2: a receiver 500 ..." becomes { id: "B2", evidence: "a receiver 500 ..." }. */
export function splitDefect(description: string): { id: string; evidence: string } {
  const at = description.indexOf(":");
  if (at < 0) return { id: description.trim(), evidence: "" };
  return { id: description.slice(0, at).trim(), evidence: description.slice(at + 1).trim() };
}

interface Visited {
  readonly title: string;
  readonly project: string;
  readonly node: Record<string, unknown>;
}

function visit(suites: unknown, out: Visited[]): void {
  if (!Array.isArray(suites)) return;
  for (const suite of suites) {
    if (!isRecord(suite)) continue;
    if (Array.isArray(suite["specs"])) {
      for (const spec of suite["specs"]) {
        if (!isRecord(spec) || !Array.isArray(spec["tests"])) continue;
        for (const node of spec["tests"]) {
          if (!isRecord(node)) continue;
          const project = typeof node["projectName"] === "string" ? node["projectName"] : "(no project)";
          out.push({ title: typeof spec["title"] === "string" ? spec["title"] : "", project, node });
        }
      }
    }
    visit(suite["suites"], out);
  }
}

/** Throws (fail fast) on a non-object root or an unknown test status. */
export function parseJobReport(label: string, raw: unknown): JobSummary {
  if (!isRecord(raw)) throw new Error("Playwright JSON report root must be an object");
  const tests: Visited[] = [];
  visit(raw["suites"], tests);

  type Counts = { passed: number; failed: number; skipped: number; expectedFailures: number; flaky: number };
  const byProject = new Map<string, Counts>();
  const expectedFailures: ExpectedFailureRow[] = [];
  const unexpectedFailures: string[] = [];
  const sweeps = new Map<string, { rules: number; violations: number; tests: number }>();
  let sawSweep = false;

  for (const { title, project, node } of tests) {
    const counts: Counts = byProject.get(project) ?? { passed: 0, failed: 0, skipped: 0, expectedFailures: 0, flaky: 0 };
    const status = node["status"];
    if (typeof status !== "string" || !(KNOWN_STATUSES as readonly string[]).includes(status)) {
      throw new Error(`unsupported test status ${JSON.stringify(status)} for "${title}" in project ${project}`);
    }
    if (status === "skipped") counts.skipped += 1;
    else if (status === "flaky") counts.flaky += 1;
    else if (status === "unexpected") {
      counts.failed += 1;
      unexpectedFailures.push(title);
    } else if (node["expectedStatus"] === "failed") {
      counts.expectedFailures += 1;
      const defect = annotationOf(node["annotations"], ISSUE);
      const parts = defect === undefined ? { id: "", evidence: "" } : splitDefect(defect);
      expectedFailures.push({
        testId: TEST_ID.exec(title)?.[1] ?? "",
        title,
        defectId: parts.id,
        evidence: parts.evidence,
      });
    } else {
      counts.passed += 1;
    }
    byProject.set(project, counts);

    const sweep = annotationOf(node["annotations"], SWEEP);
    if (sweep !== undefined) {
      sawSweep = true;
      const match = SWEEP_TEXT.exec(sweep);
      if (match !== null) {
        const product = match[1] ?? "";
        const current = sweeps.get(product) ?? { rules: Number(match[2]), violations: 0, tests: 0 };
        current.violations += Number(match[3]);
        current.tests += 1;
        sweeps.set(product, current);
      }
    }
  }

  return {
    label,
    projects: [...byProject].map(([project, c]) => ({ project, ...c })),
    expectedFailures,
    unexpectedFailures,
    sweeps: sawSweep ? [...sweeps].map(([product, s]) => ({ product, ...s })) : undefined,
  };
}

/** Throws when the report ran no tests, naming the path (P6 :199). */
export function requireTests(summary: JobSummary, path: string): void {
  const total = summary.projects.reduce(
    (sum, p) => sum + p.passed + p.failed + p.skipped + p.expectedFailures + p.flaky,
    0,
  );
  if (total === 0) throw new Error(`${path} contains zero tests`);
}

/** Markdown table safety for arbitrary text (titles and evidence). */
export function escapeCell(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Evidence that names a docs/ path adds a commit-pinned link. The evidence text is always kept. */
export function evidenceCell(evidence: string, repo: string, sha: string): string {
  if (evidence === "") return "(none)";
  const text = escapeCell(evidence);
  const path = /(docs\/[\w./-]+?\.md)(?::(\d+))?/.exec(evidence);
  if (path === null) return text;
  const file = path[1] ?? "";
  const line = path[2] !== undefined ? `#L${path[2]}` : "";
  return `${text} ([${file}](https://github.com/${repo}/blob/${sha}/${file}${line}))`;
}

export function formatJobSummary(s: JobSummary, env: { repo: string; sha: string; runUrl: string }): string {
  const lines: string[] = [`## P2 ${s.label}: run summary`, ""];
  lines.push(
    "| project | passed | failed | skipped | expected failures | flaky |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  );
  const total = { passed: 0, failed: 0, skipped: 0, expectedFailures: 0, flaky: 0 };
  for (const row of s.projects) {
    lines.push(
      `| ${escapeCell(row.project)} | ${row.passed} | ${row.failed} | ${row.skipped} | ${row.expectedFailures} | ${row.flaky} |`,
    );
    total.passed += row.passed;
    total.failed += row.failed;
    total.skipped += row.skipped;
    total.expectedFailures += row.expectedFailures;
    total.flaky += row.flaky;
  }
  lines.push(
    `| **total** | **${total.passed}** | **${total.failed}** | **${total.skipped}** | **${total.expectedFailures}** | **${total.flaky}** |`,
    "",
  );

  if (s.expectedFailures.length > 0) {
    lines.push(
      "### Expected failures (known defects, still reproducing)",
      "",
      "| test ID | test | defect | evidence |",
      "| --- | --- | --- | --- |",
    );
    for (const row of s.expectedFailures) {
      const defect = row.defectId === "" ? "**NO DEFECT ID**" : escapeCell(row.defectId);
      lines.push(
        `| ${escapeCell(row.testId || "(no ID)")} | ${escapeCell(row.title)} | ${defect} | ${evidenceCell(row.evidence, env.repo, env.sha)} |`,
      );
    }
    lines.push("");
  } else {
    lines.push("Known defects still reproducing: none", "");
  }

  if (s.unexpectedFailures.length > 0) {
    lines.push("### Unexpected failures", "");
    for (const title of s.unexpectedFailures.slice(0, LIST_CAP)) lines.push(`- ${escapeCell(title)}`);
    const omitted = s.unexpectedFailures.length - LIST_CAP;
    if (omitted > 0) lines.push(`- ... and ${omitted} more (see the JUnit or the HTML report)`);
    lines.push("");
  }

  lines.push("### Invariant sweep", "");
  if (s.sweeps === undefined) {
    lines.push("Invariant sweep: not reported in this run's JSON (no sweep annotation found).", "");
  } else {
    for (const sweep of s.sweeps) {
      lines.push(
        `- ${escapeCell(sweep.product)}: ${sweep.rules} rules, ${sweep.violations} violations (${sweep.tests} tests swept)`,
      );
    }
    lines.push("");
  }

  lines.push(`Run page with the artifacts: ${env.runUrl}`, "");
  return lines.join("\n");
}
```

`scripts/write-ci-job-summary.ts` (new). Usage: `node scripts/write-ci-job-summary.ts <label> <report.json>`.

```ts
// P2 job summary for one Playwright invocation. Usage: node scripts/write-ci-job-summary.ts <label> <report.json>
// Prints the markdown and appends it to $GITHUB_STEP_SUMMARY when that is set. Exit codes:
//   0 = summary written, or the report is missing (a warning is printed and a placeholder is written)
//   1 = wrong argument count, unreadable JSON, unsupported shape, or zero tests (named on stderr)
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { formatJobSummary, parseJobReport, requireTests } from "../src/ci/playwright-json-summary.ts";

const args = process.argv.slice(2);
const env = process.env;
const repo = env["GITHUB_REPOSITORY"] ?? "";
const runUrl = `${env["GITHUB_SERVER_URL"] ?? "https://github.com"}/${repo}/actions/runs/${env["GITHUB_RUN_ID"] ?? ""}`;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (args.length !== 2) fail("usage: write-ci-job-summary.ts <label> <report.json>");
const [label, path] = args as [string, string];

let markdown: string;
if (!existsSync(path)) {
  process.stdout.write(`::warning::No Playwright JSON report at ${path} for ${label}; the job summary is incomplete.\n`);
  markdown = `## P2 ${label}: run summary\n\nNo Playwright JSON report was written, so the results table is not available.\n\nRun page with the artifacts: ${runUrl}\n`;
} else {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    fail(`${path} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  try {
    const summary = parseJobReport(label, raw);
    requireTests(summary, path);
    markdown = formatJobSummary(summary, { repo, sha: env["GITHUB_SHA"] ?? "", runUrl });
  } catch (error: unknown) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

process.stdout.write(markdown);
if (env["GITHUB_STEP_SUMMARY"]) appendFileSync(env["GITHUB_STEP_SUMMARY"], markdown, "utf8");
```

Notes:

- `process.exit` after the stderr write keeps the message. The `never` return type lets TypeScript narrow `raw`
  and `markdown` after the calls.
- Runtime: the step runs under the repository's Node (>=22.22.0, section 13), the same floor as the repository.
- Boundary: the summary runs after the tests, so it needs the checkout and the runtime to exist. A failure
  before the tests can leave no report, which the warning path covers. A whole-job timeout or a lost runner can
  stop the summary step from running at all. `!cancelled()` does not cover those cases.

### 4.4 The `expectedDefect` helper, the AST guard and the migration

`src/ci/known-defect.ts` (new). It is the only file that may call `test.fail` directly.

```ts
import { test } from "@playwright/test";

/**
 * Marks the running test as an expected failure of a known defect. The description is "ID: evidence": the text
 * before the first colon is the defect ID and the rest is the evidence (a probe path and line). It pushes the
 * `issue` annotation the summary reads, then calls Playwright's own test.fail(true, description), so the expected
 * failure behaves exactly as the call it replaces. Call it where the bare test.fail() stood: after the setup and
 * cleanup asserts, right before the assertion that is expected to fail.
 */
export function expectedDefect(description: string): void {
  const parsed = parseDefectDescription(description);
  test.info().annotations.push({ type: "issue", description: `${parsed.id}: ${parsed.evidence}` });
  test.fail(true, description);
}

/** Pure, unit-tested. Throws unless the ID rule and the evidence rule hold. */
export function parseDefectDescription(description: string): { id: string; evidence: string } {
  const at = description.indexOf(":");
  const id = at < 0 ? "" : description.slice(0, at).trim();
  const evidence = at < 0 ? "" : description.slice(at + 1).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(id)) {
    throw new Error(`defect description must start with an ID (letters, digits, hyphens) then a colon: ${JSON.stringify(description)}`);
  }
  if (evidence === "") throw new Error(`defect ${id} has no evidence after the colon`);
  return { id, evidence };
}
```

**The guard (review, syntax-aware).** `src/ci/known-defect-guard.ts` (new) is used only by the unit test. It
uses the TypeScript compiler API (`typescript` 6.0.3 is already a dev dependency). It does not match text:

1. Parses each `.ts` file under `tests/`, `src/`, `scripts/`, and `playwright.config.ts` with `ts.createSourceFile`.
2. Finds the local names that refer to Playwright's `test`: a named import `test`, an alias (`test as t`), and the
   namespace form `ns.test` for `import * as ns from "@playwright/test"`.
3. Reports every property access `<name>.fail` where `<name>` is one of those names, whether it is called or only
   referenced, and including `.fail.only`. The parser handles whitespace, line breaks between tokens and `?.`.
4. Comments and string literals are not code nodes, so they never match. The guard's own fixtures are strings.
5. Exempts exactly one file: `src/ci/known-defect.ts`.

Diagnostic format (fixed, so the red state can be checked):
`<path>:<line>: direct test.fail use; call expectedDefect("<ID>: <evidence>") instead`.

**Migration (one atomic change, OD-2).** Replace the 16 call sites with the strings in 2.4. Remove a
`test.fail` import only when it becomes unused. Add `import { expectedDefect } from "<relative path>/src/ci/known-defect.ts";`
(the relative depth differs per file; `tsc` checks it). Assertions, setup, cleanup, loop structure and the
placement of each call do not change.

### 4.5 Lane wiring (exact patches)

For every lane step that runs Playwright, the command stays exactly as it is. The step gains `P2_JSON_FILE` in
its `env`. A summary step goes after the test step and any leak check, and before the upload. Each budget is a
comment on its own line before the scalar (review blocker 3). Section 5 covers Documenso.

**Cal (`.github/workflows/p2-cal.yml`).** The step "Lane tests (cal-api, then cal-serial)" (`:92-99`) becomes:

```yaml
      - name: Lane tests (cal-api, then cal-serial)
        timeout-minutes: 10
        env:
          STRIPE_API_KEY: ${{ secrets.STRIPE_API_KEY }}
          P2_JSON_FILE: results/playwright-cal.json
        run: |
          set -euo pipefail
          mkdir -p results
          npx playwright test --project=cal-api --project=cal-serial
```

(`STRIPE_API_KEY` is already in that step's env today. The only addition is `P2_JSON_FILE`.)

After "Lane leak check" (`:100-103`) and before "Upload report, JUnit and receiver and fixture logs" (`:104`):

```yaml
      - name: Job summary (cal)
        if: ${{ !cancelled() }}
        # SUMMARY_STEP basis: P1 e2e.yml:256-261 gives its job-summary step the same 2-minute budget.
        timeout-minutes: 2
        run: |
          set -euo pipefail
          node scripts/write-ci-job-summary.ts "cal" results/playwright-cal.json
```

The upload's `path:` list (`:109-114`) gains one line, `results/playwright-cal.json`, after `results/junit.xml`.
The artifact name `cal-api-report` does not change.

**Medusa (`.github/workflows/p2-med.yml`).** The job-level `env:` (`:23-24`) gains
`P2_JSON_FILE: results/playwright-med.json`. The step "Run the lane (med-api)" (`:121-125`) keeps its command.
After it, and before "Upload the report, junit and logs" (`:127`):

```yaml
      - name: Job summary (med)
        if: ${{ !cancelled() }}
        # SUMMARY_STEP basis: P1 e2e.yml:256-261, 2 minutes.
        timeout-minutes: 2
        run: |
          set -euo pipefail
          node scripts/write-ci-job-summary.ts "med" results/playwright-med.json
```

No path is added: the upload already includes `results/`. The step's `node` is the job's Node, from `setup-node`
with `.nvmrc` (`:33-35`).

**Twenty (`.github/workflows/p2-tw.yml`), three jobs.** Each job's run step gains `P2_JSON_FILE`. Its summary
step goes between the run step and its upload. Its upload `path:` gains its JSON line. The Node is the job's
`setup-node` with `.nvmrc` (`:45-50`).

| Job | Run step (command unchanged) | Add to its `env` | Summary label | Add to upload `path:` |
|---|---|---|---|---|
| `tw-api` | "Run the lane (tw-api)" (`:73-75`) | `P2_JSON_FILE: results/playwright-tw-api.json` | `tw-api` | `results/playwright-tw-api.json` (after `results/junit.xml`, `:83`) |
| `tw-multiws` | "Run the @multiws cases (WH-009)" (`:144-146`) | `P2_JSON_FILE: results/playwright-tw-multiws.json` | `tw-multiws` | `results/playwright-tw-multiws.json` (after `:154`) |
| `tw-cache` | "Run the @replicas cases (CACHE-001)" (`:209-211`) | `P2_JSON_FILE: results/playwright-tw-cache.json` | `tw-cache` | `results/playwright-tw-cache.json` (after `:219`) |

The summary step for `tw-api` (the other two change only the label and the path):

```yaml
      - name: Job summary (tw-api)
        if: ${{ !cancelled() }}
        # SUMMARY_STEP basis: P1 e2e.yml:256-261, 2 minutes.
        timeout-minutes: 2
        run: |
          set -euo pipefail
          node scripts/write-ci-job-summary.ts "tw-api" results/playwright-tw-api.json
```

The artifact names `tw-lane`, `tw-multiws` and `tw-cache` do not change. Each job runs on its own runner, so the
three JSON paths never collide.

**Documenso.** API and billing: section 5.2. Serial: section 5.3.

**Checks for every edited lane file:** `actionlint` (section 9 step 13) and `npx prettier --check .github/workflows/`.
The lane's leak checks, teardown and `always()` ordering are kept. A summary step never runs before a leak check
or a teardown in its job.

### 4.6 Probe A: the Playwright contract, before any implementation

The probe runs first (section 9 step 2). It never touches `tests/`, `playwright.config.ts` or a product. It
lives under `scratch/`. `scratch/` is not git-ignored, so the build adds `scratch/` to the **local**
`.git/info/exclude` (never committed). It removes only the explicit probe folder.

```bash
set -euo pipefail
node --version                                  # must print v22.22.0 or later
echo "scratch/" >> .git/info/exclude             # local exclude only; not committed
PROBE_DIR="scratch/p2-summary-probe"            # fixed path; the only folder removed afterwards
mkdir -p "$PROBE_DIR"
```

`scratch/p2-summary-probe/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "contract.spec.ts",
  workers: 1,
  retries: 1,
  reporter: [["json", { outputFile: process.env["PROBE_REPORT"] }]],
  projects: [{ name: "summary-probe" }],
});
```

`scratch/p2-summary-probe/contract.spec.ts`. It covers the statuses and annotation types the parser reads:

```ts
import { test as base, expect } from "@playwright/test";

// An auto fixture that pushes an annotation after use(), as src/invariants/fixture.ts does (V4 mechanics).
const test = base.extend<{ sweepProbe: void }>({
  sweepProbe: [
    async ({}, use, testInfo) => {
      await use();
      testInfo.annotations.push({ type: "invariant-sweep", description: "probe: 2 rules, 0 violations" });
    },
    { auto: true },
  ],
});

test("pass", () => expect(1).toBe(1));

test("xfail", () => {
  test.info().annotations.push({ type: "issue", description: "PROBE-ONLY: scratch reporter check" });
  test.fail(true, "PROBE-ONLY: scratch reporter check");
  expect(1).toBe(2);
});

test("unexpected-pass", () => {
  test.fail(true, "PROBE-ONLY: unexpected pass");
});

test("ordinary-failure", () => expect(1).toBe(2));

test.skip("skipped", () => {});

test("flaky", () => expect(test.info().retry).toBe(1));
```

Run it and check the JSON. The runner exits 1 on purpose (`ordinary-failure` and `unexpected-pass` are red).
Nothing else may be red. Paths are relative to the repository root:

```bash
set +e
PROBE_REPORT="$PWD/$PROBE_DIR/report.json" npx playwright test --config="$PROBE_DIR/playwright.config.ts"
probe_rc=$?
set -e
test "$probe_rc" -eq 1                          # exactly the two deliberate reds
PROBE_DIR="$PROBE_DIR" node --input-type=module -e '
import fs from "node:fs";
import assert from "node:assert/strict";
const raw = JSON.parse(fs.readFileSync(process.env.PROBE_DIR + "/report.json", "utf8"));
const tests = [];
const visit = (suites) => { for (const s of suites ?? []) { for (const spec of s.specs ?? []) for (const t of spec.tests ?? []) tests.push({ title: spec.title, ...t }); visit(s.suites); } };
visit(raw.suites);
const by = new Map(tests.map((t) => [t.title, t]));
for (const t of tests) assert.equal(t.projectName, "summary-probe");
const want = { pass: "expected", xfail: "expected", "unexpected-pass": "unexpected", "ordinary-failure": "unexpected", skipped: "skipped", flaky: "flaky" };
for (const [title, status] of Object.entries(want)) assert.equal(by.get(title)?.status, status, title);
const x = by.get("xfail");
assert.equal(x.expectedStatus, "failed");
assert.ok(x.annotations.some((a) => a.type === "issue"));
assert.ok(x.annotations.some((a) => a.type === "fail"));
assert.ok(x.annotations.some((a) => a.type === "invariant-sweep"));
console.log(JSON.stringify(tests, null, 2));
'
```

Expected: the runner exits 1, the Node assertions exit 0, and the printed JSON is the parser fixture. If the shape
differs, keep the real JSON as evidence and stop (section 14, S2). Do not guess the shape.

After the helper exists (section 9 step 5), rerun the probe with `test.fail(true, …)` replaced by
`expectedDefect("PROBE-ONLY: scratch reporter check")` (imported from `../../src/ci/known-defect.ts`), with the
same assertions. Then remove the probe folder by its explicit path: `rm -rf scratch/p2-summary-probe`. That is the
only removal. No glob.

## 5. Design B: the Documenso serial project moves to a nightly

### 5.1 Why

The PR gate waits for its slowest lane. The Documenso job waits for 29 min of serial work, which includes
cron-tick reminders (`tests/serial/doc/reminders.spec.ts`). A PR that touches doc paths pays that cost every
time. Serial belongs on a schedule and on demand. Section 2.2 gives the measured numbers.

### 5.2 `.github/workflows/p2-doc.yml` (changed parts)

1. Header comment (`:1-11`): rewrite it. The PR path runs the API and billing jobs; the serial project runs in
   `p2-doc-serial.yml` on a schedule and on manual dispatch. Keep the Node 22 and Node 24 paragraph and the
   `workflow_call` paragraph.
2. Job `doc-api` name (`:40`) becomes `doc-api`. Its job budget (`:44`), with the comment on the line before:

```yaml
    # DOC_API_JOB basis: 8 min 44 s without serial (run 42081000668; a subtraction, not a separate job).
    # 30 min matches the cal lane budget (p2-cal.yml). It is not a promise of the future duration.
    timeout-minutes: 30
```

3. The API step (`:110-115`) keeps its command and gains an env and a summary step:

```yaml
      - name: API project
        # DOC_API_STEP basis: 2 min 51 s measured (run 42081000668), about 5x headroom.
        timeout-minutes: 15
        env:
          P2_JSON_FILE: results/playwright-doc-api.json
        run: |
          "$NODE22" node_modules/@playwright/test/cli.js test --project=doc-api

      - name: Job summary (doc-api)
        if: ${{ !cancelled() }}
        # SUMMARY_STEP basis: P1 e2e.yml:256-261, 2 minutes.
        timeout-minutes: 2
        run: |
          "$NODE22" scripts/write-ci-job-summary.ts "doc-api" results/playwright-doc-api.json
```

4. Delete the serial step (`:117-125`, starting at the comment `# The serial project depends on doc-api ...`).
5. Results upload (`:138-144`): remove the `playwright-report-serial/` line. The `results/` line already covers the JSON.
6. Job `doc-billing-api`: its billing project step (`:238-244`) gains
   `P2_JSON_FILE: results/playwright-doc-billing.json`. A summary step with label `doc-billing` goes between that
   step and its Results upload (`:251`), with the same `!cancelled()` condition, the 2-minute comment and budget.
7. The doc guard (`:41`) and the billing guard are unchanged, and so are the `secrets` inherit rules.

"Doc-api only" in this plan means "no `doc-serial`". It does not mean "no billing". The billing job stays on the PR path.

### 5.3 `.github/workflows/p2-doc-serial.yml` (new; full skeleton with the real source blocks)

Each source block below is copied from the base at `47c507e`, `.github/workflows/p2-doc.yml`. The line numbers in
the comments name the source. Copy the blocks character for character. Do not write them from memory. Check W5
(section 7.3) rejects a placeholder.

```yaml
# P2 documenso serial project (cron-tick reminders, sweeps). Owned by the documenso lane (docs/lane-ownership.md).
# Not called by ci.yml: this file never runs on a pull request. It runs on a schedule (02:37 UTC, which is 08:07 in
# Asia/Colombo, daily) and on manual dispatch. The PR path runs the API and billing jobs only (p2-doc.yml).
# Why separate: the serial project waits for quarter-hour cron ticks (tests/serial/doc/reminders.spec.ts) and took
# 29 min 07 s in run 42081000668. Keeping it on every PR made the doc lane the critical path.
# Same stack, Node split and harness rules as p2-doc.yml. Serial runs with --no-deps, deliberately: it does not run
# the API project first in this job (section 5.6 has the proof that it passes alone).
name: p2-doc-serial

on:
  schedule:
    - cron: "37 2 * * *" # RD-7: 02:37 UTC = 08:07 Asia/Colombo, outside the tw-study window (Mon 05:17 UTC).
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: p2-doc-serial-${{ github.ref }}
  cancel-in-progress: false # Matches tw-study.yml: a scheduled run is never cancelled by a later one.

defaults:
  run:
    shell: bash

env:
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
  DOCUMENSO_GOTENBERG: "1"
  NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS: "p2-receiver.test"
  PRODUCTS_ROOT: ${{ github.workspace }}/../products

jobs:
  doc-serial:
    name: doc-serial
    runs-on: ubuntu-24.04
    # DOC_SERIAL_JOB basis: 37 min 51 s for the whole job in run 42081000668. 90 min is about 2.4x that, for the cron wait.
    timeout-minutes: 90
    steps:
      - name: Checkout the commit under test
        timeout-minutes: 5
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      # Source: p2-doc.yml:52-60 (Node 22 and the pin).
      - name: Node 22 for the repository (install, tests)
        timeout-minutes: 5
        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Pin the Node 22 path
        timeout-minutes: 5
        run: echo "NODE22=$(command -v node)" >> "$GITHUB_ENV"

      # Source: p2-doc.yml:62-72 (PDF tools; the checks at the end are required and must stay).
      - name: PDF tools for the signature checks (pdfsig, pdftotext)
        timeout-minutes: 10
        run: |
          set -euo pipefail
          if ! command -v pdfsig >/dev/null || ! command -v pdftotext >/dev/null; then
            sudo apt-get update
            sudo apt-get install -y poppler-utils
          fi
          command -v pdfsig
          command -v pdftotext

      # Source: p2-doc.yml:73-75.
      - name: Install locked dependencies
        timeout-minutes: 10
        run: npm ci

      # Source: p2-doc.yml:77-84.
      - name: Node 24 for the harness (up and down)
        timeout-minutes: 5
        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 24
      - name: Pin the Node 24 path
        timeout-minutes: 5
        run: echo "NODE24=$(command -v node)" >> "$GITHUB_ENV"

      # Source: p2-doc.yml:86-91 (the env block is kept: it names the product and the Node 24 path).
      - name: Clone the pinned Documenso fork and install its dependencies
        timeout-minutes: 30
        env:
          P2_BOOTSTRAP_PRODUCTS: documenso
          NODE24: ${{ env.NODE24 }}
        run: bash scripts/bootstrap.sh documenso

      # Source: p2-doc.yml:93-95.
      - name: Receiver hostname in the hosts file
        timeout-minutes: 2
        run: bash scripts/ensure-receiver-hostname.sh

      # Source: p2-doc.yml:97-99.
      - name: Read-only and fixture database passwords (generated for this job)
        timeout-minutes: 2
        run: bash scripts/qa-passwords.sh

      # Source: p2-doc.yml:101-103.
      - name: Start the Documenso stack (harness v0.3.1)
        timeout-minutes: 30
        run: timeout 1500 "$NODE24" node_modules/qa-portfolio-harness/scripts/up.mjs documenso

      # Source: p2-doc.yml:105-108 (role provisioning; the command is required).
      - name: Provision the read-only and fixture roles
        timeout-minutes: 5
        run: |
          "$NODE22" scripts/db-roles.ts provision documenso

      # The serial project, alone. Source: p2-doc.yml:117-125 (its `always()` moves to the stop and results steps).
      - name: Serial project (cron ticks and sweeps; --no-deps, runs alone)
        # SERIAL_STEP basis: 29 min 07 s measured (run 42081000668); 60 min is about 2x, unchanged from p2-doc.yml.
        timeout-minutes: 60
        env:
          P2_JSON_FILE: results/playwright-doc-serial.json
          P2_JUNIT_FILE: results/junit-serial.xml
          P2_HTML_DIR: playwright-report-serial
        run: |
          "$NODE22" node_modules/@playwright/test/cli.js test --project=doc-serial --no-deps

      - name: Job summary (doc-serial)
        if: ${{ !cancelled() }}
        # SUMMARY_STEP basis: P1 e2e.yml:256-261, 2 minutes.
        timeout-minutes: 2
        run: |
          "$NODE22" scripts/write-ci-job-summary.ts "doc-serial" results/playwright-doc-serial.json

      # Source: p2-doc.yml:127-131 (stop the stack on every outcome).
      - name: Stop the stack (always)
        if: ${{ always() }}
        timeout-minutes: 10
        run: |
          "$NODE24" node_modules/qa-portfolio-harness/scripts/down.mjs documenso

      - name: Results (JUnit, HTML and JSON)
        if: ${{ always() }}
        timeout-minutes: 5
        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: p2-doc-serial-results
          path: |
            results/
            playwright-report-serial/
          if-no-files-found: ignore
          retention-days: 7
```

Notes:

- Every `timeout-minutes` budget has its named comment on the line before it, so the checker reads it (W6).
- The serial file has no `if:` and no same-repo guard. It never runs on a PR, so a PR guard would only skip a schedule.
- The serial file has no `secrets` (the billing secret is in the billing job only), and no `workflow_call`.
- Before the build, the source line ranges above are re-checked against the base at the build's `origin/main`.
  A mismatch stops the build (S1). It is not silently re-copied.

### 5.4 `scripts/ci-changes.sh` and `docs/lane-ownership.md`

- `scripts/ci-changes.sh` (`re_doc`, line 11): add `\.github/workflows/p2-doc-serial\.yml$`. A PR that
  changes the serial file counts as a doc change, and the PR path runs the doc jobs (never the serial file).
  Test G15 (section 7.3) pins it.
- `docs/lane-ownership.md`: the Documenso row names `.github/workflows/p2-doc.yml`. Add
  `.github/workflows/p2-doc-serial.yml`. In the gate section, add one sentence: "`p2-doc-serial.yml` runs on a
  schedule and on manual dispatch, and `ci.yml` never calls it."

### 5.5 Why the PR gate still covers doc

`ci.yml` is unchanged. The `p2-doc` caller still runs when the doc flag is true. That run now contains the doc
API and billing jobs and no serial step. `gate` still requires `p2-doc` when its flag is true (CI gate plan,
section 4.5). Billing coverage stays on the PR path.

### 5.6 Serial proof and post-merge policy

What GitHub does, stated precisely (review blocker 6):

- A new workflow file must exist on the default branch before GitHub lists it for `workflow_dispatch`. Once it is
  listed, a manual run can select another branch or ref through the branch selector (`--ref`).
- A `schedule` always runs from the default branch.
- `--no-deps` skips Playwright's dependency project. It does not show that no state from an earlier invocation
  remains in the database. Only running the serial project on its own shows that.

Preferred: a **pre-merge serial-only proof** (V5, evidence E4). It needs no dispatch and no schedule.

1. On the build branch, add one throwaway commit to `p2-doc.yml`. It adds a job `doc-serial-proof` whose only
   product step is the serial command, with the same runtime and harness steps as `p2-doc-serial.yml` (copied
   from there) and no API step. Subject: `ci: throwaway serial-only proof (revert before merge)`.
2. Push. The PR run executes that job on a fresh harness stack. Record its URL, its conclusion, its summary, and
   its teardown result (E4).
3. Revert it with a normal commit: `git revert --no-commit <sha>`, then
   `git commit -m "revert: drop the throwaway serial-only proof"`. Never force-push. Confirm the revert before merge.

Fallback, only if the maintainer accepts the risk in writing (owner step 4): the first serial-alone run is the
post-merge dispatch (E5). The closeout stays **incomplete** until E5 passes. Post-merge failure policy (this
replaces the old S3, which could not occur in the order it stated):

- A failing nightly stays red. It is reported, not hidden.
- Sessions do not edit tests, do not restore or remove coverage, and do not dispatch anything.
- The maintainer decides the repair, as a new change through the normal PR path.

## 6. Summary of file changes (the build's exact list)

| Path | Change | Section |
|---|---|---|
| `playwright.config.ts` | JSON reporter with `P2_JSON_FILE` | 4.2 |
| `src/ci/playwright-json-summary.ts` | new | 4.3 |
| `src/ci/known-defect.ts` | new | 4.4 |
| `src/ci/known-defect-guard.ts` | new (the AST scanner, used by the unit test only) | 4.4 |
| `scripts/write-ci-job-summary.ts` | new | 4.3 |
| `scripts/ci-changes.sh` | add the serial file to `re_doc` | 5.4 |
| `.github/workflows/p2-cal.yml` | env, summary step, one upload path line | 4.5 |
| `.github/workflows/p2-med.yml` | job env, summary step | 4.5 |
| `.github/workflows/p2-tw.yml` | three jobs: env, summary step, one upload path line each | 4.5 |
| `.github/workflows/p2-doc.yml` | serial removed, summary step, JSON env, name, budgets | 5.2 |
| `.github/workflows/p2-doc-serial.yml` | new | 5.3 |
| `tests/unit/ci/workflow.test.ts` | schedule-only set, new W tests, G15 | 7.3 |
| `tests/unit/ci/job-summary.test.ts` | new | 7.1 |
| `tests/unit/ci/known-defect.test.ts` | new | 7.2 |
| `tests/unit/ci/fixtures/` (one JSON file from probe A) | new | 9 step 2 |
| `tests/unit/lanes/doc/ci.test.ts` | assertions moved to the serial file | 7.4 |
| `tests/integration/tw/currency.spec.ts` | two call sites | 2.4 |
| `tests/webhooks/doc/payload.spec.ts` | one | 2.4 |
| `tests/webhooks/tw/b1-drop.spec.ts` | one (line 60 is a comment and stays) | 2.4 |
| `tests/webhooks/cal/cal-wh.spec.ts` | one | 2.4 |
| `tests/contracts/doc/upload.spec.ts` | four (the constant is unchanged; the call changes) | 2.4 |
| `tests/contracts/tw/rest-oas.spec.ts` | one | 2.4 |
| `tests/contracts/cal/cal-con.spec.ts` | two | 2.4 |
| `tests/contracts/cal/cal-con-005.spec.ts` | one | 2.4 |
| `tests/contracts/med/product-contract.spec.ts` | one | 2.4 |
| `tests/serial/doc/conversion.spec.ts` | one | 2.4 |
| `tests/serial/cal/cal-task.spec.ts` | one | 2.4 |
| `docs/lane-ownership.md` | the Documenso row and one gate sentence | 5.4 |

**Documentation set (review nit):** the only documentation the build changes is `docs/lane-ownership.md`. This
plan file is the design record and is not part of the build PR. Revision 1 said "two docs"; that was wrong, and
this table is the authority.

Nothing else changes: `ci.yml`, `api.yml`, `env-check.yml`, `tw-study.yml`, `package.json`, `package-lock.json`,
the harness, `.env*`, the product forks.

## 7. Unit tests (exact list, names and counts)

Baseline on `origin/main` at `47c507e`: whole run `# tests 572`, `# pass 572`. `tests/unit/ci/workflow.test.ts`:
`# tests 62`. The build records its own measured numbers.

Predicted after the change (arithmetic, not a claim): new tests are 20 (job-summary) + 6 (known-defect) + 6 (workflow) =
**32**. Whole run **604** (572 + 32). `workflow.test.ts` **68** (62 + 6). The Documenso test file keeps its count
(its assertions move; none are added).

### 7.1 `tests/unit/ci/job-summary.test.ts` (new, 20 tests)

S1 to S16 call the module with in-memory fixtures. S17 to S20 run the real script
(`scripts/write-ci-job-summary.ts`) with `spawnSync` and real temporary files. The file is therefore not "pure";
the subprocess tests are the file-system coverage the review asked for.

| # | Test | Assertion |
|---|---|---|
| S1 | per-project totals come from `projectName` | a fixture with `cal-api` and `cal-serial` gives two project rows with the right counts |
| S2 | the defect ID and evidence come from the `issue` annotation | `splitDefect("B2: a receiver 500 …")` gives `id: "B2"` and the evidence text |
| S3 | a bare expected failure is listed with an empty defect and `**NO DEFECT ID**` | an expected failure with no `issue` annotation: `defectId === ""`, and the markdown contains `**NO DEFECT ID**` |
| S4 | the invariant sweep aggregates per product | three `invariant-sweep` annotations for `cal`: `tests: 3` and the violations summed |
| S5 | unexpected tests count as failed and are listed by title | one unexpected node: `failed: 1`, its title listed |
| S6 | flaky and skipped count, and neither counts as passed | one of each: `flaky: 1`, `skipped: 1`, `passed: 0` |
| S7 | an expected failure that unexpectedly passed is not listed (P6 `:131`) | a `status: expected` node with `expectedStatus: passed` is absent from the expected-failures table |
| S8 | annotations of another type are ignored (P6 `:191`) | a `fail` annotation with a description is not read as an `issue` |
| S9 | a non-object root is rejected (P6 `:195`) | `parseJobReport("x", [])` throws |
| S10 | zero tests is rejected and the message names the path (P6 `:199`) | `requireTests` on an empty summary throws `contains zero tests`, naming the path |
| S11 | an unsupported status fails fast with its name | status `"weird"` throws, naming the status and the test |
| S12 | markup in titles and evidence is escaped | a title with `|`, a newline and `<b>` renders as `\|`, a space and `&lt;b&gt;` |
| S13 | a `docs/` path in evidence adds a commit-pinned link and keeps the text | `evidenceCell("x docs/a.md:5", "o/r", "abc")` contains the text and `https://github.com/o/r/blob/abc/docs/a.md#L5` |
| S14 | prose evidence stays prose | `evidenceCell("product bug", …)` equals `product bug` |
| S15 | a missing sweep annotation is reported as not reported | a report with no sweep annotation: the markdown contains `not reported` |
| S16 | the title list truncates at 20 and says how many were omitted | 23 unexpected failures: 20 bullets and `... and 3 more` |
| S17 | the CLI with the wrong argument count exits 1 with usage | `spawnSync` with three arguments: status 1, stderr contains `usage:` |
| S18 | the CLI with malformed JSON exits 1 and names the file | a temporary file containing `{`: status 1, stderr names the file |
| S19 | the CLI with a missing report exits 0, warns, and writes the placeholder | status 0, stdout contains `::warning::` and `No Playwright JSON report` |
| S20 | the CLI appends to `GITHUB_STEP_SUMMARY` when it is set, and does not when it is unset | set: the file gains the markdown; unset: no file is created |

S1 to S16 use a fixture taken from probe A's printed JSON (9 step 2), stored under `tests/unit/ci/fixtures/`.

### 7.2 `tests/unit/ci/known-defect.test.ts` (new, 6 tests)

| # | Test | Assertion |
|---|---|---|
| K1 | no direct `test.fail` use in any product or test file | the guard finds nothing in `tests/`, `src/`, `scripts/` and `playwright.config.ts`, except `src/ci/known-defect.ts`. Failure output: `<path>:<line>: direct test.fail use; call expectedDefect("<ID>: <evidence>") instead`. Red until the migration (9 step 6). |
| K2 | the guard catches whitespace and multi-line calls | in-memory sources: `test.fail (true, "x")` and a `test.fail(` call split across lines are found; the guard's own fixture strings are not |
| K3 | the guard ignores comments and string literals | `// test.fail(true, "x")` and `const s = "test.fail(true)"` are not found |
| K4 | the guard follows aliases and the namespace form | `import { test as t }` then `t.fail()` is found; `import * as ns` then `ns.test.fail()` is found |
| K5 | the `parseDefectDescription` rules | `"P2-MED-CON-PRODUCT: known …"` parses to `P2-MED-CON-PRODUCT`; `"P2-MED-CON-PRODUCT known …"` (no colon) throws; `"B2:"` (no evidence) throws; `"B2: text"` gives `{id: "B2", evidence: "text"}` |
| K6 | migration audit: every `expectedDefect` argument in `tests/` parses | each argument is a string literal, or an identifier bound to a string-literal `const` in the same file; the resolved string passes K5 |

### 7.3 `tests/unit/ci/workflow.test.ts` (6 new tests; existing assertions updated)

Checker changes first (review blocker 3):

- A **schedule-only set** is defined once: `const SCHEDULE_ONLY = ["tw-study.yml", "p2-doc-serial.yml"]`. The
  trigger rule uses it: a schedule-only file may have `schedule` and `workflow_dispatch`. The callable-only test
  (today it requires `workflow_call` on every lane except `tw-study.yml`) excludes the same set, so
  `p2-doc-serial.yml` is not required to be callable. The serial file must **not** have `workflow_call`, and it
  must not carry a copied PR guard. Adding the file to the `lanes` array alone would fail the callable-only test,
  which is why the set is defined first.
- Timeouts: every named budget is a comment on the line before its scalar. The existing regexes match the scalar
  line and keep working. No regex is weakened.

| # | Test | Assertion |
|---|---|---|
| W1 | (changed) the trigger and callable rules use the schedule-only set | `p2-doc-serial.yml` is accepted with `schedule` and `workflow_dispatch`, and is not required to be callable |
| W2 | new: the serial file's triggers are exactly `schedule` and `workflow_dispatch`, with cron `37 2 * * *` | `triggersOf` equals both, and the cron line matches exactly |
| W3 | new: the serial file has no `workflow_call`, `pull_request`, `secrets` or PR guard | none of these texts occur |
| W4 | new: `ci.yml` does not call the serial file | `ci.yml` does not contain `p2-doc-serial.yml` |
| W5 | new: the serial file contains the required source commands and no placeholder | it contains `command -v pdfsig`, `db-roles.ts provision documenso`, and `--project=doc-serial --no-deps`; no line is `true` alone and none contains `TODO` |
| W6 | new: every named budget comment sits on the line before its scalar | for each marker (`DOC_API_JOB`, `DOC_API_STEP`, `DOC_SERIAL_JOB`, `SERIAL_STEP`, `SUMMARY_STEP`), the regex `# MARKER[^\n]*\n\s*timeout-minutes: \d+` matches in the changed files |
| G15 | new (classifier group): a change to the serial file runs only `doc` | `classify("pull_request", [".github/workflows/p2-doc-serial.yml"])` equals `only("p2_doc")` |

New tests in this file: W2 to W6 and G15, which is 6. W1 changes an existing test.

### 7.4 `tests/unit/lanes/doc/ci.test.ts` (no new test; assertions changed)

- Lines 47-53: the `doc-api` job has the API step and no serial step (`!WORKFLOW.includes("Serial project")`). The
  serial command is asserted on `p2-doc-serial.yml`, read as a second file.
- Lines 81-88 (review): the config-names test only checks membership, which proves little. It now asserts that
  `p2-doc.yml` contains `--project=doc-api` and `--project=doc-billing-api`, and that `p2-doc-serial.yml` contains
  `--project=doc-serial --no-deps`. It reads both workflow commands, so a name in the config alone does not pass.
- Lines 65-72 (timeout count): the Documenso checker keeps its regex. The budget comments sit on their own lines.
- Lines 75-78 (guard count): unchanged. `p2-doc.yml` still has two guarded jobs (`doc-api`, `doc-billing-api`).

## 8. Documentation

Only `docs/lane-ownership.md` (section 5.4). No owner name, no product doc, no runbook. The summary is
self-explanatory.

## 9. Build checklist (step-ordered)

Run from the repository root. Node `>=22.22.0`. Each step ends with a check. No step runs a product stack unless
it says so. Section 13 notes the session's Docker status.

0. **Prerequisites.** `git fetch origin`. `git rev-parse origin/main` must be `47c507e` or a descendant (S1).
   `node -v` prints `v22.22.0` or later. Create the branch:
   `git checkout -b feat/2026-11-06-p2-run-summary-nightly origin/main`.
1. **Approval gate.** Owner step 1 (section 12) is recorded: OD-2 approved. Otherwise stop here.
2. **Probe A (section 4.6).** Run it exactly as written. Its checks must pass. Copy the printed JSON to
   `tests/unit/ci/fixtures/playwright-contract.json` (a new file). The probe folder is removed at step 5.
3. **Summary tests first** (S1 to S20 in `tests/unit/ci/job-summary.test.ts`). They are red until step 4.
4. **Summary module and CLI.** Create `src/ci/playwright-json-summary.ts` and `scripts/write-ci-job-summary.ts`
   (4.3). Run `node --test tests/unit/ci/job-summary.test.ts`. Expected: 20 of 20 pass.
5. **Helper and guard.** Create `src/ci/known-defect.ts` and `src/ci/known-defect-guard.ts` (4.4). Write
   `tests/unit/ci/known-defect.test.ts` (K1 to K6). Run `node --test tests/unit/ci/known-defect.test.ts`: K2 to K5
   pass; K1 and K6 are red, because the call sites are not yet migrated. Rerun probe A with `expectedDefect`
   (4.6, last paragraph), then `rm -rf scratch/p2-summary-probe`.
6. **Migration.** Replace the 16 call sites with the strings in 2.4. Run the known-defect test again: K1 and K6
   pass. Run `npx tsc -p tsconfig.json --noEmit` (exit 0) and
   `npx eslint tests src scripts playwright.config.ts` (exit 0).
7. **Reporter.** Edit `playwright.config.ts` (4.2). Run `npx playwright test --list --project=cal-api` (exit 0,
   tests listed).
8. **Lane wiring.** Edit `p2-cal.yml`, `p2-med.yml`, `p2-tw.yml` (4.5) and `p2-doc.yml` (5.2). Create
   `p2-doc-serial.yml` (5.3). Run `npx prettier --check .github/workflows/` (exit 0).
9. **Checkers.** Update `tests/unit/ci/workflow.test.ts` (7.3) and `tests/unit/lanes/doc/ci.test.ts` (7.4). Run
   `node --test tests/unit/ci/workflow.test.ts tests/unit/lanes/doc/ci.test.ts` (exit 0). Record the counts.
10. **Classifier.** Edit `scripts/ci-changes.sh` (5.4). Run
    `printf '%s\n' '.github/workflows/p2-doc-serial.yml' | EVENT_NAME=pull_request bash scripts/ci-changes.sh`.
    Expected output: `p2_cal=false`, `p2_doc=true`, `p2_med=false`, `p2_tw=false`.
11. **Docs.** Edit `docs/lane-ownership.md` (5.4).
12. **Full local checks.** `npm run check` (exit 0). Record the whole-run count (predicted 604) and the
    `workflow.test.ts` count (predicted 68), and any difference with its reason.
13. **actionlint (mandatory, V7).** Install a pinned actionlint release through the build's tooling, and record its
    version and sha256 in the PR body. Then run
    `actionlint .github/workflows/ci.yml .github/workflows/p2-cal.yml .github/workflows/p2-med.yml .github/workflows/p2-doc.yml .github/workflows/p2-doc-serial.yml .github/workflows/p2-tw.yml`.
    Expected: exit 0, no diagnostics. A diagnostic is fixed in the YAML. Do not ignore it, and do not relax a
    check. If the release cannot be installed (its host is not allowed), stop and report the environment finding
    (section 13).
14. **Commits (section 10).** Each commit is green. Stage by explicit path. Run `git diff --cached --stat` before each.
15. **Push and PR.** `git push -u origin feat/2026-11-06-p2-run-summary-nightly`. Open one PR into `main` titled
    `ci: p2 run summary, expected-defect annotations, nightly documenso serial`. Put the evidence (section 11) in the
    body as it lands.
16. **Pre-merge proof.** Section 5.6 (E4): the throwaway serial-only commit, its run, then its revert commit.
17. **Evidence.** Section 11, E1 to E7.

## 10. Commit plan (lowercase, no trailers, every commit green)

Red tests are never committed. The helper, its guard and the migration land in one green commit.

1. `ci: add the p2 job summary module and its cli` (`src/ci/playwright-json-summary.ts`,
   `scripts/write-ci-job-summary.ts`, `tests/unit/ci/job-summary.test.ts`, `tests/unit/ci/fixtures/playwright-contract.json`).
2. `ci: add the expected-defect helper, its guard and the migration of the 16 call sites` (`src/ci/known-defect.ts`,
   `src/ci/known-defect-guard.ts`, `tests/unit/ci/known-defect.test.ts`, and the 11 test files in section 6).
3. `ci: write a json report and a job summary from each p2 lane` (`playwright.config.ts`, `p2-cal.yml`,
   `p2-med.yml`, `p2-tw.yml`, the summary and JSON parts of `p2-doc.yml`).
4. `ci: move the documenso serial project to a nightly workflow` (`p2-doc.yml` serial removal,
   `p2-doc-serial.yml`, `scripts/ci-changes.sh`, `tests/unit/ci/workflow.test.ts`, `tests/unit/lanes/doc/ci.test.ts`).
5. `docs(ci): describe the serial nightly and the job summary in lane-ownership` (`docs/lane-ownership.md`).

Each commit leaves the unit files it touches green. The pre-merge proof and its revert (section 5.6) are two
further commits on the branch. They are reverted before merge. Never amend a pushed commit. Never force-push.
Never skip hooks.

## 11. Verification: required evidence (PR body)

- **E1 (static and unit).** `npm run check` exit 0, with the counts (predicted 604 and 68). The `actionlint` output
  (exit 0) with its pinned version and sha256. `npx prettier --check .github/workflows/` exit 0.
- **E2 (summary and defect row).** One lane run on the build PR. Its job summary shows the results table, the
  expected-failures table with a defect ID (for example `PB-CAL-OAS-1`), the sweep line, and the run link. Record the URL.
- **E3 (PR timing without serial).** The `p2-doc / doc-api` job on the build PR has no serial step. Record its URL,
  wall time and step list. Baseline: 37 min 51 s (run 42081000668).
- **E4 (serial-only, pre-merge, V5).** The throwaway proof job (5.6): its URL, conclusion, the summary it wrote, its
  teardown result, and the revert commit's sha. The proof is a pass on a fresh stack, recorded before the merge.
- **E5 (post-merge registration and first nightly, V6).** After the merge, the owner dispatches `p2-doc-serial` from
  `main` (owner step 3). Record its URL, conclusion, summary and wall time. A later scheduled run is recorded when it
  happens. Until E5 is recorded, the closeout is incomplete.
- **E6 (real sweep, V4).** A real lane run (cal, doc-api or tw) whose JSON holds the invariant-sweep annotation from
  `src/invariants/fixture.ts`, shown in its summary. Record the run URL and the sweep line.
- **E7 (probe, V1 to V3).** The probe JSON and the assertion output (section 4.6), attached to the PR body as text.

## 12. Owner steps (the session never does these)

1. Record OD-2 approval (the 16-site migration) in the PR body or a comment. Build step 1 needs it.
2. Merge with a merge commit, as before. The ruleset is unchanged.
3. After the merge, dispatch `p2-doc-serial` from `main` (E5). The nightly schedule starts on its own at 02:37 UTC
   after that.
4. If the pre-merge proof (E4) is not done, the risk is accepted in writing. Otherwise E4 is required.

Sessions never change the ruleset, never merge, never tag, never dispatch.

## 13. Environment changes

- **Node:** `>=22.22.0` (the repository's `engines.node`). Native `.ts` runs under that floor, the same way
  `scripts/validate-specs.ts` runs today. No new package, no `tsx`.
- **actionlint:** not installed in this session. The build installs a pinned release (step 13). If the install needs a
  host that is not allowed, or a tool the session cannot provide, that is an environment finding: stop and report it.
  Do not skip the check. If an environment change is needed, the exact steps would be:
  - Cursor cloud: an install step for the pinned release in `scripts/cloud-install.sh`. That is a build-PR change and
    is outside this plan's list unless approved.
  - Claude Code cloud: the same install, from the session-start path (`.claude/hooks/session-start.sh`) or the
    environment setup script, following the environment docs.
  This plan makes neither change.
- **Docker:** the session reported that the Docker daemon is not available (`/tmp/dockerd.log`). This plan runs no
  product stack. The pre-merge proof (E4) needs a fresh harness stack. If Docker is still unavailable when the build
  reaches E4, stop and report. Do not improvise a shared stack.
- **Paths and network:** `PRODUCTS_ROOT=/home/user/products` stays as today. Loopback only: `127.0.0.1`. The existing
  receiver-host exception (`scripts/ensure-receiver-hostname.sh`) is unchanged. No new host.
- **Secrets:** none. `p2-doc-serial.yml` references no secret. `STRIPE_API_KEY` stays in the cal and billing lanes only.

## 14. Risks, open decisions, STOP conditions

### 14.1 Risks

| ID | Risk | Mitigation |
|---|---|---|
| R1 | The serial project depends on API state from an earlier step in the same job. | `--no-deps` is already used. The pre-merge serial-only proof (E4) tests it. If it fails, see S3. |
| R2 | A new workflow must be on the default branch before dispatch can list it. The first nightly is therefore post-merge. | Section 5.6 states the rule. E4 covers the serial behaviour without dispatch. E5 covers registration after the merge. |
| R3 | Playwright's JSON differs from the assumptions (V1 to V3). | Probe A runs first, and its real JSON is the fixture. S2 stops the build on a mismatch. |
| R4 | `expectedDefect` writes its annotation at the wrong point (V2). | The placement is kept from the bare call. E2 and probe A show it. |
| R5 | The summary CLI exits 1 on a broken report and turns a lane red. | Deliberate (4.3): a broken report is a tooling bug and must show. The test result itself is unchanged. |
| R6 | Evidence links point at a path that changed. | Links use the run's `GITHUB_SHA`, so they match the code under test. |
| R7 | Lane-owned test files change (OD-2). | One call-site replacement each. No assertion, setup, cleanup or placement change. Owner approval first. |
| R8 | A `setup-node` version or a copied step drifts from its source. | Section 5.3 copies the blocks, with their source line numbers in comments. W5 checks the required commands. |
| R9 | The guard's parse misses a form (an unusual alias, for example). | K2 to K4 cover the forms in use. A new form is added as a test before it is allowed. |
| R10 | The gate roll-up is not built (OD-1). | Accepted. Not a risk to this change. |

### 14.2 Decisions

All four are accepted (section 3.1). OD-2 needs its recorded approval before the build starts (section 3.2).

### 14.3 STOP conditions (builder)

- S1 `origin/main` is not `47c507e` or a descendant of it. Stop and report the real sha. Also stop if the source line
  ranges in 5.3 no longer match the build's base.
- S2 Probe A (4.6) disagrees with the parser's or the helper's assumptions. Stop. Keep the real JSON as evidence and
  report it. Do not change the parser to hide the difference.
- S3 The pre-merge serial-only proof (E4) fails. Stop before the merge. Report the failing test and its dependency
  on API state. Any repair is a new change, approved by the maintainer. Sessions do not restore or remove coverage on
  their own. (The post-merge failure policy is in section 5.6.)
- S4 A lane run shows a job skipped whose flag is true (CI gate plan, S3). Stop. That is a guard or classifier bug.
- S5 A step needs a secret this plan does not name. Stop. The allow-list stays `["STRIPE_API_KEY"]`.
- S6 Any action, environment or product change is needed outside section 13. Stop and report.
- S7 `actionlint` reports a diagnostic that cannot be fixed without weakening a check. Stop and report.

## 15. Repo rules applied (plan and build)

- No personal name in repository text. Repository slugs appear only inside URLs.
- No `Co-authored-by`, no `Claude-Session`, no session or chat links, no "Generated by" footer, no model name.
- Lowercase conventional commit subjects (section 10). No red intermediate commits.
- `git add` by explicit path. No `git add -A`. No force-push. No hook skipping. No amend of a pushed commit.
- Sessions never merge, tag or dispatch. The owner dispatches the post-merge serial run (section 12).
- No secret value is printed or written.
- No edit to product forks, the harness package, `.env` files or `node_modules`.
- Industry practice only: no `continue-on-error`, no weakened gate, no duplicate triggers kept "just in case".
- Root-cause fixes only. The PR critical path is fixed by moving the serial work to its own schedule. Nothing is
  filtered or retried.
- Timeouts are named comments on their own line, with a basis: `DOC_API_JOB` 30 min, `DOC_API_STEP` 15 min,
  `DOC_SERIAL_JOB` 90 min, `SERIAL_STEP` 60 min, `SUMMARY_STEP` 2 min. Cal, med and tw job budgets are unchanged.
- Loopback only (`127.0.0.1`). The existing receiver-host exception is unchanged. No new host.

## 16. Final report format (for the build session)

1. Base sha verified (section 9 step 0).
2. OD-2 approval reference (section 9 step 1).
3. Plan path and the plan commit sha.
4. Build branch, build commits (sha and subject), PR URL.
5. Test counts: before 572 / 62, after (measured), and any difference from 604 / 68, with the reason.
6. actionlint version and sha256, and its output.
7. Evidence E1 to E7, with URLs and results, or "not run" with the reason.
8. Anything UNVERIFIED, listed by ID from section 2.6 (V1 to V8). Nothing left unlisted.
