# P2 foundation Task 3: database roles, fixture writer and the global invariant sweep (plan only)

Builds on Task 2 (`docs/plans/2026-11-01-p2-task2-receiver-signers.md`). Index:
`docs/plans/2026-11-01-p2-foundation-index.md`. This plan replaces the roadmap decision D5 ("no dedicated role",
`docs/plans/2026-10-20-p2-phase1-roadmap.md`) as the senior review requires.

## 1. Header

- Plan branch `plan/2026-11-01-p2-foundation`. Base commit at plan time: `main` = `fd554c901e82a7a936fb0074af42de6b26f56ab1`.
- Build branch: `feat/<build-date>-p2-task3-db-roles-invariants`, `<build-date>` = `date -u +%F` on the build day.
  **Cut from the head of the Task 2 branch** (`feat/<date>-p2-task2-receiver-signers`), record that SHA. PR base: the
  Task 2 branch (GitHub retargets to `main` when it merges and is deleted).
- Depends on: Task 1 (merged) and Task 2 (stacked; this task does not use the receiver or the signers, so a
  Task 2 stop does not block it, see the index).
- Unit chain: Task 2 head **172** -> this task **211** (+39). db-guard: **8 -> 22** tests (+14).
- Harness stays `v0.2.11` in this task. Probe date 2026-11-01 on the Claude Code cloud VM (Node 22.23.3, Docker 29.9.2).
- Verification of this plan: all code below was built in a scratch copy on top of the Task 2 code. `npm run check`
  exit 0 (211/211), `npm run test:db` against a throwaway `postgres:15` 22/22 three times in a row, and the
  provisioning, the writer and every product rule were also run against the real harness databases
  (section 2).

## 2. Probe findings

### 2.1 Who owns the harness databases (probe P6)

| Product | Server | Admin user (default URL in `src/env.ts`) | Attributes |
|---|---|---|---|
| Cal | PostgreSQL 18.6, `trust` auth | `postgres` | superuser |
| Documenso | PostgreSQL 15 | `documenso` | superuser (`POSTGRES_USER`) |
| Medusa | PostgreSQL 15 | `medusa` | superuser |
| Twenty | PostgreSQL 16.15 | `postgres` | superuser |

A plain database owner without `CREATEROLE` cannot create roles (throwaway `postgres:15`, owner `appowner`:
`ERROR: permission denied to create role`). The harness databases are owned by superusers, so provisioning needs
no harness change.

Provisioning SQL (section 6.2) was run on: a throwaway `postgres:15`, and the real Cal (18.6), Documenso (15),
Medusa (15) and Twenty (16.15) databases, each **twice** (idempotent) and then torn down:

```text
db-roles provision: cal ok   (x2)      db-roles teardown: cal ok     leftover roles: 0
qa_ro   SELECT on an existing table, on a table created later, and on a schema created later: ok
        INSERT/UPDATE/CREATE TABLE in the default session: SQLSTATE 25006 (read-only transaction)
        explicit BEGIN READ WRITE; INSERT: SQLSTATE 42501 (permission denied)   <- second, independent layer
qa_fixture (Cal live): UPDATE "Task"."scheduledAt" ok; UPDATE "Task".attempts / DELETE / INSERT /
        SELECT payload / UPDATE "Booking" -> all SQLSTATE 42501; password rotation: the old password gives 28P01
Twenty live: CREATE SCHEMA p2_probe_later; CREATE TABLE ...  -> qa_ro reads it at once (pg_read_all_data)
```

The alternative `GRANT SELECT ON ALL TABLES` plus `ALTER DEFAULT PRIVILEGES FOR ROLE <owner>` also worked, but it
only covers objects created by the named owner and Twenty creates a schema per workspace, so
`pg_read_all_data` (PostgreSQL 14+; every product is 15 or newer) is simpler and does not drift.

### 2.2 Time-travel columns, derived from the master-plan cases that need them

| Case | Needs | Table.column (pinned ref) | Source line that makes it matter |
|---|---|---|---|
| P2-CAL-SCH-002 | a due scheduled trigger | `WebhookScheduledTriggers.startAfter` | `schema.prisma:1318`; `handleWebhookScheduledTriggers.ts:16-22` (jobs with `startAfter <= now` run). **The master plan calls it `startTime`; the schema says `startAfter`.** |
| P2-CAL-TASK-001, P2-CAL-TASK-002 | retries without waiting | `Task.scheduledAt` | `schema.prisma:1830`; `tasker/repository.ts:136-141` (a retry with `minRetryIntervalMins` pushes `scheduledAt` out) |
| P2-DOC-EXP-001, P2-DOC-EXP-002 | an expiry at now+2 s / now-1 s | `Recipient.expiresAt` | `schema.prisma:640`; `expire-recipients-sweep.handler.ts:13` |
| P2-DOC-REM-001, P2-DOC-REM-002 | a reminder that is due | `Recipient.nextReminderAt` | `schema.prisma:645`; `send-signing-reminders-sweep.handler.ts:13`. **The master plan says `lastReminderAt`; the sweep filters on `nextReminderAt`.** |

Not covered: **P2-DOC-JOB-003** needs a "job with an invalid payload inserted via fixture", i.e. an `INSERT`; the
review limits `qa_fixture` to column-level `UPDATE` of time columns. Open decision OD-2. Medusa and Twenty have no
case that needs a database write (P2-MED-PL-001 and P2-TW-PAG-001 use the API), so they get no `qa_fixture`.

### 2.3 Playwright fixture order (probe, Playwright 1.64.0, toy project)

```text
sweep:setup > created:setup > body > created:teardown(cleanup) > sweep:teardown(after use)     (test passes)
sweep:setup > created:setup > body-fail > created:teardown(cleanup) > sweep:teardown(after use) (test fails)
```

An `auto: true` fixture declared in the base `test` tears down **after** the test's own fixtures, also when the
body fails. So a test's atomic cleanup has already run when the P2-X-DB-001 sweep looks, and a violation can fail
the test from the fixture teardown.

### 2.4 Seed data is not clean (found by running the rules unscoped)

```text
Documenso: SELECT status, count(*), count("completedAt") FROM "Envelope" GROUP BY 1
  DRAFT 354/0   PENDING 337/0   COMPLETED 333/0      <- every seeded COMPLETED envelope has completedAt NULL
  e.g. title "[MEDIUM] Document 2 - COMPLETED", created by the harness seed (packages/prisma/seed/documents.ts:65,676)
```

This is **seed data from the fork's dev seeder, not a runtime product defect** (the same rule is exactly what the
sweep should enforce for rows the product creates at run time). Consequence, decision D5: consistency and orphan
rules judge only rows created at or after the run start.

### 2.5 Rules run against the live schemas (2026-11-01)

Cal (7 rules), Documenso (7), Medusa (5): every rule ran with no SQL error against the real database as `qa_ro`
(`basis: "live"`). Twenty: the two `core` rules ran live; the per-workspace `person` rule is `basis: "source"` (its
column `nameFirstName` comes from the person entity; the Task 5 readiness spec executes it and fails on
SQLSTATE 42P01/42703). Positive control found live: the unscoped Documenso envelope rule returned the seeded rows.

## 3. Resolved decisions

- **D1. Roles are created by an explicit provisioning step with the harness admin URL, never inside a test.**
  Industry standard: DDL belongs to an admin-run setup (migration or script), tests connect with least privilege.
  `scripts/db-roles.ts provision|teardown <product|all>` is idempotent (create if missing, rotate the password,
  re-converge grants) and reversible (`DROP OWNED BY` + `DROP ROLE`). Rejected: (b) a harness release that
  provisions roles (harness work for something P2 can do today); (c) running tests as the owner (no defence if a
  helper writes). Only `src/db/roles-admin.ts`, `scripts/db-roles.ts` and `tests/db/**` may use the owner URL;
  ESLint forbids importing `dbUrl` anywhere else that tests use.
- **D2. `qa_ro` = `pg_read_all_data` + `default_transaction_read_only = on` + no `CREATE` on `public`.** The Task 1
  oracle layers (client guard, `BEGIN READ ONLY`, session option) stay; the role adds a fourth, independent one
  (probe: `42501` even in a `READ WRITE` transaction).
- **D3. `qa_fixture` = column-level `SELECT(pk, col)` and `UPDATE(col)` on the allow-list only**, after a
  `REVOKE ALL ON ALL TABLES IN SCHEMA public` so removing a column from the list removes the grant on the next run.
  No `INSERT`, `DELETE`, other column or DDL. `checkRoleGrants` compares the live grants with the allow-list and fails
  provisioning on any difference.
- **D4. `src/db/fixture.ts` is the only write path.** It accepts exactly
  `UPDATE <allow-listed table> SET <allow-listed timestamp column> = $1 WHERE <pk> = $2`, requires a master-plan
  case id that owns the column, requires exactly one row (else rolls back), and logs every call (applied, refused or
  failed) as JSONL in `fixture-logs/<run id>.jsonl`. It refuses everything else client-side; the grants refuse it
  again server-side (live proof in 2.1).
- **D5. Scope of the sweep.** Consistency and orphan rules (`param: "run-start"`) judge rows created at or after
  the run's start instant, which is encoded in the run prefix (`p2-qa-20261101t090000z-...`). Leak rules
  (`prefix-like`, `contains-like`) look for live rows that carry this run's prefix. Leak rules honour a
  `RetainRegistry` for credentials a **worker-scoped** fixture keeps on purpose (Task 4 registers them).
- **D6. The sweep is an `auto: true` fixture** (`src/invariants/fixture.ts`): it runs after every test of a product
  project, attaches `p2-x-db-001-violations.txt` (rule, source line, SQL, parameters, rows) and throws, so the test
  fails. Rows are listed as `id` and `value` only; rule SQL never selects `*`, and rows of a rule whose id names a
  secret are redacted. At most 20 rows per violation are printed.
- **D7. Passwords.** `P2_QA_RO_PASSWORD` and `P2_QA_FIXTURE_PASSWORD`, 16-128 characters of `[A-Za-z0-9_-]`, are
  generated per machine (`npm run qa:passwords` writes them to the gitignored `.env`, never replacing an existing
  value) or per CI job (`openssl rand -hex 16`, masked). Errors name the variable, never the value.
- **D8. Project names map to products** (`cal-api` -> `cal`, ...). The `-serial` twins are added by Task 6.

## 4. Case mapping

- **P2-X-DB-001** (label from the brief, see Task 2 OD-1): the sweep, all four products.
- Prepared (time travel only; no case runs here): P2-CAL-SCH-002, P2-CAL-TASK-001/002, P2-DOC-EXP-001/002,
  P2-DOC-REM-001/002. Not preparable: P2-DOC-JOB-003 (OD-2).
- Rules prepare the lanes' own assertions: P2-CAL-DST-002 (booking end after start), P2-CAL-TASK-* (attempts),
  P2-DOC-SM-* / P2-DOC-SIG-* (completed has completedAt), P2-MED-WH-* (authorized session has authorized_at),
  P2-CAL-CON-002 / P2-DOC-CON-002 (leak rules after the atomic fixture's cleanup).

Framework checks (not case IDs): qa_ro cannot write (two SQLSTATEs), qa_fixture cannot touch any other column or
statement, password rotation invalidates the old password, a table and a schema created after provisioning stay
readable, the sweep finds a seeded orphan, leak and inconsistency (positive control) and passes on a clean
database, a retained leak is ignored, an old row is out of scope of a consistency rule, a rule error is not a
silent pass (`42P01` surfaces).

## 5. Architecture

| File | Change | Responsibility |
|---|---|---|
| `src/db/fixture-allowlist.ts` | new | the four movable columns, each with case ids and the source line |
| `src/db/roles.ts` | new | pure SQL builders, identifier and password validation |
| `src/db/roles-admin.ts` | new | admin-side runner, grant check; the only `src/` file that may use the owner URL |
| `src/db/fixture.ts` | new | the narrow writer and its JSONL log |
| `src/db/pg.ts` | edit | `readOnlyDb` connects as `qa_ro` (`roleDbUrl`) |
| `src/env.ts` | edit | `P2_QA_RO_PASSWORD`, `P2_QA_FIXTURE_PASSWORD`, `roleDbUrl()` |
| `src/invariants/engine.ts` | new | rule type, scoped parameters, sweep, retention, report |
| `src/invariants/rules.ts` | new | rules per product, each with its source line; project -> product map |
| `src/invariants/after-test.ts` | new | the fixture body with injected dependencies |
| `src/invariants/fixture.ts` | new | the Playwright auto fixture and the shared `RetainRegistry` |
| `scripts/db-roles.ts` | new | CLI: `provision` / `teardown` |
| `scripts/qa-passwords.sh` | new | writes missing passwords into `.env` (names only on stdout) |
| `package.json` | edit | scripts `db:roles:provision`, `db:roles:teardown`, `qa:passwords` |
| `tsconfig.json` | edit | include `scripts/**/*.ts` |
| `eslint.config.mjs` | edit | forbid `dbUrl` and the guard bypass where tests live; ignore `fixture-logs/` |
| `.gitignore`, `.env.example` | edit | `fixture-logs/`; the two password lines |
| `tests/unit/db/{roles,fixture}.test.ts`, `tests/unit/invariants/engine.test.ts` | new | 39 tests |
| `tests/db/roles-and-invariants.db.test.ts` | new | 14 db-guard tests on `postgres:15` |

Not touched: CI workflows (the existing `db-guard` job runs `npm run test:db`, which now includes the new file),
the harness, the forks, `playwright.config.ts`.

## 6. Module contracts (exact code, built and tested in the scratch copy)

### 6.1 Allow-list and role SQL

`src/db/fixture-allowlist.ts`

```ts
import type { ProductId } from "../env.ts";

/**
 * The only columns a test may change, and only to move time (plan Task 3, section 2.2).
 * Each entry names the master-plan cases that need it and the product line that makes the column
 * matter. Adding a column is a code change reviewed with its case id: there is no escape hatch.
 */
export interface FixtureColumn {
  readonly table: string;
  readonly pk: string;
  readonly pkKind: "text" | "int";
  readonly column: string;
  /** Only timestamps are movable. */
  readonly kind: "timestamp";
  readonly cases: readonly string[];
  readonly cite: string;
}

export const FIXTURE_ALLOWLIST: Readonly<Record<ProductId, readonly FixtureColumn[]>> = {
  cal: [
    {
      table: "Task",
      pk: "id",
      pkKind: "text",
      column: "scheduledAt",
      kind: "timestamp",
      cases: ["P2-CAL-TASK-001", "P2-CAL-TASK-002"],
      cite: "packages/prisma/schema.prisma:1830 (Task.scheduledAt); packages/features/tasker/repository.ts:136-141 (retry pushes scheduledAt out by minRetryIntervalMins)",
    },
    {
      table: "WebhookScheduledTriggers",
      pk: "id",
      pkKind: "int",
      column: "startAfter",
      kind: "timestamp",
      cases: ["P2-CAL-SCH-002"],
      cite: "packages/prisma/schema.prisma:1318 (startAfter); packages/features/webhooks/lib/handleWebhookScheduledTriggers.ts:16-22 (jobs with startAfter <= now run)",
    },
  ],
  documenso: [
    {
      table: "Recipient",
      pk: "id",
      pkKind: "int",
      column: "expiresAt",
      kind: "timestamp",
      cases: ["P2-DOC-EXP-001", "P2-DOC-EXP-002"],
      cite: "packages/prisma/schema.prisma:640 (Recipient.expiresAt); packages/lib/jobs/definitions/internal/expire-recipients-sweep.handler.ts:13",
    },
    {
      table: "Recipient",
      pk: "id",
      pkKind: "int",
      column: "nextReminderAt",
      kind: "timestamp",
      cases: ["P2-DOC-REM-001", "P2-DOC-REM-002"],
      cite: "packages/prisma/schema.prisma:645 (Recipient.nextReminderAt); packages/lib/jobs/definitions/internal/send-signing-reminders-sweep.handler.ts:13",
    },
  ],
  medusa: [],
  twenty: [],
};

/** Products that get a qa_fixture role at all. Medusa and Twenty have no time-travel case. */
export function fixtureProducts(): readonly ProductId[] {
  return (Object.keys(FIXTURE_ALLOWLIST) as ProductId[]).filter(
    (product) => FIXTURE_ALLOWLIST[product].length > 0,
  );
}
```

`src/db/roles.ts`

```ts
import type { FixtureColumn } from "./fixture-allowlist.ts";

/**
 * SQL for the two least-privilege roles (plan Task 3, decision D1). Pure: it only builds text.
 * Run it with the harness admin URL through scripts/db-roles.ts, never from a test.
 *  - qa_ro: member of the predefined role pg_read_all_data (PostgreSQL 14+), so it can SELECT every
 *    table in every schema, including schemas created later (Twenty creates one per workspace);
 *    default_transaction_read_only=on on the role as one more layer.
 *  - qa_fixture: column-level SELECT(pk, column) and UPDATE(column) on the allow-listed columns
 *    only. No INSERT, no DELETE, no other column, no DDL.
 */
export const RO_ROLE = "qa_ro";
export const FIXTURE_ROLE = "qa_fixture";

const SIMPLE_IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const PASSWORD = /^[A-Za-z0-9_-]{16,128}$/;

export class RoleConfigError extends Error {
  override readonly name = "RoleConfigError";
  constructor(message: string) {
    super(`TEST BUG: ${message}`);
  }
}

export function quoteIdent(name: string): string {
  if (!SIMPLE_IDENT.test(name)) {
    throw new RoleConfigError(
      `identifier ${JSON.stringify(name)} must match ${String(SIMPLE_IDENT)}`,
    );
  }
  return `"${name}"`;
}

/** Error text names the variable, never the value. */
export function assertPassword(variable: string, value: string | undefined): string {
  if (value === undefined || !PASSWORD.test(value)) {
    throw new RoleConfigError(`${variable} must match ${String(PASSWORD)} (value not shown)`);
  }
  return value;
}

export interface ProvisionInput {
  /** Database name of the product (from its admin URL). */
  readonly database: string;
  readonly roPassword: string;
  /** Undefined: no fixture role for this product, and an existing one is dropped. */
  readonly fixturePassword?: string | undefined;
  readonly fixtureColumns: readonly FixtureColumn[];
}

const createRole = (role: string): string =>
  `DO $p2$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${quoteIdent(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $p2$`;

const dropRole = (role: string): string =>
  `DO $p2$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN DROP OWNED BY ${quoteIdent(role)}; DROP ROLE ${quoteIdent(role)}; END IF; END $p2$`;

/** Idempotent: every run converges to the same grants and rotates the passwords. */
export function provisionStatements(input: ProvisionInput): string[] {
  const database = quoteIdent(input.database);
  const statements = [
    createRole(RO_ROLE),
    `ALTER ROLE ${quoteIdent(RO_ROLE)} WITH PASSWORD '${assertPassword("P2_QA_RO_PASSWORD", input.roPassword)}'`,
    `ALTER ROLE ${quoteIdent(RO_ROLE)} SET default_transaction_read_only = on`,
    `GRANT pg_read_all_data TO ${quoteIdent(RO_ROLE)}`,
    `GRANT CONNECT ON DATABASE ${database} TO ${quoteIdent(RO_ROLE)}`,
  ];
  if (input.fixturePassword === undefined || input.fixtureColumns.length === 0) {
    statements.push(dropRole(FIXTURE_ROLE));
    return statements;
  }
  const fixture = quoteIdent(FIXTURE_ROLE);
  statements.push(
    createRole(FIXTURE_ROLE),
    `ALTER ROLE ${fixture} WITH PASSWORD '${assertPassword("P2_QA_FIXTURE_PASSWORD", input.fixturePassword)}'`,
    `GRANT CONNECT ON DATABASE ${database} TO ${fixture}`,
    `GRANT USAGE ON SCHEMA public TO ${fixture}`,
    // Converge: drop whatever an earlier run granted (column privileges go with the table's).
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${fixture}`,
  );
  for (const column of input.fixtureColumns) {
    const table = quoteIdent(column.table);
    statements.push(
      `GRANT SELECT (${quoteIdent(column.pk)}, ${quoteIdent(column.column)}) ON ${table} TO ${fixture}`,
      `GRANT UPDATE (${quoteIdent(column.column)}) ON ${table} TO ${fixture}`,
    );
  }
  return statements;
}

/** Drops everything provisionStatements created (grants go with the roles). */
export function teardownStatements(): string[] {
  return [dropRole(FIXTURE_ROLE), dropRole(RO_ROLE)];
}
```

`src/db/roles-admin.ts`

```ts
import pg from "pg";
import { dbUrl, loadEnv, type ProductId } from "../env.ts";
import { FIXTURE_ALLOWLIST, type FixtureColumn } from "./fixture-allowlist.ts";
import {
  FIXTURE_ROLE,
  RO_ROLE,
  assertPassword,
  provisionStatements,
  teardownStatements,
} from "./roles.ts";

/**
 * Admin-side runner for scripts/db-roles.ts. The only module besides tests/db that may use the
 * harness owner URL (ESLint enforces it). It never prints a statement, because statements carry
 * the role passwords.
 */
export interface AdminClientLike {
  query(text: string): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

export function databaseNameOf(connectionString: string): string {
  const name = decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, ""));
  if (name === "") throw new Error("TEST BUG: admin URL has no database name");
  return name;
}

export async function provisionRoles(
  client: AdminClientLike,
  input: {
    database: string;
    roPassword: string;
    fixturePassword: string;
    columns: readonly FixtureColumn[];
  },
): Promise<void> {
  const statements = provisionStatements({
    database: input.database,
    roPassword: input.roPassword,
    fixturePassword: input.columns.length === 0 ? undefined : input.fixturePassword,
    fixtureColumns: input.columns,
  });
  for (const statement of statements) await client.query(statement);
}

export async function teardownRoles(client: AdminClientLike): Promise<void> {
  for (const statement of teardownStatements()) await client.query(statement);
}

/** Problems found in the live grants, empty when they match the allow-list exactly. */
export async function checkRoleGrants(
  client: AdminClientLike,
  columns: readonly FixtureColumn[],
): Promise<string[]> {
  const problems: string[] = [];
  const roles = await client.query(
    `SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, pg_has_role(rolname, 'pg_read_all_data', 'member') AS reads_all
       FROM pg_roles WHERE rolname IN ('${RO_ROLE}', '${FIXTURE_ROLE}') ORDER BY rolname`,
  );
  const byName = new Map(roles.rows.map((r) => [String(r["rolname"]), r]));
  const ro = byName.get(RO_ROLE);
  if (!ro) problems.push(`${RO_ROLE} does not exist`);
  else {
    if (ro["rolsuper"] === true || ro["rolcreaterole"] === true || ro["rolcreatedb"] === true)
      problems.push(`${RO_ROLE} has elevated attributes`);
    if (ro["reads_all"] !== true) problems.push(`${RO_ROLE} is not a member of pg_read_all_data`);
  }
  const fixture = byName.get(FIXTURE_ROLE);
  if (columns.length === 0 && fixture)
    problems.push(`${FIXTURE_ROLE} exists but this product has no time-travel column`);
  if (columns.length > 0 && !fixture) problems.push(`${FIXTURE_ROLE} does not exist`);
  if (fixture) {
    if (
      fixture["rolsuper"] === true ||
      fixture["rolcreaterole"] === true ||
      fixture["rolcreatedb"] === true
    )
      problems.push(`${FIXTURE_ROLE} has elevated attributes`);
    const granted = await client.query(
      `SELECT table_name, column_name, privilege_type FROM information_schema.column_privileges
        WHERE grantee = '${FIXTURE_ROLE}' ORDER BY table_name, column_name, privilege_type`,
    );
    const actual = granted.rows
      .map(
        (r) =>
          `${String(r["table_name"])}.${String(r["column_name"])}:${String(r["privilege_type"])}`,
      )
      .sort();
    const expected = columns
      .flatMap((c) => [
        `${c.table}.${c.pk}:SELECT`,
        `${c.table}.${c.column}:SELECT`,
        `${c.table}.${c.column}:UPDATE`,
      ])
      .filter((v, i, all) => all.indexOf(v) === i)
      .sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      problems.push(
        `${FIXTURE_ROLE} column grants differ: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`,
      );
    }
    const tableLevel = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.role_table_grants WHERE grantee = '${FIXTURE_ROLE}' AND privilege_type IN ('INSERT','DELETE','TRUNCATE')`,
    );
    if (Number(tableLevel.rows[0]?.["n"]) !== 0)
      problems.push(`${FIXTURE_ROLE} has table-level INSERT/DELETE/TRUNCATE`);
  }
  return problems;
}

export async function withAdmin<T>(
  product: ProductId,
  fn: (client: AdminClientLike, database: string) => Promise<T>,
): Promise<T> {
  const url = dbUrl(product);
  const client = new pg.Client({
    connectionString: url,
    application_name: `p2-qa-roles-${product}`,
  });
  await client.connect();
  try {
    return await fn(client, databaseNameOf(url));
  } finally {
    await client.end();
  }
}

export async function provisionProduct(
  product: ProductId,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const parsed = loadEnv(env);
  const roPassword = assertPassword("P2_QA_RO_PASSWORD", parsed.P2_QA_RO_PASSWORD);
  const columns = FIXTURE_ALLOWLIST[product];
  const fixturePassword =
    columns.length === 0
      ? "unused-unused-unused"
      : assertPassword("P2_QA_FIXTURE_PASSWORD", parsed.P2_QA_FIXTURE_PASSWORD);
  await withAdmin(product, async (client, database) => {
    await provisionRoles(client, { database, roPassword, fixturePassword, columns });
    const problems = await checkRoleGrants(client, columns);
    if (problems.length > 0)
      throw new Error(
        `TEST BUG: ${product} roles do not match the allow-list:\n  ${problems.join("\n  ")}`,
      );
  });
}
```

`scripts/db-roles.ts`

```ts
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { PRODUCT_IDS, type ProductId } from "../src/env.ts";
import { provisionProduct, teardownRoles, withAdmin } from "../src/db/roles-admin.ts";

/**
 * Explicit setup step, never run from a test (plan Task 3, decision D1).
 *   node scripts/db-roles.ts provision <product|all>   create or converge qa_ro / qa_fixture
 *   node scripts/db-roles.ts teardown  <product|all>   drop what provision created
 * Needs the product running (migrations done) and P2_QA_RO_PASSWORD / P2_QA_FIXTURE_PASSWORD.
 * Prints role names and outcomes only; never a statement, URL or password.
 */
// Local convenience, as in playwright.config.ts: values already in the shell (CI) win over .env.
if (existsSync(".env")) loadEnvFile(".env");

const [command, target] = process.argv.slice(2);
const products: ProductId[] =
  target === "all" ? [...PRODUCT_IDS] : PRODUCT_IDS.filter((p) => p === target);

if ((command !== "provision" && command !== "teardown") || products.length === 0) {
  console.error(
    "usage: node scripts/db-roles.ts <provision|teardown> <cal|documenso|medusa|twenty|all>",
  );
  process.exit(2);
}

for (const product of products) {
  try {
    if (command === "provision") await provisionProduct(product);
    else await withAdmin(product, (client) => teardownRoles(client));
    console.log(`db-roles ${command}: ${product} ok`);
  } catch (error) {
    // The message never contains a URL or a password (see roles.ts / roles-admin.ts).
    console.error(
      `db-roles ${command}: ${product} FAILED: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exit(1);
  }
}
```

`scripts/qa-passwords.sh`

```bash
#!/usr/bin/env bash
# Ensure .env holds P2_QA_RO_PASSWORD and P2_QA_FIXTURE_PASSWORD (plan Task 3). Idempotent: an existing
# value is never replaced, so a provisioned database keeps working. Prints variable NAMES only.
# Works on a laptop, in Cursor cloud and in Claude Code cloud; CI generates its own per job instead.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"
for name in P2_QA_RO_PASSWORD P2_QA_FIXTURE_PASSWORD; do
  if grep -Eq "^${name}=.+" "$ENV_FILE"; then
    echo "[qa-passwords] $name already set"
    continue
  fi
  # Drop an empty "NAME=" line, then append a fresh 32-hex value (matches [A-Za-z0-9_-]{16,128}).
  grep -Ev "^${name}=\s*$" "$ENV_FILE" > "$ENV_FILE.tmp" || true
  mv "$ENV_FILE.tmp" "$ENV_FILE"
  printf '%s=%s\n' "$name" "$(openssl rand -hex 16)" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "[qa-passwords] $name generated"
done
```

### 6.2 Fixture writer

`src/db/fixture.ts`

```ts
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { roleDbUrl, type ProductId } from "../env.ts";
import { FIXTURE_ALLOWLIST, type FixtureColumn } from "./fixture-allowlist.ts";
import { quoteIdent } from "./roles.ts";

/**
 * The only way a test writes to a product database (plan Task 3, decision D2). It accepts
 * `UPDATE <allow-listed table> SET <allow-listed column> = <value> WHERE <pk> = <id>` and nothing
 * else, refuses the rest here, and the qa_fixture grants refuse it again on the server. Every call,
 * applied or refused, is one JSONL line.
 */
/** Where the writer logs by default: one JSONL file per run, gitignored. */
export function defaultFixtureLogFile(runPrefix: string): string {
  return path.join("fixture-logs", `${runPrefix}.jsonl`);
}

export class FixtureRefusedError extends Error {
  override readonly name = "FixtureRefusedError";
  constructor(reason: string) {
    super(`TEST BUG: fixture write refused: ${reason}`);
  }
}

export interface FixtureUpdate {
  readonly table: string;
  readonly column: string;
  readonly pk: string | number;
  readonly value: Date;
  /** Master-plan case id; must be one of the allow-list entry's cases. */
  readonly caseId: string;
}

export interface FixtureWriter {
  update(update: FixtureUpdate): Promise<void>;
  close(): Promise<void>;
}

interface QueryablePool {
  connect(): Promise<{
    query(config: { text: string; values?: unknown[] }): Promise<{ rowCount: number | null }>;
    release(destroy?: boolean): void;
  }>;
  end(): Promise<void>;
}

export interface FixtureWriterOptions {
  readonly product: ProductId;
  readonly logFile: string;
  readonly connectionString?: string;
  readonly allowlist?: readonly FixtureColumn[];
  readonly pool?: QueryablePool;
  readonly now?: () => Date;
}

const CASE_ID = /^P2-[A-Z0-9]+(?:-[A-Z0-9]+)+$/;

export function findAllowed(
  allowlist: readonly FixtureColumn[],
  update: FixtureUpdate,
): FixtureColumn {
  if (!CASE_ID.test(update.caseId)) throw new FixtureRefusedError("caseId is not a P2 case id");
  const entry = allowlist.find((c) => c.table === update.table && c.column === update.column);
  if (!entry) {
    throw new FixtureRefusedError(`${update.table}.${update.column} is not in the allow-list`);
  }
  if (!entry.cases.includes(update.caseId)) {
    throw new FixtureRefusedError(
      `${update.caseId} is not a case for ${update.table}.${update.column}`,
    );
  }
  if (!(update.value instanceof Date) || Number.isNaN(update.value.getTime())) {
    throw new FixtureRefusedError("value must be a valid Date");
  }
  if (
    entry.pkKind === "int" &&
    !(typeof update.pk === "number" && Number.isSafeInteger(update.pk))
  ) {
    throw new FixtureRefusedError(`${entry.table}.${entry.pk} needs an integer key`);
  }
  if (entry.pkKind === "text" && !(typeof update.pk === "string" && update.pk.length > 0)) {
    throw new FixtureRefusedError(`${entry.table}.${entry.pk} needs a non-empty text key`);
  }
  return entry;
}

/** Text of the one statement the writer can send. Identifiers come from the allow-list only. */
export function updateSql(entry: FixtureColumn): string {
  return `UPDATE ${quoteIdent(entry.table)} SET ${quoteIdent(entry.column)} = $1 WHERE ${quoteIdent(entry.pk)} = $2`;
}

export function createFixtureWriter(options: FixtureWriterOptions): FixtureWriter {
  const allowlist = options.allowlist ?? FIXTURE_ALLOWLIST[options.product];
  const now = options.now ?? ((): Date => new Date());
  mkdirSync(path.dirname(options.logFile), { recursive: true });
  let pool = options.pool;
  const getPool = (): QueryablePool => {
    pool ??= new pg.Pool({
      connectionString: options.connectionString ?? roleDbUrl(options.product, "qa_fixture"),
      max: 1,
      application_name: `p2-qa-fixture-${options.product}`,
      connectionTimeoutMillis: 5_000,
    }) as unknown as QueryablePool;
    return pool;
  };
  const log = (line: Record<string, unknown>): void => {
    appendFileSync(
      options.logFile,
      `${JSON.stringify({ v: 1, ts: now().toISOString(), product: options.product, ...line })}\n`,
    );
  };

  return {
    async update(update) {
      let entry: FixtureColumn;
      try {
        entry = findAllowed(allowlist, update);
      } catch (error) {
        log({
          outcome: "refused",
          reason: error instanceof Error ? error.message : "unknown",
          table: update.table,
          column: update.column,
          caseId: update.caseId,
        });
        throw error;
      }
      const client = await getPool().connect();
      try {
        await client.query({ text: "BEGIN" });
        const result = await client.query({
          text: updateSql(entry),
          values: [update.value, update.pk],
        });
        if (result.rowCount !== 1) {
          await client.query({ text: "ROLLBACK" });
          log({
            outcome: "refused",
            reason: `matched ${String(result.rowCount)} rows`,
            table: entry.table,
            column: entry.column,
            pk: update.pk,
            caseId: update.caseId,
          });
          throw new FixtureRefusedError(
            `${entry.table} ${String(update.pk)} matched ${String(result.rowCount)} rows, expected 1`,
          );
        }
        await client.query({ text: "COMMIT" });
        log({
          outcome: "applied",
          table: entry.table,
          column: entry.column,
          pk: update.pk,
          value: update.value.toISOString(),
          caseId: update.caseId,
        });
      } catch (error) {
        if (!(error instanceof FixtureRefusedError)) {
          await client.query({ text: "ROLLBACK" }).catch(() => undefined);
          log({
            outcome: "failed",
            table: entry.table,
            column: entry.column,
            pk: update.pk,
            caseId: update.caseId,
            sqlstate: (error as { code?: string }).code,
          });
        }
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      const current = pool;
      pool = undefined;
      await current?.end();
    },
  };
}
```

### 6.3 Invariant engine, rules and fixture

`src/invariants/engine.ts`

```ts
import { escapeLike } from "../run/prefix.ts";
import { assertSelectOnly } from "../db/select-guard.ts";
import type { ReadOnlyDb } from "../db/pg.ts";

/**
 * P2-X-DB-001 engine (plan Task 3). A rule is one SELECT that returns the rows that BREAK an
 * invariant, as columns `id` and `value` (text). Zero rows means the invariant holds.
 */
export type RuleKind = "consistency" | "orphan" | "leak";
export type RuleParam = "prefix-like" | "contains-like" | "run-start";

export interface Rule {
  readonly id: string;
  readonly kind: RuleKind;
  readonly description: string;
  /** Source line the rule relies on, at the pinned product ref. */
  readonly cite: string;
  /** "live" = run against the real schema on the date in `verified`; "source" = read from schema files. */
  readonly basis: "live" | "source";
  readonly verified: string;
  readonly sql: string;
  /**
   * `$1` is the run prefix as `prefix%` (prefix-like) or `%prefix%` (contains-like), or the run's
   * start instant as an ISO string (run-start). Consistency and orphan rules use run-start so they
   * judge only rows created by this run, never the harness seed data.
   */
  readonly param?: RuleParam;
  /** SQL contains `{schema}`, replaced by each schema in `perSchemaQuery`. Twenty: one per workspace. */
  readonly perSchemaQuery?: string;
}

export interface Violation {
  readonly ruleId: string;
  readonly kind: RuleKind;
  readonly description: string;
  readonly cite: string;
  readonly sql: string;
  readonly params: readonly string[];
  readonly schema: string | undefined;
  readonly rows: readonly { readonly id: string; readonly value: string }[];
}

/** Rows a long-lived (worker-scoped) fixture keeps on purpose. Matching is by exact rule id + value. */
export class RetainRegistry {
  private readonly kept = new Map<string, Set<string>>();
  retain(ruleId: string, value: string): () => void {
    const values = this.kept.get(ruleId) ?? new Set<string>();
    values.add(value);
    this.kept.set(ruleId, values);
    return () => {
      values.delete(value);
    };
  }
  has(ruleId: string, value: string): boolean {
    return this.kept.get(ruleId)?.has(value) ?? false;
  }
}

const SCHEMA_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const MAX_ROWS_REPORTED = 20;

export function assertRuleShape(rule: Rule): void {
  assertSelectOnly(rule.sql.replaceAll("{schema}", "s"));
  if (/select\s+\*/i.test(rule.sql) || /\.\*/.test(rule.sql)) {
    throw new Error(`TEST BUG: rule ${rule.id} selects *; list id and value only`);
  }
  const placeholders = new Set(rule.sql.match(/\$\d+/g) ?? []);
  const expected = rule.param === undefined ? 0 : 1;
  if (placeholders.size !== expected) {
    throw new Error(
      `TEST BUG: rule ${rule.id} uses ${String(placeholders.size)} parameters, expected ${String(expected)}`,
    );
  }
  if ((rule.perSchemaQuery !== undefined) !== rule.sql.includes("{schema}")) {
    throw new Error(
      `TEST BUG: rule ${rule.id} must use {schema} exactly when perSchemaQuery is set`,
    );
  }
  if (rule.kind === "leak" && (rule.param === undefined || rule.param === "run-start")) {
    throw new Error(`TEST BUG: leak rule ${rule.id} needs a run-prefix parameter`);
  }
  if (rule.kind !== "leak" && rule.param !== "run-start") {
    throw new Error(
      `TEST BUG: ${rule.kind} rule ${rule.id} must be scoped with the run-start parameter`,
    );
  }
}

/** The UTC start encoded in the run prefix: p2-qa-20261101t090000z-0a1b2c3d -> 2026-11-01T09:00:00.000Z. */
export function runStartIso(runPrefix: string): string {
  const match = /^p2-qa-(\d{4})(\d{2})(\d{2})t(\d{2})(\d{2})(\d{2})z-[0-9a-f]{8}$/.exec(runPrefix);
  if (!match) throw new Error(`TEST BUG: not a run prefix: ${JSON.stringify(runPrefix)}`);
  const [, y, mo, d, h, mi, sec] = match;
  return `${y ?? ""}-${mo ?? ""}-${d ?? ""}T${h ?? ""}:${mi ?? ""}:${sec ?? ""}.000Z`;
}

export function paramFor(rule: Rule, runPrefix: string): string[] {
  if (rule.param === undefined) return [];
  if (rule.param === "run-start") return [runStartIso(runPrefix)];
  const escaped = escapeLike(runPrefix);
  return [rule.param === "prefix-like" ? `${escaped}%` : `%${escaped}%`];
}

export interface SweepContext {
  readonly runPrefix: string;
  readonly retained?: RetainRegistry;
  /** Leak rules are skipped in the per-test sweep when false (consistency and orphan still run). */
  readonly includeLeaks: boolean;
}

export async function runSweep(
  db: ReadOnlyDb,
  rules: readonly Rule[],
  context: SweepContext,
): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const rule of rules) {
    assertRuleShape(rule);
    if (rule.kind === "leak" && !context.includeLeaks) continue;
    const params = paramFor(rule, context.runPrefix);
    const schemas: (string | undefined)[] =
      rule.perSchemaQuery === undefined
        ? [undefined]
        : (await db.select<{ schema_name: string }>(rule.perSchemaQuery)).map((r) => r.schema_name);
    for (const schema of schemas) {
      if (schema !== undefined && !SCHEMA_NAME.test(schema)) {
        throw new Error(`TEST BUG: rule ${rule.id} got an unexpected schema name from the catalog`);
      }
      const sql = schema === undefined ? rule.sql : rule.sql.replaceAll("{schema}", `"${schema}"`);
      const rows = (await db.select<{ id: unknown; value: unknown }>(sql, params))
        .map((r) => ({ id: String(r.id), value: String(r.value) }))
        .filter((r) => !(rule.kind === "leak" && context.retained?.has(rule.id, r.value)));
      if (rows.length > 0) {
        violations.push({
          ruleId: rule.id,
          kind: rule.kind,
          description: rule.description,
          cite: rule.cite,
          sql,
          params,
          schema,
          rows,
        });
      }
    }
  }
  return violations;
}

const SECRET_NAME = /(secret|token|password|passwd|hash|signature|authorization)/i;
const clip = (text: string): string => (text.length > 120 ? `${text.slice(0, 117)}...` : text);

/** Text for the failure message and the attachment: SQL, parameters and the offending rows. */
export function formatViolations(violations: readonly Violation[]): string {
  return violations
    .map((v) => {
      const shown = v.rows.slice(0, MAX_ROWS_REPORTED).map((r) => {
        const value = SECRET_NAME.test(v.ruleId) ? "<redacted>" : clip(r.value);
        return `  id=${clip(r.id)} value=${value}`;
      });
      const more =
        v.rows.length > MAX_ROWS_REPORTED
          ? [`  ... ${String(v.rows.length - MAX_ROWS_REPORTED)} more`]
          : [];
      return [
        `${v.ruleId} [${v.kind}${v.schema === undefined ? "" : ` ${v.schema}`}] ${v.description}`,
        `  relies on: ${v.cite}`,
        `  sql: ${v.sql}`,
        `  params: ${JSON.stringify(v.params)}`,
        ...shown,
        ...more,
      ].join("\n");
    })
    .join("\n\n");
}
```

`src/invariants/rules.ts`

```ts
import type { ProductId } from "../env.ts";
import type { Rule } from "./engine.ts";

/**
 * One rule list per product. Every rule cites the schema line it relies on at the pinned ref
 * (scripts/bootstrap.sh). `basis: "live"` rules were run against the real schema on `verified`;
 * `basis: "live"` rules are checked against the running product by the Task 5 readiness spec,
 * which fails on an unknown table or column (SQLSTATE 42P01/42703).
 */
const LEAK_LIKE_PREFIX = "prefix-like" as const;
const LEAK_LIKE_CONTAINS = "contains-like" as const;
const RUN_START = "run-start" as const;
const ESC = String.raw`ESCAPE '\'`;

export const RULES: Readonly<Record<ProductId, readonly Rule[]>> = {
  cal: [
    {
      id: "cal-task-succeeded-has-attempt",
      kind: "consistency",
      description: "A succeeded task has at least one attempt (succeed() increments attempts)",
      cite: "packages/features/tasker/repository.ts:136-146; packages/prisma/schema.prisma:1832,1838",
      basis: "live",
      verified: "2026-11-01",
      param: RUN_START,
      sql: `SELECT "id"::text AS id, "attempts"::text AS value FROM "Task" WHERE "succeededAt" IS NOT NULL AND "attempts" < 1 AND "createdAt" >= $1::timestamptz`,
    },
    {
      id: "cal-task-attempts-bounded",
      kind: "consistency",
      description:
        "attempts never exceeds maxAttempts (tasks run only while attempts < maxAttempts)",
      cite: "packages/features/tasker/repository.ts:10-35; packages/prisma/schema.prisma:1838-1840",
      basis: "live",
      verified: "2026-11-01",
      param: RUN_START,
      sql: `SELECT "id"::text AS id, ("attempts"::text || '/' || "maxAttempts"::text) AS value FROM "Task" WHERE "attempts" > "maxAttempts" AND "createdAt" >= $1::timestamptz`,
    },
    {
      id: "cal-booking-end-after-start",
      kind: "consistency",
      description: "Every booking ends after it starts",
      cite: "packages/prisma/schema.prisma:869-870",
      basis: "live",
      verified: "2026-11-01",
      param: RUN_START,
      sql: `SELECT "id"::text AS id, "uid" AS value FROM "Booking" WHERE "endTime" <= "startTime" AND "createdAt" >= $1::timestamptz`,
    },
    {
      id: "cal-leak-webhook-url",
      kind: "leak",
      description: "No webhook of this run keeps a receiver URL (/r/<run id>/...)",
      cite: "packages/prisma/schema.prisma:1149 (Webhook.subscriberUrl)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_CONTAINS,
      sql: `SELECT "id"::text AS id, "subscriberUrl" AS value FROM "Webhook" WHERE "subscriberUrl" LIKE $1 ${ESC}`,
    },
    {
      id: "cal-leak-api-key-note",
      kind: "leak",
      description: "No API key of this run is left (ApiKey.note carries the run prefix)",
      cite: "packages/prisma/schema.prisma:1172-1176 (ApiKey.note)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id"::text AS id, "note" AS value FROM "ApiKey" WHERE "note" LIKE $1 ${ESC}`,
    },
    {
      id: "cal-leak-event-type-slug",
      kind: "leak",
      description: "No event type of this run is left",
      cite: "packages/prisma/schema.prisma:159-161 (EventType.title, slug)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id"::text AS id, "slug" AS value FROM "EventType" WHERE "slug" LIKE $1 ${ESC}`,
    },
    {
      id: "cal-leak-user-email",
      kind: "leak",
      description: "No user of this run is left (model User is mapped to users)",
      cite: 'packages/prisma/schema.prisma:138 (email); @@map(name: "users")',
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id"::text AS id, "email" AS value FROM "users" WHERE "email" LIKE $1 ${ESC}`,
    },
  ],
  documenso: [
    {
      id: "doc-envelope-completed-has-completedAt",
      kind: "consistency",
      description: "A COMPLETED envelope has completedAt",
      cite: "packages/prisma/schema.prisma:381-387 (DocumentStatus), 444 (Envelope.completedAt)",
      basis: "live",
      verified: "2026-11-01",
      param: RUN_START,
      sql: `SELECT "id" AS id, "status"::text AS value FROM "Envelope" WHERE "status" = 'COMPLETED' AND "completedAt" IS NULL AND "createdAt" >= $1::timestamptz`,
    },
    {
      id: "doc-recipient-signed-has-signedAt",
      kind: "consistency",
      description: "A SIGNED recipient has signedAt",
      cite: "packages/prisma/schema.prisma:617-621 (SigningStatus), 643 (Recipient.signedAt)",
      basis: "live",
      verified: "2026-11-01",
      param: RUN_START,
      sql: `SELECT r."id"::text AS id, r."email" AS value FROM "Recipient" r JOIN "Envelope" e ON e."id" = r."envelopeId" WHERE r."signingStatus" = 'SIGNED' AND r."signedAt" IS NULL AND e."createdAt" >= $1::timestamptz`,
    },
    {
      id: "doc-job-completed-has-completedAt",
      kind: "consistency",
      description: "A COMPLETED background job has completedAt",
      cite: "packages/prisma/schema.prisma:1117-1138 (BackgroundJobStatus, completedAt)",
      basis: "live",
      verified: "2026-11-01",
      param: RUN_START,
      sql: `SELECT "id" AS id, "name" AS value FROM "BackgroundJob" WHERE "status" = 'COMPLETED' AND "completedAt" IS NULL AND "submittedAt" >= $1::timestamptz`,
    },
    {
      id: "doc-leak-webhook-url",
      kind: "leak",
      description: "No webhook of this run keeps a receiver URL (/r/<run id>/...)",
      cite: "packages/prisma/schema.prisma:184-190 (Webhook.webhookUrl)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_CONTAINS,
      sql: `SELECT "id" AS id, "webhookUrl" AS value FROM "Webhook" WHERE "webhookUrl" LIKE $1 ${ESC}`,
    },
    {
      id: "doc-leak-api-token-name",
      kind: "leak",
      description: "No API token of this run is left (ApiToken.name carries the run prefix)",
      cite: "packages/prisma/schema.prisma:222-224 (ApiToken.name)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id"::text AS id, "name" AS value FROM "ApiToken" WHERE "name" LIKE $1 ${ESC}`,
    },
    {
      id: "doc-leak-envelope-title",
      kind: "leak",
      description: "No live envelope of this run is left",
      cite: "packages/prisma/schema.prisma:435-445 (Envelope.title, deletedAt)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id" AS id, "title" AS value FROM "Envelope" WHERE "title" LIKE $1 ${ESC} AND "deletedAt" IS NULL`,
    },
    {
      id: "doc-leak-recipient-email",
      kind: "leak",
      description: "No recipient of this run is left",
      cite: "packages/prisma/schema.prisma:632-635 (Recipient.email)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id"::text AS id, "email" AS value FROM "Recipient" WHERE "email" LIKE $1 ${ESC}`,
    },
  ],
  medusa: [
    {
      id: "med-payment-session-authorized-has-authorized-at",
      kind: "consistency",
      description: "An authorized payment session has authorized_at",
      cite: "@medusajs/payment 2.21.2 payment_session.authorized_at (observed 2026-11-01: authorized sessions carry it)",
      basis: "live",
      verified: "2026-11-01",
      param: RUN_START,
      sql: `SELECT "id" AS id, "status" AS value FROM "payment_session" WHERE "status" = 'authorized' AND "authorized_at" IS NULL AND "deleted_at" IS NULL AND "created_at" >= $1::timestamptz`,
    },
    {
      id: "med-link-cart-payment-collection-orphan",
      kind: "orphan",
      description:
        "A cart-payment_collection link row points at an existing cart (modules have no cross-module FK)",
      cite: "@medusajs/medusa 2.21.2 link table cart_payment_collection (core-flows createPaymentCollectionForCartWorkflow)",
      basis: "live",
      verified: "2026-11-01",
      param: RUN_START,
      sql: `SELECT l."id" AS id, l."cart_id" AS value FROM "cart_payment_collection" l LEFT JOIN "cart" c ON c."id" = l."cart_id" WHERE l."deleted_at" IS NULL AND c."id" IS NULL AND l."created_at" >= $1::timestamptz`,
    },
    {
      id: "med-leak-product-title",
      kind: "leak",
      description: "No live product of this run is left",
      cite: "@medusajs/product 2.21.2 product.title, deleted_at",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id" AS id, "title" AS value FROM "product" WHERE "title" LIKE $1 ${ESC} AND "deleted_at" IS NULL`,
    },
    {
      id: "med-leak-customer-email",
      kind: "leak",
      description: "No live customer of this run is left",
      cite: "@medusajs/customer 2.21.2 customer.email, deleted_at",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id" AS id, "email" AS value FROM "customer" WHERE "email" LIKE $1 ${ESC} AND "deleted_at" IS NULL`,
    },
    {
      id: "med-leak-api-key-title",
      kind: "leak",
      description: "No live (unrevoked) API key of this run is left",
      cite: "@medusajs/api-key 2.21.2 api_key.title, revoked_at (probe 2026-11-01: revoke then delete)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id" AS id, "title" AS value FROM "api_key" WHERE "title" LIKE $1 ${ESC} AND "revoked_at" IS NULL AND "deleted_at" IS NULL`,
    },
  ],
  twenty: [
    {
      id: "tw-leak-api-key-name",
      kind: "leak",
      description: "No unrevoked API key of this run is left (a revoked key stays as a row)",
      cite: "core.apiKey columns id, name, revokedAt (live 2026-11-01); api-key.resolver.ts revokeApiKey",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id"::text AS id, "name" AS value FROM "core"."apiKey" WHERE "name" LIKE $1 ${ESC} AND "revokedAt" IS NULL`,
    },
    {
      id: "tw-leak-webhook-url",
      kind: "leak",
      description: "No live webhook of this run keeps a receiver URL (/r/<run id>/...)",
      cite: "core.webhook columns id, targetUrl, deletedAt (live 2026-11-01)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_CONTAINS,
      sql: `SELECT "id"::text AS id, "targetUrl" AS value FROM "core"."webhook" WHERE "targetUrl" LIKE $1 ${ESC} AND "deletedAt" IS NULL`,
    },
    {
      id: "tw-leak-person-first-name",
      kind: "leak",
      description: "No live person of this run is left in any workspace schema",
      cite: "packages/twenty-server person.workspace-entity.ts (name composite -> nameFirstName); schemas workspace_* (live 2026-11-01: table person exists)",
      basis: "source",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      perSchemaQuery: String.raw`SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'workspace\_%' ESCAPE '\' ORDER BY schema_name`,
      sql: `SELECT "id"::text AS id, "nameFirstName" AS value FROM {schema}."person" WHERE "nameFirstName" LIKE $1 ${ESC} AND "deletedAt" IS NULL`,
    },
  ],
};

export function rulesFor(product: ProductId): readonly Rule[] {
  return RULES[product];
}

/** Playwright project name -> product (playwright.config.ts: cal-api, doc-api, med-api, tw-api). */
const PROJECT_PRODUCT: Readonly<Record<string, ProductId>> = {
  "cal-api": "cal",
  "doc-api": "documenso",
  "med-api": "medusa",
  "tw-api": "twenty",
};

export function productOfProject(projectName: string): ProductId | undefined {
  return PROJECT_PRODUCT[projectName];
}
```

`src/invariants/after-test.ts`

```ts
import type { ReadOnlyDb } from "../db/pg.ts";
import {
  formatViolations,
  runSweep,
  type RetainRegistry,
  type Rule,
  type Violation,
} from "./engine.ts";

/**
 * Body of the P2-X-DB-001 auto fixture, with every dependency injected so node:test can drive it.
 * Returns the attachment text on violation (SQL plus rows) or undefined when the DB is clean.
 */
export async function sweepAfterTest(input: {
  db: ReadOnlyDb;
  rules: readonly Rule[];
  runPrefix: string;
  retained: RetainRegistry;
}): Promise<{ violations: Violation[]; report: string } | undefined> {
  const violations = await runSweep(input.db, input.rules, {
    runPrefix: input.runPrefix,
    retained: input.retained,
    includeLeaks: true,
  });
  if (violations.length === 0) return undefined;
  return { violations, report: formatViolations(violations) };
}
```

`src/invariants/fixture.ts`

```ts
import { test as base } from "@playwright/test";
import { readOnlyDb } from "../db/pg.ts";
import { currentRunPrefix } from "../run/prefix.ts";
import { sweepAfterTest } from "./after-test.ts";
import { RetainRegistry } from "./engine.ts";
import { productOfProject, rulesFor } from "./rules.ts";

/**
 * P2-X-DB-001: after EVERY test of a product project, sweep that product's database. Playwright
 * tears auto fixtures down after the test's own fixtures (probed on 1.64.0, also when the body
 * fails), so a test's atomic cleanup has already run when the sweep looks. Zero violations are
 * required: any violation fails the test, with the SQL and the rows attached.
 */
export const retained = new RetainRegistry();

export const test = base.extend<{ dbInvariants: undefined }>({
  dbInvariants: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring pattern
    async ({}, use, testInfo) => {
      await use(undefined);
      const product = productOfProject(testInfo.project.name);
      if (product === undefined) return;
      const outcome = await sweepAfterTest({
        db: readOnlyDb(product),
        rules: rulesFor(product),
        runPrefix: currentRunPrefix(),
        retained,
      });
      if (outcome === undefined) return;
      await testInfo.attach("p2-x-db-001-violations.txt", {
        body: outcome.report,
        contentType: "text/plain",
      });
      throw new Error(
        `P2-X-DB-001: ${String(outcome.violations.length)} violation(s)\n${outcome.report}`,
      );
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
```

### 6.4 Edits to existing files

`src/env.ts` (diff)

```diff
--- a/src/env.ts
+++ b/src/env.ts
@@ -78,4 +78,8 @@ const schema = z.object({
     z.coerce.number().int().min(1024).max(65535).default(4317),
   ),
+  // Passwords of the two roles scripts/db-roles.ts creates. Optional here: only code that connects as
+  // a role needs them, and it checks the shape (src/db/roles.ts assertPassword) without echoing it.
+  P2_QA_RO_PASSWORD: z.preprocess(blankToUndefined, z.string().trim().optional()),
+  P2_QA_FIXTURE_PASSWORD: z.preprocess(blankToUndefined, z.string().trim().optional()),
   P2_DB_STATEMENT_TIMEOUT_MS: z.preprocess(
     blankToUndefined,
@@ -130,2 +134,28 @@ export function receiverConfig(env: NodeJS.ProcessEnv = process.env): {
   return { hosts: parsed.P2_RECEIVER_HOSTS, port: parsed.P2_RECEIVER_PORT };
 }
+
+export type DbRole = "qa_ro" | "qa_fixture";
+
+/**
+ * Connection string for a P2 role: the product's host, port and database with the role's name and
+ * password. `dbUrl()` (the harness owner) is for scripts/db-roles.ts and tests/db only; ESLint
+ * forbids importing it anywhere else. Errors never contain a URL or a password.
+ */
+export function roleDbUrl(
+  product: ProductId,
+  role: DbRole,
+  env: NodeJS.ProcessEnv = process.env,
+): string {
+  const parsed = loadEnv(env);
+  const variable = role === "qa_ro" ? "P2_QA_RO_PASSWORD" : "P2_QA_FIXTURE_PASSWORD";
+  const password = role === "qa_ro" ? parsed.P2_QA_RO_PASSWORD : parsed.P2_QA_FIXTURE_PASSWORD;
+  if (password === undefined || !/^[A-Za-z0-9_-]{16,128}$/.test(password)) {
+    throw new Error(
+      `TEST BUG: ${variable} is missing or malformed (run npm run db:roles:provision)`,
+    );
+  }
+  const url = new URL(dbUrl(product, env));
+  url.username = role;
+  url.password = password;
+  return url.toString();
+}
```

`src/db/pg.ts` (diff)

```diff
--- a/src/db/pg.ts
+++ b/src/db/pg.ts
@@ -1,4 +1,4 @@
 import pg from "pg";
-import { dbStatementTimeoutMs, dbUrl, type ProductId } from "../env.ts";
+import { dbStatementTimeoutMs, roleDbUrl, type ProductId } from "../env.ts";
 import { assertSelectOnly } from "./select-guard.ts";
 
@@ -154,10 +154,10 @@ export function createReadOnlyDb(product: OracleLabel, options: ReadOnlyDbOption
 const registry = new Map<ProductId, ReadOnlyDb>();
 
-/** One pool per product per worker process, configured from env (src/env.ts). */
+/** One pool per product per worker process, connecting as qa_ro (src/db/roles.ts). */
 export function readOnlyDb(product: ProductId, env: NodeJS.ProcessEnv = process.env): ReadOnlyDb {
   let db = registry.get(product);
   if (!db) {
     db = createReadOnlyDb(product, {
-      connectionString: dbUrl(product, env),
+      connectionString: roleDbUrl(product, "qa_ro", env),
       statementTimeoutMs: dbStatementTimeoutMs(env),
     });
```

`package.json` (diff)

```diff
--- a/package.json
+++ b/package.json
@@ -17,5 +17,8 @@
     "check": "npm run check:static && npm run unit",
     "list:api": "playwright test --list --pass-with-no-tests",
-    "test:api": "playwright test"
+    "test:api": "playwright test",
+    "db:roles:provision": "node scripts/db-roles.ts provision",
+    "db:roles:teardown": "node scripts/db-roles.ts teardown",
+    "qa:passwords": "bash scripts/qa-passwords.sh"
   },
   "dependencies": {
```

`tsconfig.json` (diff)

```diff
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -22,4 +22,4 @@
     "skipLibCheck": true
   },
-  "include": ["src/**/*.ts", "tests/**/*.ts", "playwright.config.ts"]
+  "include": ["src/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts", "playwright.config.ts"]
 }
```

`eslint.config.mjs` (diff)

```diff
--- a/eslint.config.mjs
+++ b/eslint.config.mjs
@@ -9,5 +9,12 @@ const NO_SLEEP = "No sleeps in API tests: use expect.poll with an explicit timeo
 export default tseslint.config(
   {
-    ignores: ["node_modules/", "test-results/", "playwright-report/", "results/", "receiver-logs/"],
+    ignores: [
+      "node_modules/",
+      "test-results/",
+      "playwright-report/",
+      "results/",
+      "receiver-logs/",
+      "fixture-logs/",
+    ],
   },
   js.configs.recommended,
@@ -55,4 +62,31 @@ export default tseslint.config(
     },
   },
+  {
+    // The harness owner URL is for the provisioning script and the db-guard tests only (plan Task 3).
+    files: [
+      "tests/contracts/**",
+      "tests/webhooks/**",
+      "tests/integration/**",
+      "tests/readiness/**",
+      "src/clients/**",
+      "src/auth/**",
+      "src/fixtures/**",
+      "src/invariants/**",
+    ],
+    rules: {
+      "no-restricted-syntax": [
+        "error",
+        {
+          selector: "ImportSpecifier[imported.name='dbUrl']",
+          message:
+            "Use roleDbUrl(): the owner-role URL is for scripts/db-roles.ts and tests/db only.",
+        },
+        {
+          selector: "Property[key.name='unsafeDisableGuardForServerTests']",
+          message: "Only tests/db/** may disable the read-only guard.",
+        },
+      ],
+    },
+  },
   { files: ["**/*.mjs"], ...tseslint.configs.disableTypeChecked },
   prettier,
```

`.gitignore` (diff)

```diff
--- a/.gitignore
+++ b/.gitignore
@@ -9,3 +9,4 @@ results/*
 !results/.gitkeep
 receiver-logs/
+fixture-logs/
 *.log
```

`.env.example`: below the `P2_RUN_ID=` line add (the comment is the final text; it supersedes the scratch wording):

```text
# Passwords for the two DB roles scripts/db-roles.ts creates (qa_ro, qa_fixture): 16-128 chars of
# [A-Za-z0-9_-]. `npm run qa:passwords` writes them into .env; CI generates its own per job. Never commit them.
P2_QA_RO_PASSWORD=
P2_QA_FIXTURE_PASSWORD=
```

### 6.5 Tests (exact names are the contract)

`tests/unit/db/roles.test.ts`

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { FIXTURE_ALLOWLIST, fixtureProducts } from "../../../src/db/fixture-allowlist.ts";
import {
  FIXTURE_ROLE,
  RO_ROLE,
  assertPassword,
  provisionStatements,
  quoteIdent,
  teardownStatements,
} from "../../../src/db/roles.ts";
import { roleDbUrl } from "../../../src/env.ts";

const RO_PW = "ro0123456789abcdefRO";
const FX_PW = "fx0123456789abcdefFX";

describe("roles: provisioning SQL", () => {
  test("qa_ro is created idempotently, read-only, a member of pg_read_all_data and can connect", () => {
    const sql = provisionStatements({
      database: "calendso",
      roPassword: RO_PW,
      fixtureColumns: [],
    });
    assert.match(
      sql[0] ?? "",
      /IF NOT EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'qa_ro'\) THEN CREATE ROLE "qa_ro" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/,
    );
    assert.ok(sql.includes(`ALTER ROLE "qa_ro" WITH PASSWORD '${RO_PW}'`));
    assert.ok(sql.includes('ALTER ROLE "qa_ro" SET default_transaction_read_only = on'));
    assert.ok(sql.includes('GRANT pg_read_all_data TO "qa_ro"'));
    assert.ok(sql.includes('GRANT CONNECT ON DATABASE "calendso" TO "qa_ro"'));
  });

  test("a product without time-travel columns gets no qa_fixture and an existing one is dropped", () => {
    const sql = provisionStatements({
      database: "medusa",
      roPassword: RO_PW,
      fixturePassword: FX_PW,
      fixtureColumns: [],
    });
    assert.ok(sql.at(-1)?.includes('DROP OWNED BY "qa_fixture"; DROP ROLE "qa_fixture"'));
    assert.ok(!sql.some((s) => s.includes(FX_PW)));
  });

  test("qa_fixture gets column-level SELECT(pk, column) and UPDATE(column) and nothing table-wide", () => {
    const columns = FIXTURE_ALLOWLIST.cal;
    const sql = provisionStatements({
      database: "calendso",
      roPassword: RO_PW,
      fixturePassword: FX_PW,
      fixtureColumns: columns,
    });
    assert.ok(sql.includes('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "qa_fixture"'));
    assert.ok(sql.includes('GRANT SELECT ("id", "scheduledAt") ON "Task" TO "qa_fixture"'));
    assert.ok(sql.includes('GRANT UPDATE ("scheduledAt") ON "Task" TO "qa_fixture"'));
    assert.ok(
      sql.includes('GRANT UPDATE ("startAfter") ON "WebhookScheduledTriggers" TO "qa_fixture"'),
    );
    const grants = sql.filter((s) => s.startsWith("GRANT") && s.includes('TO "qa_fixture"'));
    for (const grant of grants)
      assert.match(grant, /^GRANT (SELECT|UPDATE) \(|^GRANT (CONNECT|USAGE) ON/);
    assert.ok(
      !sql.some(
        (s) =>
          /INSERT|DELETE|TRUNCATE|ALL PRIVILEGES|WITH GRANT OPTION/.test(s) &&
          s.startsWith("GRANT"),
      ),
    );
  });

  test("the revoke comes before the grants so a removed column loses its privilege", () => {
    const sql = provisionStatements({
      database: "d",
      roPassword: RO_PW,
      fixturePassword: FX_PW,
      fixtureColumns: FIXTURE_ALLOWLIST.documenso,
    });
    const revoke = sql.findIndex((s) => s.startsWith("REVOKE ALL ON ALL TABLES"));
    const firstColumnGrant = sql.findIndex((s) => s.startsWith("GRANT SELECT ("));
    assert.ok(revoke >= 0 && revoke < firstColumnGrant);
  });

  test("teardown drops both roles with their grants and contains no password", () => {
    const sql = teardownStatements();
    assert.equal(sql.length, 2);
    assert.ok(sql[0]?.includes('DROP OWNED BY "qa_fixture"'));
    assert.ok(sql[1]?.includes('DROP OWNED BY "qa_ro"'));
  });

  test("the role names are fixed constants", () => {
    assert.deepEqual([RO_ROLE, FIXTURE_ROLE], ["qa_ro", "qa_fixture"]);
  });
});

describe("roles: input validation", () => {
  test("quoteIdent accepts Prisma-style names and rejects anything that could escape the quotes", () => {
    assert.equal(quoteIdent("WebhookScheduledTriggers"), '"WebhookScheduledTriggers"');
    for (const bad of ['a"b', "a b", "a;b", "", "1abc", "a-b", "x".repeat(64)]) {
      assert.throws(() => quoteIdent(bad), /TEST BUG: identifier/, bad);
    }
  });

  test("assertPassword requires 16-128 safe characters and never echoes the value", () => {
    assert.equal(assertPassword("P2_QA_RO_PASSWORD", RO_PW), RO_PW);
    for (const bad of [
      undefined,
      "",
      "short",
      "has space 0123456789",
      "quote'0123456789abcdef",
      "x".repeat(129),
    ]) {
      assert.throws(
        () => assertPassword("P2_QA_RO_PASSWORD", bad),
        (error: unknown) => {
          const text = (error as Error).message;
          return (
            text.includes("P2_QA_RO_PASSWORD") &&
            !text.includes("quote'") &&
            !text.includes("has space")
          );
        },
      );
    }
  });

  test("provisioning rejects a hostile database name", () => {
    assert.throws(
      () => provisionStatements({ database: 'x"; DROP', roPassword: RO_PW, fixtureColumns: [] }),
      /TEST BUG: identifier/,
    );
  });
});

describe("roles: allow-list", () => {
  test("only Cal and Documenso have time-travel columns, each tied to master-plan case ids", () => {
    assert.deepEqual(fixtureProducts(), ["cal", "documenso"]);
    assert.deepEqual(FIXTURE_ALLOWLIST.medusa, []);
    assert.deepEqual(FIXTURE_ALLOWLIST.twenty, []);
    for (const entry of [...FIXTURE_ALLOWLIST.cal, ...FIXTURE_ALLOWLIST.documenso]) {
      assert.equal(entry.kind, "timestamp");
      assert.ok(
        entry.cases.length > 0 && entry.cases.every((c) => /^P2-[A-Z]+-[A-Z]+-\d{3}$/.test(c)),
        entry.column,
      );
      assert.match(entry.cite, /schema\.prisma:\d+/);
    }
  });

  test("the allow-listed columns are exactly the ones named in the plan", () => {
    const names = (["cal", "documenso"] as const).flatMap((p) =>
      FIXTURE_ALLOWLIST[p].map((c) => `${p}:${c.table}.${c.column}`),
    );
    assert.deepEqual(names, [
      "cal:Task.scheduledAt",
      "cal:WebhookScheduledTriggers.startAfter",
      "documenso:Recipient.expiresAt",
      "documenso:Recipient.nextReminderAt",
    ]);
  });
});

describe("roles: connection URLs", () => {
  const env = { P2_QA_RO_PASSWORD: RO_PW, P2_QA_FIXTURE_PASSWORD: FX_PW };

  test("roleDbUrl swaps only the credentials of the product URL", () => {
    assert.equal(
      roleDbUrl("cal", "qa_ro", env),
      `postgresql://qa_ro:${RO_PW}@127.0.0.1:5450/calendso`,
    );
    assert.equal(
      roleDbUrl("documenso", "qa_fixture", env),
      `postgres://qa_fixture:${FX_PW}@127.0.0.1:5451/documenso`,
    );
  });

  test("a missing or malformed password is a TEST BUG that names the variable and no value", () => {
    assert.throws(() => roleDbUrl("cal", "qa_ro", {}), /P2_QA_RO_PASSWORD is missing or malformed/);
    assert.throws(
      () => roleDbUrl("cal", "qa_fixture", { P2_QA_FIXTURE_PASSWORD: "bad bad" }),
      (e: unknown) => !(e as Error).message.includes("bad bad"),
    );
  });
});
```

`tests/unit/db/fixture.test.ts`

```ts
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import {
  createFixtureWriter,
  FixtureRefusedError,
  findAllowed,
  updateSql,
} from "../../../src/db/fixture.ts";
import { FIXTURE_ALLOWLIST } from "../../../src/db/fixture-allowlist.ts";

const WHEN = new Date("2026-11-01T08:00:00.000Z");
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Call {
  text: string;
  values?: unknown[];
}
function fakePool(rowCount: number | null) {
  const calls: Call[] = [];
  let released = 0;
  return {
    calls,
    released: () => released,
    pool: {
      connect: () =>
        Promise.resolve({
          query: (config: Call) => {
            calls.push(config);
            return Promise.resolve({
              rowCount: config.text.startsWith("UPDATE") ? rowCount : null,
            });
          },
          release: () => {
            released += 1;
          },
        }),
      end: () => Promise.resolve(),
    },
  };
}

function writerFor(product: "cal" | "documenso", rowCount: number | null = 1) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "p2-fixture-"));
  dirs.push(dir);
  const logFile = path.join(dir, "logs", "fixture.jsonl");
  const fake = fakePool(rowCount);
  const writer = createFixtureWriter({ product, logFile, pool: fake.pool, now: () => WHEN });
  const lines = (): Record<string, unknown>[] =>
    readFileSync(logFile, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  return { writer, fake, lines };
}

describe("fixture writer: client-side refusals", () => {
  const base = {
    table: "Task",
    column: "scheduledAt",
    pk: "abc",
    value: WHEN,
    caseId: "P2-CAL-TASK-001",
  };

  test("accepts an allow-listed column for one of its cases", () => {
    assert.equal(findAllowed(FIXTURE_ALLOWLIST.cal, base).column, "scheduledAt");
  });

  test("refuses a table or column that is not in the allow-list", async () => {
    const { writer, fake, lines } = writerFor("cal");
    for (const bad of [
      { ...base, column: "attempts" },
      { ...base, table: "Booking" },
      { ...base, column: "scheduledAt; DROP TABLE x" },
    ]) {
      await assert.rejects(
        writer.update(bad),
        (e: unknown) => e instanceof FixtureRefusedError && /not in the allow-list/.test(e.message),
      );
    }
    assert.equal(fake.calls.length, 0, "nothing reached the database");
    assert.deepEqual(
      lines().map((l) => l["outcome"]),
      ["refused", "refused", "refused"],
    );
  });

  test("refuses a case id that does not own the column, and a malformed case id", async () => {
    const { writer } = writerFor("cal");
    await assert.rejects(
      writer.update({ ...base, caseId: "P2-DOC-EXP-001" }),
      /is not a case for Task\.scheduledAt/,
    );
    await assert.rejects(
      writer.update({ ...base, caseId: "whatever" }),
      /caseId is not a P2 case id/,
    );
  });

  test("refuses values and keys of the wrong type", async () => {
    const cal = writerFor("cal").writer;
    await assert.rejects(cal.update({ ...base, value: new Date("nope") }), /valid Date/);
    await assert.rejects(
      cal.update({ ...base, value: "2026-01-01" as unknown as Date }),
      /valid Date/,
    );
    await assert.rejects(cal.update({ ...base, pk: 5 }), /non-empty text key/);
    await assert.rejects(cal.update({ ...base, pk: "" }), /non-empty text key/);
    const doc = writerFor("documenso").writer;
    const docBase = {
      table: "Recipient",
      column: "expiresAt",
      value: WHEN,
      caseId: "P2-DOC-EXP-001",
    };
    await assert.rejects(doc.update({ ...docBase, pk: "7" }), /integer key/);
    await assert.rejects(doc.update({ ...docBase, pk: 7.5 }), /integer key/);
  });

  test("a product without an allow-list refuses everything", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "p2-fixture-"));
    dirs.push(dir);
    const writer = createFixtureWriter({
      product: "medusa",
      logFile: path.join(dir, "f.jsonl"),
      pool: fakePool(1).pool,
    });
    await assert.rejects(writer.update(base), /not in the allow-list/);
  });
});

describe("fixture writer: the one statement it can send", () => {
  test("builds a parameterised UPDATE from allow-list identifiers only", () => {
    const entry = FIXTURE_ALLOWLIST.documenso[1];
    assert.ok(entry);
    assert.equal(updateSql(entry), 'UPDATE "Recipient" SET "nextReminderAt" = $1 WHERE "id" = $2');
  });

  test("applies inside a transaction, logs the write and releases the client", async () => {
    const { writer, fake, lines } = writerFor("documenso");
    await writer.update({
      table: "Recipient",
      column: "expiresAt",
      pk: 41,
      value: WHEN,
      caseId: "P2-DOC-EXP-002",
    });
    assert.deepEqual(
      fake.calls.map((c) => c.text),
      ["BEGIN", 'UPDATE "Recipient" SET "expiresAt" = $1 WHERE "id" = $2', "COMMIT"],
    );
    assert.deepEqual(fake.calls[1]?.values, [WHEN, 41]);
    assert.equal(fake.released(), 1);
    assert.deepEqual(lines(), [
      {
        v: 1,
        ts: "2026-11-01T08:00:00.000Z",
        product: "documenso",
        outcome: "applied",
        table: "Recipient",
        column: "expiresAt",
        pk: 41,
        value: "2026-11-01T08:00:00.000Z",
        caseId: "P2-DOC-EXP-002",
      },
    ]);
  });

  test("rolls back and refuses when the key matches zero or many rows", async () => {
    for (const rowCount of [0, 2, null]) {
      const { writer, fake, lines } = writerFor("cal", rowCount);
      await assert.rejects(
        writer.update({
          table: "Task",
          column: "scheduledAt",
          pk: "x",
          value: WHEN,
          caseId: "P2-CAL-TASK-002",
        }),
        /expected 1/,
      );
      assert.ok(fake.calls.map((c) => c.text).includes("ROLLBACK"));
      assert.ok(!fake.calls.map((c) => c.text).includes("COMMIT"));
      assert.equal(lines()[0]?.["outcome"], "refused");
      assert.equal(fake.released(), 1);
    }
  });

  test("a database error rolls back, is logged with its SQLSTATE and is rethrown", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "p2-fixture-"));
    dirs.push(dir);
    const logFile = path.join(dir, "f.jsonl");
    const pool = {
      connect: () =>
        Promise.resolve({
          query: (config: Call) =>
            config.text.startsWith("UPDATE")
              ? Promise.reject(Object.assign(new Error("denied"), { code: "42501" }))
              : Promise.resolve({ rowCount: null }),
          release: () => undefined,
        }),
      end: () => Promise.resolve(),
    };
    const writer = createFixtureWriter({ product: "cal", logFile, pool, now: () => WHEN });
    await assert.rejects(
      writer.update({
        table: "Task",
        column: "scheduledAt",
        pk: "x",
        value: WHEN,
        caseId: "P2-CAL-TASK-001",
      }),
      /denied/,
    );
    const line = JSON.parse(readFileSync(logFile, "utf8").trim()) as Record<string, unknown>;
    assert.deepEqual([line["outcome"], line["sqlstate"]], ["failed", "42501"]);
  });

  test("close() ends the pool once and is safe to call twice", async () => {
    let ended = 0;
    const dir = mkdtempSync(path.join(os.tmpdir(), "p2-fixture-"));
    dirs.push(dir);
    const pool = {
      connect: () => Promise.reject(new Error("unused")),
      end: () => {
        ended += 1;
        return Promise.resolve();
      },
    };
    const writer = createFixtureWriter({
      product: "cal",
      logFile: path.join(dir, "f.jsonl"),
      pool,
    });
    await writer.close();
    await writer.close();
    assert.equal(ended, 1);
  });
});
```

`tests/unit/invariants/engine.test.ts`

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReadOnlyDb, SqlParam } from "../../../src/db/pg.ts";
import { sweepAfterTest } from "../../../src/invariants/after-test.ts";
import {
  RetainRegistry,
  assertRuleShape,
  formatViolations,
  paramFor,
  runStartIso,
  runSweep,
  type Rule,
} from "../../../src/invariants/engine.ts";
import { RULES, productOfProject, rulesFor } from "../../../src/invariants/rules.ts";

const PREFIX = "p2-qa-20261101t090000z-0a1b2c3d";

interface Seen {
  sql: string;
  params: readonly SqlParam[];
}
function fakeDb(answer: (sql: string) => Record<string, unknown>[]): {
  db: ReadOnlyDb;
  seen: Seen[];
} {
  const seen: Seen[] = [];
  const db: ReadOnlyDb = {
    product: "db-guard",
    select: <Row extends Record<string, unknown>>(
      sql: string,
      params: readonly SqlParam[] = [],
    ) => {
      seen.push({ sql, params });
      return Promise.resolve(answer(sql) as Row[]);
    },
    close: () => Promise.resolve(),
  };
  return { db, seen };
}

const leak: Rule = {
  id: "t-leak",
  kind: "leak",
  description: "d",
  cite: "c",
  basis: "live",
  verified: "2026-11-01",
  param: "prefix-like",
  sql: String.raw`SELECT "id"::text AS id, "name" AS value FROM "T" WHERE "name" LIKE $1 ESCAPE '\'`,
};
const consistency: Rule = {
  id: "t-cons",
  kind: "consistency",
  description: "d",
  cite: "c",
  basis: "live",
  verified: "2026-11-01",
  param: "run-start",
  sql: `SELECT "id"::text AS id, "s" AS value FROM "T" WHERE "x" IS NULL AND "createdAt" >= $1::timestamptz`,
};

describe("rules: every product rule is well formed", () => {
  test("each rule passes the SELECT-only guard, lists columns and uses its parameter once", () => {
    for (const [product, rules] of Object.entries(RULES)) {
      assert.ok(rules.length > 0, product);
      for (const rule of rules)
        assert.doesNotThrow(() => {
          assertRuleShape(rule);
        }, rule.id);
    }
  });

  test("ids are unique, every rule cites a source and has a verification date", () => {
    const ids = Object.values(RULES)
      .flat()
      .map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const rule of Object.values(RULES).flat()) {
      assert.ok(rule.cite.length > 10, rule.id);
      assert.match(rule.verified, /^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("consistency and orphan rules are scoped to the run; leak rules take the prefix", () => {
    for (const rule of Object.values(RULES).flat()) {
      if (rule.kind === "leak")
        assert.ok(rule.param === "prefix-like" || rule.param === "contains-like", rule.id);
      else assert.equal(rule.param, "run-start", rule.id);
    }
  });

  test("every product has at least one leak rule and the project map covers the four projects", () => {
    for (const product of ["cal", "documenso", "medusa", "twenty"] as const) {
      assert.ok(
        rulesFor(product).some((r) => r.kind === "leak"),
        product,
      );
    }
    assert.deepEqual(["cal-api", "doc-api", "med-api", "tw-api"].map(productOfProject), [
      "cal",
      "documenso",
      "medusa",
      "twenty",
    ]);
    assert.equal(productOfProject("chromium"), undefined);
  });
});

describe("engine: shape checks", () => {
  test("rejects SELECT *, a wrong parameter count, a write, and a leak rule without a prefix", () => {
    assert.throws(() => {
      assertRuleShape({ ...consistency, sql: "SELECT * FROM t WHERE a < $1" });
    }, /selects \*/);
    assert.throws(() => {
      assertRuleShape({ ...consistency, sql: `SELECT "id" AS id, 'x' AS value FROM "T"` });
    }, /0 parameters, expected 1/);
    assert.throws(() => {
      assertRuleShape({ ...consistency, sql: `DELETE FROM "T" WHERE "createdAt" >= $1` });
    }, /read-only guard/);
    assert.throws(() => {
      assertRuleShape({ ...leak, param: "run-start" });
    }, /needs a run-prefix parameter/);
    assert.throws(() => {
      assertRuleShape({ ...consistency, kind: "orphan", param: "prefix-like" });
    }, /must be scoped with the run-start/);
    assert.throws(() => {
      assertRuleShape({ ...consistency, perSchemaQuery: "SELECT 1" });
    }, /\{schema\}/);
  });

  test("runStartIso reads the UTC start out of the prefix and refuses anything else", () => {
    assert.equal(runStartIso(PREFIX), "2026-11-01T09:00:00.000Z");
    assert.throws(() => runStartIso("p2-qa-oops"), /not a run prefix/);
  });

  test("paramFor escapes LIKE wildcards and builds prefix and contains patterns", () => {
    assert.deepEqual(paramFor(leak, PREFIX), [`${PREFIX}%`]);
    assert.deepEqual(paramFor({ ...leak, param: "contains-like" }, PREFIX), [`%${PREFIX}%`]);
    assert.deepEqual(paramFor(consistency, PREFIX), ["2026-11-01T09:00:00.000Z"]);
    assert.deepEqual(paramFor({ ...leak, param: undefined } as unknown as Rule, PREFIX), []);
  });
});

describe("engine: sweep", () => {
  test("a clean database yields no violations and sends the right parameters", async () => {
    const { db, seen } = fakeDb(() => []);
    const out = await runSweep(db, [leak, consistency], { runPrefix: PREFIX, includeLeaks: true });
    assert.deepEqual(out, []);
    assert.deepEqual(
      seen.map((s) => s.params),
      [[`${PREFIX}%`], ["2026-11-01T09:00:00.000Z"]],
    );
  });

  test("violations carry the rule, the SQL, the parameters and string rows", async () => {
    const { db } = fakeDb(() => [{ id: 7, value: "p2-qa-x" }]);
    const [v] = await runSweep(db, [leak], { runPrefix: PREFIX, includeLeaks: true });
    assert.ok(v);
    assert.deepEqual(
      [v.ruleId, v.kind, v.rows],
      ["t-leak", "leak", [{ id: "7", value: "p2-qa-x" }]],
    );
    assert.equal(v.sql, leak.sql);
    assert.deepEqual(v.params, [`${PREFIX}%`]);
  });

  test("includeLeaks=false skips leak rules but still runs the others", async () => {
    const { db, seen } = fakeDb(() => []);
    await runSweep(db, [leak, consistency], { runPrefix: PREFIX, includeLeaks: false });
    assert.equal(seen.length, 1);
    assert.match(seen[0]?.sql ?? "", /"x" IS NULL/);
  });

  test("retained values are ignored for leak rules only, by exact rule id and value", async () => {
    const retained = new RetainRegistry();
    const release = retained.retain("t-leak", "p2-qa-kept");
    const rows = [
      { id: "1", value: "p2-qa-kept" },
      { id: "2", value: "p2-qa-leaked" },
    ];
    const { db } = fakeDb(() => rows);
    const [v] = await runSweep(db, [leak], { runPrefix: PREFIX, includeLeaks: true, retained });
    assert.deepEqual(
      v?.rows.map((r) => r.value),
      ["p2-qa-leaked"],
    );
    release();
    const again = await runSweep(db, [leak], { runPrefix: PREFIX, includeLeaks: true, retained });
    assert.equal(again[0]?.rows.length, 2);
    const kept = new RetainRegistry();
    kept.retain("t-cons", "p2-qa-kept");
    const cons = await runSweep(fakeDb(() => rows).db, [consistency], {
      runPrefix: PREFIX,
      includeLeaks: true,
      retained: kept,
    });
    assert.equal(cons[0]?.rows.length, 2, "consistency violations are never excused");
  });

  test("a per-schema rule runs once per schema the catalog returns and quotes the name", async () => {
    const perSchema: Rule = {
      ...leak,
      id: "t-schema",
      perSchemaQuery: "SELECT schema_name FROM information_schema.schemata",
      sql: leak.sql.replace('"T"', '{schema}."person"'),
    };
    const { db, seen } = fakeDb((sql) =>
      sql.includes("schemata")
        ? [{ schema_name: "workspace_a1" }, { schema_name: "workspace_b2" }]
        : [{ id: "1", value: "x" }],
    );
    const out = await runSweep(db, [perSchema], { runPrefix: PREFIX, includeLeaks: true });
    assert.deepEqual(
      out.map((v) => v.schema),
      ["workspace_a1", "workspace_b2"],
    );
    assert.ok(seen.some((s) => s.sql.includes('"workspace_a1"."person"')));
  });

  test("a schema name that is not a plain identifier stops the sweep", async () => {
    const perSchema: Rule = {
      ...leak,
      perSchemaQuery: "SELECT 1",
      sql: leak.sql.replace('"T"', "{schema}.t"),
    };
    const { db } = fakeDb((sql) => (sql === "SELECT 1" ? [{ schema_name: 'x"; drop' }] : []));
    await assert.rejects(
      runSweep(db, [perSchema], { runPrefix: PREFIX, includeLeaks: true }),
      /unexpected schema name/,
    );
  });
});

describe("engine: report", () => {
  test("formatViolations prints rule, source, SQL, parameters and rows, clips long values and caps rows", () => {
    const text = formatViolations([
      {
        ruleId: "t-leak",
        kind: "leak",
        description: "No leak",
        cite: "schema.prisma:1",
        sql: "SELECT 1",
        params: ["a%"],
        schema: undefined,
        rows: Array.from({ length: 25 }, (_, i) => ({ id: String(i), value: "v".repeat(200) })),
      },
    ]);
    assert.match(
      text,
      /^t-leak \[leak\] No leak\n {2}relies on: schema\.prisma:1\n {2}sql: SELECT 1\n {2}params: \["a%"\]/,
    );
    assert.equal((text.match(/ {2}id=/g) ?? []).length, 20);
    assert.match(text, / {2}\.\.\. 5 more/);
    assert.ok(!text.includes("v".repeat(121)));
  });

  test("rows of a rule whose id names a secret are redacted", () => {
    const text = formatViolations([
      {
        ruleId: "x-token-leak",
        kind: "leak",
        description: "d",
        cite: "c",
        sql: "s",
        params: [],
        schema: "ws_1",
        rows: [{ id: "1", value: "tok_123" }],
      },
    ]);
    assert.ok(!text.includes("tok_123"));
    assert.match(text, /\[leak ws_1\]/);
  });

  test("sweepAfterTest returns nothing when clean and a report when not", async () => {
    const clean = await sweepAfterTest({
      db: fakeDb(() => []).db,
      rules: [leak],
      runPrefix: PREFIX,
      retained: new RetainRegistry(),
    });
    assert.equal(clean, undefined);
    const dirty = await sweepAfterTest({
      db: fakeDb(() => [{ id: "1", value: "p2-qa-left" }]).db,
      rules: [leak],
      runPrefix: PREFIX,
      retained: new RetainRegistry(),
    });
    assert.ok(dirty);
    assert.equal(dirty.violations.length, 1);
    assert.match(dirty.report, /t-leak/);
  });
});
```

`tests/db/roles-and-invariants.db.test.ts`

```ts
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import pg from "pg";
import { createFixtureWriter } from "../../src/db/fixture.ts";
import { FIXTURE_ALLOWLIST } from "../../src/db/fixture-allowlist.ts";
import { createReadOnlyDb, DbQueryError, type ReadOnlyDb } from "../../src/db/pg.ts";
import { checkRoleGrants, provisionRoles, teardownRoles } from "../../src/db/roles-admin.ts";
import { runSweep, RetainRegistry, type Rule } from "../../src/invariants/engine.ts";
import { makeRunPrefix } from "../../src/run/prefix.ts";

// db-guard job only: a throwaway postgres:15 service, never a product (plan Task 3).
const adminUrl = process.env["P2_DB_GUARD_URL"]?.trim() ?? "";
if (!/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//.test(adminUrl)) {
  throw new Error(
    "TEST BUG: set P2_DB_GUARD_URL to a throwaway loopback postgres:15 (see api.yml db-guard)",
  );
}
const DATABASE = "p2_guard_roles";
const RO_PW = "ro-guard-0123456789abcdef";
const FX_PW = "fx-guard-0123456789abcdef";
const RO_PW_2 = "ro-guard-rotated-0123456789";
// A run that started an hour ago: rows this file creates are newer than it.
const PREFIX = makeRunPrefix(new Date(Date.now() - 3_600_000), "0a1b2c3d");
const url = (user: string, password: string): string => {
  const u = new URL(adminUrl);
  u.pathname = `/${DATABASE}`;
  u.username = user;
  u.password = password;
  return u.toString();
};
const adminOnDatabase = (): string => {
  const u = new URL(adminUrl);
  u.pathname = `/${DATABASE}`;
  return u.toString();
};

const columns = FIXTURE_ALLOWLIST.cal;
let admin: pg.Client;
let tmp: string;

async function scalar(client: pg.Client, sql: string): Promise<number> {
  const { rows } = await client.query<{ n: number }>(sql);
  return rows[0]?.n ?? Number.NaN;
}

async function sqlstateOf(client: pg.Client, sql: string): Promise<string | undefined> {
  try {
    await client.query(sql);
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

before(async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "p2-guard-"));
  const root = new pg.Client({ connectionString: adminUrl });
  await root.connect();
  await root.query(`DROP DATABASE IF EXISTS ${DATABASE}`);
  await root.query(`CREATE DATABASE ${DATABASE}`);
  await root.end();
  admin = new pg.Client({ connectionString: adminOnDatabase() });
  await admin.connect();
  // Cal-shaped tables for the allow-list, plus tables for the synthetic invariant rules.
  await admin.query(`
    CREATE TABLE "Task" (id text PRIMARY KEY, "scheduledAt" timestamptz NOT NULL DEFAULT now(), attempts int NOT NULL DEFAULT 0, note text);
    CREATE TABLE "WebhookScheduledTriggers" (id serial PRIMARY KEY, "startAfter" timestamptz NOT NULL DEFAULT now(), payload text);
    CREATE TABLE parent (id int PRIMARY KEY, name text, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE child (id int PRIMARY KEY, parent_id int, name text, created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO "Task"(id, note) VALUES ('t1', 'n');
    INSERT INTO "WebhookScheduledTriggers"(payload) VALUES ('p');`);
  await provisionRoles(admin, {
    database: DATABASE,
    roPassword: RO_PW,
    fixturePassword: FX_PW,
    columns,
  });
});

after(async () => {
  await teardownRoles(admin);
  await admin.end();
  const root = new pg.Client({ connectionString: adminUrl });
  await root.connect();
  await root.query(`DROP DATABASE IF EXISTS ${DATABASE}`);
  await root.end();
  rmSync(tmp, { recursive: true, force: true });
});

describe("qa_ro against a real postgres:15", () => {
  test("reads every table, including one and a schema created after provisioning", async () => {
    await admin.query(
      `CREATE TABLE later (id int); INSERT INTO later VALUES (1); CREATE SCHEMA workspace_x; CREATE TABLE workspace_x.person (id int); INSERT INTO workspace_x.person VALUES (2)`,
    );
    const ro = new pg.Client({ connectionString: url("qa_ro", RO_PW) });
    await ro.connect();
    assert.equal(await scalar(ro, `SELECT count(*)::int AS n FROM "Task"`), 1);
    assert.equal(await scalar(ro, `SELECT count(*)::int AS n FROM later`), 1);
    assert.equal(await scalar(ro, `SELECT count(*)::int AS n FROM workspace_x.person`), 1);
    await ro.end();
  });

  test("cannot write: 25006 by default, 42501 even in an explicit READ WRITE transaction", async () => {
    const ro = new pg.Client({ connectionString: url("qa_ro", RO_PW) });
    await ro.connect();
    assert.equal(await sqlstateOf(ro, "INSERT INTO later VALUES (9)"), "25006");
    assert.equal(await sqlstateOf(ro, `UPDATE "Task" SET attempts = 9`), "25006");
    await ro.query("BEGIN READ WRITE");
    assert.equal(await sqlstateOf(ro, "INSERT INTO later VALUES (9)"), "42501");
    await ro.query("ROLLBACK");
    assert.equal(await sqlstateOf(ro, "CREATE TABLE zz (i int)"), "25006");
    await ro.end();
  });

  test("the product oracle (createReadOnlyDb) works with the qa_ro URL", async () => {
    const db = createReadOnlyDb("db-guard", {
      connectionString: url("qa_ro", RO_PW),
      statementTimeoutMs: 2000,
    });
    const rows = await db.select<{ n: number }>(`SELECT count(*)::int AS n FROM "Task"`);
    assert.equal(rows[0]?.n, 1);
    await db.close();
  });
});

describe("qa_fixture against a real postgres:15", () => {
  test("can update only the granted columns; every other statement fails with 42501", async () => {
    const fx = new pg.Client({ connectionString: url("qa_fixture", FX_PW) });
    await fx.connect();
    assert.equal(
      await sqlstateOf(
        fx,
        `UPDATE "Task" SET "scheduledAt" = now() - interval '1 hour' WHERE id = 't1'`,
      ),
      undefined,
    );
    assert.equal(
      await sqlstateOf(
        fx,
        `UPDATE "WebhookScheduledTriggers" SET "startAfter" = now() WHERE id = 1`,
      ),
      undefined,
    );
    for (const sql of [
      `UPDATE "Task" SET attempts = 5 WHERE id = 't1'`,
      `UPDATE "Task" SET note = 'x' WHERE id = 't1'`,
      `DELETE FROM "Task" WHERE id = 't1'`,
      `INSERT INTO "Task"(id) VALUES ('t2')`,
      `TRUNCATE "Task"`,
      `SELECT note FROM "Task"`,
      `SELECT * FROM "Task"`,
      `UPDATE later SET id = 3`,
      `SELECT count(*) FROM parent`,
      `CREATE TABLE zz (i int)`,
    ]) {
      assert.equal(await sqlstateOf(fx, sql), "42501", sql);
    }
    await fx.end();
  });

  test("checkRoleGrants finds nothing wrong, and reports a column granted by hand", async () => {
    assert.deepEqual(await checkRoleGrants(admin, columns), []);
    await admin.query(`GRANT UPDATE (attempts) ON "Task" TO qa_fixture`);
    const problems = await checkRoleGrants(admin, columns);
    assert.equal(problems.length, 1);
    assert.match(problems[0] ?? "", /column grants differ/);
    await provisionRoles(admin, {
      database: DATABASE,
      roPassword: RO_PW,
      fixturePassword: FX_PW,
      columns,
    });
    assert.deepEqual(await checkRoleGrants(admin, columns), [], "re-provisioning converges");
  });

  test("the fixture writer applies an allowed update and the server refuses the rest", async () => {
    const logFile = path.join(tmp, "fixture.jsonl");
    const writer = createFixtureWriter({
      product: "cal",
      logFile,
      connectionString: url("qa_fixture", FX_PW),
    });
    const when = new Date("2026-01-01T00:00:00.000Z");
    await writer.update({
      table: "Task",
      column: "scheduledAt",
      pk: "t1",
      value: when,
      caseId: "P2-CAL-TASK-001",
    });
    await writer.close();
    const stored = await admin.query<{ scheduledAt: Date }>(
      `SELECT "scheduledAt" FROM "Task" WHERE id = 't1'`,
    );
    assert.equal(stored.rows[0]?.scheduledAt.toISOString(), when.toISOString());
    const lines = readFileSync(logFile, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    assert.deepEqual(
      [lines[0]?.["outcome"], lines[0]?.["table"], lines[0]?.["caseId"]],
      ["applied", "Task", "P2-CAL-TASK-001"],
    );
  });
});

describe("provisioning lifecycle", () => {
  test("running it twice is harmless and a new password replaces the old one", async () => {
    await provisionRoles(admin, {
      database: DATABASE,
      roPassword: RO_PW_2,
      fixturePassword: FX_PW,
      columns,
    });
    const old = new pg.Client({ connectionString: url("qa_ro", RO_PW) });
    await assert.rejects(old.connect(), (e: unknown) => (e as { code?: string }).code === "28P01");
    const fresh = new pg.Client({ connectionString: url("qa_ro", RO_PW_2) });
    await fresh.connect();
    await fresh.end();
    await provisionRoles(admin, {
      database: DATABASE,
      roPassword: RO_PW,
      fixturePassword: FX_PW,
      columns,
    });
  });

  test("a product without columns gets no qa_fixture, and teardown removes both roles", async () => {
    await provisionRoles(admin, {
      database: DATABASE,
      roPassword: RO_PW,
      fixturePassword: FX_PW,
      columns: [],
    });
    assert.equal(
      await scalar(admin, `SELECT count(*)::int AS n FROM pg_roles WHERE rolname = 'qa_fixture'`),
      0,
    );
    assert.deepEqual(await checkRoleGrants(admin, []), []);
    await provisionRoles(admin, {
      database: DATABASE,
      roPassword: RO_PW,
      fixturePassword: FX_PW,
      columns,
    });
    await teardownRoles(admin);
    assert.equal(
      await scalar(
        admin,
        `SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN ('qa_ro','qa_fixture')`,
      ),
      0,
    );
    await provisionRoles(admin, {
      database: DATABASE,
      roPassword: RO_PW,
      fixturePassword: FX_PW,
      columns,
    });
  });
});

// Synthetic rules on synthetic tables: they prove the engine, the positive controls and the
// zero-violation pass. The product rules are run against real schemas by the readiness specs.
const orphan: Rule = {
  id: "g-orphan",
  kind: "orphan",
  description: "child points at an existing parent",
  cite: "tests/db fixture schema",
  basis: "live",
  verified: "2026-11-01",
  param: "run-start",
  sql: `SELECT c.id::text AS id, c.parent_id::text AS value FROM child c LEFT JOIN parent p ON p.id = c.parent_id WHERE c.parent_id IS NOT NULL AND p.id IS NULL AND c.created_at >= $1::timestamptz`,
};
const leakRule: Rule = {
  id: "g-leak",
  kind: "leak",
  description: "no parent of this run is left",
  cite: "tests/db fixture schema",
  basis: "live",
  verified: "2026-11-01",
  param: "prefix-like",
  sql: String.raw`SELECT id::text AS id, name AS value FROM parent WHERE name LIKE $1 ESCAPE '\'`,
};
const consistency: Rule = {
  id: "g-cons",
  kind: "consistency",
  description: "a named child has a parent",
  cite: "tests/db fixture schema",
  basis: "live",
  verified: "2026-11-01",
  param: "run-start",
  sql: `SELECT id::text AS id, name AS value FROM child WHERE name IS NOT NULL AND parent_id IS NULL AND created_at >= $1::timestamptz`,
};

describe("P2-X-DB-001 sweep against a real postgres:15", () => {
  let ro: ReadOnlyDb;
  before(() => {
    ro = createReadOnlyDb("db-guard", {
      connectionString: url("qa_ro", RO_PW),
      statementTimeoutMs: 2000,
    });
  });
  after(async () => {
    await ro.close();
  });

  test("passes on a clean database", async () => {
    assert.deepEqual(
      await runSweep(ro, [orphan, leakRule, consistency], {
        runPrefix: PREFIX,
        includeLeaks: true,
      }),
      [],
    );
  });

  test("positive control: a seeded orphan, a seeded leak and a seeded inconsistency are all found", async () => {
    await admin.query(
      `INSERT INTO parent VALUES (1, '${PREFIX}-leaked-parent'), (2, 'other-run-parent')`,
    );
    await admin.query(
      `INSERT INTO child VALUES (10, 999, 'o'), (11, 1, 'ok'), (12, NULL, 'no-parent')`,
    );
    const found = await runSweep(ro, [orphan, leakRule, consistency], {
      runPrefix: PREFIX,
      includeLeaks: true,
    });
    const byRule = Object.fromEntries(found.map((v) => [v.ruleId, v.rows.map((r) => r.id)]));
    assert.deepEqual(byRule, { "g-orphan": ["10"], "g-leak": ["1"], "g-cons": ["12"] });
  });

  test("a row created before the run started is outside the scope of consistency rules", async () => {
    const future = "p2-qa-20991231t235959z-0a1b2c3d";
    const found = await runSweep(ro, [orphan, consistency], {
      runPrefix: future,
      includeLeaks: true,
    });
    assert.deepEqual(found, []);
  });

  test("a retained leak is ignored and the sweep passes once the rows are cleaned", async () => {
    const retained = new RetainRegistry();
    retained.retain("g-leak", `${PREFIX}-leaked-parent`);
    const withRetain = await runSweep(ro, [leakRule], {
      runPrefix: PREFIX,
      includeLeaks: true,
      retained,
    });
    assert.deepEqual(withRetain, []);
    await admin.query(`DELETE FROM child; DELETE FROM parent`);
    assert.deepEqual(
      await runSweep(ro, [orphan, leakRule, consistency], {
        runPrefix: PREFIX,
        includeLeaks: true,
      }),
      [],
    );
  });

  test("a rule SQL that is not a SELECT never reaches the server", async () => {
    await assert.rejects(
      runSweep(ro, [{ ...orphan, sql: `DELETE FROM child WHERE created_at >= $1` }], {
        runPrefix: PREFIX,
        includeLeaks: true,
      }),
      /read-only guard/,
    );
  });

  test("an error in a rule is a DbQueryError with its SQLSTATE, not a silent pass", async () => {
    const broken: Rule = {
      ...orphan,
      sql: `SELECT id::text AS id, 'x' AS value FROM no_such_table WHERE created_at >= $1::timestamptz`,
    };
    await assert.rejects(
      runSweep(ro, [broken], { runPrefix: PREFIX, includeLeaks: true }),
      (e: unknown) => e instanceof DbQueryError && e.sqlstate === "42P01",
    );
  });
});
```

Counts: `roles.test.ts` 14, `fixture.test.ts` 9, `engine.test.ts` 16 = **39** unit tests; the db file 14 (on top of the 8 that exist).

## 7. Data isolation, cleanup and leak check

- The db-guard tests create their own database `p2_guard_roles` on the throwaway server and drop it in `after`;
  roles are dropped by `teardownRoles`. They never touch a product database.
- The fixture writer writes only rows the caller names by key; its log is `fixture-logs/<run id>.jsonl`.
- Leak check: the leak rules of every product, run after each test (section 4 of the engine). Residue that cannot
  be removed through the product's API belongs in the lane's cleanup, never in the allow-list.
- Provisioning leaves two roles per product; `npm run db:roles:teardown -- <product>` removes them and proves
  `0` left. CI jobs are ephemeral; developers tear down with that command.

## 8. Build steps (repo root; `export PATH="/usr/local/bin:$PATH"`; on any differing output STOP and paste it)

0. Branch: `git fetch origin && git checkout -b feat/$(date -u +%F)-p2-task3-db-roles-invariants origin/feat/<date>-p2-task2-receiver-signers`
   (or the local Task 2 branch); `git rev-parse HEAD` recorded. `npm ci && npm run check` -> `# tests 172`.
1. Throwaway server for the db tests (not a product; removed at the end):
   ```bash
   docker run -d --rm --name p2guard -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:55433:5432 postgres:15
   until docker exec p2guard pg_isready -U postgres >/dev/null 2>&1; do :; done
   export P2_DB_GUARD_URL=postgres://postgres:postgres@127.0.0.1:55433/postgres
   npm run test:db        # baseline: "# tests 8" "# pass 8"
   ```
   (`until ... do :; done` is a readiness loop on a command's exit code, not a sleep; if the server is slow, run it
   again. If the container cannot start, that is an ENV finding: STOP.)
2. `src/db/fixture-allowlist.ts`, `src/db/roles.ts`, `tests/unit/db/roles.test.ts`, the `env.ts` edit.
   `node --test tests/unit/db/roles.test.ts` -> `# tests 14`. Commit 1.
3. `src/db/fixture.ts`, `tests/unit/db/fixture.test.ts` -> `# tests 9`. Commit 2.
4. `src/invariants/engine.ts`, `rules.ts`, `after-test.ts`, `fixture.ts`, `tests/unit/invariants/engine.test.ts`
   -> `# tests 16`. Commit 3.
5. `src/db/roles-admin.ts`, `scripts/db-roles.ts`, `scripts/qa-passwords.sh`, `package.json`, `tsconfig.json`,
   `eslint.config.mjs`, `.gitignore`, `.env.example`, the `pg.ts` edit. `chmod +x scripts/qa-passwords.sh`.
   `bash scripts/qa-passwords.sh` twice: first run prints `generated` twice, second `already set` twice; `stat -c %a .env`
   -> `600`; `awk -F= '/^P2_QA/{print $1, length($2)}' .env` -> each `32`. Commit 4.
6. `tests/db/roles-and-invariants.db.test.ts`; `npm run test:db` -> `# tests 22`, `# pass 22`; run it three times.
   Commit 5.
7. `npm run check` -> exit 0, `# tests 211`. `docker rm -f p2guard`.
8. Optional but expected when a stack is available (otherwise record "UNPROBED: no stack in this session"): bring
   one product up with its harness `up`, then `npm run qa:passwords && npm run db:roles:provision -- <product>`
   twice (`db-roles provision: <product> ok` both times), then
   `node --input-type=module -e` is **not** needed: Task 5's readiness specs execute every rule. Tear down with
   `npm run db:roles:teardown -- <product>` and the product's `down`.

## 9. Done criteria (machine-checkable)

```bash
npm run check                                   # exit 0; "# tests 211" "# pass 211" "# fail 0"
P2_DB_GUARD_URL=postgres://postgres:postgres@127.0.0.1:55433/postgres npm run test:db   # "# tests 22" "# pass 22" "# fail 0"
node --test tests/unit/db/roles.test.ts tests/unit/db/fixture.test.ts tests/unit/invariants/engine.test.ts 2>&1 | grep -E '^# (tests|pass)'   # 39 / 39
npm run list:api                                # "Total: 0 tests in 0 files"
grep -rn "dbUrl" src tests --include=*.ts | grep -v -E '^(src/env.ts|src/db/roles-admin.ts|tests/unit/env.test.ts|tests/db/)'   # no output
git status --porcelain                          # empty after the commits
git diff --name-only <task2-head>..HEAD | sort  # exactly the files of section 5
git diff <task2-head>..HEAD -- . ':(exclude)tests/unit' | grep -E '^\+' | grep -nE 'sk_live_|sk_test_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|Bearer [A-Za-z0-9._-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|postgres(ql)?://[A-Za-z0-9_]+:[A-Za-z0-9]{8,}@' ; test $? -eq 1
git diff <task2-head>..HEAD | grep -niE 'j[a]yami|h[e]ttigoda' ; test $? -eq 1
```

The `grep dbUrl` line proves the owner URL is only used where D1 allows it. Do not weaken it.

## 10. Self-verification

From a clean `npm ci`, repeat sections 8.1 to 8.7 and paste the real output (commands and trimmed results) in the
PR body, plus the `bash scripts/qa-passwords.sh` output (names only). If step 8.8 ran, paste the two provision
lines and the teardown line per product.

## 11. Commit plan (lowercase Conventional Commits, explicit paths, never `git add -A`)

1. `feat(db): add role sql and the time-travel allow-list` - `src/db/fixture-allowlist.ts src/db/roles.ts src/env.ts tests/unit/db/roles.test.ts`
2. `feat(db): add the narrow fixture writer` - `src/db/fixture.ts tests/unit/db/fixture.test.ts`
3. `feat(invariants): add the p2-x-db-001 sweep engine, rules and fixture` - `src/invariants/engine.ts src/invariants/rules.ts src/invariants/after-test.ts src/invariants/fixture.ts tests/unit/invariants/engine.test.ts`
4. `feat(db): add role provisioning script and oracle login as qa_ro` - `src/db/roles-admin.ts src/db/pg.ts scripts/db-roles.ts scripts/qa-passwords.sh package.json tsconfig.json eslint.config.mjs .gitignore .env.example`
5. `test(db): prove roles, the writer and the sweep on postgres 15` - `tests/db/roles-and-invariants.db.test.ts`

PR title: `feat(db): add qa_ro and qa_fixture roles and the p2-x-db-001 sweep`. No trailers.

## 12. Environment changes

- Automatic from the repo: `npm ci`; `scripts/qa-passwords.sh` is a repo script. Nothing else.
- Cursor cloud: add one line to `AGENTS.md` under "Cursor Cloud specific instructions" (this task edits
  `AGENTS.md`, so it also changes `AGENTS.md:16` from the personal name to "the maintainer"): "Before DB-role work run
  `npm run qa:passwords`." No change to `.cursor/environment.json`, `.cursor/Dockerfile` or `scripts/cloud-install.sh`
  (generating passwords there would bake them into the snapshot).
- Claude Code cloud: pasted by hand into the environment's setup script: nothing. In `.claude/hooks/session-start.sh`
  nothing either; the agent runs `npm run qa:passwords` once per session (same AGENTS.md line).
- CI: no workflow change. A lane job (later) generates the two passwords per job with `openssl rand -hex 16` and
  masks them before `npm run db:roles:provision -- <product>`.
- Manual repository setting: none.

## 13. Will NOT do / Open decisions / Risks

Will NOT do: provision anything inside a test; add `INSERT` or `DELETE` to `qa_fixture`; write to a product
database through any other path; add a scope or tolerance to hide a violation; run a product in this task's
required criteria; add lane rules; touch Medusa/Twenty time columns (none exist).

| ID | Question | Options | Evidence | Recommended default |
|---|---|---|---|---|
| OD-1 | Twenty person rule is `basis: "source"` | (a) keep, Task 5 executes it; (b) probe now | re-seeding Twenty costs ~5 min | (a); a failure there is a plan contradiction and STOPs Task 5 |
| OD-2 | P2-DOC-JOB-003 needs an `INSERT` of a poison job | (a) leave it to the Documenso lane with its own narrow, reviewed grant on `BackgroundJob`; (b) create a job through the product and `UPDATE` its payload column (race); (c) drop the case | review limits the fixture to time columns | (a); **not BLOCKING for the foundation** |
| OD-3 | Cal `Task.scheduledAt` is only needed if the chain sets `minRetryIntervalMins` | (a) keep the grant; (b) drop until the lane proves it | `repository.ts:136-141` | (a), it costs nothing |
| OD-4 | Consistency rules are run-scoped, so a defect in seed data is invisible | (a) accept (seed is the harness's); (b) add a one-off seed audit | 2.4 | (a); report the 333 rows to the harness/fork owner as a follow-up |

Risks: the `pg_read_all_data` grant needs PostgreSQL 14+ (all four are 15+; a product on 13 would fail
provisioning loudly); `ALTER ROLE ... SET` and `DROP OWNED BY` need superuser (they are in the provisioning step
only); a rule that cannot see a column after a product upgrade fails with `42703`, which is the intended loud
failure; the sweep adds about seven small queries per test (3 to 30 ms each on the probe VM).

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
   the commit identity from the environment (`GIT_AUTHOR_*`/`GIT_COMMITTER_*`). If the builder is
   Cursor cloud (it adds a `Co-authored-by` trailer), do not push such commits: stop and report.
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
