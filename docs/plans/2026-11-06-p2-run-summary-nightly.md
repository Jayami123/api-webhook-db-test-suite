# P2 run summary and nightly Documenso serial: plan (plan only, nothing built)

Written 2026-11-06. This page is a guide for a junior engineer who builds the change later. Every
step names an exact path, an exact command and the output to expect. Nothing in this session builds,
opens a PR, merges, tags or dispatches a workflow.

## 1. Header

| Item | Value |
|---|---|
| Repository | this repository (the P2 test suite) |
| Base verified | `47c507e275a2c11a0836c8d3f5c54227986e492d` (merge of PR #20). `git rev-parse origin/main` returns this sha, and `git merge-base --is-ancestor 47c507e origin/main` exits 0. |
| Plan branch | `plan/2026-11-06-p2-run-summary-nightly` (from `origin/main`) |
| Build branch (later) | `feat/2026-11-06-p2-run-summary-nightly` (from `origin/main` at build time) |
| Build PR | one PR into `main`, opened by the build session. The owner merges with a merge commit. |
| Scope | Playwright reporter config, one summary module and one CLI, one `expectedDefect` helper, the lane workflow YAML, one new nightly workflow, unit guards, two docs. No product code, no harness, no `.env`, no `node_modules`. |
| Ruleset | unchanged. `gate` is already the required check (PR #20 merged). |

## 2. Facts checked

### 2.1 Verified in this session (on `origin/main` at `47c507e`)

| Fact | Where |
|---|---|
| Reporter is list, JUnit and HTML only; no JSON reporter. JUnit and HTML paths come from `P2_JUNIT_FILE` and `P2_HTML_DIR`. | `playwright.config.ts:42-53` |
| `workers: 1`, `retries: 0`, `fullyParallel: false` | `playwright.config.ts:35-37` |
| Serial projects depend on their API project (`dependencies: [after]`) | `playwright.config.ts:28-30`, `:67-70` |
| `doc-serial` is `serialProject("doc-serial", "doc", "doc-api")` | `playwright.config.ts:68` |
| The sweep annotation is pushed in the fixture after `use()` returns (after the test body) | `src/invariants/fixture.ts:38-41` |
| `SWEEP_ANNOTATION_TYPE` is `"invariant-sweep"`; the description is `<product>: <N> rules, <V> violations` | `src/invariants/after-test.ts:30-41` |
| `doc-api` job: id line 38, name `doc-api and doc-serial` line 40, guard line 41, `timeout-minutes: 120` line 44 | `.github/workflows/p2-doc.yml:38-44` |
| API project step: `--project=doc-api` | `.github/workflows/p2-doc.yml:110-115` |
| Serial step (`if: always()`, `timeout-minutes: 60`, `P2_JUNIT_FILE`/`P2_HTML_DIR` env, `--project=doc-serial --no-deps`) | `.github/workflows/p2-doc.yml:117-125` |
| Results upload includes `playwright-report-serial/` | `.github/workflows/p2-doc.yml:138-144` |
| `doc-billing-api` job: name line 148, guard line 148 area, billing project step at lines 238-244, results upload 251-258 | `.github/workflows/p2-doc.yml:146-258` |
| Cal lane runs `cal-api` and `cal-serial` in one step (`npx playwright test --project=cal-api --project=cal-serial`), leak check, upload `results/junit.xml` and `playwright-report/` | `.github/workflows/p2-cal.yml:92-116` |
| Med lane: run step, then upload `playwright-report/`, `results/` | `.github/workflows/p2-med.yml:121-139` |
| Tw lane: three jobs, each with an upload step of `results/junit.xml` | `.github/workflows/p2-tw.yml:76-84`, `:147-155`, `:212-220` |
| `tw-study.yml` cron `17 5 * * 1`, `workflow_dispatch`, `cancel-in-progress: false` | `.github/workflows/tw-study.yml:6-16` |
| `ci.yml` calls `p2-doc.yml` with `secrets: inherit` (doc flag) | `.github/workflows/ci.yml` (the `p2-doc` job) |
| The checker: lanes list `p2-cal.yml, p2-med.yml, p2-doc.yml, p2-tw.yml, tw-study.yml` | `tests/unit/ci/workflow.test.ts:233` |
| The checker: `schedule` allowed only in `tw-study.yml` (lanes allow `workflow_call` and `workflow_dispatch`) | `tests/unit/ci/workflow.test.ts` (triggers rule, 6.2 of the CI gate plan) |
| The Documenso unit test asserts serial is a step of `p2-doc.yml` | `tests/unit/lanes/doc/ci.test.ts:47-53` |
| The Documenso unit test asserts every project name in the config is named in its workflow | `tests/unit/lanes/doc/ci.test.ts:81-88` |
| The classifier regex for doc paths | `scripts/ci-changes.sh` (`re_doc`) |
| `src/ci/` does not exist. `src/` has `auth clients contracts db env.ts fixtures invariants lanes readiness run shared slo slo.ts webhooks`. | `ls src` |
| `@playwright/test` is `1.64.0`; `.nvmrc` is `22`; `tsconfig.json` sets `erasableSyntaxOnly: true` | `package.json`, `.nvmrc`, `tsconfig.json` |
| Node runs `.ts` files directly (precedent: `"specs:validate": "node scripts/validate-specs.ts"`) | `package.json:23` |

### 2.2 Measured timings (run `42081000668`, head `c754999`, PR #20 E1)

Times are UTC from the job step records (`actions_get get_workflow_job`).

| Job | Step | Start | End | Duration |
|---|---|---|---|---|
| `p2-doc / doc-api and doc-serial` (job `127434555892`) | whole job | 18:07:47 | 18:45:38 | 37 min 51 s |
| same | Install locked dependencies | 18:08:01 | 18:08:41 | 40 s |
| same | Clone and install Documenso | 18:08:42 | 18:09:42 | 60 s |
| same | Start the Documenso stack (harness up) | 18:09:42 | 18:13:36 | 3 min 54 s |
| same | API project | 18:13:36 | 18:16:27 | 2 min 51 s |
| same | Serial project | 18:16:27 | 18:45:34 | 29 min 07 s |
| same | Stop the stack (always) | 18:45:34 | 18:45:35 | 1 s |
| `p2-cal / cal-api` (job `127434555904`) | whole job | 18:07:48 | 18:23:44 | 15 min 56 s |
| same | Bootstrap the Cal product | 18:08:34 | 18:12:38 | 4 min 4 s |
| same | Harness up (cal) | 18:12:38 | 18:19:39 | 7 min 1 s |
| same | Lane tests (cal-api, then cal-serial) | 18:19:39 | 18:23:40 | 4 min 1 s |

Reading: the Documenso job minus its serial step is about 9 minutes (37 min 51 s less 29 min 07 s).
That is shorter than the Cal lane (about 16 minutes). The PR `ci` run is as long as its longest lane,
so the serial step is the whole reason doc is the critical path.

### 2.3 Expected-failure inventory (16 real `test.fail` call sites)

Comment-only lines are excluded. The list is the call sites on `origin/main`.

**Bare `test.fail()` (no defect text, five sites): these are the ones the lint must reject.**

| File:line | Test ID (from the test title) | Defect named in the code comment | Defect ID to use (existing probe record) |
|---|---|---|---|
| `tests/webhooks/cal/cal-wh.spec.ts:379` | `P2-CAL-WH-003` | "Finding B2" | `B2` (probe `docs/probes/2026-11-02-p2-lane-cal-live-probes.md:338`) |
| `tests/contracts/cal/cal-con.spec.ts:39` | `P2-CAL-CON-001` | "PB-CAL-OAS-1" | `PB-CAL-OAS-1` (probe `...-live-probes.md:325`) |
| `tests/contracts/cal/cal-con.spec.ts:117` | `P2-CAL-CON-002` | "PB-CAL-OAS-1" (probe L12 section) | `PB-CAL-OAS-1` (`...-live-probes.md:325`) |
| `tests/contracts/cal/cal-con-005.spec.ts:197` | `P2-CAL-CON-005` | "PB-CAL-OAS-1" | `PB-CAL-OAS-1` (`...-live-probes.md:325`) |
| `tests/serial/cal/cal-task.spec.ts:248` | `P2-CAL-TASK-003` (per round) | "Finding B4" | `B4` (probe `...-live-probes.md:346`) |

These IDs already exist in the probe records. None is invented. `B2` and `B4` are short names; see
open decision OD-3.

**Annotated call sites (11, already carry a description; they become `expectedDefect` calls):**

| File:line | Description passed today | Defect ID |
|---|---|---|
| `tests/integration/tw/currency.spec.ts:97` | `P2-TW-BUG-001: 9007199254740993 is accepted ...` | `P2-TW-BUG-001` |
| `tests/integration/tw/currency.spec.ts:184` | `P2-TW-BUG-001 (GraphQL): ...` | `P2-TW-BUG-001` (ID text is `P2-TW-BUG-001 (GraphQL)`; see step 4 of section 9) |
| `tests/webhooks/doc/payload.spec.ts:85` | `P5-DOC-TOK-002: every document payload ...` | `P5-DOC-TOK-002` |
| `tests/webhooks/tw/b1-drop.spec.ts:101` | `P2-TW-BUG-003: a webhook created after a delete ...` | `P2-TW-BUG-003` |
| `tests/contracts/doc/upload.spec.ts:77, 92, 107, 142` (four sites) | constant `PB_DOC_001` = `PB-DOC-001: files.ts:56-57 ...` | `PB-DOC-001` |
| `tests/contracts/tw/rest-oas.spec.ts:114` | `P2-TW-BUG-002: OAS 3.1.1 ...` | `P2-TW-BUG-002` |
| `tests/contracts/med/product-contract.spec.ts:140` | `P2-MED-CON-PRODUCT known product deviations: ...` | `P2-MED-CON-PRODUCT` |
| `tests/serial/doc/conversion.spec.ts:88` | constant `P5_CONV_001` (`conversion.spec.ts:16-17`) | `P5-DOC-CONV-001` |

Total: 5 bare + 11 annotated = 16 call sites across 11 files.

### 2.4 Reference implementations (read via public raw URLs; cited by line)

Files fetched into the session scratchpad. Line numbers below are in those files.

| Reference | What the plan takes from it |
|---|---|
| P6: https://github.com/Jayami123/k6-load-concurrency-suite, `scripts/write-ci-job-summary.ts` (80 lines) | The CLI shape: read JSON, build markdown, write stdout, append to `$GITHUB_STEP_SUMMARY` (`:70-80`). A missing report prints a `::warning::` and continues (`:47-50`). A zero-test or invalid report exits 1 (`:52-56`, `:77-79`). |
| P6: `src/ci/playwright-json-summary.ts` (208 lines) | The parser (`parsePlaywrightJsonReport`, `:93-150`), the status mapping (`skipped`, `flaky`, `unexpected` = failed, `expected` + `expectedStatus=failed` = expected failure, `:113-147`), the `issue` annotation read (`:41-58`, `:130-141`), `issueIdFromDescription` (`:35-39`), `mergeSummaries` with dedup (`:157-176`), `requireTests` (`:179-183`), and `formatPlaywrightJobSummary` (`:185-208`). |
| P1: https://github.com/Jayami123/playwright-e2e-ci-framework, `scripts/write-ci-job-summary.mts` (80 lines), `src/core/playwright-json-summary.ts` (237 lines), `tests/unit/playwright-json-summary.spec.ts` (161 lines), `.github/workflows/e2e.yml` (2038 lines) | Same design. The step in `e2e.yml` (lines 256-261) uses `if: ${{ !cancelled() }}` and `timeout-minutes: 2`. The plan copies both. |

The plan ports P6's TypeScript shape (the brief asked for it). The P6 module is a port of P1's, and
its header says so (`p6` line 1-4). Keep the same "keep in sync by hand" note in the P2 module.

### 2.5 Not verified in this session (UNVERIFIED, each has a settling step)

| ID | Item | How it gets settled |
|---|---|---|
| V1 | The Playwright JSON reporter writes `projectName` on each test node, and its status values match P6's mapping (`expected`, `unexpected`, `flaky`, `skipped`, with `expectedStatus`). | Build step B4: run the reporter on a one-test project and read the JSON. |
| V2 | A `test.fail` helper that pushes `{type: "issue"}` mid-test still leaves that annotation in the JSON report, given the test ends in a failed assertion. | Build step B6: the expected-failure table on the lane run shows the defect ID. This is also evidence item E2. |
| V3 | Playwright's `test.fail(true, description)` writes its own annotation of type `fail` (not `issue`). The plan keeps that call so behaviour does not change, and adds `issue` beside it. | Build step B4 reads both annotation types on one test. |
| V4 | The invariant-sweep annotation (pushed after `use()`) is present in the JSON report of the test. | Build step B6 (the sweep line on the lane summary). |
| V5 | Serial tests do not read state written by API tests (the serial project already uses `--no-deps`, so Playwright does not run `doc-api` first). The nightly job runs serial **alone** for the first time. | Evidence item E5: the first nightly or dispatch run of `p2-doc-serial.yml` must pass without `doc-api`. |
| V6 | A `workflow_dispatch` or `schedule` run only starts from the default branch. The new `p2-doc-serial.yml` cannot be dispatched from the build branch to prove itself before merge. | Owner dispatches it from `main` after the merge (owner step, section 12). Recorded as a risk, not verified here. |
| V7 | Whether `actionlint`-level YAML problems exist in the new skeletons. | Not checked by any tool in this repo. The first run is the check (as in the CI gate plan, U3). |
| V8 | P6's full unit test file (its own tests for the summary). | Not fetched. The plan writes its own tests (section 7). |

## 3. Decisions

### 3.1 Resolved in this plan (defaults the build follows; owner can change)

| ID | Question | Default | Why |
|---|---|---|---|
| RD-1 | Port P6 or P1 for the summary? | P6 (TypeScript, as the brief asks) | Same parser, a newer shape, and P2 already uses native `.ts` under Node 22 (`scripts/validate-specs.ts`). |
| RD-2 | Install `tsx` for the summary CLI? | No. `node scripts/write-ci-job-summary.ts` (Node strips types, like `validate-specs.ts`). | No new dependency, no `package.json` change. |
| RD-3 | How many JSON reporter files? | One per CI step that runs Playwright (see 4.2). | Mirrors the JUnit isolation the Documenso job already uses (`P2_JUNIT_FILE`). Two steps that write one file would overwrite each other. |
| RD-4 | `if:` on the summary step | `${{ !cancelled() }}` (P1 precedent, `e2e.yml:257`), not `always()`. | It still writes when tests fail, and it does not run after a cancel, when no report exists. |
| RD-5 | Summary exit policy | P6 policy: a missing report is a warning and exit 0. A zero-test or unreadable report exits 1. | Missing means the step never ran (warn). A broken report is a tooling bug and must be red, not silent. |
| RD-6 | Where the defect annotation comes from | A single helper `expectedDefect(description)` in `src/ci/known-defect.ts`, the only place that calls `test.fail(`. | One place to enforce the rule, and one annotation type (`issue`) for the parser. |
| RD-7 | Nightly cron | `37 2 * * *` (UTC) = 08:07 in Asia/Colombo (UTC+5:30, no DST). | Minute 37 avoids the top-of-hour load. 02:37 UTC is outside the `tw-study` window (Monday 05:17 UTC) and is before the Colombo working day. |
| RD-8 | Serial in its own file or a job in `p2-doc.yml` | Its own file, `p2-doc-serial.yml` (section 5.3). | A `schedule` trigger in `p2-doc.yml` would make the lane file scheduled, and `ci.yml` calls that file. A separate file keeps the PR path unchanged (the `tw-study.yml` pattern). |
| RD-9 | Roll-up table in the gate job (brief item 5) | **Not in this change** (default "no"). | A roll-up needs `download-artifact` in `gate`. A failure there would turn `gate` red, which must not change its pass or fail logic. The repo rules forbid `continue-on-error`, so the step cannot be made non-blocking. Recorded as OD-1. |

### 3.2 Open decisions (the owner must answer before the build starts)

| ID | Question | Recommendation | Impact if the answer differs |
|---|---|---|---|
| OD-1 | Add the gate roll-up later as its own change? | Yes, later, after the summary has run for a few weeks. | None now. |
| OD-2 | Migrate the 16 call sites in lane-owned test files in this PR, or per lane? | One PR (this one). The rule is a shared lint; a split leaves a window with two patterns. | Per-lane PRs would take four PRs and must land in order. |
| OD-3 | Defect IDs `B2` and `B4` are short names from the cal probe record. Keep them, or rename to `P2-CAL-B2` / `P2-CAL-B4`? | Keep (they are the names in the probe record; renaming is an invention). | A rename changes the summary text only. |
| OD-4 | Show failing test titles on the summary (not only expected failures)? | Yes, titles only, up to 20 (section 4.3). | None. |

## 4. Design A: run summary

### 4.1 What the summary shows (per lane job)

1. Heading: `## P2 <label>: run summary`.
2. Per-project table: passed, failed, skipped, expected failures, flaky. A total row.
3. Expected-failures table: test ID, test title, defect ID, evidence link. Populated only by the
   `expectedDefect` annotation (4.4).
4. Unexpected failures list: test titles only (the failed red set), up to 20.
5. Invariant sweep: one line per product, `<product>: <N> rules, <V> violations (<T> tests swept)`.
   Any `V > 0` is a sentence, not an emoji.
6. Run link: `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`. The
   artifacts are at the foot of that page.

Sample (numbers are illustrative only):

```markdown
## P2 cal: run summary

| project | passed | failed | skipped | expected failures | flaky |
| --- | ---: | ---: | ---: | ---: | ---: |
| cal-api | 41 | 0 | 0 | 3 | 0 |
| cal-serial | 4 | 0 | 0 | 1 | 0 |
| **total** | **45** | **0** | **0** | **4** | **0** |

### Expected failures (known defects, still reproducing)

| test ID | test | defect | evidence |
| --- | --- | --- | --- |
| P2-CAL-CON-001 | GET /v2/slots matches the OAS schema | PB-CAL-OAS-1 | [probe](https://github.com/OWNER/REPO/blob/SHA/docs/probes/2026-11-02-p2-lane-cal-live-probes.md#L325) |

### Invariant sweep

- cal: 2 rules, 0 violations (45 tests swept)

Run page with the artifacts: https://github.com/OWNER/REPO/actions/runs/RUN_ID
```

`OWNER/REPO`, `SHA` and `RUN_ID` come from the CI environment; the sample is not a real run.

### 4.2 Reporter isolation (one JSON file per Playwright run)

Change `playwright.config.ts` (the CI reporter list, lines 42-53). Add the JSON reporter between the
JUnit and HTML entries, with its own environment variable:

```ts
        ["json", { outputFile: process.env["P2_JSON_FILE"] ?? "results/playwright.json" }],
```

Every lane step that runs Playwright gets a distinct file:

| Workflow (job) | Playwright run | `P2_JSON_FILE` |
|---|---|---|
| `p2-cal.yml` (`cal-api`) | `--project=cal-api --project=cal-serial` (one step) | `results/playwright-cal.json` |
| `p2-doc.yml` (`doc-api`) | `--project=doc-api` | `results/playwright-doc-api.json` |
| `p2-doc.yml` (`doc-billing-api`) | `--project=doc-billing-api` | `results/playwright-doc-billing.json` |
| `p2-doc-serial.yml` (`doc-serial`) | `--project=doc-serial --no-deps` | `results/playwright-doc-serial.json` |
| `p2-med.yml` (`med-api`) | `--project=med-api` | `results/playwright-med.json` |
| `p2-tw.yml` (`tw-api`) | the tw-api run | `results/playwright-tw-api.json` |
| `p2-tw.yml` (`tw-multiws`) | the tw-multiws run | `results/playwright-tw-multiws.json` |
| `p2-tw.yml` (`tw-cache`) | the tw-cache run | `results/playwright-tw-cache.json` |

Why one file per step: a JSON reporter writes one file. Two steps that share a path overwrite each
other, the same reason the Documenso job already splits its JUnit file. Each file is uploaded with the
job's artifacts, so a reader can rebuild the summary later.

### 4.3 The summary module and the CLI (full skeletons)

`src/ci/playwright-json-summary.ts` (new). Port of P6 `src/ci/playwright-json-summary.ts`, extended
with per-project totals, invariant-sweep rows and unexpected-failure titles. It is pure: it takes
parsed JSON and returns data, so the unit tests need no file system.

```ts
// Ported from https://github.com/Jayami123/k6-load-concurrency-suite, src/ci/playwright-json-summary.ts (P6), which is a port of
// the P1 module. P2 changes: per-project totals (projectName), invariant-sweep rows, unexpected-failure titles,
// the defect description is "ID: evidence" (see src/ci/known-defect.ts). Keep in sync by hand.
// erasableSyntaxOnly: no enums, no parameter properties, no namespaces.

export interface RunTotals {
  readonly passed: number;
  readonly failed: number;
  readonly flaky: number;
  readonly expectedFailures: number;
  readonly skipped: number;
}

export interface ProjectTotals extends RunTotals {
  readonly project: string;
}

export interface ExpectedFailureRow {
  readonly testId: string; // "P2-CAL-CON-001", from the title; "" when the title has no ID
  readonly title: string;
  readonly defectId: string; // "" when the test has no issue annotation (lint should prevent this)
  readonly evidence: string; // the text after "ID: "; "" when absent
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
  readonly sweeps: readonly SweepRow[];
}

const ISSUE = "issue";
const SWEEP = "invariant-sweep";
const TEST_ID = /^(P[0-9]?-[A-Z0-9]+(?:-[A-Z0-9]+)+)/; // e.g. P2-CAL-CON-001, P5-DOC-TOK-002

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The first annotation of a type, with its description, or undefined. */
export function annotationOf(annotations: unknown, type: string): string | undefined {
  if (!Array.isArray(annotations)) return undefined;
  for (const annotation of annotations) {
    if (!isRecord(annotation) || annotation["type"] !== type) continue;
    const description = annotation["description"];
    if (typeof description === "string" && description.trim() !== "") return description;
  }
  return undefined;
}

/** "B2: a receiver 500 is acknowledged ..." -> { id: "B2", evidence: "a receiver 500 ..." } */
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

/** Walks suites recursively and yields each test node with its spec title and project name. */
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

export function parseJobReport(label: string, raw: unknown): JobSummary {
  if (!isRecord(raw)) throw new Error("Playwright JSON report root must be an object");
  const tests: Visited[] = [];
  visit(raw["suites"], tests);

  const byProject = new Map<string, { passed: number; failed: number; flaky: number; expectedFailures: number; skipped: number }>();
  const expectedFailures: ExpectedFailureRow[] = [];
  const unexpectedFailures: string[] = [];
  const sweepTests = new Map<string, { rules: number; violations: number; tests: number }>();

  for (const { title, project, node } of tests) {
    const counts = byProject.get(project) ?? { passed: 0, failed: 0, flaky: 0, expectedFailures: 0, skipped: 0 };
    const status = node["status"];
    const expectedStatus = node["expectedStatus"];
    if (status === "skipped") counts.skipped += 1;
    else if (status === "flaky") counts.flaky += 1;
    else if (status === "unexpected") {
      counts.failed += 1;
      unexpectedFailures.push(title);
    } else if (status === "expected" && expectedStatus === "failed") {
      counts.expectedFailures += 1;
      const defect = annotationOf(node["annotations"], ISSUE);
      const parts = defect === undefined ? { id: "", evidence: "" } : splitDefect(defect);
      const testId = TEST_ID.exec(title)?.[1] ?? "";
      expectedFailures.push({ testId, title, defectId: parts.id, evidence: parts.evidence });
    } else if (status === "expected") counts.passed += 1;
    byProject.set(project, counts);

    const sweep = annotationOf(node["annotations"], SWEEP);
    if (sweep !== undefined) {
      const match = /^(.+?): (\d+) rules, (\d+) violations$/.exec(sweep);
      if (match !== null) {
        const product = match[1] ?? "";
        const current = sweepTests.get(product) ?? { rules: Number(match[2]), violations: 0, tests: 0 };
        current.violations += Number(match[3]);
        current.tests += 1;
        sweepTests.set(product, current);
      }
    }
  }

  return {
    label,
    projects: [...byProject].map(([project, c]) => ({ project, ...c })),
    expectedFailures,
    unexpectedFailures,
    sweeps: [...sweepTests].map(([product, s]) => ({ product, rules: s.rules, violations: s.violations, tests: s.tests })),
  };
}

/** Throws when a report ran no tests (P6 requireTests, :179-183). */
export function requireTests(summary: JobSummary, path: string): void {
  const total = summary.projects.reduce(
    (sum, p) => sum + p.passed + p.failed + p.flaky + p.expectedFailures + p.skipped,
    0,
  );
  if (total === 0) throw new Error(`${path} contains zero tests`);
}

/** Evidence that names a repository path links to that path at the commit under test. */
export function evidenceCell(evidence: string, repo: string, sha: string): string {
  const path = /(docs\/[\w./-]+?\.md)(?::(\d+))?/.exec(evidence);
  if (path === null) return evidence === "" ? "(none)" : evidence;
  const line = path[2] !== undefined ? `#L${path[2]}` : "";
  return `[${path[1] ?? ""}](https://github.com/${repo}/blob/${sha}/${path[1] ?? ""}${line})`;
}

export function formatJobSummary(s: JobSummary, env: { repo: string; sha: string; runUrl: string }): string {
  const lines: string[] = [`## P2 ${s.label}: run summary`, ""];
  lines.push("| project | passed | failed | skipped | expected failures | flaky |", "| --- | ---: | ---: | ---: | ---: | ---: |");
  let [p, f, sk, ef, fl] = [0, 0, 0, 0, 0];
  for (const row of s.projects) {
    lines.push(`| ${row.project} | ${row.passed} | ${row.failed} | ${row.skipped} | ${row.expectedFailures} | ${row.flaky} |`);
    p += row.passed; f += row.failed; sk += row.skipped; ef += row.expectedFailures; fl += row.flaky;
  }
  lines.push(`| **total** | **${p}** | **${f}** | **${sk}** | **${ef}** | **${fl}** |`, "");

  if (s.expectedFailures.length > 0) {
    lines.push("### Expected failures (known defects, still reproducing)", "", "| test ID | test | defect | evidence |", "| --- | --- | --- | --- |");
    for (const row of s.expectedFailures) {
      const defect = row.defectId === "" ? "**NO DEFECT ID**" : row.defectId;
      lines.push(`| ${row.testId || "(no ID)"} | ${row.title} | ${defect} | ${evidenceCell(row.evidence, env.repo, env.sha)} |`);
    }
    lines.push("");
  } else {
    lines.push("Known defects still reproducing: none", "");
  }

  if (s.unexpectedFailures.length > 0) {
    lines.push("### Unexpected failures", "");
    for (const title of s.unexpectedFailures.slice(0, 20)) lines.push(`- ${title}`);
    lines.push("");
  }

  if (s.sweeps.length > 0) {
    lines.push("### Invariant sweep", "");
    for (const sweep of s.sweeps) {
      lines.push(`- ${sweep.product}: ${sweep.rules} rules, ${sweep.violations} violations (${sweep.tests} tests swept)`);
    }
    lines.push("");
  }

  lines.push(`Run page with the artifacts: ${env.runUrl}`, "");
  return lines.join("\n");
}
```

`scripts/write-ci-job-summary.ts` (new). The CLI. It follows P6 exactly on the exit policy (RD-5).

```ts
// Writes the P2 job summary for one lane job. Usage: node scripts/write-ci-job-summary.ts <label> <report.json>...
// Appends to $GITHUB_STEP_SUMMARY when set (the CI step), and always prints the same markdown.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import {
  formatJobSummary,
  parseJobReport,
  requireTests,
  type JobSummary,
} from "../src/ci/playwright-json-summary.ts";

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new Error(`${path} is not valid JSON`, { cause });
  }
}

function merge(parts: readonly JobSummary[], label: string): JobSummary {
  return {
    label,
    projects: parts.flatMap((p) => p.projects),
    expectedFailures: parts.flatMap((p) => p.expectedFailures),
    unexpectedFailures: parts.flatMap((p) => p.unexpectedFailures),
    sweeps: parts.flatMap((p) => p.sweeps),
  };
}

const [label = "lane", ...paths] = process.argv.slice(2);
const env = process.env;
const runUrl = `${env["GITHUB_SERVER_URL"] ?? "https://github.com"}/${env["GITHUB_REPOSITORY"] ?? ""}/actions/runs/${env["GITHUB_RUN_ID"] ?? ""}`;
const present = paths.filter((p) => existsSync(p));

let markdown: string;
if (present.length === 0) {
  process.stdout.write(`::warning::No Playwright JSON report for ${label}; the job summary is incomplete.\n`);
  markdown = `## P2 ${label}: run summary\n\nNo Playwright JSON report was written, so the results table is not available.\n\nRun page with the artifacts: ${runUrl}\n`;
} else {
  try {
    const parts = present.map((path) => {
      const summary = parseJobReport(label, readJson(path));
      requireTests(summary, path);
      return summary;
    });
    markdown = formatJobSummary(merge(parts, label), {
      repo: env["GITHUB_REPOSITORY"] ?? "",
      sha: env["GITHUB_SHA"] ?? "",
      runUrl,
    });
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    markdown = "";
  }
}
process.stdout.write(markdown);
if (markdown !== "" && env["GITHUB_STEP_SUMMARY"]) appendFileSync(env["GITHUB_STEP_SUMMARY"], markdown, "utf8");
```

Notes for the builder:

- The `type` keyword in an import list (`type JobSummary`) is erasable. Keep `verbatimModuleSyntax` happy.
- `process.exitCode = 1` on a broken or empty report: the step fails. That is RD-5, on purpose.
- `process.stdout.write` runs before the exit code is set, so the markdown still shows in the log.

### 4.4 The `expectedDefect` helper and the lint rule

`src/ci/known-defect.ts` (new). The only file that may call `test.fail(`.

```ts
import { test } from "@playwright/test";

/**
 * Marks the running test as an expected failure of a known defect. The description is "ID: evidence"
 * (the defect ID before the first colon, the evidence after it). It writes the `issue` annotation the
 * summary reads (src/ci/playwright-json-summary.ts), and then calls Playwright's own test.fail(true, description)
 * so the behaviour is the same as the call it replaces. Call it at the same place the bare test.fail() sat:
 * after the setup and cleanup asserts, right before the assertion that is expected to fail.
 */
export function expectedDefect(description: string): void {
  const parsed = parseDefectDescription(description);
  test.info().annotations.push({ type: "issue", description: `${parsed.id}: ${parsed.evidence}` });
  test.fail(true, description);
}

/** Pure: exported for the unit test. Throws unless the description has an ID and evidence. */
export function parseDefectDescription(description: string): { id: string; evidence: string } {
  const at = description.indexOf(":");
  const id = at < 0 ? "" : description.slice(0, at).trim();
  const evidence = at < 0 ? "" : description.slice(at + 1).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(id)) {
    throw new Error(`defect description must start with an ID then a colon: ${JSON.stringify(description)}`);
  }
  if (evidence === "") throw new Error(`defect ${id} has no evidence after the colon`);
  return { id, evidence };
}
```

Two points:

- The current description `P2-TW-BUG-001 (GraphQL): ...` fails the ID rule (the ID may not contain a space or a
  parenthesis). Build step 4 rewrites it as `P2-TW-BUG-001: (GraphQL) 9007199254740993 is accepted ...`, so the ID is
  `P2-TW-BUG-001` and the scope moves into the evidence text.
- The lint in `tests/unit/ci/known-defect.test.ts` (section 7) scans every `.ts` file under `tests/` and
  `src/` and fails on any `test.fail(` line that is not a comment, unless the file is
  `src/ci/known-defect.ts`.

Migration of the 16 call sites (exact replacements):

| Before | After |
|---|---|
| `test.fail();` (5 sites, section 2.3) | `expectedDefect("<ID>: <evidence>");` (the strings in section 2.3) |
| `test.fail(true, PB_DOC_001);` (4 sites) | `expectedDefect(PB_DOC_001);` |
| `test.fail(true, P5_CONV_001);` | `expectedDefect(P5_CONV_001);` |
| `test.fail(\n  true,\n  "P2-…: …",\n);` (multi-line sites) | `expectedDefect("P2-…: …");` |

Add `import { expectedDefect } from "../../src/ci/known-defect.ts";` (path relative to each file;
the build checks each file's relative depth). Remove a `test.fail` import only if it is unused now.

Playwright import check: `test.fail(true, description)` is the call the helper makes, and it has
always been a valid form, so the behaviour of the 16 sites does not change. Only the annotation list
gains an `issue` entry.

## 5. Design B: Documenso serial moves to a nightly

### 5.1 Why this is the fix (root cause)

The PR gate waits for its slowest lane. The Documenso job waits for 29 min of serial work (cron-tick
reminders, `tests/serial/doc/reminders.spec.ts`, which polls the quarter-hour cron). That work does not
change with a small PR, so the PR pays for it every time. Measured in section 2.2: the job is 37 min,
and its API project is 2 min 51 s. Serial belongs on a schedule and on demand, not on every PR.

### 5.2 `.github/workflows/p2-doc.yml` (changed parts only)

1. Header comment (lines 2-11): rewrite the "Runs on pull requests ... and always stops the stack" sentence to
   say: the PR path runs the API project only; the serial project runs in `p2-doc-serial.yml` on a schedule
   and on manual dispatch. Keep the Node 22 / Node 24 paragraph (lines 6-8) and the `workflow_call` paragraph.
2. Job `doc-api`: the name becomes `doc-api` (line 40). Its `timeout-minutes` becomes `30`
   (line 44) with the comment `# DOC_API_JOB basis: measured 9 min without serial (run 42081000668); 30 min is the lane budget in p2-cal.yml.`
   The guard on line 41 is unchanged.
3. Step `API project` (lines 110-115): keep the command. Add the env and the summary step after it:

```yaml
      - name: API project
        timeout-minutes: 15 # DOC_API_STEP basis: measured 2 min 51 s (run 42081000668); 5x headroom.
        env:
          P2_JSON_FILE: results/playwright-doc-api.json
        run: |
          "$NODE22" node_modules/@playwright/test/cli.js test --project=doc-api

      - name: Write the job summary (doc-api)
        if: ${{ !cancelled() }}
        timeout-minutes: 2 # SUMMARY_STEP basis: P1 e2e.yml:258.
        run: |
          "$NODE22" scripts/write-ci-job-summary.ts "doc-api" results/playwright-doc-api.json
```

Note: the summary runs with `NODE22` so it uses the repository Node, not Node 24 (the harness Node).

4. Delete the serial step entirely (the block that starts with the comment
   `# The serial project depends on doc-api in Playwright ...`, lines 117-125). Keep the comment's lesson
   in the new file (section 5.3).
5. Results upload (lines 138-144): remove `playwright-report-serial/`. Add
   `results/playwright-doc-api.json` (the JSON is an artifact, RD-3).
6. Job `doc-billing-api`: add `P2_JSON_FILE: results/playwright-doc-billing.json` to its billing project
   step (lines 238-244) and a summary step (`!cancelled()`, 2 min) before its Results upload (line 251).
   Its label is `doc-billing`.

### 5.3 `.github/workflows/p2-doc-serial.yml` (new, full skeleton)

Copy the steps of the `doc-api` job from `p2-doc.yml` that come before the API project (checkout,
Node 22, PDF tools, install, Node 24, Documenso bootstrap, receiver hostname, passwords, harness
up, roles), unchanged. Then the serial step and the rest. The full file:

```yaml
# P2 documenso serial project (cron ticks and sweeps). Owned by the documenso lane (docs/lane-ownership.md).
# Not called by ci.yml: this file never runs on a pull request. It runs on a schedule (nightly, UTC 02:37 =
# 08:07 Asia/Colombo) and on manual dispatch. The PR path runs the API project only (p2-doc.yml).
# Why separate: the serial project waits for quarter-hour cron ticks (tests/serial/doc/reminders.spec.ts) and
# takes about 29 minutes. Measured in run 42081000668. Running it on every PR made doc the critical path.
# Same stack, same Node split and same harness rules as p2-doc.yml (see that file's header).
name: p2-doc-serial

on:
  schedule:
    - cron: "37 2 * * *" # SERIAL_CRON basis: RD-7 in docs/plans/2026-11-06-p2-run-summary-nightly.md.
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: p2-doc-serial-${{ github.ref }}
  cancel-in-progress: false # tw-study.yml precedent: a scheduled measurement is never cancelled by a later dispatch.

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
    # DOC_SERIAL_JOB basis: measured 37 min (run 42081000668); 90 min is 2.4x that, for the cron wait.
    timeout-minutes: 90
    steps:
      - name: Checkout the commit under test
        timeout-minutes: 5
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false

      - name: Node 22 for the repository (install, tests)
        timeout-minutes: 5
        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version-file: .nvmrc
          cache: npm

      - name: Pin the Node 22 path
        timeout-minutes: 5
        run: echo "NODE22=$(command -v node)" >> "$GITHUB_ENV"

      - name: PDF tools for the signature checks (pdfsig, pdftotext)
        timeout-minutes: 10
        run: |
          # Copy the exact lines of p2-doc.yml "PDF tools for the signature checks" (lines 64-72) here.
          true

      - name: Install locked dependencies
        timeout-minutes: 10
        run: npm ci

      - name: Node 24 for the harness (up and down)
        timeout-minutes: 5
        uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 24

      - name: Pin the Node 24 path
        timeout-minutes: 5
        run: echo "NODE24=$(command -v node)" >> "$GITHUB_ENV"

      - name: Clone the pinned Documenso fork and install its dependencies
        timeout-minutes: 30
        run: bash scripts/bootstrap.sh documenso

      - name: Receiver hostname in the hosts file
        timeout-minutes: 2
        run: bash scripts/ensure-receiver-hostname.sh

      - name: Read-only and fixture database passwords (generated for this job)
        timeout-minutes: 2
        run: bash scripts/qa-passwords.sh

      - name: Start the Documenso stack (harness v0.3.1)
        timeout-minutes: 30
        run: timeout 1500 "$NODE24" node_modules/qa-portfolio-harness/scripts/up.mjs documenso

      - name: Provision the read-only and fixture roles
        timeout-minutes: 5
        run: |
          # Copy the exact run block of p2-doc.yml "Provision the read-only and fixture roles" (lines 106-109).
          true

      - name: Serial project (cron ticks, sweeps; runs alone, --no-deps)
        timeout-minutes: 60 # SERIAL_STEP basis: measured 29 min 07 s; unchanged from p2-doc.yml today.
        env:
          P2_JSON_FILE: results/playwright-doc-serial.json
          P2_JUNIT_FILE: results/junit-serial.xml
          P2_HTML_DIR: playwright-report-serial
        run: |
          "$NODE22" node_modules/@playwright/test/cli.js test --project=doc-serial --no-deps

      - name: Write the job summary (doc-serial)
        if: ${{ !cancelled() }}
        timeout-minutes: 2 # SUMMARY_STEP basis: P1 e2e.yml:258.
        run: |
          "$NODE22" scripts/write-ci-job-summary.ts "doc-serial" results/playwright-doc-serial.json

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

Notes for the builder:

- The skeleton above has two placeholder steps (`PDF tools` and `Provision`). Replace each with the
  exact block it names from `p2-doc.yml`. Do not write them from memory. The unit test in section 7
  (W5) fails on a placeholder `true`.
- The `Node 24` step in the skeleton is written with `node-version: 24`. Copy the exact `setup-node`
  block from `p2-doc.yml` (lines 77-81) instead, so the version and any comment match the source.
- `P2_JSON_FILE` is set on the serial step; the job-level `env` does not set it, to keep one file per run.
- The `Stop the stack` step is `always()`; the summary is `!cancelled()`. The summary runs before the
  stack stops, so a stack-stop failure never hides the results.

### 5.4 `scripts/ci-changes.sh` and `docs/lane-ownership.md`

- `scripts/ci-changes.sh`: add `\.github/workflows/p2-doc-serial\.yml$` to `re_doc`. A change to the
  serial file then counts as a doc change, which runs `doc-api` (the PR path), not serial. This keeps the
  gate's doc flag honest. Unit test G15 (section 7) pins it.
- `docs/lane-ownership.md`: the Documenso row lists `.github/workflows/p2-doc.yml`. Add
  `.github/workflows/p2-doc-serial.yml`. In the "Gate for lane workflows" section, add one sentence:
  "`p2-doc-serial.yml` runs on a schedule and on manual dispatch only, and is never called from `ci.yml`."

### 5.5 Why the PR gate still requires the doc lane when doc paths change

`ci.yml` is unchanged. The `p2-doc` caller job still runs when the doc flag is `true` (section 4.3 of the
CI gate plan). After this change that job runs `doc-api` only, about 9 minutes, shorter than the Cal lane.
The `gate` job still requires `p2-doc` to succeed when its flag is true (CI gate plan, section 4.5).

## 6. Summary of file changes (the build's exact list)

| Path | Change |
|---|---|
| `playwright.config.ts` | Add the JSON reporter with `P2_JSON_FILE` (section 4.2). |
| `src/ci/playwright-json-summary.ts` | New (section 4.3). |
| `src/ci/known-defect.ts` | New (section 4.4). |
| `scripts/write-ci-job-summary.ts` | New (section 4.3). |
| `scripts/ci-changes.sh` | Add `p2-doc-serial.yml` to `re_doc` (section 5.4). |
| `.github/workflows/p2-doc.yml` | Remove serial, add summary and JSON env, rename the job, timeouts (section 5.2). |
| `.github/workflows/p2-doc-serial.yml` | New (section 5.3). |
| `.github/workflows/p2-cal.yml` | JSON env, summary step, upload path (section 4.5). |
| `.github/workflows/p2-med.yml` | JSON env, summary step, upload path (section 4.5). |
| `.github/workflows/p2-tw.yml` | JSON env and summary step in each of three jobs (section 4.5). |
| `tests/unit/ci/workflow.test.ts` | Serial file rules, `ci.yml` does not call it, G15 (section 7). |
| `tests/unit/ci/job-summary.test.ts` | New (section 7). |
| `tests/unit/ci/known-defect.test.ts` | New (section 7). |
| `tests/unit/lanes/doc/ci.test.ts` | Serial assertions move to `p2-doc-serial.yml` (section 7, D-group). |
| `tests/integration/tw/currency.spec.ts` | Two call sites → `expectedDefect` (section 4.4). |
| `tests/webhooks/doc/payload.spec.ts` | One → `expectedDefect`. |
| `tests/webhooks/tw/b1-drop.spec.ts` | One → `expectedDefect` (the comment at line 60 stays a comment). |
| `tests/webhooks/cal/cal-wh.spec.ts` | One bare → `expectedDefect("B2: …")`. |
| `tests/contracts/doc/upload.spec.ts` | Four → `expectedDefect(PB_DOC_001)`. |
| `tests/contracts/tw/rest-oas.spec.ts` | One → `expectedDefect`. |
| `tests/contracts/cal/cal-con.spec.ts` | Two bare → `expectedDefect("PB-CAL-OAS-1: …")`. |
| `tests/contracts/cal/cal-con-005.spec.ts` | One bare → `expectedDefect("PB-CAL-OAS-1: …")`. |
| `tests/contracts/med/product-contract.spec.ts` | One → `expectedDefect`. |
| `tests/serial/doc/conversion.spec.ts` | One → `expectedDefect(P5_CONV_001)`. |
| `tests/serial/cal/cal-task.spec.ts` | One bare → `expectedDefect("B4: …")`. |
| `docs/lane-ownership.md` | Documenso row and one gate sentence (section 5.4). |

Nothing else changes. `ci.yml`, `api.yml`, `env-check.yml`, `tw-study.yml`, `package.json`,
`package-lock.json`, the harness and `.env*` are not touched.

The lane-owned test files are touched because the rule (`expectedDefect`) is a shared lint and
the call sites are the only way to satisfy it. OD-2 records this. The change is one line per call
site, with no assertion changed.

## 7. Unit tests (exact list, names and counts)

Baseline on `origin/main` at `47c507e`: whole run `# tests 572`, `# pass 572`; in
`tests/unit/ci/workflow.test.ts`: `# tests 62`. Build records the real numbers.

Predicted after the change: whole run **589** (572 + 17); `tests/unit/ci/workflow.test.ts` **66**
(62 + 4). The 17 new tests are the list below. The D-group changes assertions in an existing test
and adds none.

### 7.1 `tests/unit/ci/job-summary.test.ts` (new, 11 tests, pure: no file system)

| # | Test name | Assertion |
|---|---|---|
| S1 | parses per-project totals | a fixture with `projectName` `cal-api` and `cal-serial` yields two project rows with the right counts |
| S2 | reads the defect ID and evidence from the `issue` annotation | `splitDefect("B2: a receiver 500 …")` → `{id: "B2", evidence: "a receiver 500 …"}` |
| S3 | a bare expected failure is listed with an empty defect ID | a `status: expected`, `expectedStatus: failed` node without an `issue` annotation → `defectId === ""`, and `formatJobSummary` prints `**NO DEFECT ID**` |
| S4 | the invariant sweep is aggregated per product | three `invariant-sweep` annotations for `cal` give `tests: 3` and the summed `violations` |
| S5 | `unexpected` tests are counted as failed and listed by title | one unexpected node → `failed: 1` and its title in `unexpectedFailures` |
| S6 | `flaky` and `skipped` are counted, not passed | one of each → `flaky: 1`, `skipped: 1`, `passed: 0` |
| S7 | `requireTests` throws for a report with zero tests | `requireTests` on an empty summary throws `contains zero tests` |
| S8 | the markdown has the exact table header and total row | snapshot of the first table lines for the fixture |
| S9 | evidence that names a `docs/` path becomes a commit-pinned link | `evidenceCell("docs/x.md:325", "o/r", "abc")` → `[docs/x.md](https://github.com/o/r/blob/abc/docs/x.md#L325)` |
| S10 | evidence without a path is plain text | `evidenceCell("product bug", …)` → `product bug` |
| S11 | the CLI prints a warning and exits 0 when no report exists | `spawnSync` of `node scripts/write-ci-job-summary.ts cal results/missing.json` → status 0, stdout has `::warning::` |

### 7.2 `tests/unit/ci/known-defect.test.ts` (new, 2 tests)

| # | Test name | Assertion |
|---|---|---|
| K1 | no `test.fail(` outside `src/ci/known-defect.ts` | scan `tests/**/*.ts` and `src/**/*.ts`, skip comment-only lines (first non-space `//`, `*`, `/*`), fail with the file:line list. Red on `origin/main` (16 sites) until the migration (section 9, step B3). |
| K2 | `parseDefectDescription` rejects a description with no ID or no evidence | `"no colon"` and `"B2:"` throw; `"B2: text"` returns `{id: "B2", evidence: "text"}` |

### 7.3 `tests/unit/ci/workflow.test.ts` (4 new tests; existing assertions updated)

| # | Change | Assertion |
|---|---|---|
| W1 | `lanes` list (line 233) gains `p2-doc-serial.yml` | the existing "each lane workflow is either inert or a safe live lane" test covers it. No new test. |
| W2 | Triggers rule: `schedule` allowed in `p2-doc-serial.yml` as well as `tw-study.yml` | existing trigger test covers it. No new test. |
| W3 | new test: `ci.yml` does not call `p2-doc-serial.yml` | `assert.ok(!caller.includes("p2-doc-serial.yml"))` |
| W4 | new test: `p2-doc-serial.yml` triggers are exactly `schedule` and `workflow_dispatch`, with cron `37 2 * * *` | `triggersOf(lines)` deep-equals the two, and the cron line matches |
| W5 | new test: the serial file has no placeholder `true` step and no `secrets` reference | no line equals `          true`, and `/\bsecrets\./` does not match |
| G15 | `tests/unit/ci/workflow.test.ts` classifier group (14 today): a change to `p2-doc-serial.yml` runs only `doc` | `classify("pull_request", [".github/workflows/p2-doc-serial.yml"])` → `only("p2_doc")` |

Total new in `workflow.test.ts`: W3, W4, W5, G15 = 4. The count is 62 + 4 = 66.

### 7.4 `tests/unit/lanes/doc/ci.test.ts` (no new test; assertions moved)

- Lines 47-53 (`it has the doc-api job (API and serial steps) …`): assert the `doc-api` job has the API
  step and **no** serial step (`!WORKFLOW.includes("Serial project")`), and that the serial command
  lives in `p2-doc-serial.yml` (read that file).
- Lines 81-88 (config project names): the serial name is checked against `p2-doc-serial.yml`,
  not `p2-doc.yml`.
- Line 75-78 (fork guard count = 2): unchanged; `p2-doc.yml` still has two guarded jobs.

Total new in the whole run: 11 (S) + 2 (K) + 4 (W3, W4, W5, G15) = **17**. Predicted whole run
572 + 17 = **589**; `workflow.test.ts` 62 + 4 = **66**.

## 8. Documentation

- `docs/lane-ownership.md`: section 5.4. No owner name.
- This plan is the only new doc. The build does not add a runbook; the job summary is self-explanatory.

## 9. Build checklist (step-ordered, for the builder)

Run each command from the repository root. Node 22 (`.nvmrc`). Each step ends with a check.

0. Prerequisites. `git fetch origin`. `git rev-parse origin/main` must print `47c507e…` or a descendant
   that contains it. Otherwise stop (S1, section 14). `node -v` prints `v22.x`. Create the branch:
   `git checkout -b feat/2026-11-06-p2-run-summary-nightly origin/main`.
1. Baseline. `npm run -s unit` must end `# pass 572`, `# fail 0`. Record it.
2. Write the lint test first (K1, K2). `node --test tests/unit/ci/known-defect.test.ts`. K1 is red
   (16 sites). That is the expected red.
3. Write the summary tests first (S1 to S11). They are red until the module exists.
4. Create `src/ci/known-defect.ts` (section 4.4). Create `src/ci/playwright-json-summary.ts` (section 4.3).
   Create `scripts/write-ci-job-summary.ts` (section 4.3). Run `node --test tests/unit/ci/job-summary.test.ts`
   and `node --test tests/unit/ci/known-defect.test.ts` (K2 green; K1 still red).
   For `P2-TW-BUG-001 (GraphQL)` (section 4.4): move "(GraphQL)" into the evidence text. The defect ID is
   `P2-TW-BUG-001`.
5. Migrate the 16 call sites (section 4.4 table and section 6 file list). Run
   `node --test tests/unit/ci/known-defect.test.ts`: K1 green. Run `npx tsc -p tsconfig.json --noEmit`
   (typecheck) and `npx eslint tests src scripts` (lint). Both exit 0.
6. Playwright config (section 4.2). Run `npx playwright test --list --project=cal-api` to confirm the config
   loads. Output ends with a count and no error.
7. Verify V1 to V3 locally with a one-test project (an invented spec under `tests/unit/` is NOT allowed; use a
   throwaway spec under `scratch/` that is never added to git). Read the JSON. Record `projectName`, the
   status values, and the annotation types. Delete the throwaway file with an explicit path (`rm scratch/<file>`)
   and never use a glob.
8. Workflows. Edit `p2-cal.yml`, `p2-med.yml`, `p2-tw.yml`, `p2-doc.yml` as in sections 4.5 and 5.2. Create
   `p2-doc-serial.yml` (section 5.3) and fill its two placeholder steps from `p2-doc.yml` line ranges.
   Run `npx prettier --check .github/workflows/` (exit 0) and `node --test tests/unit/ci/workflow.test.ts`.
9. Checker and doc unit changes (section 7.3 and 7.4). `node --test tests/unit/ci/workflow.test.ts` and
   `node --test tests/unit/lanes/doc/ci.test.ts` green.
10. `scripts/ci-changes.sh` (section 5.4, G15). `bash -n scripts/ci-changes.sh`.
11. `docs/lane-ownership.md` (section 5.4).
12. Full checks: `npm run check` exit 0. Record `# tests 589`, `# pass 589`, `# fail 0` (or the real
    numbers, with the reason for any difference).
13. Stage by explicit path, one commit per group, lowercase conventional subjects (section 10). No `git add -A`.
14. Push: `git push -u origin feat/2026-11-06-p2-run-summary-nightly`. Retry only network errors, per the repo rules.
15. Open the build PR into `main` (the build session does this). Title:
    `ci: p2 run summary, expected-defect annotations, nightly documenso serial`.
16. Evidence (section 11). Record run URLs in the PR body as they land.

## 10. Commit plan (lowercase, no trailers)

1. `test(ci): add the summary and defect-annotation unit tests` (K1, K2, S1 to S11 files, not yet green).
2. `ci: add the p2 job summary module, its cli and the expectedDefect helper` (`src/ci/…`, `scripts/write-ci-job-summary.ts`, the two new unit files green).
3. `test(defects): route every expected failure through expectedDefect` (the 11 test files; K1 green).
4. `ci: write a job summary and a json report from each p2 lane` (`playwright.config.ts`, `p2-cal.yml`, `p2-med.yml`, `p2-tw.yml`, `p2-doc.yml` summary and JSON parts).
5. `ci: move the documenso serial project to a nightly workflow` (`p2-doc.yml` serial removal, `p2-doc-serial.yml`, `scripts/ci-changes.sh`, `tests/unit/ci/workflow.test.ts`, `tests/unit/lanes/doc/ci.test.ts`).
6. `docs(ci): describe the serial nightly and the job summary in lane-ownership` (`docs/lane-ownership.md`).

Each commit must leave `npm run unit` green, except commit 1 (red by design, K1 and the summary tests). If
the builder prefers, commit 1 and 2 can be squashed locally before the first push (not after: never amend a
pushed commit).

Explicit `git add` paths: list the files of each commit by name (section 6). `git diff --cached --stat`
before each commit.

## 11. Verification: required evidence (for the build PR body)

- **E1 (unit).** `npm run check` exit 0; counts `589 / 589`, `66` in `workflow.test.ts` (or the real numbers and the reason).
- **E2 (summary visible, expected-failure table populated).** One lane run on the build PR (the `p2-cal`
  or `p2-tw` job, which is on the PR path when shared CI paths change). Its job summary shows the results
  table, the expected-failures table with at least one defect ID (for example `PB-CAL-OAS-1`), the sweep
  line, and the run link. Record the run URL and the summary text.
- **E3 (PR timing without serial).** The `p2-doc / doc-api` job on the build PR (doc paths changed) finishes
  without a serial step. Record the job URL, the wall time, and the step list (no `Serial project` step).
  Compare with 37 min 51 s (run 42081000668).
- **E4 (nightly or dispatch serial run).** A `p2-doc-serial` run on `main` after the merge (owner dispatches
  it, V6): the job URL, its conclusion, its job summary, and its wall time.
- **E5 (serial alone, V5).** The E4 run must pass without `doc-api`. A failure there is a dependency on
  API state, and the plan's answer is then to make the serial test set self-contained, not to re-add
  `doc-api` to the nightly.
- **E6 (expected-failure defect on the summary for each migrated defect family).** One summary line per family
  (`B2`, `B4`, `PB-CAL-OAS-1`, `P2-TW-BUG-001`, `PB-DOC-001`), read from the lane runs that exist.
- **E7 (V1 to V4 from the step-7 readout).** The recorded `projectName`, status values, annotation types and
  sweep annotation presence, pasted into the PR body.

## 12. Owner steps (after the build PR is green; never by the session)

1. Read the build PR evidence (section 11, E1 to E3). Approve the migration of lane-owned test files (OD-2).
2. Merge with a merge commit, as before. The ruleset is unchanged (`gate` stays the required check).
3. After the merge, dispatch `p2-doc-serial` from `main` (V6). Record its URL as E4 and E5. The schedule starts on
   its own from the next 02:37 UTC.

Sessions never change the ruleset, never merge, never tag, never dispatch.

## 13. Environment changes

None expected. The change uses Node 22 (already `.nvmrc`) to run `.ts` files with type stripping, the same
way `scripts/validate-specs.ts` runs today. No new package, no `tsx`.

- Cursor cloud: no change. `.cursor/environment.json` and `scripts/cloud-install.sh` are untouched.
  `PRODUCTS_ROOT=/home/user/products` stays as today.
- Claude Code cloud: no change. `.claude/hooks/session-start.sh` is untouched.
- New secret: none. `p2-doc-serial.yml` references no secret (W5). New host: none. The summary reads files only.
- Local builder tools: `node` 22. Nothing else.

## 14. Risks, open decisions, STOP conditions

### 14.1 Risks

| ID | Risk | Mitigation |
|---|---|---|
| R1 | The nightly serial depends on API state (V5). | `--no-deps` is already in use. E5 is the test. If it fails, the fix is in the serial tests, not the nightly's job list. |
| R2 | A scheduled or dispatched run only starts from `main` (V6). The serial job cannot prove itself before merge. | The PR proves the doc API path and the summary. The serial proof is E4, after the merge. Stated in section 12. |
| R3 | Playwright's JSON shape differs from P6's assumption (V1). | Step 7 reads the real JSON. The parser is unit-tested on a fixture from the real output (S1). |
| R4 | `expectedDefect` pushes the annotation after a failing assertion or in the wrong place (V2). | The helper is called where the bare call sat. E2 shows it. |
| R5 | The summary CLI exits 1 on a bad report and turns a lane red. | RD-5 is deliberate. A bad report is a tooling bug and must show. The lane's test result is unchanged. |
| R6 | Expected-failure evidence links point at a SHA that does not contain the path (a deleted file). | The link uses `GITHUB_SHA` of the run, so it matches the code under test. |
| R7 | Lane-owned test files change (OD-2). | One-line call-site replacements only, no assertion changes. Owner approval in section 12. |
| R8 | `ubuntu-24.04` runners and the `setup-node` version for Node 24 differ from the copy (5.3 note). | Copy the exact `setup-node` block from `p2-doc.yml`. |
| R9 | The JUnit and HTML report names for the serial file in `p2-doc-serial.yml` (`junit-serial.xml`) are no longer needed in `p2-doc.yml`. | Keep the names as they are in the new file, so nothing else reads a different path. |

### 14.2 Open decisions

OD-1 to OD-4 in section 3.2. All four have a default and do not block the plan.

### 14.3 STOP conditions (builder)

- S1 `origin/main` is not `47c507e` or a descendant. Stop, report the real sha, and put it in this plan's header.
- S2 V1 or V3 shows that Playwright does not write `projectName` or the `issue` annotation as assumed. Stop. Do not
  change the parser to hide the difference. Report the real shape and wait for the owner.
- S3 V5 fails (E5): the serial project needs API state. Stop before moving the serial step. Report which test
  depends on which API test.
- S4 Any lane run shows `skipped` for a job whose flag is true. Stop. That is a guard or classifier bug (CI gate plan, S3).
- S5 A step needs a secret that this plan does not name. Stop. The allow-list stays `["STRIPE_API_KEY"]` and
  `p2-doc-serial.yml` names none.
- S6 Any action or env change is needed outside section 13. Stop and report.

## 15. Repo rules applied (plan and build)

- No personal name in repository text. Repository slugs appear only inside URLs, as the owner allowed.
- No `Co-authored-by`, no `Claude-Session`, no session or chat links, no "Generated by" footer, no model name.
- Lowercase conventional commit subjects (section 10).
- `git add` by explicit path. No `git add -A`. No force-push. No hook skipping. No amend of a pushed commit.
- Sessions never merge, tag or dispatch. The owner dispatches the serial run (section 12).
- No secret value is printed or written.
- No edit to product forks, the harness package, `.env` files or `node_modules`.
- Industry practice only: no `continue-on-error`, no weakened gate, no duplicate triggers kept "just in case".
- Root-cause fixes only. The long PR critical path is fixed by moving the serial work to its own schedule, not by
  filtering or retrying tests.
- Timeouts are named comments with a basis: `DOC_API_JOB` 30 min, `DOC_API_STEP` 15 min, `SUMMARY_STEP` 2 min,
  `SERIAL_STEP` 60 min, `DOC_SERIAL_JOB` 90 min (sections 5.2, 5.3). Cal, med and tw job timeouts are unchanged.
- Network: `127.0.0.1` only for any local harness call. No new host.

## 16. Final report format (for the build session)

1. Base sha verified (section 9, step 0).
2. Plan path and the plan commit sha.
3. Build branch, build commits (sha and subject), PR URL.
4. Test counts: before 572 / 62, after (measured), and any difference from 589 / 66, with the reason.
5. Evidence E1 to E7 with URLs and results, or "not run" with the reason.
6. Open decisions OD-1 to OD-4 with the value the owner chose.
7. Anything UNVERIFIED, listed by ID from section 2.5 (V1 to V8). Nothing left unlisted.
