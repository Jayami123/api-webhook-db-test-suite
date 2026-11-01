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
