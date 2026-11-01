# P2 foundation Task 6: the CI foundation job the four lanes depend on (plan only)

Builds on Task 5 (`docs/plans/2026-11-01-p2-task5-env-prereqs-readiness.md`). Index:
`docs/plans/2026-11-01-p2-foundation-index.md`. After this task the work splits into four parallel product lanes
(cal, doc, med, tw); this plan does not plan lane cases.

## 1. Header

- Plan branch `plan/2026-11-01-p2-foundation`. Base commit at plan time: `main` = `fd554c901e82a7a936fb0074af42de6b26f56ab1`.
- Build branch: `feat/<build-date>-p2-task6-ci-foundation`, `<build-date>` = `date -u +%F`. **Cut from the head of the
  Task 5 branch**, record that SHA. PR base: the Task 5 branch.
- Depends on Tasks 2 to 5 (it only needs their files to exist; it runs no product). Unit chain: Task 5 head **265**
  -> this task **277** (+12). Playwright projects: 4 -> 8 (adds the `*-serial` twins, no tests yet).
- Harness `v0.2.18` (Task 5). Probe date 2026-11-01.
- Verification of this plan: built in the scratch copy; `npm run check` exit 0 (277/277), `npm run specs:validate`
  `ok: 3/3 valid`, the workflow parses (Python `yaml`), the `foundation` gate logic was run with `jq` on a failing and
  a passing `needs` object. No CI run was possible during planning, so CI wall-clock times are **UNPROBED** and the
  PR must paste the first run's job durations (section 9).

## 2. Probe findings

> No probe of the products was needed; local timings and the gate check are recorded here. The probe record is `docs/probes/2026-11-01-p2-foundation-probes.md` (section P7 for the base counts).

### 2.1 What exists

`.github/workflows/api.yml` (Task 1): jobs `check`, `unit`, `db-guard`, each `timeout-minutes: 10`, `permissions:
contents: read` at workflow level, `concurrency` per ref, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"`. `env-check.yml`:
job `env-check`, `timeout-minutes: 5` (`bash -n` and `shellcheck` on scripts and hooks, JSON configs parse, `.env` not
tracked). These job names are or will be required checks; renaming one breaks the Main ruleset.

### 2.2 Action pins (checked with `git ls-remote --tags` on 2026-11-01; still the newest tags)

| Action | Pin used in the file | Tag |
|---|---|---|
| `actions/checkout` | `3d3c42e5aac5ba805825da76410c181273ba90b1` | v7.0.1 |
| `actions/setup-node` | `949feb2413d6458794dcd2491c4babbbce0c15c1` | v7.1.0 |
| `actions/upload-artifact` | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | v7.0.2 |

All three are lightweight tags, so the tag SHA is the commit. The new jobs reuse exactly these.

### 2.3 Local timings of the commands each job runs (probe VM, 4 cores; CI runners are slower)

```text
npm ci (registry cache warm)            10.8 s
npm run check:static (format, lint, tsc) 17.5 s
npm run unit (277 tests)                  2.8 s
npm run specs:validate                    0.6 s
npx playwright test --list                1.5 s
npm run test:db (postgres:15 up)          2.1 s
```

### 2.4 The offline OAS step

`loadSpec` (Task 1) dereferences, validates and compiles response schemas. `scripts/validate-specs.ts` runs it over
every `*.json|*.yaml|*.yml` under `contracts/` (lanes add `contracts/<product>/...`) and `tests/fixtures/oas/`, except
the Swagger 2.0 file that `tests/unit/contracts/oas.test.ts` rejects on purpose. A dangling `$ref` fails with a one-line
reason (`Missing $ref pointer "#/components/schemas/Missing"`). Today it validates 3 files.

### 2.5 The gate pattern (run locally with jq)

```text
NEEDS={"check":{"result":"success"},"unit":{"result":"success"},"db-guard":{"result":"failure"},"specs":{"result":"skipped"}}
jq -e 'all(.[]; .result == "success")'  -> exit 1      (failure and skipped both fail the gate)
all four "success"                       -> exit 0
```

`if: always()` on the gate makes it run, and fail, when a dependency failed; without it GitHub would mark the gate
"skipped", which a required check accepts as passing in some configurations.

## 3. Resolved decisions

- **D1. Keep `check`, `unit`, `db-guard` byte-for-byte except two lines:** one assertion line in `check` (the project list
  now has the serial twins), and the `db-guard` service health command, now `pg_isready -h 127.0.0.1 -U postgres`. The IPv4
  literal avoids a `localhost` lookup that can return `::1` (the CI runner behaviour is UNPROBED; the first run confirms the
  service is healthy). Names and `timeout-minutes: 10` are pinned by a unit test.
- **D2. Add `specs` (offline OAS validity, 10 min) and `foundation` (gate, 5 min).** Lanes declare `needs: foundation`;
  the ruleset can require `foundation` alone, with `check`/`unit` kept because they already are required.
- **D3. `foundation` is a `jq` check of `toJSON(needs)`.** Standard gate pattern; prints each result; fails unless all
  are `success`. No checkout, no cache, no token.
- **D4. Lane skeleton as a comment, not as jobs.** A lane is `needs: foundation`, one job per product, `timeout-minutes: 30`
  (25 min budget plus 5 for the `always()` cleanup), bootstrap -> harness `up` -> roles -> tests -> upload ->
  harness `down`.
  **Build cache (decided here; the lane tasks implement it).** Key: `p2-build-<product>-<pinned product SHA>-<harness tag>-<node version>-<hash of the lockfiles>`,
  where the product SHA is pinned in `scripts/bootstrap.sh`, the harness tag in `package.json`, the Node version is `node -v`,
  and the hash covers `package-lock.json` and the product's lockfile (`hashFiles(...)`). It caches build output only, never a product's
  `node_modules` from another key. The repository's Actions cache limit is 10 GB (GitHub's documented limit; UNPROBED for this
  repository): the owner checks the usage before the first lane. Alternative, not chosen now: prebuilt harness images (one `docker
  build` per tag, pushed to a registry); it needs a registry, credentials and a retention policy, so it is a later owner decision.
  Budget: section 9 has a cold and a warm row for each lane product.
- **D5. Serial projects reserve the shape for cron, tasker and sweep cases:** `cal-serial`, `doc-serial`, `med-serial`,
  `tw-serial`, `testMatch: serial/<code>/**/*.spec.ts`, `dependencies: ["<code>-api"]`. Everything is already
  `workers: 1`; the projects fix the place (after the product's other tests) and the name. `productOfProject` maps
  them to the same product so the sweep and the receiver fixture work.
- **D6. A unit test guards the workflow** (`tests/unit/ci/workflow.test.ts`): job ids and names, timeouts (`10,10,10,10,5`),
  every `uses:` pinned by 40-hex SHA with a `# vX.Y.Z` comment, `permissions: contents: read`, no `pull_request_target`,
  no `continue-on-error`, no `secrets.`, the `foundation` needs list and `always()`, the lane skeleton commented. No YAML
  parser dependency.
- **D7. No timeout is raised; every new job sets its own.** Budget table in section 9.

## 4. Case mapping

None. Framework checks: workflow shape (7 tests), OAS discovery and validation (5 tests), project/product map for the
serial twins (1 changed test). Prepares: the lane jobs of all products (`needs: foundation`), P2-CAL-SCH-002 (`startAfter`), P2-CAL-SCH-003 (new),
P2-CAL-TASK-001/002 (driven by a connection reset), P2-DOC-REM-001/002 (`nextReminderAt`), P2-DOC-EXP-*, P2-DOC-JOB-* and
P2-TW-JOB-001 (serial projects). The CUT IDs of index section 9 are not used here.

## 5. Architecture

| File | Change | Responsibility |
|---|---|---|
| `.github/workflows/api.yml` | edit | `specs` and `foundation` jobs, serial-twin assertion, lane skeleton comment |
| `package.json` | edit | script `specs:validate` |
| `src/contracts/validate-specs.ts` | new | discovery and validation, pure and injectable |
| `scripts/validate-specs.ts` | new | CLI for the `specs` job |
| `tests/fixtures/oas-invalid/broken-ref.yaml` | new | negative fixture (not scanned by the CLI) |
| `playwright.config.ts` | edit | `serialProject()` and the four `*-serial` projects |
| `src/invariants/rules.ts` | edit | project -> product map includes the serial twins |
| `tests/unit/ci/workflow.test.ts`, `tests/unit/contracts/validate-specs.test.ts` | new | 12 tests |
| `tests/unit/invariants/engine.test.ts` | edit | the project-map test covers both suffixes |

Not touched: `env-check.yml`, the harness, any product, the existing steps of `check`, `unit`, `db-guard`.

## 6. Module contracts (exact code, built and tested in the scratch copy)

### 6.1 The workflow

Final `api.yml` (the unchanged steps are byte-identical to `main`):

`.github/workflows/api.yml`

```yaml
# Foundation shape (plan Task 6). The four product lanes (cal, doc, med, tw) are added later as jobs
# that declare `needs: foundation`; see the commented skeleton at the end of this file.
name: api

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: api-${{ github.ref }}
  cancel-in-progress: true

defaults:
  run:
    shell: bash

env:
  # Playwright 1.64 has no install script; this only guards against a future one. No browsers.
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"

jobs:
  check:
    name: check
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Install
        run: npm ci
      - name: Format, lint, typecheck
        run: npm run check:static
      - name: Playwright has the four API projects, their serial twins and no browser
        run: |
          set -euo pipefail
          npm run list:api
          out="$(npx playwright test --list --project=__list_projects__ 2>&1 || true)"
          echo "$out" | grep -F 'Available projects: "cal-api", "doc-api", "med-api", "tw-api", "cal-serial", "doc-serial", "med-serial", "tw-serial"'
          if [ -d "$HOME/.cache/ms-playwright" ]; then
            echo "A Playwright browser cache exists; P2 must not download browsers." >&2
            exit 1
          fi

  unit:
    name: unit
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Install
        run: npm ci
      - name: Unit tests (node:test, no product)
        run: |
          mkdir -p results
          npm run unit:ci
      - name: Upload unit JUnit
        if: always()
        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: unit-junit
          path: results/unit-junit.xml
          if-no-files-found: warn
          retention-days: 7

  # Proves the server-side read-only layers on a real Postgres (plan D5, D14). Not a product.
  # Not required at first; joins check and unit in the Main ruleset after two green main runs.
  db-guard:
    name: db-guard
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    services:
      postgres:
        image: postgres:15
        env:
          # Throwaway service container that lives only for this job; not a secret.
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -h 127.0.0.1 -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      P2_DB_GUARD_URL: postgres://postgres:postgres@127.0.0.1:5432/postgres
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Install
        run: npm ci
      - name: Read-only layers against postgres:15 (25006, 42601, 57014, EXPLAIN ANALYZE)
        run: npm run test:db

  # Offline OAS validity: every committed spec dereferences, validates and compiles (no product).
  specs:
    name: specs
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Install
        run: npm ci
      - name: Committed OAS files are valid (contracts/ and tests/fixtures/oas/)
        run: npm run specs:validate

  # The single gate the product lanes depend on. It runs even when a dependency failed (always())
  # so that its own result is a failure then, not "skipped".
  foundation:
    name: foundation
    needs: [check, unit, db-guard, specs]
    if: ${{ always() }}
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - name: Every foundation job succeeded
        env:
          NEEDS: ${{ toJSON(needs) }}
        run: |
          set -euo pipefail
          echo "$NEEDS" | jq -r 'to_entries[] | "\(.key): \(.value.result)"'
          echo "$NEEDS" | jq -e 'all(.[]; .result == "success")' >/dev/null

  # ---- Lane skeleton (guidance only; lanes are added by their own tasks) -----------------------
  # A lane is one job per product, about 25 minutes at most, with its own stack:
  #
  #   cal-api:                          # doc-api, med-api, tw-api alike
  #     name: cal-api
  #     needs: foundation
  #     runs-on: ubuntu-24.04
  #     timeout-minutes: 30            # 25 min budget + 5 min for the always() cleanup below
  #     env:
  #       P2_QA_RO_PASSWORD / P2_QA_FIXTURE_PASSWORD: generated per job (openssl rand -hex 16, ::add-mask::)
  #     steps:
  #       - checkout, setup-node, npm ci                       # same pinned actions as above
  #       - bootstrap the product at its pinned ref            # bash scripts/bootstrap.sh cal
  #       - harness up                                          # node node_modules/qa-portfolio-harness/scripts/up.mjs cal
  #       - provision roles                                     # npm run db:roles:provision -- cal
  #       - start the receiver and run the lane                 # npx playwright test --project=cal-api --project=cal-serial
  #       - upload report, junit, receiver-logs/, fixture-logs/ # if: always(), retention-days: 7
  #       - harness down                                        # if: always(); the job must always end with `down`
  #
  # Cron, tasker and sweep cases live in tests/serial/<code>/ and run in the <code>-serial project
  # after <code>-api (workers=1 already; the project only fixes their place and name).
```

Diff against Task 5:

`.github/workflows/api.yml` (diff)

```diff
--- a/.github/workflows/api.yml
+++ b/.github/workflows/api.yml
@@ -1,2 +1,4 @@
+# Foundation shape (plan Task 6). The four product lanes (cal, doc, med, tw) are added later as jobs
+# that declare `needs: foundation`; see the commented skeleton at the end of this file.
 name: api
 
@@ -39,10 +41,10 @@ jobs:
       - name: Format, lint, typecheck
         run: npm run check:static
-      - name: Playwright has the four API projects and no browser
+      - name: Playwright has the four API projects, their serial twins and no browser
         run: |
           set -euo pipefail
           npm run list:api
           out="$(npx playwright test --list --project=__list_projects__ 2>&1 || true)"
-          echo "$out" | grep -F 'Available projects: "cal-api", "doc-api", "med-api", "tw-api"'
+          echo "$out" | grep -F 'Available projects: "cal-api", "doc-api", "med-api", "tw-api", "cal-serial", "doc-serial", "med-serial", "tw-serial"'
           if [ -d "$HOME/.cache/ms-playwright" ]; then
             echo "A Playwright browser cache exists; P2 must not download browsers." >&2
@@ -110,2 +112,59 @@ jobs:
       - name: Read-only layers against postgres:15 (25006, 42601, 57014, EXPLAIN ANALYZE)
         run: npm run test:db
+
+  # Offline OAS validity: every committed spec dereferences, validates and compiles (no product).
+  specs:
+    name: specs
+    runs-on: ubuntu-24.04
+    timeout-minutes: 10
+    steps:
+      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
+        with:
+          persist-credentials: false
+      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
+        with:
+          node-version-file: .nvmrc
+          cache: npm
+      - name: Install
+        run: npm ci
+      - name: Committed OAS files are valid (contracts/ and tests/fixtures/oas/)
+        run: npm run specs:validate
+
+  # The single gate the product lanes depend on. It runs even when a dependency failed (always())
+  # so that its own result is a failure then, not "skipped".
+  foundation:
+    name: foundation
+    needs: [check, unit, db-guard, specs]
+    if: ${{ always() }}
+    runs-on: ubuntu-24.04
+    timeout-minutes: 5
+    steps:
+      - name: Every foundation job succeeded
+        env:
+          NEEDS: ${{ toJSON(needs) }}
+        run: |
+          set -euo pipefail
+          echo "$NEEDS" | jq -r 'to_entries[] | "\(.key): \(.value.result)"'
+          echo "$NEEDS" | jq -e 'all(.[]; .result == "success")' >/dev/null
+
+  # ---- Lane skeleton (guidance only; lanes are added by their own tasks) -----------------------
+  # A lane is one job per product, about 25 minutes at most, with its own stack:
+  #
+  #   cal-api:                          # doc-api, med-api, tw-api alike
+  #     name: cal-api
+  #     needs: foundation
+  #     runs-on: ubuntu-24.04
+  #     timeout-minutes: 30            # 25 min budget + 5 min for the always() cleanup below
+  #     env:
+  #       P2_QA_RO_PASSWORD / P2_QA_FIXTURE_PASSWORD: generated per job (openssl rand -hex 16, ::add-mask::)
+  #     steps:
+  #       - checkout, setup-node, npm ci                       # same pinned actions as above
+  #       - bootstrap the product at its pinned ref            # bash scripts/bootstrap.sh cal
+  #       - harness up                                          # node node_modules/qa-portfolio-harness/scripts/up.mjs cal
+  #       - provision roles                                     # npm run db:roles:provision -- cal
+  #       - start the receiver and run the lane                 # npx playwright test --project=cal-api --project=cal-serial
+  #       - upload report, junit, receiver-logs/, fixture-logs/ # if: always(), retention-days: 7
+  #       - harness down                                        # if: always(); the job must always end with `down`
+  #
+  # Cron, tasker and sweep cases live in tests/serial/<code>/ and run in the <code>-serial project
+  # after <code>-api (workers=1 already; the project only fixes their place and name).
```

### 6.2 Offline OAS validity

`src/contracts/validate-specs.ts`

```ts
import { readdirSync } from "node:fs";
import path from "node:path";
import { loadSpec, type ContractSpec } from "./oas.ts";

/**
 * Offline OAS validity (plan Task 6): every committed spec must dereference, validate and compile
 * its response schemas with the same loader the contract tests use. No product, no network.
 */
const SPEC_FILE = /\.(json|ya?ml)$/i;

/** Fixtures that tests/unit/contracts/oas.test.ts rejects on purpose (Swagger 2.0 is unsupported). */
export const NEGATIVE_FIXTURES: readonly string[] = ["tests/fixtures/oas/swagger-2.0.json"];

export function isSpecFile(file: string): boolean {
  return SPEC_FILE.test(file);
}

/** Recursive, sorted, specs only. A missing root is not an error (lanes create `contracts/<product>` later). */
export function discoverSpecs(
  roots: readonly string[],
  list: (dir: string) => { name: string; isDirectory: boolean }[] = (dir) =>
    readdirSync(dir, { withFileTypes: true }).map((d) => ({
      name: d.name,
      isDirectory: d.isDirectory(),
    })),
): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    let entries: { name: string; isDirectory: boolean }[];
    try {
      entries = list(dir);
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const full = path.posix.join(dir.replaceAll("\\", "/"), entry.name);
      if (entry.isDirectory) walk(full);
      else if (isSpecFile(entry.name)) found.push(full);
    }
  };
  for (const root of roots) walk(root);
  return found.sort();
}

export interface SpecResult {
  readonly file: string;
  readonly ok: boolean;
  readonly detail: string;
}

export async function validateSpecs(
  files: readonly string[],
  load: (id: string, file: string) => Promise<ContractSpec> = loadSpec,
): Promise<SpecResult[]> {
  const results: SpecResult[] = [];
  for (const file of files) {
    try {
      await load(path.basename(file), file);
      results.push({ file, ok: true, detail: "valid" });
    } catch (error) {
      results.push({
        file,
        ok: false,
        detail: error instanceof Error ? (error.message.split("\n")[0] ?? "invalid") : "invalid",
      });
    }
  }
  return results;
}
```

`scripts/validate-specs.ts`

```ts
import {
  discoverSpecs,
  NEGATIVE_FIXTURES,
  validateSpecs,
} from "../src/contracts/validate-specs.ts";

/** `node scripts/validate-specs.ts` (npm run specs:validate): exit 1 if any committed spec is invalid. */
const files = discoverSpecs(["contracts", "tests/fixtures/oas"]).filter(
  (file) => !NEGATIVE_FIXTURES.includes(file),
);
if (files.length === 0) {
  console.error("specs:validate FAILED: no spec found under contracts/ or tests/fixtures/oas/");
  process.exit(1);
}
const results = await validateSpecs(files);
for (const r of results)
  console.log(`${r.ok ? "ok  " : "FAIL"} ${r.file}${r.ok ? "" : `: ${r.detail}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(
  `specs:validate ${failed === 0 ? "ok" : "FAILED"}: ${String(results.length - failed)}/${String(results.length)} valid`,
);
process.exit(failed === 0 ? 0 : 1);
```

`tests/fixtures/oas-invalid/broken-ref.yaml`

```yaml
openapi: 3.0.3
info: { title: broken, version: "1" }
paths:
  /x:
    get:
      operationId: getX
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Missing"
```

`package.json` (diff)

```diff
--- a/package.json
+++ b/package.json
@@ -20,5 +20,6 @@
     "db:roles:provision": "node scripts/db-roles.ts provision",
     "db:roles:teardown": "node scripts/db-roles.ts teardown",
-    "qa:passwords": "bash scripts/qa-passwords.sh"
+    "qa:passwords": "bash scripts/qa-passwords.sh",
+    "specs:validate": "node scripts/validate-specs.ts"
   },
   "dependencies": {
```

### 6.3 Serial projects and the project map

`playwright.config.ts` (diff)

```diff
--- a/playwright.config.ts
+++ b/playwright.config.ts
@@ -22,4 +22,12 @@ function apiProject(name: string, code: string): Project {
 }
 
+/**
+ * Cron, tasker and sweep cases: they trigger product-wide jobs, so they run alone, after the
+ * product's other tests (plan Task 6). Same single worker as everything else.
+ */
+function serialProject(name: string, code: string, after: string): Project {
+  return { name, testMatch: [`serial/${code}/**/*.spec.ts`], dependencies: [after] };
+}
+
 export default defineConfig({
   testDir: "tests",
@@ -51,4 +59,8 @@ export default defineConfig({
     apiProject("med-api", "med"),
     apiProject("tw-api", "tw"),
+    serialProject("cal-serial", "cal", "cal-api"),
+    serialProject("doc-serial", "doc", "doc-api"),
+    serialProject("med-serial", "med", "med-api"),
+    serialProject("tw-serial", "tw", "tw-api"),
   ],
 });
```

`src/invariants/rules.ts` (diff)

```diff
--- a/src/invariants/rules.ts
+++ b/src/invariants/rules.ts
@@ -251,5 +251,5 @@ export function rulesFor(product: ProductId): readonly Rule[] {
 }
 
-/** Playwright project name -> product (playwright.config.ts: cal-api, doc-api, med-api, tw-api). */
+/** Playwright project name -> product (playwright.config.ts: the four -api and the four -serial projects). */
 const PROJECT_PRODUCT: Readonly<Record<string, ProductId>> = {
   "cal-api": "cal",
@@ -257,4 +257,8 @@ const PROJECT_PRODUCT: Readonly<Record<string, ProductId>> = {
   "med-api": "medusa",
   "tw-api": "twenty",
+  "cal-serial": "cal",
+  "doc-serial": "documenso",
+  "med-serial": "medusa",
+  "tw-serial": "twenty",
 };
 
```

### 6.4 Tests (exact names are the contract)

`tests/unit/ci/workflow.test.ts`

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/**
 * Guards the CI shape of plan Task 6 without a YAML parser: the workflow files are small and
 * regular. A change that renames a required check, raises a timeout, loosens an action pin or adds
 * a lane before its task fails here.
 */
const workflow = readFileSync(".github/workflows/api.yml", "utf8");
const live = workflow
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .join("\n");

function jobs(): Map<string, string> {
  const section = live.slice(live.indexOf("\njobs:\n") + 7);
  const out = new Map<string, string>();
  const parts = section.split(/^ {2}([a-z][a-z0-9-]*):\s*$/m);
  for (let i = 1; i < parts.length; i += 2) out.set(parts[i] ?? "", parts[i + 1] ?? "");
  return out;
}
const timeoutOf = (body: string): number =>
  Number(/^ {4}timeout-minutes: (\d+)\s*$/m.exec(body)?.[1]);

describe("api.yml foundation shape", () => {
  test("the jobs are exactly check, unit, db-guard, specs and foundation, each named like its id", () => {
    assert.deepEqual([...jobs().keys()], ["check", "unit", "db-guard", "specs", "foundation"]);
    for (const [id, body] of jobs()) {
      assert.match(body, new RegExp(`^ {4}name: ${id}\\s*$`, "m"), id);
    }
  });

  test("existing timeouts are unchanged, new ones are set, and nothing exceeds 10 minutes", () => {
    const timeouts = Object.fromEntries([...jobs()].map(([id, body]) => [id, timeoutOf(body)]));
    assert.deepEqual(timeouts, { check: 10, unit: 10, "db-guard": 10, specs: 10, foundation: 5 });
  });

  test("every action is pinned by full commit SHA with a version comment", () => {
    const uses = workflow.split("\n").filter((line) => /^\s*-?\s*uses:/.test(line));
    assert.ok(uses.length >= 8);
    for (const line of uses) {
      assert.match(line, /uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+\s*$/, line);
    }
  });

  test("permissions are read-only and the dangerous triggers and flags are absent", () => {
    assert.match(live, /^permissions:\n {2}contents: read\n/m);
    assert.ok(!/pull_request_target/.test(live));
    assert.ok(!/continue-on-error/.test(live));
    assert.ok(!/\bsecrets\./.test(live));
  });

  test("foundation waits for every other job, always runs, and fails unless all succeeded", () => {
    const body = jobs().get("foundation") ?? "";
    assert.match(body, /^ {4}needs: \[check, unit, db-guard, specs\]\s*$/m);
    assert.match(body, /^ {4}if: \$\{\{ always\(\) \}\}\s*$/m);
    assert.match(body, /jq -e 'all\(\.\[\]; \.result == "success"\)'/);
  });

  test("the check job still asserts the four API projects, their serial twins and no browser", () => {
    assert.ok(
      workflow.includes(
        `Available projects: "cal-api", "doc-api", "med-api", "tw-api", "cal-serial", "doc-serial", "med-serial", "tw-serial"`,
      ),
    );
    assert.ok(workflow.includes("ms-playwright"));
  });

  test("the lane skeleton is guidance only: it is commented and names the budget", () => {
    assert.match(workflow, /^\s*# +cal-api:/m);
    assert.match(workflow, /^\s*# +needs: foundation/m);
    assert.ok(!/^ {2}(cal|doc|med|tw)-api:/m.test(live));
    assert.match(workflow, /25 min budget/);
  });
});
```

`tests/unit/contracts/validate-specs.test.ts`

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  discoverSpecs,
  isSpecFile,
  NEGATIVE_FIXTURES,
  validateSpecs,
} from "../../../src/contracts/validate-specs.ts";

describe("offline OAS validity", () => {
  test("isSpecFile accepts json, yaml and yml only", () => {
    assert.deepEqual(
      ["a.json", "a.YAML", "a.yml", "SOURCE.md", "a.json.bak", "a.ts"].map(isSpecFile),
      [true, true, true, false, false, false],
    );
  });

  test("discoverSpecs walks directories, sorts, skips non-specs and tolerates a missing root", () => {
    const tree: Record<string, { name: string; isDirectory: boolean }[]> = {
      contracts: [
        { name: "medusa", isDirectory: true },
        { name: "cal", isDirectory: true },
        { name: "README.md", isDirectory: false },
      ],
      "contracts/medusa": [
        { name: "store.openapi.full.yaml", isDirectory: false },
        { name: "SOURCE.md", isDirectory: false },
      ],
      "contracts/cal": [{ name: "openapi.json", isDirectory: false }],
    };
    const list = (dir: string): { name: string; isDirectory: boolean }[] => {
      const entries = tree[dir];
      if (entries === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return entries;
    };
    assert.deepEqual(discoverSpecs(["contracts", "nowhere"], list), [
      "contracts/cal/openapi.json",
      "contracts/medusa/store.openapi.full.yaml",
    ]);
  });

  test("discoverSpecs rethrows any error other than a missing directory", () => {
    assert.throws(
      () =>
        discoverSpecs(["contracts"], () => {
          throw Object.assign(new Error("denied"), { code: "EACCES" });
        }),
      /denied/,
    );
  });

  test("the committed positive fixtures all validate, and the negative fixture is excluded by name", async () => {
    const files = discoverSpecs(["tests/fixtures/oas"]).filter(
      (f) => !NEGATIVE_FIXTURES.includes(f),
    );
    assert.ok(files.length >= 3);
    const results = await validateSpecs(files);
    assert.deepEqual(
      results.filter((r) => !r.ok),
      [],
    );
    assert.deepEqual(NEGATIVE_FIXTURES, ["tests/fixtures/oas/swagger-2.0.json"]);
    assert.equal((await validateSpecs(NEGATIVE_FIXTURES))[0]?.ok, false);
  });

  test("a spec with a dangling $ref fails with a one-line reason", async () => {
    const results = await validateSpecs(["tests/fixtures/oas-invalid/broken-ref.yaml"]);
    assert.equal(results.length, 1);
    const detail = results[0]?.detail ?? "";
    assert.equal(results[0]?.ok, false);
    assert.match(detail, /Missing \$ref pointer/);
    assert.ok(!detail.includes("\n"));
  });
});
```

`tests/unit/invariants/engine.test.ts` (diff)

```diff
--- a/tests/unit/invariants/engine.test.ts
+++ b/tests/unit/invariants/engine.test.ts
@@ -97,10 +97,12 @@ describe("rules: every product rule is well formed", () => {
       );
     }
-    assert.deepEqual(["cal-api", "doc-api", "med-api", "tw-api"].map(productOfProject), [
-      "cal",
-      "documenso",
-      "medusa",
-      "twenty",
-    ]);
+    const names = ["cal", "doc", "med", "tw"];
+    for (const suffix of ["api", "serial"]) {
+      assert.deepEqual(
+        names.map((code) => productOfProject(`${code}-${suffix}`)),
+        ["cal", "documenso", "medusa", "twenty"],
+        suffix,
+      );
+    }
     assert.equal(productOfProject("chromium"), undefined);
   });
```

Counts: `workflow.test.ts` 7, `validate-specs.test.ts` 5 = **12** added; `engine.test.ts` keeps 16 tests.

## 7. Data isolation, cleanup and leak check

No product, no database, no credential. The `specs` job reads committed files only. The gate has no checkout. Nothing
is uploaded by the new jobs. The lane skeleton states the lane obligations: unique run prefix per job, roles
provisioned and torn down, `down` in an `if: always()` step, artefacts without secrets (the secret scan of Task 5).

## 8. Build steps (repo root; `export PATH="/usr/local/bin:$PATH"`; on any differing output STOP and paste it)

0. Branch from the Task 5 head, record the SHA. `npm ci && npm run check` -> `# tests 265`. `npx playwright test --list --project=__list_projects__ 2>&1 | grep -F 'Available projects'`
   shows the four `-api` projects.
1. `src/contracts/validate-specs.ts`, `scripts/validate-specs.ts`, `tests/fixtures/oas-invalid/broken-ref.yaml`,
   `tests/unit/contracts/validate-specs.test.ts`, the `package.json` script. `npm run specs:validate` ->
   `specs:validate ok: 3/3 valid`, exit 0. `node --test tests/unit/contracts/validate-specs.test.ts` -> `# tests 5`.
   Commit 1.
2. `playwright.config.ts` (serial projects), `src/invariants/rules.ts`, `tests/unit/invariants/engine.test.ts`.
   `npx playwright test --list --project=__list_projects__ 2>&1 | grep -F 'Available projects: "cal-api", "doc-api", "med-api", "tw-api", "cal-serial", "doc-serial", "med-serial", "tw-serial"'`
   matches. Commit 2.
3. `.github/workflows/api.yml` and `tests/unit/ci/workflow.test.ts` -> `# tests 7`. Parse check:
   `python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/api.yml')); print(list(d['jobs']), [j['timeout-minutes'] for j in d['jobs'].values()])"`
   -> `['check', 'unit', 'db-guard', 'specs', 'foundation'] [10, 10, 10, 10, 5]`. Gate logic:
   ```bash
   echo '{"a":{"result":"success"},"b":{"result":"skipped"}}' | jq -e 'all(.[]; .result == "success")' >/dev/null; echo $?   # 1
   echo '{"a":{"result":"success"},"b":{"result":"success"}}' | jq -e 'all(.[]; .result == "success")' >/dev/null; echo $?   # 0
   ```
   Commit 3.
4. `npm run check` -> exit 0, `# tests 277`. `P2_DB_GUARD_URL=... npm run test:db` still 22 (throwaway container, as in Task 3).
5. Push the branch and open the PR (Appendix B). Watch the first CI run: all five jobs green, durations pasted.
   If the PR cannot be opened, save the body as Appendix B says.

## 9. Done criteria (machine-checkable) and the budget table

```bash
npm run check                         # exit 0; "# tests 277" "# pass 277" "# fail 0"
npm run specs:validate                # exit 0; "specs:validate ok: 3/3 valid"
npm run list:api | tail -1            # "Total: 0 tests in 0 files"
npx playwright test --list --project=__list_projects__ 2>&1 | grep -c 'Available projects: "cal-api", "doc-api", "med-api", "tw-api", "cal-serial", "doc-serial", "med-serial", "tw-serial"'   # 1
python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/api.yml')); print(list(d['jobs']), d['jobs']['foundation']['needs'], [j['timeout-minutes'] for j in d['jobs'].values()])"
#   ['check', 'unit', 'db-guard', 'specs', 'foundation'] ['check', 'unit', 'db-guard', 'specs'] [10, 10, 10, 10, 5]
git diff <task5-head>..HEAD -- .github/workflows/api.yml | grep -E '^-' | grep -v '^---' | grep -vE 'Available projects|Playwright has the four'   # empty: no existing line removed except the assertion and its step name
git log origin/feat/2026-11-01-p2-task5-env-prereqs-readiness..HEAD --format=%B | grep -iE 'co-?authored-?by|generated[ ]with|claude-?session' ; test $? -eq 1   # no trailers, before any push
git status --porcelain                # empty after the commits
git diff <task5-head>..HEAD | grep -E '^\+' | grep -niE 'j[a]yami|h[e]ttigoda' ; test $? -eq 1
# in the PR, after the first CI run:
# after the first CI run: read each job's duration from the PR Checks tab (job page, elapsed time); paste the five durations
```

Every job duration in the first CI run must be at most `timeout - 3 min`. A job that is slower is a STOP (never raise
the timeout; find the slow step).

| Job | `timeout-minutes` | Worst-case estimate (3x the probe times, plus 1.5 min for checkout, `setup-node` and cache restore) | Margin |
|---|---|---|---|
| `check` | 10 (unchanged) | 1.5 + 0.6 (npm ci) + 1.0 (static) + 0.1 (list) = about 3.3 min | 6.7 min |
| `unit` | 10 (unchanged) | 1.5 + 0.6 + 0.2 (tests) + 0.1 (artifact) = about 2.4 min | 7.6 min |
| `db-guard` | 10 (unchanged) | 1.5 + 0.6 + 1.5 (postgres service pull and health) + 0.3 (22 db tests) = about 3.9 min | 6.1 min |
| `specs` (new) | 10 | 1.5 + 0.6 + 0.1 = about 2.2 min | 7.8 min |
| `foundation` (new) | 5 | about 0.5 min (runner start; no checkout) | 4.5 min |
| lane (later), Cal, **cold** | 30 (25 + 5) | 1.5 x the probed cold start (12 min, Task 5 2.7) = 18 min, + 1.5 min setup + 2 min tests + 1 min `down` = **22.5 min** (estimate; the 1.5x is the factor of Task 5 section 8 step 5) | 7.5 min |
| lane (later), Documenso, **cold** | 30 (25 + 5) | 1.5 x 11 min = 16.5 min, + 1.5 + 2 + 1 = **21 min** (estimate) | 9 min |
| lane (later), Cal, **warm** (cache hit) | 30 (25 + 5) | 3 x the probed warm start (about 1 min, Task 5 2.7) = 3 min, + 1.5 + 2 + 1 = **7.5 min** (estimate) | 22.5 min |
| lane (later), Documenso, **warm** (cache hit) | 30 (25 + 5) | 3 x about 1 min = 3 min, + 1.5 + 2 + 1 = **7.5 min** (estimate) | 22.5 min |

Every cold and warm row is at least 3 min under the timeout. The cold rows use 1.5 x the probe (the same factor as Task 5's
timeouts) because 3 x the cold start would exceed the 30 min timeout; no timeout is raised for it.

These are estimates (UNPROBED on CI); the PR replaces them with measured durations.

## 10. Self-verification

From a clean `npm ci`, run every command of section 9 and paste the real output, then paste the first CI run's job
durations. No claimed result without pasted output.

## 11. Commit plan (lowercase Conventional Commits, explicit paths, never `git add -A`)

1. `feat(contracts): validate committed oas files offline` - `src/contracts/validate-specs.ts scripts/validate-specs.ts tests/fixtures/oas-invalid/broken-ref.yaml tests/unit/contracts/validate-specs.test.ts package.json`
2. `feat(playwright): reserve a serial project per product` - `playwright.config.ts src/invariants/rules.ts tests/unit/invariants/engine.test.ts`
3. `ci(api): add the specs job and the foundation gate` - `.github/workflows/api.yml tests/unit/ci/workflow.test.ts`

PR title: `ci(api): add the foundation gate for the product lanes`. No trailers.

## 12. Environment changes

- Automatic from the repo: the workflow (`.github/workflows/api.yml`). No cloud environment (Cursor or Claude Code) changes.
- Pasted by hand (CI only): the owner adds two GitHub Actions secrets, `STRIPE_API_KEY` (a Stripe test-mode `sk_test_` key) and
  `STRIPE_WEBHOOK_SECRET` (`whsec_`), for the lanes that use option (4) of Task 5 OD-2. Nothing else is pasted.
- The CI db-guard job generates its two DB-role passwords per job (Task 3 section 12); they never reach a log.

**Manual repository setting (the owner, after the PR merges and two green runs on `main`):** add these checks to the
Main ruleset's required status checks, by these exact names:

```text
check
unit
db-guard
specs
foundation
env-check
```

`foundation` alone is enough to gate lanes (it fails unless the other four succeeded); the others stay required
because `check` and `unit` already are and a ruleset that lists only the gate hides which job failed. Lane jobs
(`cal-api`, `doc-api`, `med-api`, `tw-api`) join the list in their own tasks after two green `main` runs.

## 13. Will NOT do / Open decisions / Risks

Will NOT do: add a lane job; raise or lower an existing timeout; rename a job; add a secret, a token permission, a
self-hosted runner or `pull_request_target`; add a YAML parser dependency; cache anything; touch `env-check.yml`.

| ID | Question | Options | Evidence | Recommended default |
|---|---|---|---|---|
| OD-1 | Require only `foundation` + `env-check`, or all six names | (a) all six; (b) two | 12 | (a); the owner decides in the ruleset |
| OD-2 | Do serial projects deserve to exist before their first spec | (a) yes, shape reserved; (b) add with the first cron case | `workers: 1` already serialises | (a), as the brief asks |
| OD-3 | `specs` could be a step in `check` | (a) own job (parallel, own check name); (b) step | runtime is under a second | (a) |
| OD-4 | Lane cold-start time vs the 25 min budget | (a) cache build output keyed by product, pinned SHA, harness tag, Node version and lockfile hash (D4), prebuilt harness images as the alternative; (b) accept | Task 5, 2.7 | (a), decided in D4; the lane tasks implement it |

Risks: the gate trusts `toJSON(needs)`; if GitHub changes the shape the unit test on the `jq` line and the first CI
run fail loudly; Python `yaml` is only a planning-time check, the real guard is the unit test; durations on CI are
unmeasured until the first run.

## 14. Builder STOP conditions

Builder STOP conditions (stop, report, never improvise):

- A done criterion still fails after one root-caused fix attempt: report cause, evidence, output.
- Any need to edit a product fork, `node_modules` or the harness, or a harness release that is not
  yet tagged.
- A secret is needed that the environment does not provide, or a secret would be printed.
- A fact at build time contradicts this plan (header name, signature construction, route, grant,
  env var, version): report expected vs observed with `file:line`.
- Any need to weaken an assertion, add a sleep or retry, skip a check, cut scope or raise a timeout.
- A blocked host (proxy 403, ENOTFOUND) or Docker unavailable: this is an ENV finding. Stop.
- A BLOCKING open decision is reached. Any scope cut without approval makes the task PARTIAL;
  report it as PARTIAL.

## Appendix A. Repo rules that apply

Repo rules that apply to this task (restated from the planning brief; `AGENTS.md` still governs):

1. Industry best practice only. Root-cause every failure before changing anything.
2. Never weaken an assertion, widen a tolerance, add a retry or a skip to get green, or raise any
   `timeout-minutes`. No sleeps, no fixed waits: async waits use `expect.poll` with an explicit,
   named deadline (node:test units use events, never timers).
3. Label every surprise PRODUCT BUG (SUSPECTED) or TEST BUG with evidence (HTTP status, body,
   `file:line`). No expected-failure marker in the foundation; any `test.fail` belongs to a lane,
   scoped to the exact wrong value, with the setup asserted first.
4. Data isolation by run prefix (`p2-qa-<utc>-<8 hex>`), cleanup sweep and leak check for anything
   the task creates.
5. Lowercase Conventional Commits. Dated branches. Stage explicit paths only, never `git add -A`.
   No force-push, no rebase of pushed work, no tags, no merges.
6. No `Co-authored-by`, "Generated with" or session-link lines in commits, PR text or files. Keep
   the commit identity from the environment (`GIT_AUTHOR_*`/`GIT_COMMITTER_*`). Build environment: Claude Code cloud
   (its `.claude/settings.json` turns attribution off). A Cursor build needs the owner to turn off Cursor's commit
   attribution first (index section 9); a build that still adds a trailer stops before push. The trailer grep in
   section 9 is the pre-push gate.
7. Never print, log, commit or upload secrets or tokens. Redact them in artefacts and traces.
8. Never edit product forks, `node_modules` or the harness. The harness owns starting and stopping
   products. A harness change is a separate harness-release prerequisite (its own repo, PR and tag).
9. Never use the GitHub account Bridge-bss.
10. No personal name in any repo text (code, comments, docs, commits, PR text): write "the owner"
    or "the maintainer". Fix `AGENTS.md:16` only if this task already edits `AGENTS.md`.
11. Do not run CodeRabbit; the owner runs it after.
12. One product stack at a time; every stack run ends with that product's `down`.

## Appendix B. Autonomous build protocol

Autonomous build protocol (the build session runs Tasks 2 to 6 in order, no owner input between tasks):

1. Before starting a task the builder merges nothing. It cuts the task branch from the previous
   task's branch head (Task 2 from fetched `origin/main`) and records that SHA in its report.
2. It follows this plan with the recommended default of every open decision, unless the decision is
   marked BLOCKING (then it stops, see STOP conditions).
3. After the done criteria pass it pushes the branch and opens the PR with the base set to the
   previous task's branch (GitHub retargets to `main` when that branch merges and is deleted).
   PR title = the lowercase Conventional Commit of the main change. Body = summary, pasted
   verification output, "stacked on" link, unit count chain, open decisions taken with defaults.
4. If the session cannot open PRs it saves the body to `docs/handoff/pr-bodies/<branch>.md` on
   that branch, commits it (`docs: add pr body for <branch>`), pushes, and reports the path.
5. It never merges, never comments on a PR, never tags.
6. If a task stops, later tasks that depend on it do not start. The index says which are
   independent.
7. The session ends with a report per task: branch, head SHA, PR (or saved body), done criteria
   pass/fail with output, decisions taken by default, anything unprobed that is now probed.
