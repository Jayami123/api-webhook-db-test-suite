# P2 Phase 1 Task 1: framework skeleton, no product (plan only)

This is the implementation plan a weaker model will build from. Do not write framework code until
Jayami approves this document.

Structure and depth follow `docs/reference/p1-plan-example-medusa.md` and the P6 plans in
[Jayami123/k6-load-concurrency-suite](https://github.com/Jayami123/k6-load-concurrency-suite)
`docs/plans/` (read at `98b1c82`: Task 1 race framework and Task 2 Medusa race; there is no P6
Task 4 plan yet). That reference file lives in the P6 repo, not in this one. P1 UI-truth and
page-object rules do **not** apply. P2 tests below the UI: HTTP contracts, read-only database
oracles, no browsers, no sleeps.

## Context

- Repo: [Jayami123/api-webhook-db-test-suite](https://github.com/Jayami123/api-webhook-db-test-suite).
  P2.
- Plan branch: `plan/2026-10-20-p2-phase1`. Before this plan, `origin/main` was merged into it
  (`git merge --no-edit origin/main` → `Already up to date.`; `main` is still `5fc804f`).
- Build branch (later, after approval): `feat/2026-10-21-p2-framework`, cut from fetched
  `origin/main`. The plan doc is **not** on that branch; it stays on the plan branch.
- Roadmap: `docs/plans/2026-10-20-p2-phase1-roadmap.md` Task 1. This plan revises roadmap D2 (unit
  runner) and the Task 1 file list; the revision is in the same commit as this plan.
- Harness: `qa-portfolio-harness` `v0.2.11` = `f96038f951c8d62521ac60098661a851df9f65bb`. Task 1
  adds it as a dependency but never runs it. No product is started in Task 1.
- Phase 1 has 7 tasks, one PR each. This is Task 1 only.

Master-plan names used as-is (`docs/master-plan.html` §2, §3):

- `playwright.config.ts` with projects `cal-api`, `doc-api`, `med-api`, `tw-api` (no browsers)
- `src/db/pg.ts` read-only pool per product; `src/contracts/` OAS → AJV validators
  (`ajv-formats`, `strict: false`)
- `tests/contracts/<product>/`, `tests/webhooks/<product>/`, `tests/integration/<product>/`
- `src/clients/{cal,doc,med,tw}.ts` and `src/fixtures/atomic.ts` are **not** in this task

Master-plan file name changes, all agreed in the roadmap: `src/contracts/ajv.ts` → `src/contracts/oas.ts`;
workflow `.github/workflows/p2-api.yml` → `.github/workflows/api.yml`.

## 1. Header

- Probe date: 2026-10-21, this Claude Code cloud VM. Node after `export PATH="/usr/local/bin:$PATH"`:
  **v22.23.3** (`/usr/local/bin/node`), npm **10.9.9**. Node 24 (Documenso only):
  `/opt/node24/bin/node` **v24.22.0**. `.nvmrc` is `22`.
- `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` are preset
  in this VM. The probe overrode the browsers path with an empty directory to simulate CI.
- All probe code ran in a scratch directory outside the repo. Nothing was written to the repo, the
  forks or the harness. One throwaway `postgres:15` container (not a product) was started for the
  pg probe and removed (`docker rm -f`).
- Every code block in §8 was built, linted, formatted, typechecked and unit-tested in that scratch
  project with the exact pins in D4: `npm run check` → exit 0, **87 tests, 87 pass, 0 fail**,
  6.6 s wall.

## 2. Probe findings (required; no guessed values)

### 2.1 Node, npm, TypeScript runner

```text
$ export PATH="/usr/local/bin:$PATH"; node --version; npm --version
v22.23.3
10.9.9
```

- `node --test "tests/unit/**/*.test.ts"` (quoted glob, Node expands it) runs `.ts` files with no
  flag and recurses folders: `# tests 87 # pass 87 # fail 0`.
- A TypeScript `enum` fails at runtime: `SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript
  enum is not supported in strip-only mode`. `tsc` with `erasableSyntaxOnly: true` catches it first:
  `error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.` The same flag
  rejects constructor parameter properties (`constructor(readonly x: T)`), so classes declare fields.
- Imports must use `.ts` suffixes (`allowImportingTsExtensions: true`, `noEmit: true`).
- Reporter flags placed **after** the glob are ignored (`node --test "glob" --test-reporter=dot`
  still printed TAP). Flags go before the glob.
- Multi-reporter works: `--test-reporter=spec --test-reporter-destination=stdout
  --test-reporter=junit --test-reporter-destination=results/unit-junit.xml` → 87 `<testcase>`
  entries in the XML.

### 2.2 Dependency versions (npm registry, 2026-10-21)

| Package | Latest stable | Published (UTC) | Pinned in D4 | Note |
|---|---|---|---|---|
| `@playwright/test` | 1.64.1 | 2026-10-14 | 1.64.1 | same as P6 |
| `typescript` | 7.0.2 | | **6.0.3** (2026-04-16) | `typescript-eslint@8.72.0` peer is `typescript >=4.8.4 <6.1.0` |
| `@types/node` | 26.6.5 | | **22.20.5** (2026-10-01) | latest 22.x, matches Node 22 |
| `eslint` | 10.13.0 | 2026-10-16 | 10.13.0 | engines `^20.19.0 \|\| ^22.13.0 \|\| >=24` |
| `@eslint/js` | 10.0.1 | 2026-02-06 | 10.0.1 | |
| `typescript-eslint` | 8.72.0 | 2026-10-19 | 8.72.0 | peer `eslint ^8.57 \|\| ^9 \|\| ^10` |
| `eslint-config-prettier` | 10.1.8 | 2025-07-18 | 10.1.8 | |
| `globals` | 17.13.0 | 2026-10-01 | 17.13.0 | |
| `prettier` | 3.9.10 | 2026-10-10 | 3.9.10 | same as P6 |
| `pg` | 8.23.1 | 2026-09-30 | 8.23.1 | same as P6 |
| `@types/pg` | 8.23.1 | 2026-08-17 | 8.23.1 | does not declare `queryMode` (see 2.6) |
| `ajv` | 8.20.0 | 2026-04-24 | 8.20.0 | |
| `ajv-formats` | 3.0.1 | 2024-03-30 | 3.0.1 | peer `ajv ^8` |
| `@apidevtools/swagger-parser` | 13.1.0 | 2026-09-20 | 13.1.0 | engines `node >=22.19.0`; peer `openapi-types >=7` |
| `openapi-types` | 12.1.3 | 2023-05-24 | 12.1.3 | |
| `zod` | 4.6.7 | 2026-10-12 | 4.6.7 | |
| `vitest` | 5.0.5 | 2026-10-15 | not used | see D2 |

`npm install --save-exact` of the pinned set: 14.4 s, `found 0 vulnerabilities`, no peer warnings.
Adding `qa-portfolio-harness@github:Jayami123/qa-portfolio-harness#v0.2.11`: 8.5 s; lockfile
`resolved` is `git+ssh://git@github.com/Jayami123/qa-portfolio-harness.git#f96038f…`, the same form
P6 uses in CI. `rm -rf node_modules && npm ci`: 8.5 s.

### 2.3 Playwright with zero browsers

- `@playwright/test`, `playwright` and `playwright-core` 1.64.1 have **no install scripts**
  (`scripts: {}`), so `npm ci` never downloads a browser. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` stays
  in CI as a belt-and-braces setting; no `.npmrc` is needed.
- With `PLAYWRIGHT_BROWSERS_PATH` pointing at an **empty** directory, an API test using the
  `request` fixture against a local `node:http` server passed: `1 passed (720ms)`; the directory
  stayed empty.
- A test that asks for `page` fails loudly: `Error: browserType.launch: Executable doesn't exist at
  …/chromium_headless_shell-1248/…`. So an accidental browser test cannot pass silently.
- Zero test files: `playwright test --list` → `Error: No tests found`, exit **1**. With
  `--pass-with-no-tests` → `Total: 0 tests in 0 files`, exit **0**.
- `playwright test --list --project=nope` prints
  `Error: Project(s) "nope" not found. Available projects: "cal-api", "doc-api", "med-api", "tw-api"`.
  That line is how CI proves the four projects exist while there are no specs yet.
- Glob `testMatch: ["{contracts,webhooks,integration}/<code>/**/*.spec.ts"]` with `testDir: "tests"`
  put 4 sample specs in the right projects and did **not** pick up `tests/unit/u.test.ts`.
- `P2_RUN_ID` set in `playwright.config.ts` (runner process) was identical in 4 workers:
  `p2-qa-…-4c39d4c3` printed by workers 0–3. One prefix per run.
- Playwright loads `src/**/*.ts` imports with `.ts` suffixes from specs and the config: `1 passed`.

### 2.4 OpenAPI versions the loader must handle

| Product | Source | `openapi` |
|---|---|---|
| Cal | `docs/api-reference/v2/openapi.json` at `CAL_REF` | `3.0.0` |
| Documenso | `trpc-to-openapi` 2.1.5 default `opts.openApiVersion ?? '3.0.3'`; fork does not override | `3.0.3` |
| Medusa | core tag `v2.21.2` `www/apps/api-reference/specs/store/openapi.full.yaml` | `3.0.0` (its `info.version` says `2.21.1`) |
| Twenty | `base-schema.utils.ts` | `3.1.1` |

So one loader must handle 3.0 and 3.1. Swagger 2.0 is out of scope.

### 2.5 swagger-parser + AJV 2020 behaviour

- `Ajv2020` + `ajv-formats`, `strict: false`, `allErrors: true` on a dereferenced 3.0 fixture:
  valid body `true`; `nullable: true` with `null` → `true`; bad `date-time` → `false`,
  `/created_at must match format "date-time"`. On 3.1: `type: ["string","null"]` works.
- **Circular schemas:** a fully dereferenced self-referencing schema (`Node.child → Node`) makes
  `ajv.compile` throw `Maximum call stack size exceeded`. With
  `dereference: { circular: "ignore" }` the cycle stays a `$ref`, and compiling via
  `ajv.addSchema(wholeDoc, id)` + `ajv.getSchema(id + "#/paths/…/schema")` validates nested data
  correctly (`ok true`, bad nested `name` → `/child/name must be string`). Cached `getSchema` ×1000:
  0.9 ms.
- **OAS 3.0 boolean `exclusiveMinimum: true`** fails under 2020-12:
  `schema is invalid: data/exclusiveMinimum must be number` (and with `validateSchema: false`:
  `exclusiveMinimum value must be ["number"]`). Cal and Medusa specs contain **0** boolean
  exclusives; Documenso's generator may emit them. The loader rewrites them for 3.0 documents.
- Unknown formats (`x-medusa-id`, Cal's `phone`) are ignored under `strict: false` and logged via
  `logger.warn` (`unknown format "x-medusa-id" ignored in schema at path "#"`). The loader collects
  these into `spec.warnings` instead of printing them.
- `discriminator` and `example` / `x-*` keywords compile and are ignored.
- Real specs (dereference + addSchema + compile one operation): Medusa store, 68 paths, not circular,
  dereference **550 ms**, compile `POST /store/carts` **829 ms**, responses
  `200,400,401,404,409,422,500`; Cal, 82 paths, not circular, 79 ms + 49 ms. Hence D7: one load per
  file per worker, validators cached.

### 2.6 Postgres read-only behaviour (throwaway `postgres:15` = 15.19, same major as the harness)

Pool built with `options: "-c default_transaction_read_only=on -c statement_timeout=500"`:

| Attempt | Result |
|---|---|
| `SELECT current_setting(…)` | `ro=on`, `statement_timeout=500ms`, `application_name` set |
| `CREATE TABLE t(x int)` | `25006 cannot execute CREATE TABLE in a read-only transaction` |
| `SELECT 1 INTO t2` | `25006` |
| `WITH d AS (DELETE … RETURNING 1) SELECT * FROM d` | `25006` |
| `SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE; CREATE TABLE …` | `25006` |
| `SELECT pg_sleep(2)` | `57014 canceling statement due to statement timeout` |
| `SELECT 1; SELECT 2` (no params, simple protocol) | **runs both** |
| `SELECT $1::int; SELECT 2` (params) | `42601 cannot insert multiple commands into a prepared statement` |
| `{ text: "SELECT 1; SELECT 2", queryMode: "extended" }` | `42601` (pg 8.23.1 `lib/query.js` honours `queryMode`) |
| `SELECT set_config('default_transaction_read_only','off',false)` | **OK, and the session default is now `off`** |
| after that: `BEGIN TRANSACTION READ ONLY; CREATE TABLE z …` | `25006` (explicit READ ONLY transaction still holds) |
| in a READ ONLY txn: `set_config('transaction_read_only','off',true)` | `25001 transaction read-write mode must be set before any query` |
| **`EXPLAIN ANALYZE CREATE TABLE t7 AS SELECT 1`** | **OK, table created** (session read-only) |
| **`BEGIN READ ONLY; EXPLAIN ANALYZE CREATE TABLE t8 AS SELECT 1`** | **OK, table created** |
| `EXPLAIN ANALYZE SELECT 1 INTO t9`, `EXPLAIN ANALYZE CREATE MATERIALIZED VIEW mv1 …` | **OK, created** |
| plain `CREATE TABLE t6 AS SELECT 1` | `25006` |
| `nextval`, `setval` | `25006` |
| `pg_notify('c','x')`, `pg_advisory_xact_lock(1)`, `lo_create(0)` (→ `16405`), `txid_current()` | **OK** (side effects despite read-only) |

Conclusions used in D5: the server setting alone is **not** enough. `EXPLAIN ANALYZE` of
`CREATE TABLE AS` / `SELECT INTO` / `CREATE MATERIALIZED VIEW` writes through both the session and
the explicit READ ONLY transaction on 15.19, `set_config` can turn the session default off, and some
functions have side effects. The client guard is a real control, not decoration.

### 2.7 Lint and format

- `typescript-eslint` `strictTypeChecked` flags every `node:test` `test(...)` call with
  `no-floating-promises`. Fixed with
  `allowForKnownSafeCalls: [{ from: "package", package: "node:test", name: ["test","it","describe","suite"] }]`.
- `restrict-template-expressions` rejects numbers in template literals; allowed with
  `{ allowNumber: true }`.
- `no-restricted-globals` on `setTimeout` in `tests/contracts/**` fires:
  `Unexpected use of 'setTimeout'. No sleeps in API tests: use expect.poll with an explicit timeout`.
- Prettier 3.9.10 on the tracked files: `README.md`, workflows and JSON pass; `docs/master-plan.html`
  and `docs/plans/*.md` would be rewritten; **`AGENTS.md` would be changed in meaning**:
  `GIT_AUTHOR_*/GIT_COMMITTER_*` → `GIT_AUTHOR__/GIT_COMMITTER__` (markdown emphasis). Both go into
  `.prettierignore`.
- `process.loadEnvFile(".env")` does not override variables already in the shell
  (`A=fromshell` stayed `fromshell`; `B` came from the file).

### 2.8 Actions pins (lightweight tags, so the tag SHA is the commit)

| Action | Tag | SHA |
|---|---|---|
| `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` (already used by `env-check.yml`) |
| `actions/setup-node` | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` (P6 uses it) |
| `actions/upload-artifact` | v7.0.2 | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |

## 3. Resolved decisions

Each decision leads with the industry-standard approach, then the rejected alternatives.

- **D1 Language and strictness.** TypeScript in ESM (`"type": "module"`), `strict` plus
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
  `noImplicitReturns`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noEmit` (no build step: Node
  and Playwright both run `.ts` directly, §2.1, §2.3). Rejected: plain JS with JSDoc (weaker
  contracts for later tasks); a `dist/` build (nothing consumes compiled output); `enum` and
  parameter properties (Node cannot strip them).

- **D2 Unit runner = `node:test` (revises roadmap D2, which said Vitest).** For a TypeScript library
  that needs no bundler or DOM, the platform runner is the standard choice now that Node strips types
  natively: zero extra dependencies, the same module resolution as runtime, built-in `mock`,
  `mock.timers` (Task 2 receiver modes), JUnit reporter. The harness and P6 use it, so the portfolio
  has one unit style. Rejected: Vitest 5.0.5 (pulls Vite and ~40 packages, resolves modules through
  Vite rather than Node, a fast-moving major for no feature we need); Jest (needs a transform for TS
  ESM); Playwright as unit runner (unit files would need a project, and `tests/unit` must stay out of
  API projects).

- **D3 Lint and format.** ESLint 10 flat config with `typescript-eslint` `strictTypeChecked`
  (type-aware, `projectService`), `eslint-config-prettier` last, Prettier for formatting. Config
  file is `eslint.config.mjs` (no `jiti` loader needed). Repo rules: no sleeps in API test folders
  (`setTimeout`, `setInterval`, `waitForTimeout`), `node:test` calls allowed as floating promises.
  Rejected: Biome (P1/P6 use ESLint + Prettier; parity wins); `recommended` instead of
  `strictTypeChecked` (misses unsafe `any` flows in clients later); Prettier for prose docs (§2.7).

- **D4 Dependency pins.** Exact versions (`--save-exact`), latest stable that satisfies every peer
  range (table §2.2): TypeScript **6.0.3** because `typescript-eslint` does not support 7.x yet.
  Everything is a `devDependency` except `qa-portfolio-harness` (runtime dependency, same as P6).
  Lockfile committed; CI uses `npm ci`. Rejected: caret ranges (lockfile still pins, but
  `package.json` stops documenting what was tested); TypeScript 7.0.2 (peer conflict).
  Release-age question: OQ2.

- **D5 Read-only DB oracle, five layers.** Industry standard is a read-only role or a read-only
  transaction at the server. We cannot add a role (harness owns the databases), so:
  1. **Client guard** `assertSelectOnly` (`src/db/select-guard.ts`): one `SELECT` or `WITH … SELECT`;
     rejects comments (`--`, `/*`), dollar quoting, `E''`/`U&''` strings, unbalanced quotes, more
     than one statement, `EXPLAIN` (and every other non-SELECT start), write/DDL/transaction/session
     keywords anywhere (also inside `WITH`), `SELECT … INTO`, row locks `FOR UPDATE/SHARE`, and
     side-effect functions (`set_config`, `lo_*`, `pg_notify`, advisory locks, backend signals, file
     readers, `dblink*`, `txid_current`). Keywords are matched after masking `'…'` literals and
     `"…"` identifiers, so `"order"` and `'delete me'` are fine.
  2. **Extended protocol** (`queryMode: "extended"`): the server refuses a second statement
     (`42601`).
  3. **`BEGIN TRANSACTION READ ONLY` … `ROLLBACK`** around every query: survives a session default
     flipped by `set_config` (§2.6).
  4. **Session defaults** in the startup packet: `default_transaction_read_only=on`,
     `statement_timeout`, `idle_in_transaction_session_timeout`.
  5. **Errors** carry product + SQLSTATE + server message, never the connection string; a failed
     client is destroyed (`release(err)`), not returned to the pool.

  Rejected: guard only (the server must also refuse); server settings only (§2.6 shows
  `EXPLAIN ANALYZE CREATE TABLE AS` writing through both); a dedicated `qa_readonly` role
  (needs DDL on harness databases; can be proposed to the harness later); a full SQL parser such
  as `pgsql-ast-parser` (extra dependency with its own dialect gaps; the guard errs on rejecting).
  Known false positives, accepted: a literal containing `--`, unquoted identifiers that are keywords
  (`set`, `start`, `comment`), `E''` strings. Write them quoted or parameterise.

- **D6 Pool shape.** One `pg.Pool` per product per worker process (`readOnlyDb(product)` registry),
  `max: 2`, `allowExitOnIdle: true`, `connectionTimeoutMillis: 5000`,
  `application_name: p2-qa-oracle-<product>`. `closeAllReadOnlyDbs()` for worker teardown (product
  tasks add the fixture). Rejected: a new `Client` per query (slow, connection churn); one pool
  shared across products (different databases).

- **D7 Contract loader.** Commit specs, load with `SwaggerParser.dereference(file,
  { dereference: { circular: "ignore" } })`, add the whole document to `Ajv2020` (`strict: false`,
  `allErrors: true`, `ajv-formats`) as one schema resource, compile response schemas lazily by JSON
  Pointer, cache per `method + path + status + media type`, cache the loaded spec per file. Lookup by
  `operationId` or `method + path template`; status falls back `exact → NXX → default`; media type
  parameters (`; charset=utf-8`) ignored. OAS 3.0 boolean exclusives normalised (§2.5). Errors are
  one readable line each (`at /id: must be string (got 7) [#/properties/id/type]`), first 10 plus a
  count. Rejected: full dereference + `ajv.compile(schema)` per response (overflows on cycles);
  default Ajv (draft-07) class (3.1 is 2020-12; one class for both is simpler and 2020 accepts
  3.0's `nullable`); `openapi-response-validator`/`openapi-schema-validator` wrappers (unmaintained,
  hide Ajv options); `swagger-parser.validate()` on product specs (we test the product's responses,
  not the spec author; vendor quirks would block every run).

- **D8 Env getters.** One `zod` schema in `src/env.ts`, blank values = unset, loopback-only URLs
  (`127.0.0.1`, `localhost`, `[::1]`) so a mistyped env can never point tests at a remote host,
  defaults = the harness's public local defaults (not secrets). Errors list variable names and
  reasons, never values. `.env` is read only by `playwright.config.ts` via `process.loadEnvFile`,
  and the shell wins (§2.7). Rejected: `dotenv` (Node has it built in); hand-written parsers (P6
  style; repetitive once there are 10+ variables); `envalid` (another dependency for what zod does).

- **D9 Run-id prefix.** `p2-qa-<yyyymmddThhmmssZ lowercased>-<8 hex>`, e.g.
  `p2-qa-20261021t093005z-1a2b3c4d` (31 chars). Generated once in `playwright.config.ts` and
  exported as `P2_RUN_ID` so all workers share it (§2.3); CI may preset it and it must match the
  pattern. `runScopedName(label)` builds entity names; `escapeLike` / `likePrefixPattern` build
  `LIKE $1 ESCAPE '\'` parameters for orphan checks. Lowercase because products lowercase emails and
  slugs. Rejected: `Date.now()` (unreadable in DB rows); UUID only (no time ordering for humans);
  a prefix per worker (orphan checks would miss sibling workers).

- **D10 Playwright config.** `testDir: "tests"`, four projects matched by glob on the product
  folder code (`cal`, `doc`, `med`, `tw`) under `contracts|webhooks|integration`, `retries: 0`,
  `workers: 1`, `fullyParallel: false`, `forbidOnly` on CI, test timeout 60 s, expect timeout 10 s
  (`expect.poll` passes its own explicit `timeout`), `trace: "retain-on-failure"` (records API calls,
  no browser), `extraHTTPHeaders: { accept: "application/json" }`, JUnit + HTML reporters on CI.
  No `browserName`, no `devices`. Rejected: `workers > 1` now (exact DB counts in later tasks need
  a decision per product); retries (hide oracle flakes); regex `testMatch` (Windows path
  separators; globs are portable).

- **D11 CI.** New workflow `.github/workflows/api.yml`, name `api`, jobs **`check`** and
  **`unit`**, on `pull_request`, `push` to `main` and `workflow_dispatch`; `permissions: contents: read`;
  `concurrency` cancels superseded runs; actions pinned by SHA (§2.8); `persist-credentials: false`;
  Node from `.nvmrc` with npm cache; `npm ci`; `timeout-minutes: 10`. `check` = format, lint,
  typecheck, project listing proof; `unit` = `node:test` with JUnit artefact. Units run once in CI
  (in `unit`), while local `npm run check` runs all four. After Jayami approves this plan and Task 1
  merges, `check` and `unit` become required checks; Jayami adds them to the Main ruleset.
  Rejected: one job (one required check hides which gate failed); running units in both jobs;
  `ubuntu-latest` (P6 pins `ubuntu-24.04`).

- **D12 Folder codes.** Test folders and project names use the short codes `cal`, `doc`, `med`,
  `tw` (master plan §2 `src/clients/{cal,doc,med,tw}.ts`); `ProductId` in code uses full names
  (`cal`, `documenso`, `medusa`, `twenty`) to match the harness and env variable names. Rejected:
  full names for folders (diverges from the master plan's client file names).

## 4. Goal and scope

**In:**

- `package.json` + `package-lock.json`, exact pins (D4), scripts (§14 Step 1)
- `tsconfig.json` strict (D1); `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore` (D3)
- `src/run/prefix.ts` (D9), `src/env.ts` (D8), `src/db/select-guard.ts` + `src/db/pg.ts` (D5, D6),
  `src/contracts/oas.ts` (D7)
- Unit tests for each module, including guard bypass attempts and tiny local OAS fixtures
  (3.0 YAML, 3.1 JSON, Swagger 2.0 negative)
- `playwright.config.ts` with `cal-api`, `doc-api`, `med-api`, `tw-api`, no browsers (D10)
- `.github/workflows/api.yml` with `check` and `unit` (D11)
- `.env.example`: add `P2_RUN_ID=` and `P2_DB_STATEMENT_TIMEOUT_MS=` (names and comments only)
- `README.md`: a short "Develop" section with the commands

**Out:** see §18.

## 5. Test-case mapping

Task 1 has **no** mapped case IDs. It covers the master-plan Phase 1 framework items
"clients-to-be" (env getters, base URLs, run prefix that clients will use), "DB helper"
(`src/db/pg.ts`) and "contract loader" (`src/contracts/oas.ts`). Product clients and per-run tokens
come in Tasks 3–6; the receiver and signers in Task 2. No Playwright spec is added in Task 1.

## 6. Extra risky checks (inside the framework, required)

All are unit tests (no product, no database):

- **Guard bypasses** (§8.6 test table, 42 reject rows): comment hiding (`SELECT 1 -- ; DROP`,
  `/**/DELETE`), multi-statement (`SELECT 1; DROP TABLE t`, `SELECT 1;;`), `EXPLAIN ANALYZE CREATE
  TABLE … AS`, writable CTE, `SELECT INTO`, row locks, dollar quoting, `E''` escapes, unbalanced
  quotes, `set_config`, `lo_create`, `pg_notify`, advisory locks, `dblink_exec`, `txid_current`.
  Each asserts the exact `reason`.
- **Guard false positives on legit SQL** (11 accept rows): quoted `"order"`, keywords inside
  literals, doubled quotes, `LIKE $1 ESCAPE '\'`, `UNION ALL`, trailing `;`.
- **Pool wiring**: startup `options` string exact; `BEGIN TRANSACTION READ ONLY` → one
  `queryMode: "extended"` query → `ROLLBACK` order exact; guard rejection never calls
  `pool.connect()`; server error keeps SQLSTATE `25006`, drops the password from the message, rolls
  back and destroys the client; `close()` idempotent; use after close is a `TEST BUG`.
- **Env**: defaults, blanks, trailing slash, non-loopback rejected (HTTP and Postgres), bad
  timeouts, and the error never echoes a secret value.
- **Prefix**: exact format, pattern, no LIKE wildcards, one value across calls, malformed preset,
  missing config, label rules, LIKE escaping.
- **OAS**: valid, required, format, additionalProperties, type, `nullable`, boolean exclusive
  normalisation, unknown format → warning, `4XX` and `default` fallback, circular schema, validator
  identity cache, spec cache, 3.1 type arrays, `assertValid` message, lookup failures, Swagger 2.0
  rejected.

## 7. Architecture (every file touched, one responsibility each)

New:

- `package.json`, `package-lock.json` — pins and scripts
- `tsconfig.json` — strict typecheck for `src/`, `tests/`, `playwright.config.ts`
- `eslint.config.mjs` — lint rules (D3)
- `.prettierrc.json`, `.prettierignore` — formatting (D3)
- `playwright.config.ts` — four API projects (D10), sets `P2_RUN_ID`, loads `.env`
- `src/run/prefix.ts` — run prefix, scoped names, LIKE escaping
- `src/env.ts` — `ProductId`, validated env, `apiBaseUrl`, `dbUrl`, `dbStatementTimeoutMs`
- `src/db/select-guard.ts` — `assertSelectOnly`, `ReadOnlyGuardError`
- `src/db/pg.ts` — `createReadOnlyDb`, `readOnlyDb`, `closeAllReadOnlyDbs`, `DbQueryError`
- `src/contracts/oas.ts` — `loadSpec`, `ContractSpec`, `ContractError`, `formatAjvErrors`,
  `normaliseOas30Exclusives`
- `tests/unit/run/prefix.test.ts`, `tests/unit/env.test.ts`, `tests/unit/db/select-guard.test.ts`,
  `tests/unit/db/pg.test.ts`, `tests/unit/contracts/oas.test.ts`
- `tests/fixtures/oas/mini-3.0.yaml`, `tests/fixtures/oas/mini-3.1.json`,
  `tests/fixtures/oas/swagger-2.0.json`
- `.github/workflows/api.yml` — `check` + `unit`

Modified:

- `.env.example` — two names added (§14 Step 2)
- `README.md` — "Develop" section (§14 Step 6)

Not changed: `AGENTS.md`, `docs/`, `scripts/`, `.claude/`, `.cursor/`, `.github/workflows/env-check.yml`,
`.gitignore` (already ignores `node_modules/`, `.env`, `test-results/`, `playwright-report/`,
`results/*`, `receiver-logs/`), `.nvmrc`, forks, harness.

```mermaid
flowchart LR
  spec["tests/**/*.spec.ts (Tasks 3-6)"] --> oas["src/contracts/oas.ts"]
  spec --> db["src/db/pg.ts"]
  spec --> prefix["src/run/prefix.ts"]
  db --> guard["src/db/select-guard.ts"]
  db --> env["src/env.ts"]
  oas --> files["contracts/<product>/* (Tasks 3-6)"]
  config["playwright.config.ts"] --> prefix
  db -->|"BEGIN READ ONLY, extended query, ROLLBACK"| pgsrv[("product Postgres (harness)")]
```

## 8. Module contracts (exact code; built and tested in the probe)

Copy these files verbatim. They already pass `npm run check` with the D4 pins. If a step's output
differs from §14, stop and report.

### 8.1 `package.json`

```json
{
  "name": "api-webhook-db-test-suite",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.22.0"
  },
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json",
    "unit": "node --test \"tests/unit/**/*.test.ts\"",
    "unit:ci": "node --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=results/unit-junit.xml \"tests/unit/**/*.test.ts\"",
    "check:static": "npm run format:check && npm run lint && npm run typecheck",
    "check": "npm run check:static && npm run unit",
    "list:api": "playwright test --list --pass-with-no-tests",
    "test:api": "playwright test"
  },
  "dependencies": {
    "qa-portfolio-harness": "github:Jayami123/qa-portfolio-harness#v0.2.11"
  },
  "devDependencies": {
    "@apidevtools/swagger-parser": "13.1.0",
    "@eslint/js": "10.0.1",
    "@playwright/test": "1.64.1",
    "@types/node": "22.20.5",
    "@types/pg": "8.23.1",
    "ajv": "8.20.0",
    "ajv-formats": "3.0.1",
    "eslint": "10.13.0",
    "eslint-config-prettier": "10.1.8",
    "globals": "17.13.0",
    "openapi-types": "12.1.3",
    "pg": "8.23.1",
    "prettier": "3.9.10",
    "typescript": "6.0.3",
    "typescript-eslint": "8.72.0",
    "zod": "4.6.7"
  }
}
```

`private` is a JSON boolean. Do not hand-edit `package-lock.json`; Step 1 generates it.

### 8.2 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "playwright.config.ts"]
}
```

### 8.3 `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`

```js
// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

const NO_SLEEP = "No sleeps in API tests: use expect.poll with an explicit timeout (AGENTS.md).";

export default tseslint.config(
  {
    ignores: ["node_modules/", "test-results/", "playwright-report/", "results/", "receiver-logs/"],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // node:test's test()/describe() return promises the runner awaits itself.
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            { from: "package", package: "node:test", name: ["test", "it", "describe", "suite"] },
          ],
        },
      ],
    },
  },
  {
    files: ["tests/contracts/**", "tests/webhooks/**", "tests/integration/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "setTimeout", message: NO_SLEEP },
        { name: "setInterval", message: NO_SLEEP },
      ],
      "no-restricted-properties": ["error", { property: "waitForTimeout", message: NO_SLEEP }],
    },
  },
  { files: ["**/*.mjs"], ...tseslint.configs.disableTypeChecked },
  prettier,
);
```

```json
{
  "printWidth": 100,
  "trailingComma": "all",
  "endOfLine": "lf"
}
```

```text
node_modules/
package-lock.json
test-results/
playwright-report/
results/
receiver-logs/
# Prose and generated docs keep their own wrapping. Prettier also rewrites GIT_AUTHOR_* to
# GIT_AUTHOR__ in AGENTS.md (probe 2026-10-21), which changes its meaning.
AGENTS.md
docs/
```

### 8.4 `src/run/prefix.ts` and its test

```ts
import { randomBytes } from "node:crypto";

/** Every entity a P2 run creates starts with this. Lowercase: some products lowercase emails and slugs. */
export const RUN_PREFIX_PATTERN = /^p2-qa-\d{8}t\d{6}z-[0-9a-f]{8}$/;
export const RUN_ID_ENV = "P2_RUN_ID";

/** `p2-qa-<yyyymmddThhmmssZ>-<8 hex>`, e.g. `p2-qa-20261021t093000z-1a2b3c4d`. Pure: inputs are injected. */
export function makeRunPrefix(now: Date, randomHex: string): string {
  if (!/^[0-9a-f]{8}$/.test(randomHex)) {
    throw new Error(
      `TEST BUG: randomHex must be 8 lowercase hex chars, got ${JSON.stringify(randomHex)}`,
    );
  }
  const utc = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "z")
    .toLowerCase();
  return `p2-qa-${utc}-${randomHex}`;
}

/**
 * Called once from playwright.config.ts. The runner process sets P2_RUN_ID and every worker
 * inherits it, so all workers share one prefix. A preset value (CI) must match the pattern.
 */
export function ensureRunPrefix(env: NodeJS.ProcessEnv = process.env, now = new Date()): string {
  const preset = env[RUN_ID_ENV]?.trim();
  if (preset) {
    if (!RUN_PREFIX_PATTERN.test(preset)) {
      throw new Error(
        `TEST BUG: ${RUN_ID_ENV} must match ${String(RUN_PREFIX_PATTERN)}, got ${JSON.stringify(preset)}`,
      );
    }
    return preset;
  }
  const prefix = makeRunPrefix(now, randomBytes(4).toString("hex"));
  env[RUN_ID_ENV] = prefix;
  return prefix;
}

/** Read inside tests and fixtures. Throws if the config did not run (no silent fallback). */
export function currentRunPrefix(env: NodeJS.ProcessEnv = process.env): string {
  const value = env[RUN_ID_ENV]?.trim();
  if (!value || !RUN_PREFIX_PATTERN.test(value)) {
    throw new Error(`TEST BUG: ${RUN_ID_ENV} is not set; run through playwright.config.ts`);
  }
  return value;
}

/** Name for one entity: `<prefix>-<label>`. Label: lowercase letters, digits, dashes. */
export function runScopedName(label: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!/^[a-z0-9-]{1,40}$/.test(label)) {
    throw new Error(`TEST BUG: label must match [a-z0-9-]{1,40}, got ${JSON.stringify(label)}`);
  }
  return `${currentRunPrefix(env)}-${label}`;
}

/** Escape `\`, `%` and `_` for a LIKE pattern used with `ESCAPE '\'`. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** `LIKE $1 ESCAPE '\'` parameter that matches everything starting with `prefix`. */
export function likePrefixPattern(prefix: string): string {
  return `${escapeLike(prefix)}%`;
}
```

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  RUN_PREFIX_PATTERN,
  currentRunPrefix,
  ensureRunPrefix,
  escapeLike,
  likePrefixPattern,
  makeRunPrefix,
  runScopedName,
} from "../../../src/run/prefix.ts";

const FIXED = new Date("2026-10-21T09:30:05.123Z");

describe("run prefix", () => {
  test("makeRunPrefix formats UTC time and hex", () => {
    assert.equal(makeRunPrefix(FIXED, "1a2b3c4d"), "p2-qa-20261021t093005z-1a2b3c4d");
  });

  test("makeRunPrefix output matches RUN_PREFIX_PATTERN and has no LIKE wildcards", () => {
    const prefix = makeRunPrefix(FIXED, "00ff00ff");
    assert.match(prefix, RUN_PREFIX_PATTERN);
    assert.equal(escapeLike(prefix), prefix);
  });

  test("makeRunPrefix rejects non-hex or wrong-length random parts", () => {
    for (const bad of ["", "1a2b3c4", "1A2B3C4D", "zzzzzzzz", "1a2b3c4d5"]) {
      assert.throws(() => makeRunPrefix(FIXED, bad), /TEST BUG: randomHex/);
    }
  });

  test("ensureRunPrefix sets P2_RUN_ID once and keeps it", () => {
    const env: NodeJS.ProcessEnv = {};
    const first = ensureRunPrefix(env, FIXED);
    assert.match(first, RUN_PREFIX_PATTERN);
    assert.equal(env["P2_RUN_ID"], first);
    assert.equal(ensureRunPrefix(env, new Date()), first);
  });

  test("ensureRunPrefix rejects a malformed preset", () => {
    assert.throws(() => ensureRunPrefix({ P2_RUN_ID: "p2-qa-%" }), /must match/);
  });

  test("currentRunPrefix throws when the config did not run", () => {
    assert.throws(() => currentRunPrefix({}), /P2_RUN_ID is not set/);
  });

  test("runScopedName appends a safe label", () => {
    const env = { P2_RUN_ID: "p2-qa-20261021t093005z-1a2b3c4d" };
    assert.equal(runScopedName("cart-1", env), "p2-qa-20261021t093005z-1a2b3c4d-cart-1");
    for (const bad of ["", "Cart", "a_b", "a%b", "x".repeat(41)]) {
      assert.throws(() => runScopedName(bad, env), /label must match/);
    }
  });

  test("escapeLike escapes backslash, percent and underscore", () => {
    assert.equal(escapeLike(String.raw`a\b%c_d`), String.raw`a\\b\%c\_d`);
    assert.equal(likePrefixPattern("p2_qa%"), String.raw`p2\_qa\%%`);
  });
});
```

### 8.5 `src/env.ts` and its test

```ts
import * as z from "zod";

export type ProductId = "cal" | "documenso" | "medusa" | "twenty";
export const PRODUCT_IDS: readonly ProductId[] = ["cal", "documenso", "medusa", "twenty"];

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const blankToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const loopbackUrl = z
  .url({ protocol: /^https?$/ })
  .refine((raw) => LOOPBACK_HOSTS.has(new URL(raw).hostname), {
    message: "must point at 127.0.0.1, localhost or [::1] (P2 never calls remote hosts)",
  });
const loopbackPgUrl = z
  .string()
  .trim()
  .refine((raw) => /^postgres(ql)?:\/\//.test(raw) && LOOPBACK_HOSTS.has(new URL(raw).hostname), {
    message: "must be a postgres:// URL on 127.0.0.1, localhost or [::1]",
  });

// Defaults are the harness's public local defaults (qa-portfolio-harness v0.2.11 src/config.ts),
// with localhost rewritten to 127.0.0.1. They are not secrets. Never log a URL taken from env.
const schema = z.object({
  CAL_BASE_URL: z.preprocess(blankToUndefined, loopbackUrl.default("http://127.0.0.1:3000")),
  CAL_API_BASE_URL: z.preprocess(blankToUndefined, loopbackUrl.default("http://127.0.0.1:5555")),
  DOCUMENSO_BASE_URL: z.preprocess(blankToUndefined, loopbackUrl.default("http://127.0.0.1:3001")),
  MEDUSA_BASE_URL: z.preprocess(blankToUndefined, loopbackUrl.default("http://127.0.0.1:9000")),
  TWENTY_BASE_URL: z.preprocess(blankToUndefined, loopbackUrl.default("http://127.0.0.1:3002")),
  CAL_DB_URL: z.preprocess(
    blankToUndefined,
    loopbackPgUrl.default("postgresql://postgres:@127.0.0.1:5450/calendso"),
  ),
  DOCUMENSO_DB_URL: z.preprocess(
    blankToUndefined,
    loopbackPgUrl.default("postgres://documenso:password@127.0.0.1:5451/documenso"),
  ),
  MEDUSA_DB_URL: z.preprocess(
    blankToUndefined,
    loopbackPgUrl.default("postgres://medusa:medusa@127.0.0.1:5433/medusa"),
  ),
  TWENTY_DB_URL: z.preprocess(
    blankToUndefined,
    loopbackPgUrl.default("postgres://postgres:postgres@127.0.0.1:5434/default"),
  ),
  P2_DB_STATEMENT_TIMEOUT_MS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(100).max(600_000).default(5_000),
  ),
});

export type P2Env = z.infer<typeof schema>;

/** Parse and validate once per call. Error lists variable names only, never values. */
export function loadEnv(env: NodeJS.ProcessEnv = process.env): P2Env {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`TEST BUG: invalid P2 environment\n  ${names.join("\n  ")}`);
  }
  return parsed.data;
}

const BASE_URL_KEY = {
  cal: "CAL_API_BASE_URL",
  documenso: "DOCUMENSO_BASE_URL",
  medusa: "MEDUSA_BASE_URL",
  twenty: "TWENTY_BASE_URL",
} as const satisfies Record<ProductId, keyof P2Env>;
const DB_URL_KEY = {
  cal: "CAL_DB_URL",
  documenso: "DOCUMENSO_DB_URL",
  medusa: "MEDUSA_DB_URL",
  twenty: "TWENTY_DB_URL",
} as const satisfies Record<ProductId, keyof P2Env>;

/** API base URL without a trailing slash. Cal's is API v2 (5555), not the web app. */
export function apiBaseUrl(product: ProductId, env: NodeJS.ProcessEnv = process.env): string {
  return loadEnv(env)[BASE_URL_KEY[product]].replace(/\/$/, "");
}

export function dbUrl(product: ProductId, env: NodeJS.ProcessEnv = process.env): string {
  return loadEnv(env)[DB_URL_KEY[product]];
}

export function dbStatementTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return loadEnv(env).P2_DB_STATEMENT_TIMEOUT_MS;
}
```

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { apiBaseUrl, dbStatementTimeoutMs, dbUrl, loadEnv } from "../../src/env.ts";

describe("env", () => {
  test("defaults are the harness loopback defaults", () => {
    assert.equal(apiBaseUrl("medusa", {}), "http://127.0.0.1:9000");
    assert.equal(apiBaseUrl("cal", {}), "http://127.0.0.1:5555");
    assert.equal(apiBaseUrl("documenso", {}), "http://127.0.0.1:3001");
    assert.equal(apiBaseUrl("twenty", {}), "http://127.0.0.1:3002");
    assert.equal(dbUrl("medusa", {}), "postgres://medusa:medusa@127.0.0.1:5433/medusa");
    assert.equal(dbStatementTimeoutMs({}), 5000);
  });

  test("blank values fall back to defaults", () => {
    assert.equal(apiBaseUrl("medusa", { MEDUSA_BASE_URL: "  " }), "http://127.0.0.1:9000");
    assert.equal(dbStatementTimeoutMs({ P2_DB_STATEMENT_TIMEOUT_MS: "" }), 5000);
  });

  test("overrides are used and the trailing slash is dropped", () => {
    assert.equal(
      apiBaseUrl("medusa", { MEDUSA_BASE_URL: "http://localhost:9100/" }),
      "http://localhost:9100",
    );
    assert.equal(dbStatementTimeoutMs({ P2_DB_STATEMENT_TIMEOUT_MS: "250" }), 250);
  });

  test("non-loopback hosts are rejected", () => {
    assert.throws(
      () => apiBaseUrl("medusa", { MEDUSA_BASE_URL: "https://shop.example.com" }),
      /MEDUSA_BASE_URL/,
    );
    assert.throws(
      () => dbUrl("twenty", { TWENTY_DB_URL: "postgres://u:p@10.0.0.5:5432/db" }),
      /TWENTY_DB_URL/,
    );
    assert.throws(() => dbUrl("cal", { CAL_DB_URL: "mysql://127.0.0.1/x" }), /CAL_DB_URL/);
  });

  test("statement timeout must be an integer in range", () => {
    for (const bad of ["abc", "0", "99", "600001", "1.5"]) {
      assert.throws(
        () => loadEnv({ P2_DB_STATEMENT_TIMEOUT_MS: bad }),
        /P2_DB_STATEMENT_TIMEOUT_MS/,
      );
    }
  });

  test("errors name the variable but never echo its value", () => {
    const secret = "postgres://user:s3cr3t-value@db.example.com:5432/x";
    assert.throws(
      () => loadEnv({ MEDUSA_DB_URL: secret }),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes("MEDUSA_DB_URL") &&
        !error.message.includes("s3cr3t"),
    );
  });
});
```

### 8.6 `src/db/select-guard.ts` and its test

```ts
/**
 * Client-side layer of the read-only oracle (plan D5; the server-side layers are in pg.ts).
 * Accepts one SELECT or WITH … SELECT statement. Rejects everything that can write, lock, change
 * session state or hide text from this check. Errs on the side of rejecting.
 */
export class ReadOnlyGuardError extends Error {
  override readonly name = "ReadOnlyGuardError";
  readonly reason: GuardReason;
  constructor(reason: GuardReason, detail: string) {
    super(`TEST BUG: read-only guard rejected SQL (${reason}): ${detail}`);
    this.reason = reason;
  }
}

export type GuardReason =
  | "empty"
  | "comment"
  | "dollar-quote"
  | "escape-string"
  | "unbalanced-quote"
  | "multi-statement"
  | "not-select"
  | "forbidden-keyword"
  | "row-lock"
  | "forbidden-function";

// Whole words, checked after string literals and quoted identifiers are masked.
const FORBIDDEN_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "merge",
  "upsert",
  "truncate",
  "drop",
  "alter",
  "create",
  "grant",
  "revoke",
  "copy",
  "call",
  "do",
  "execute",
  "prepare",
  "deallocate",
  "lock",
  "vacuum",
  "analyze",
  "analyse",
  "explain",
  "cluster",
  "reindex",
  "refresh",
  "comment",
  "security",
  "set",
  "reset",
  "discard",
  "begin",
  "start",
  "commit",
  "rollback",
  "abort",
  "savepoint",
  "release",
  "listen",
  "unlisten",
  "notify",
  "load",
  "import",
  "into",
] as const;
const FORBIDDEN_KEYWORD_RE = new RegExp(`\\b(${FORBIDDEN_KEYWORDS.join("|")})\\b`, "i");
const ROW_LOCK_RE = /\bfor\s+(no\s+key\s+update|key\s+share|update|share)\b/i;
// Functions that have side effects even inside a READ ONLY transaction (probed on Postgres 15.19).
const FORBIDDEN_FUNCTION_RE =
  /\b(set_config|lo_\w+|pg_notify|pg_(try_)?advisory\w*|pg_cancel_backend|pg_terminate_backend|pg_reload_conf|pg_rotate_logfile|pg_read_file|pg_read_binary_file|pg_ls_\w+|pg_stat_reset\w*|dblink\w*|txid_current|pg_current_xact_id)\s*\(/i;

/** Replace '…' literals and "…" identifiers with empty placeholders so keywords inside them are ignored. */
function maskQuoted(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql.charAt(i);
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      for (;;) {
        if (j >= sql.length)
          throw new ReadOnlyGuardError("unbalanced-quote", "a quote is never closed");
        if (sql.charAt(j) === quote) {
          if (sql.charAt(j + 1) === quote) {
            j += 2; // doubled quote inside the literal
            continue;
          }
          break;
        }
        j += 1;
      }
      out += quote === "'" ? "''" : '""';
      i = j + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

export function assertSelectOnly(sql: string): void {
  if (sql.trim() === "") throw new ReadOnlyGuardError("empty", "no SQL");
  // Checked on the raw text: these can hide a second statement or a keyword from the masker.
  if (/--|\/\*/.test(sql)) throw new ReadOnlyGuardError("comment", "comments are not allowed");
  if (/\$[A-Za-z_]?\w*\$/.test(sql))
    throw new ReadOnlyGuardError("dollar-quote", "dollar quoting is not allowed");
  if (/(^|[^\w])(e|u&)'/i.test(sql))
    throw new ReadOnlyGuardError("escape-string", "E'' and U&'' strings are not allowed");

  const masked = maskQuoted(sql).trim().replace(/;\s*$/, "");
  if (masked.includes(";"))
    throw new ReadOnlyGuardError("multi-statement", "only one statement is allowed");
  if (!/^(select|with)\b/i.test(masked))
    throw new ReadOnlyGuardError("not-select", "must start with SELECT or WITH");
  if (ROW_LOCK_RE.test(masked))
    throw new ReadOnlyGuardError("row-lock", "FOR UPDATE/SHARE takes row locks");
  const keyword = FORBIDDEN_KEYWORD_RE.exec(masked);
  if (keyword?.[1]) throw new ReadOnlyGuardError("forbidden-keyword", keyword[1].toUpperCase());
  const fn = FORBIDDEN_FUNCTION_RE.exec(masked);
  if (fn?.[1]) throw new ReadOnlyGuardError("forbidden-function", `${fn[1]}()`);
}
```

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ReadOnlyGuardError,
  assertSelectOnly,
  type GuardReason,
} from "../../../src/db/select-guard.ts";

const ACCEPT: readonly string[] = [
  "SELECT 1",
  "select count(*)::int as n from \"order\" where email like $1 escape '\\'",
  "WITH x AS (SELECT id FROM cart) SELECT * FROM x",
  "SELECT 1;",
  "SELECT 'a;b' AS semicolon_in_literal",
  "SELECT 'delete from x' AS harmless_literal",
  'SELECT "update", "set" FROM "weird"',
  "SELECT 'it''s' AS quoted",
  "SeLeCt id FROM product WHERE id = ANY($1)",
  "SELECT 1\nUNION ALL\nSELECT 2",
  'SELECT starts_at, "startTime" FROM t',
];

const REJECT: readonly (readonly [string, GuardReason])[] = [
  ["", "empty"],
  ["   \n ", "empty"],
  ["INSERT INTO t VALUES (1)", "not-select"],
  ["UPDATE t SET x = 1", "not-select"],
  ["DELETE FROM t", "not-select"],
  ["TRUNCATE t", "not-select"],
  ["COPY t TO STDOUT", "not-select"],
  ["CALL p()", "not-select"],
  ["SET ROLE postgres", "not-select"],
  ["SHOW search_path", "not-select"],
  ["BEGIN", "not-select"],
  ["COMMIT", "not-select"],
  ["EXPLAIN ANALYZE CREATE TABLE t AS SELECT 1", "not-select"],
  ["explain analyze select 1", "not-select"],
  ["WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d", "forbidden-keyword"],
  ["WITH u AS (UPDATE t SET x = 1 RETURNING *) SELECT 1", "forbidden-keyword"],
  ["SELECT * INTO new_table FROM t", "forbidden-keyword"],
  ["SELECT 1; DROP TABLE t", "multi-statement"],
  ["SELECT 1;;", "multi-statement"],
  ["SELECT 1; SELECT 2", "multi-statement"],
  ["SELECT 1 -- ; DROP TABLE t", "comment"],
  ["SELECT 1 /* ; */", "comment"],
  ["/**/DELETE FROM t", "comment"],
  ["SELECT '--' AS dashes", "comment"],
  ["DO $$ BEGIN DELETE FROM t; END $$", "dollar-quote"],
  ["SELECT $tag$;DELETE FROM t$tag$", "dollar-quote"],
  ["SELECT E'\\';DELETE FROM t'", "escape-string"],
  ["SELECT U&'\\0061'", "escape-string"],
  ["SELECT 'abc", "unbalanced-quote"],
  ['SELECT "abc', "unbalanced-quote"],
  ["SELECT * FROM t FOR UPDATE", "row-lock"],
  ["SELECT * FROM t FOR NO KEY UPDATE", "row-lock"],
  ["SELECT * FROM t FOR SHARE", "row-lock"],
  ["SELECT * FROM t FOR KEY SHARE", "row-lock"],
  ["SELECT set_config('default_transaction_read_only', 'off', false)", "forbidden-function"],
  ["SELECT lo_create(0)", "forbidden-function"],
  ["SELECT pg_notify('c', 'x')", "forbidden-function"],
  ["SELECT pg_advisory_lock(1)", "forbidden-function"],
  ["SELECT pg_try_advisory_xact_lock(1)", "forbidden-function"],
  ["SELECT pg_terminate_backend(1)", "forbidden-function"],
  ["SELECT dblink_exec('x', 'DELETE FROM t')", "forbidden-function"],
  ["SELECT txid_current()", "forbidden-function"],
];

describe("assertSelectOnly", () => {
  for (const sql of ACCEPT) {
    test(`accepts: ${JSON.stringify(sql)}`, () => {
      assert.doesNotThrow(() => {
        assertSelectOnly(sql);
      });
    });
  }
  for (const [sql, reason] of REJECT) {
    test(`rejects (${reason}): ${JSON.stringify(sql)}`, () => {
      assert.throws(
        () => {
          assertSelectOnly(sql);
        },
        (error: unknown) =>
          error instanceof ReadOnlyGuardError &&
          error.reason === reason &&
          error.message.startsWith("TEST BUG"),
      );
    });
  }
});
```

### 8.7 `src/db/pg.ts` and its test

```ts
import pg from "pg";
import { dbStatementTimeoutMs, dbUrl, type ProductId } from "../env.ts";
import { assertSelectOnly } from "./select-guard.ts";

export type SqlParam = string | number | boolean | null | Date;

export interface ReadOnlyDb {
  readonly product: ProductId;
  /** One guarded SELECT inside its own READ ONLY transaction. Rows are plain objects. */
  select<Row extends Record<string, unknown>>(
    sql: string,
    params?: readonly SqlParam[],
  ): Promise<Row[]>;
  /** Idempotent. */
  close(): Promise<void>;
}

/** Narrow slice of pg.Pool so unit tests can pass a fake. */
export interface PoolLike {
  connect(): Promise<ClientLike>;
  end(): Promise<void>;
}
/** pg >= 8.12 honours queryMode; @types/pg 8.23.1 does not declare it yet. */
export type ExtendedQueryConfig = pg.QueryConfig<unknown[]> & { readonly queryMode: "extended" };
export interface ClientLike {
  query(config: string | ExtendedQueryConfig): Promise<{ rows: unknown[] }>;
  release(destroy?: boolean | Error): void;
}
export type PoolFactory = (config: pg.PoolConfig) => PoolLike;

const defaultPoolFactory: PoolFactory = (config) => {
  const pool = new pg.Pool(config);
  return {
    connect: async () => {
      const client = await pool.connect();
      return {
        query: (query) => client.query(query as pg.QueryConfig<unknown[]>),
        release: (destroy) => {
          client.release(destroy);
        },
      };
    },
    end: () => pool.end(),
  };
};

export class DbQueryError extends Error {
  override readonly name = "DbQueryError";
  readonly product: ProductId;
  readonly sqlstate: string | undefined;
  constructor(product: ProductId, sqlstate: string | undefined, message: string) {
    super(`${product} oracle query failed${sqlstate ? ` (SQLSTATE ${sqlstate})` : ""}: ${message}`);
    this.product = product;
    this.sqlstate = sqlstate;
  }
}

/** Session settings sent in the startup packet, so they apply before the first statement. */
export function readOnlySessionOptions(statementTimeoutMs: number): string {
  return [
    "-c default_transaction_read_only=on",
    `-c statement_timeout=${String(statementTimeoutMs)}`,
    `-c idle_in_transaction_session_timeout=${String(statementTimeoutMs * 2)}`,
  ].join(" ");
}

export interface ReadOnlyDbOptions {
  readonly connectionString: string;
  readonly statementTimeoutMs: number;
  readonly poolFactory?: PoolFactory;
}

export function createReadOnlyDb(product: ProductId, options: ReadOnlyDbOptions): ReadOnlyDb {
  const pool = (options.poolFactory ?? defaultPoolFactory)({
    connectionString: options.connectionString,
    max: 2,
    allowExitOnIdle: true,
    connectionTimeoutMillis: 5_000,
    application_name: `p2-qa-oracle-${product}`,
    options: readOnlySessionOptions(options.statementTimeoutMs),
  });
  let closed = false;

  return {
    product,
    async select<Row extends Record<string, unknown>>(
      sql: string,
      params: readonly SqlParam[] = [],
    ): Promise<Row[]> {
      if (closed) throw new Error(`TEST BUG: ${product} oracle used after close()`);
      assertSelectOnly(sql);
      const client = await pool.connect();
      let broken: Error | undefined;
      try {
        await client.query("BEGIN TRANSACTION READ ONLY");
        // Extended protocol: Postgres itself refuses a second statement (SQLSTATE 42601).
        const result = await client.query({
          text: sql,
          values: [...params],
          queryMode: "extended",
        });
        return result.rows as Row[];
      } catch (error) {
        broken = error instanceof Error ? error : new Error(String(error));
        const sqlstate = (error as { code?: unknown }).code;
        // Never include the connection string: only the server message and SQLSTATE.
        throw new DbQueryError(
          product,
          typeof sqlstate === "string" ? sqlstate : undefined,
          broken.message,
        );
      } finally {
        try {
          await client.query("ROLLBACK");
        } catch {
          broken ??= new Error("rollback failed");
        }
        client.release(broken ?? false);
      }
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await pool.end();
    },
  };
}

const registry = new Map<ProductId, ReadOnlyDb>();

/** One pool per product per worker process, configured from env (src/env.ts). */
export function readOnlyDb(product: ProductId, env: NodeJS.ProcessEnv = process.env): ReadOnlyDb {
  let db = registry.get(product);
  if (!db) {
    db = createReadOnlyDb(product, {
      connectionString: dbUrl(product, env),
      statementTimeoutMs: dbStatementTimeoutMs(env),
    });
    registry.set(product, db);
  }
  return db;
}

/** Call from a worker-scoped fixture teardown (product tasks). */
export async function closeAllReadOnlyDbs(): Promise<void> {
  const dbs = [...registry.values()];
  registry.clear();
  await Promise.all(dbs.map((db) => db.close()));
}
```

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type pg from "pg";
import {
  DbQueryError,
  createReadOnlyDb,
  readOnlySessionOptions,
  type ClientLike,
  type ExtendedQueryConfig,
  type PoolFactory,
} from "../../../src/db/pg.ts";
import { ReadOnlyGuardError } from "../../../src/db/select-guard.ts";

const SECRET_URL = "postgres://qa:s3cr3t-pw@127.0.0.1:5433/medusa";

interface FakeState {
  configs: pg.PoolConfig[];
  queries: (string | ExtendedQueryConfig)[];
  releases: (boolean | Error | undefined)[];
  connects: number;
  ends: number;
}

function fakePool(failOn?: (query: string | ExtendedQueryConfig) => Error | undefined): {
  factory: PoolFactory;
  state: FakeState;
} {
  const state: FakeState = { configs: [], queries: [], releases: [], connects: 0, ends: 0 };
  const factory: PoolFactory = (config) => {
    state.configs.push(config);
    return {
      connect: () => {
        state.connects += 1;
        const client: ClientLike = {
          query: (query) => {
            state.queries.push(query);
            const error = failOn?.(query);
            return error ? Promise.reject(error) : Promise.resolve({ rows: [{ n: 1 }] });
          },
          release: (destroy) => {
            state.releases.push(destroy);
          },
        };
        return Promise.resolve(client);
      },
      end: () => {
        state.ends += 1;
        return Promise.resolve();
      },
    };
  };
  return { factory, state };
}

describe("read-only pg oracle", () => {
  test("session options make every connection read-only with timeouts", () => {
    assert.equal(
      readOnlySessionOptions(5000),
      "-c default_transaction_read_only=on -c statement_timeout=5000 -c idle_in_transaction_session_timeout=10000",
    );
  });

  test("pool is built with the read-only options and a product application_name", () => {
    const { factory, state } = fakePool();
    createReadOnlyDb("medusa", {
      connectionString: SECRET_URL,
      statementTimeoutMs: 750,
      poolFactory: factory,
    });
    const config = state.configs[0];
    assert.ok(config);
    assert.equal(config.options, readOnlySessionOptions(750));
    assert.equal(config.application_name, "p2-qa-oracle-medusa");
    assert.equal(config.max, 2);
    assert.equal(config.allowExitOnIdle, true);
  });

  test("select runs BEGIN READ ONLY, one extended-protocol query, ROLLBACK, then releases", async () => {
    const { factory, state } = fakePool();
    const db = createReadOnlyDb("medusa", {
      connectionString: SECRET_URL,
      statementTimeoutMs: 5000,
      poolFactory: factory,
    });
    const rows = await db.select<{ n: number }>("SELECT $1::int AS n", [1]);
    assert.deepEqual(rows, [{ n: 1 }]);
    assert.deepEqual(state.queries, [
      "BEGIN TRANSACTION READ ONLY",
      { text: "SELECT $1::int AS n", values: [1], queryMode: "extended" },
      "ROLLBACK",
    ]);
    assert.deepEqual(state.releases, [false]);
  });

  test("guard rejection never touches the pool", async () => {
    const { factory, state } = fakePool();
    const db = createReadOnlyDb("cal", {
      connectionString: SECRET_URL,
      statementTimeoutMs: 5000,
      poolFactory: factory,
    });
    await assert.rejects(db.select("DELETE FROM t"), ReadOnlyGuardError);
    assert.equal(state.connects, 0);
  });

  test("a server error keeps SQLSTATE, drops the URL, rolls back and destroys the client", async () => {
    const serverError = Object.assign(
      new Error("cannot execute INSERT in a read-only transaction"),
      { code: "25006" },
    );
    const { factory, state } = fakePool((query) =>
      typeof query === "object" ? serverError : undefined,
    );
    const db = createReadOnlyDb("twenty", {
      connectionString: SECRET_URL,
      statementTimeoutMs: 5000,
      poolFactory: factory,
    });
    await assert.rejects(db.select("SELECT 1"), (error: unknown) => {
      assert.ok(error instanceof DbQueryError);
      assert.equal(error.sqlstate, "25006");
      assert.match(error.message, /twenty oracle query failed \(SQLSTATE 25006\)/);
      assert.ok(!error.message.includes("s3cr3t"));
      return true;
    });
    assert.equal(state.queries.at(-1), "ROLLBACK");
    assert.equal(state.releases[0], serverError);
  });

  test("close is idempotent and select after close is a TEST BUG", async () => {
    const { factory, state } = fakePool();
    const db = createReadOnlyDb("documenso", {
      connectionString: SECRET_URL,
      statementTimeoutMs: 5000,
      poolFactory: factory,
    });
    await db.close();
    await db.close();
    assert.equal(state.ends, 1);
    await assert.rejects(db.select("SELECT 1"), /used after close/);
  });
});
```

### 8.8 `src/contracts/oas.ts`, fixtures and test

```ts
import SwaggerParser from "@apidevtools/swagger-parser";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { OpenAPI } from "openapi-types";

// ajv-formats is CommonJS; under NodeNext its default import is the module object.
const addFormats = addFormatsModule.default;

export type HttpMethod = "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace";

/** Either an operationId or a method + path template exactly as written in the spec. */
export type OperationRef =
  { readonly operationId: string } | { readonly method: HttpMethod; readonly path: string };

export interface ResponseRef {
  readonly status: number;
  /** Defaults to application/json. Parameters such as `; charset=utf-8` are ignored. */
  readonly contentType?: string;
}

export interface ContractResult {
  readonly valid: boolean;
  /** Spec response key actually used: "201", "2XX" or "default". */
  readonly matchedStatus: string;
  readonly errors: readonly string[];
}

export class ContractError extends Error {
  override readonly name = "ContractError";
}

const MAX_ERRORS = 10;
const MAX_VALUE_CHARS = 80;
const METHODS: readonly HttpMethod[] = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
];

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null;

/** RFC 6901 JSON Pointer token. */
const pointerToken = (token: string): string => token.replace(/~/g, "~0").replace(/\//g, "~1");

/**
 * OAS 3.0 schemas use draft-04 style boolean exclusiveMinimum/Maximum, which JSON Schema 2020-12
 * rejects at compile time. Rewrite them in place; leave everything else alone. Cycle-safe.
 */
export function normaliseOas30Exclusives(node: unknown, seen = new WeakSet<object>()): void {
  if (!isObject(node) || seen.has(node)) return;
  seen.add(node);
  for (const [flag, bound] of [
    ["exclusiveMinimum", "minimum"],
    ["exclusiveMaximum", "maximum"],
  ] as const) {
    const value = node[flag];
    if (typeof value === "boolean") {
      if (value && typeof node[bound] === "number") {
        node[flag] = node[bound];
        Reflect.deleteProperty(node, bound);
      } else {
        Reflect.deleteProperty(node, flag);
      }
    }
  }
  for (const child of Object.values(node)) normaliseOas30Exclusives(child, seen);
}

function describeValue(data: unknown, instancePath: string): string {
  let value: unknown = data;
  for (const raw of instancePath.split("/").slice(1)) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    value = isObject(value) ? value[key] : undefined;
  }
  const text = value === undefined ? "undefined" : JSON.stringify(value);
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text;
}

/** One line per error: `at /items/0/id: must be string (got 1) [#/properties/id/type]`. */
export function formatAjvErrors(
  errors: readonly ErrorObject[] | null | undefined,
  data: unknown,
): string[] {
  const list = errors ?? [];
  const lines = list.slice(0, MAX_ERRORS).map((error) => {
    const at = error.instancePath === "" ? "(root)" : error.instancePath;
    const extra =
      error.keyword === "additionalProperties"
        ? ` '${String(error.params["additionalProperty"])}'`
        : "";
    return `at ${at}: ${error.message ?? error.keyword}${extra} (got ${describeValue(data, error.instancePath)}) [${error.schemaPath}]`;
  });
  if (list.length > MAX_ERRORS) lines.push(`… and ${String(list.length - MAX_ERRORS)} more`);
  return lines;
}

export class ContractSpec {
  readonly id: string;
  readonly openapi: string;
  /** Ajv warnings (for example unknown formats such as "phone"), collected instead of printed. */
  readonly warnings: string[];
  private readonly doc: JsonObject;
  private readonly ajv: Ajv2020;
  private readonly cache = new Map<
    string,
    { fn: ValidateFunction; matchedStatus: string; label: string }
  >();

  constructor(id: string, doc: JsonObject, warnings: string[]) {
    this.id = id;
    this.doc = doc;
    this.openapi = String(doc["openapi"]);
    this.warnings = warnings;
    this.ajv = new Ajv2020({
      strict: false,
      allErrors: true,
      logger: {
        log: () => undefined,
        warn: (...args: unknown[]) => warnings.push(args.map(String).join(" ")),
        error: console.error,
      },
    });
    addFormats(this.ajv);
    // The whole document is one schema resource; response schemas are reached by JSON Pointer, so
    // $refs left in place for circular schemas still resolve against it.
    this.ajv.addSchema(doc, this.schemaId());
  }

  private schemaId(): string {
    return `https://p2.local/oas/${encodeURIComponent(this.id)}.json`;
  }

  private resolveOperation(ref: OperationRef): {
    method: HttpMethod;
    path: string;
    operation: JsonObject;
  } {
    const paths = isObject(this.doc["paths"]) ? this.doc["paths"] : {};
    if ("operationId" in ref) {
      for (const [path, item] of Object.entries(paths)) {
        if (!isObject(item)) continue;
        for (const method of METHODS) {
          const operation = item[method];
          if (isObject(operation) && operation["operationId"] === ref.operationId)
            return { method, path, operation };
        }
      }
      throw new ContractError(
        `${this.id}: operationId ${JSON.stringify(ref.operationId)} is not in the spec`,
      );
    }
    const item = paths[ref.path];
    const operation = isObject(item) ? item[ref.method] : undefined;
    if (!isObject(operation)) {
      throw new ContractError(
        `${this.id}: ${ref.method.toUpperCase()} ${ref.path} is not in the spec (${String(Object.keys(paths).length)} paths)`,
      );
    }
    return { method: ref.method, path: ref.path, operation };
  }

  /** Compiled validator for one operation + status + content type. Cached; same function on reuse. */
  validator(
    op: OperationRef,
    response: ResponseRef,
  ): { fn: ValidateFunction; matchedStatus: string; label: string } {
    const { method, path, operation } = this.resolveOperation(op);
    const mediaType =
      (response.contentType ?? "application/json").split(";")[0]?.trim().toLowerCase() ?? "";
    const cacheKey = `${method} ${path} ${String(response.status)} ${mediaType}`;
    const hit = this.cache.get(cacheKey);
    if (hit) return hit;

    const responses = isObject(operation["responses"]) ? operation["responses"] : {};
    const exact = String(response.status);
    const range = `${exact.charAt(0)}XX`;
    const matchedStatus = [exact, range, range.toLowerCase(), "default"].find(
      (key) => key in responses,
    );
    if (matchedStatus === undefined) {
      throw new ContractError(
        `${this.id}: ${method.toUpperCase()} ${path} documents no response for ${exact} (documented: ${Object.keys(responses).join(", ")})`,
      );
    }
    const content = isObject(responses[matchedStatus])
      ? responses[matchedStatus]["content"]
      : undefined;
    const contentKeys = isObject(content) ? Object.keys(content) : [];
    const contentKey = contentKeys.find(
      (key) => key.split(";")[0]?.trim().toLowerCase() === mediaType,
    );
    if (
      contentKey === undefined ||
      !isObject(content) ||
      !isObject(content[contentKey]) ||
      !("schema" in content[contentKey])
    ) {
      throw new ContractError(
        `${this.id}: ${method.toUpperCase()} ${path} ${matchedStatus} has no ${mediaType} schema (content: ${contentKeys.join(", ") || "none"})`,
      );
    }
    const pointer = [
      "paths",
      path,
      method,
      "responses",
      matchedStatus,
      "content",
      contentKey,
      "schema",
    ]
      .map(pointerToken)
      .join("/");
    const fn = this.ajv.getSchema(`${this.schemaId()}#/${pointer}`);
    if (!fn) throw new ContractError(`${this.id}: could not compile #/${pointer}`);
    const entry = {
      fn,
      matchedStatus,
      label: `${this.id} ${method.toUpperCase()} ${path} ${matchedStatus} ${mediaType}`,
    };
    this.cache.set(cacheKey, entry);
    return entry;
  }

  validate(op: OperationRef, response: ResponseRef, body: unknown): ContractResult {
    const { fn, matchedStatus } = this.validator(op, response);
    const valid = fn(body);
    return { valid, matchedStatus, errors: valid ? [] : formatAjvErrors(fn.errors, body) };
  }

  /** Throws a ContractError whose message names the operation and lists readable errors. */
  assertValid(op: OperationRef, response: ResponseRef, body: unknown): void {
    const { label } = this.validator(op, response);
    const result = this.validate(op, response, body);
    if (!result.valid) {
      throw new ContractError(
        `${label} does not match the contract:\n  ${result.errors.join("\n  ")}`,
      );
    }
  }
}

const specCache = new Map<string, Promise<ContractSpec>>();

/**
 * Load a committed OAS file (YAML or JSON), dereference it and build validators lazily.
 * Circular $refs are left in place (`circular: "ignore"`) because a fully dereferenced cycle
 * overflows Ajv's compiler. One load per file per worker.
 */
export function loadSpec(id: string, file: string): Promise<ContractSpec> {
  const key = `${id}\u0000${file}`;
  let pending = specCache.get(key);
  if (!pending) {
    pending = (async () => {
      const api: OpenAPI.Document = await SwaggerParser.dereference(file, {
        dereference: { circular: "ignore" },
      });
      const doc = api as unknown as JsonObject;
      const version = typeof doc["openapi"] === "string" ? doc["openapi"] : "";
      if (!/^3\.[01]\./.test(version))
        throw new ContractError(
          `${id}: only OpenAPI 3.0 and 3.1 are supported, got ${JSON.stringify(version)}`,
        );
      if (version.startsWith("3.0.")) normaliseOas30Exclusives(doc);
      return new ContractSpec(id, doc, []);
    })();
    specCache.set(key, pending);
    pending.catch(() => specCache.delete(key));
  }
  return pending;
}
```

`tests/fixtures/oas/mini-3.0.yaml`:

```yaml
openapi: 3.0.3
info: { title: p2 fixture 3.0, version: "1" }
paths:
  /items/{id}:
    get:
      operationId: getItem
      responses:
        "200":
          description: ok
          content:
            application/json; charset=utf-8:
              schema: { $ref: "#/components/schemas/Item" }
        4XX:
          description: client error
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Error" }
        default:
          description: other
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Error" }
  /nodes:
    get:
      operationId: listNodes
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Node" }
  /download:
    get:
      operationId: download
      responses:
        "200":
          description: binary
          content:
            application/pdf:
              schema: { type: string, format: binary }
components:
  schemas:
    Item:
      type: object
      required: [id, created_at, price]
      additionalProperties: false
      properties:
        id: { type: string, x-vendor-note: ignored }
        created_at: { type: string, format: date-time }
        note: { type: string, nullable: true }
        price: { type: number, minimum: 0, exclusiveMinimum: true }
        phone: { type: string, format: phone }
    Error:
      type: object
      required: [message]
      properties:
        message: { type: string }
    Node:
      type: object
      required: [name]
      properties:
        name: { type: string }
        child: { $ref: "#/components/schemas/Node" }
```

`tests/fixtures/oas/mini-3.1.json`:

```json
{
  "openapi": "3.1.0",
  "info": { "title": "p2 fixture 3.1", "version": "1" },
  "paths": {
    "/people": {
      "get": {
        "operationId": "listPeople",
        "responses": {
          "200": {
            "description": "ok",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": ["data"],
                  "properties": {
                    "data": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "required": ["id"],
                        "properties": {
                          "id": { "type": "string", "format": "uuid" },
                          "city": { "type": ["string", "null"] },
                          "score": { "type": "number", "exclusiveMinimum": 0 }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

`tests/fixtures/oas/swagger-2.0.json`:

```json
{ "swagger": "2.0", "info": { "title": "old", "version": "1" }, "paths": {} }
```

```ts
import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { ContractError, loadSpec, normaliseOas30Exclusives } from "../../../src/contracts/oas.ts";

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "oas",
);
const SPEC_30 = path.join(FIXTURES, "mini-3.0.yaml");
const SPEC_31 = path.join(FIXTURES, "mini-3.1.json");
const getItem = { operationId: "getItem" } as const;
const ok = { status: 200, contentType: "application/json; charset=utf-8" } as const;
const item = { id: "i1", created_at: "2026-10-21T09:30:05Z", price: 1 };

describe("OAS contract loader", () => {
  test("a valid body passes", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.deepEqual(spec.validate(getItem, ok, item), {
      valid: true,
      matchedStatus: "200",
      errors: [],
    });
  });

  test("operation can be addressed by method + path template", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.equal(spec.validate({ method: "get", path: "/items/{id}" }, ok, item).valid, true);
  });

  test("missing required property gives a readable line", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    const result = spec.validate(getItem, ok, { id: "i1", price: 1 });
    assert.equal(result.valid, false);
    assert.match(
      result.errors[0] ?? "",
      /^at \(root\): must have required property 'created_at' .*\[#\/required\]$/,
    );
  });

  test("format, additionalProperties and type errors name the path and value", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    const result = spec.validate(getItem, ok, {
      ...item,
      created_at: "yesterday",
      extra: true,
      id: 7,
    });
    const text = result.errors.join("\n");
    assert.match(text, /at \/created_at: must match format "date-time" \(got "yesterday"\)/);
    assert.match(text, /must NOT have additional properties 'extra'/);
    assert.match(text, /at \/id: must be string \(got 7\)/);
  });

  test("OAS 3.0 nullable is honoured", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.equal(spec.validate(getItem, ok, { ...item, note: null }).valid, true);
  });

  test("OAS 3.0 boolean exclusiveMinimum is normalised and enforced", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.equal(spec.validate(getItem, ok, { ...item, price: 0 }).valid, false);
    const node: Record<string, unknown> = {
      minimum: 0,
      exclusiveMinimum: true,
      maximum: 9,
      exclusiveMaximum: false,
    };
    normaliseOas30Exclusives(node);
    assert.deepEqual(node, { exclusiveMinimum: 0, maximum: 9 });
  });

  test("unknown formats are ignored and recorded as warnings, not printed", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.equal(spec.validate(getItem, ok, { ...item, phone: "not checked" }).valid, true);
    assert.ok(spec.warnings.some((warning) => warning.includes('unknown format "phone"')));
  });

  test("4XX range and default responses are used when the exact code is absent", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.equal(spec.validate(getItem, { status: 404 }, { message: "nope" }).matchedStatus, "4XX");
    assert.equal(
      spec.validate(getItem, { status: 503 }, { message: "down" }).matchedStatus,
      "default",
    );
  });

  test("circular schemas validate nested data", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    const op = { operationId: "listNodes" };
    assert.equal(
      spec.validate(op, { status: 200 }, { name: "a", child: { name: "b", child: { name: "c" } } })
        .valid,
      true,
    );
    assert.equal(
      spec.validate(op, { status: 200 }, { name: "a", child: { name: 1 } }).valid,
      false,
    );
  });

  test("validators are cached per operation, status and content type", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.equal(
      spec.validator(getItem, ok).fn,
      spec.validator({ method: "get", path: "/items/{id}" }, { status: 200 }).fn,
    );
    assert.equal(await loadSpec("mini30", SPEC_30), spec);
  });

  test("OAS 3.1 type arrays and numeric exclusiveMinimum work", async () => {
    const spec = await loadSpec("mini31", SPEC_31);
    const op = { operationId: "listPeople" };
    const id = "0b6f4f5e-8f8a-4c56-9f55-1d2c3b4a5e6f";
    assert.equal(
      spec.validate(op, { status: 200 }, { data: [{ id, city: null, score: 1 }] }).valid,
      true,
    );
    assert.equal(spec.validate(op, { status: 200 }, { data: [{ id: "not-a-uuid" }] }).valid, false);
    assert.equal(spec.validate(op, { status: 200 }, { data: [{ id, score: 0 }] }).valid, false);
  });

  test("assertValid throws a ContractError that names the operation", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.throws(
      () => {
        spec.assertValid(getItem, ok, {});
      },
      (error: unknown) => {
        assert.ok(error instanceof ContractError);
        assert.match(
          error.message,
          /^mini30 GET \/items\/\{id\} 200 application\/json does not match the contract:/,
        );
        return true;
      },
    );
  });

  test("lookup failures are ContractErrors with what is documented", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.throws(
      () => spec.validator({ operationId: "nope" }, { status: 200 }),
      /operationId "nope" is not in the spec/,
    );
    assert.throws(
      () => spec.validator({ method: "post", path: "/items/{id}" }, { status: 200 }),
      /POST \/items\/\{id\} is not in the spec/,
    );
    assert.throws(
      () => spec.validator({ operationId: "listNodes" }, { status: 500 }),
      /documents no response for 500 \(documented: 200\)/,
    );
    assert.throws(
      () => spec.validator({ operationId: "download" }, { status: 200 }),
      /has no application\/json schema \(content: application\/pdf\)/,
    );
  });

  test("Swagger 2.0 is rejected", async () => {
    await assert.rejects(
      loadSpec("old", path.join(FIXTURES, "swagger-2.0.json")),
      /only OpenAPI 3\.0 and 3\.1/,
    );
  });
});
```

### 8.9 `playwright.config.ts`

```ts
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig, type Project } from "@playwright/test";
import { ensureRunPrefix } from "./src/run/prefix.ts";

// Local convenience only: values already in the shell (CI) win over .env.
if (existsSync(".env")) loadEnvFile(".env");
// Runs in the runner process before workers start; workers inherit P2_RUN_ID (one prefix per run).
ensureRunPrefix();

const isCI = Boolean(process.env["CI"]);

/** One project per product. Folder codes match the project names: cal, doc, med, tw. */
function apiProject(name: string, code: string): Project {
  return { name, testMatch: [`{contracts,webhooks,integration}/${code}/**/*.spec.ts`] };
}

export default defineConfig({
  testDir: "tests",
  // API tests assert exact DB counts: one worker, no retries (a retry would hide a flaky oracle).
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: isCI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results",
  reporter: isCI
    ? [
        ["list"],
        ["junit", { outputFile: "results/junit.xml" }],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ]
    : [["list"]],
  use: {
    // No browserName and no page fixture: these projects use APIRequestContext only.
    extraHTTPHeaders: { accept: "application/json" },
    trace: "retain-on-failure",
  },
  projects: [
    apiProject("cal-api", "cal"),
    apiProject("doc-api", "doc"),
    apiProject("med-api", "med"),
    apiProject("tw-api", "tw"),
  ],
});
```

### 8.10 `.github/workflows/api.yml`

```yaml
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
      - name: Playwright has the four API projects and no browser
        run: |
          set -euo pipefail
          npm run list:api
          out="$(npx playwright test --list --project=__list_projects__ 2>&1 || true)"
          echo "$out" | grep -F 'Available projects: "cal-api", "doc-api", "med-api", "tw-api"'
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
```

## 9. Oracle design

Task 1 ships the oracle, not oracle queries. Usage contract for Tasks 3–6:

```ts
import { readOnlyDb } from "../../../src/db/pg.ts";
import { currentRunPrefix, likePrefixPattern } from "../../../src/run/prefix.ts";

const db = readOnlyDb("medusa");
const rows = await db.select<{ n: number }>(
  `SELECT COUNT(*)::int AS n FROM cart WHERE email LIKE $1 ESCAPE '\\'`,
  [likePrefixPattern(currentRunPrefix())],
);
```

- Every value goes in as a parameter (`$1`), never string-concatenated.
- Count with `::int` so `pg` returns a number, not a string.
- A `ReadOnlyGuardError` or `DbQueryError` is a **TEST BUG**; the message starts with `TEST BUG`
  or names the product and SQLSTATE.
- No query in Task 1 touches a product database.

## 10. Test data, isolation, cleanup and leak check

- Task 1 creates no product data. Unit tests use fakes and local fixture files only.
- Isolation contract for later tasks: every created entity is named with `runScopedName(label)`;
  orphan checks use `likePrefixPattern(currentRunPrefix())`; cleanup is per atomic fixture
  (Task 3). No `TRUNCATE`, no DB writes from tests.

## 11. Known-bug handling

None in Task 1 (no product). The `PRODUCT BUG` / `TEST BUG` labels start in Task 3. Framework errors
already say `TEST BUG` (guard, env, prefix, use after close).

## 12. CI impact

- New workflow `api` with jobs `check` and `unit` (§8.10). No Docker, no product, no secrets.
- `env-check.yml` unchanged and still runs.
- `scripts/cloud-install.sh` starts running `npm ci` once `package-lock.json` exists (its existing
  `if [ -f package-lock.json ]`), so cloud sessions get `node_modules` automatically.
- Required checks: after this plan is approved and Task 1 merges, Jayami adds `check` and `unit`
  to the Main ruleset (roadmap §7 Q4). Product jobs join after two green `main` runs.
- Expected runtime per job on `ubuntu-24.04`: under 2 minutes (local `npm ci` 8.5 s,
  `npm run check` 6.6 s).

## 13. Risks and unknowns (each with a probe)

| Risk | Probe / mitigation |
|---|---|
| Guard false positives block a legitimate oracle query in Tasks 3–6 | The error names the reason; rewrite with quoted identifiers or parameters. Never loosen the guard without adding a reject test for the bypass it could allow. |
| Guard misses a write path not in the deny-lists | Layers 2–4 still apply; the one known server gap (`EXPLAIN ANALYZE … AS`) is blocked by the SELECT/WITH start rule. OQ1 proposes a live CI proof. |
| `queryMode` is undeclared in `@types/pg` 8.23.1 | Local `ExtendedQueryConfig` type; unit test asserts the field is sent. Re-check when `@types/pg` updates. |
| Large specs slow the first test (Medusa 550 + 829 ms) | Spec and validators cached per worker (D7); `workers: 1`. |
| Documenso OAS 3.0 boolean exclusives | Normaliser + unit test; Task 4 confirms on the real spec. |
| Twenty OAS 3.1.1 features beyond the fixture | `Ajv2020` is the 3.1 dialect; Task 5 probes the real spec. |
| `.nvmrc` is `22` (floats in CI) | Matches P1/P6. CI log prints the resolved Node version; the gate requires ≥ 22.22. |
| Git dependency fetch from GitHub in CI | Same lockfile form P6 uses in CI (§2.2); a 403/ENOTFOUND is an ENV finding: stop and report. |
| Very recent pins (`typescript-eslint` 2 days, `eslint` 5 days old) | OQ2. |
| Windows (Git Bash) for Jayami | Globs quoted and expanded by Node/Playwright, not the shell; no `mkdir -p` in npm scripts. |

## 14. Build steps (repo root; PATH export first; on any differing output: stop and report, paste it)

Do not start until Jayami approves this plan. Never `git add -A`; stage explicit paths.

### Step 0. Branch

```bash
export PATH="/usr/local/bin:$PATH"
node --version                          # v22.23.3 (any v22 >= 22.22 is fine)
git fetch origin main
git checkout -b feat/2026-10-21-p2-framework origin/main
git rev-parse --abbrev-ref HEAD         # feat/2026-10-21-p2-framework
git status --short                      # (empty)
```

### Step 1. Tooling

Write `package.json` exactly as §8.1 but **without** the `dependencies` and `devDependencies`
blocks, then install (this writes both blocks and the lockfile):

```bash
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
npm install --save-exact "qa-portfolio-harness@github:Jayami123/qa-portfolio-harness#v0.2.11"
npm install --save-dev --save-exact @playwright/test@1.64.1 typescript@6.0.3 @types/node@22.20.5 \
  eslint@10.13.0 @eslint/js@10.0.1 typescript-eslint@8.72.0 eslint-config-prettier@10.1.8 \
  globals@17.13.0 prettier@3.9.10 pg@8.23.1 @types/pg@8.23.1 ajv@8.20.0 ajv-formats@3.0.1 \
  @apidevtools/swagger-parser@13.1.0 openapi-types@12.1.3 zod@4.6.7
```

Expected: `found 0 vulnerabilities`, no `ERESOLVE`/peer warnings. Then compare `package.json`
with §8.1 (`git diff --no-index` against a copy, or by eye): identical apart from key order npm
chooses. Write `tsconfig.json`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore` (§8.2,
§8.3).

```bash
npx tsc -p tsconfig.json; echo "tsc=$?"   # "error TS18003: No inputs were found" is expected now
npx prettier --check .                     # All matched files use Prettier code style!
```

If Prettier lists any tracked file, stop: only new files may be formatted, and `AGENTS.md` /
`docs/` must be ignored.

Commit 1 (§16).

### Step 2. Prefix + env

Write `src/run/prefix.ts`, `src/env.ts` and their tests (§8.4, §8.5). Append to `.env.example`
(names only, never values):

```text
# Run prefix shared by every entity a run creates. Leave empty: playwright.config.ts generates
# p2-qa-<utc>-<8 hex>. CI may preset it; it must match that pattern.
P2_RUN_ID=
# Read-only oracle statement timeout in ms (100-600000). Default 5000.
P2_DB_STATEMENT_TIMEOUT_MS=
```

```bash
node --test "tests/unit/run/*.test.ts" "tests/unit/env.test.ts"   # tests 14, pass 14, fail 0
npx tsc -p tsconfig.json; echo "tsc=$?"                           # tsc=0
```

Commit 2.

### Step 3. Read-only oracle

Write `src/db/select-guard.ts`, `src/db/pg.ts` and their tests (§8.6, §8.7).

```bash
node --test "tests/unit/db/*.test.ts"   # tests 59, pass 59, fail 0 (53 guard + 6 pg)
npm run lint                            # exit 0, no output
```

Commit 3.

### Step 4. Contract loader

Write `src/contracts/oas.ts`, the three fixtures and the test (§8.8).

```bash
node --test "tests/unit/contracts/*.test.ts"   # tests 14, pass 14, fail 0
npm run check                                  # exit 0; unit summary tests 87, pass 87, fail 0
```

Commit 4.

### Step 5. Playwright config

Write `playwright.config.ts` (§8.9).

```bash
npm run list:api
# Listing tests:
# Total: 0 tests in 0 files
npx playwright test --list --project=__list_projects__ 2>&1 | grep -F "Available projects"
# Error: Project(s) "__list_projects__" not found. Available projects: "cal-api", "doc-api", "med-api", "tw-api"
P2_RUN_ID=bad npm run list:api 2>&1 | grep -F "TEST BUG"
# Error: TEST BUG: P2_RUN_ID must match /^p2-qa-\d{8}t\d{6}z-[0-9a-f]{8}$/, got "bad"
npm run check                                  # exit 0
```

Commit 5.

### Step 6. CI and README

Write `.github/workflows/api.yml` (§8.10). Append to `README.md` (keep its first line and BOM as is):

```markdown

## Develop

Node 22 (`.nvmrc`); in cloud sessions run `export PATH="/usr/local/bin:$PATH"` first.

    npm ci
    npm run check      # format, lint, typecheck, unit tests (no product, no browser)
    npm run unit       # unit tests only (node:test)
    npm run list:api   # Playwright API projects: cal-api, doc-api, med-api, tw-api

API tests never start products; qa-portfolio-harness does. No browsers are installed or used.
```

```bash
npx prettier --check . && npm run check   # exit 0
bash -n .claude/hooks/session-start.sh     # env-check still green locally
```

Commit 6. Push and open the PR to `main` (§16).

## 15. Verification gate (hard gate before any implementation push; paste real output)

PATH export first. Then:

1. `rm -rf node_modules && npm ci` → exit 0, `found 0 vulnerabilities`;
   `ls ~/.cache/ms-playwright 2>&1` → `No such file or directory`.
2. `npm run check` → exit 0; unit summary `tests 87`, `pass 87`, `fail 0`. The list must include
   the guard reject rows for: comment, multi-statement, `EXPLAIN ANALYZE CREATE TABLE … AS`,
   writable CTE, `SELECT INTO`, `FOR UPDATE`, `set_config`, `lo_create`, dollar quote, `E''`.
3. `npm run list:api` → `Total: 0 tests in 0 files`, exit 0.
4. Unknown-project listing shows exactly `"cal-api", "doc-api", "med-api", "tw-api"`.
5. `git diff --name-only origin/main...HEAD` lists only the §7 files. Not `AGENTS.md`, not `docs/`,
   not `scripts/`, not `products/`, no harness or fork path.
6. `git grep -nE "s3cr3t|password@|ghp_|whsec_" -- . ':!tests/unit' ':!docs'` → only the harness
   public default DB URL in `src/env.ts` (`documenso:password@127.0.0.1`, documented as a public
   default); no other match. (`docs/master-plan.html` already names a local Stripe test secret
   from P1 evidence; it is not part of this diff.)
7. After push: both `api / check` and `api / unit` green on the PR, and `env-check` green. Paste the
   run URL and the "Node.js version" line from the setup-node step.

## 16. Commit plan (Conventional, lowercase subjects, explicit paths, never `git add -A`)

Plan-only commit (this task, on `plan/2026-10-20-p2-phase1`):

1. `docs(plans): add p2 phase 1 task 1 framework plan` —
   `docs/plans/2026-10-21-p2-phase1-task1-framework.md` and the roadmap revision
   (`docs/plans/2026-10-20-p2-phase1-roadmap.md`: D2 and Task 1 files)

After approval, on `feat/2026-10-21-p2-framework`:

1. `build: add typescript, eslint, prettier and test dependencies` — `package.json`,
   `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`
2. `feat(run): add run prefix and validated env getters` — `src/run/prefix.ts`, `src/env.ts`,
   `tests/unit/run/prefix.test.ts`, `tests/unit/env.test.ts`, `.env.example`
3. `feat(db): add read-only pg oracle with select-only guard` — `src/db/select-guard.ts`,
   `src/db/pg.ts`, `tests/unit/db/select-guard.test.ts`, `tests/unit/db/pg.test.ts`
4. `feat(contracts): add oas loader with ajv 2020 validators` — `src/contracts/oas.ts`,
   `tests/fixtures/oas/*`, `tests/unit/contracts/oas.test.ts`
5. `test: add playwright config with four api projects` — `playwright.config.ts`
6. `ci: add api workflow with check and unit jobs` — `.github/workflows/api.yml`, `README.md`

PR title: `feat: p2 framework skeleton` (no product). Keep the environment's
`GIT_AUTHOR_*`/`GIT_COMMITTER_*`. No Co-Authored-By, no "Generated with", no Claude-Session lines,
no force-push, no merge by the builder.

## 17. Docs

- This plan; the roadmap revision (D2: `node:test`; Task 1 files).
- `README.md` "Develop" section (Step 6). Full README is Task 7.
- `.env.example` names only.
- No ADR; no master-plan HTML edits.

## 18. Will NOT do

- No mapped case IDs, no specs under `tests/contracts|webhooks|integration`, no product clients,
  tokens, fixtures (`src/clients/*`, `src/auth/*`, `src/fixtures/atomic.ts`), no committed product
  specs (`contracts/<product>/`)
- No receiver or signers (Task 2)
- No product start/stop, no harness commands, no Docker in CI, no product CI jobs
- No browser download, `page` fixture, `browserName`, page objects, UI assertions
- No sleeps (`setTimeout`, `waitForTimeout`), no retries, no `workers > 1`
- No DB writes, no `TRUNCATE`, no read-only role creation, no logging of DB URLs
- No Vitest, Jest, `tsx`, `dotenv`, SQL parser dependency
- No edits to `AGENTS.md`, `docs/master-plan.html`, `scripts/`, `.claude/`, `.cursor/`,
  `env-check.yml`, forks or harness
- No secrets in `.env.example`; `.env` stays gitignored
- No Co-Authored-By / Generated-with / Claude-Session lines, no author rewrites, no force-push

## 19. Open questions for Jayami

1. **Live proof of the read-only layers in CI.** Add a third job `db-guard` (or a step in `unit`)
   with a `postgres:15` service container that runs a small `tests/db/*.test.ts` against it:
   `INSERT` → `25006`, multi-statement → `42601`, `pg_sleep` past the timeout → `57014`, and
   `EXPLAIN ANALYZE CREATE TABLE … AS` blocked by the guard before it reaches the server.
   Recommended: yes, in Task 1, not required at first. Without it the server-side layers are proven
   only by this plan's probe until Task 3.
2. **Release-age policy for pins.** Pin the latest stable today (as D4; `typescript-eslint` 8.72.0
   is 2 days old, `eslint` 10.13.0 is 5 days old), or require ≥ 7 days (then `typescript-eslint`
   8.71.2 and `eslint` 10.12.0)? Recommended: latest stable as probed, Dependabot later.
3. **Roadmap D2 change.** Confirm `node:test` instead of Vitest for units (D2).
