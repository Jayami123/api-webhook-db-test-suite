import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { DbQueryError, createReadOnlyDb } from "../../src/db/pg.ts";
import { ReadOnlyGuardError } from "../../src/db/select-guard.ts";

// Runs only in the db-guard CI job (or locally against a throwaway postgres:15). Never a product DB.
const url = process.env["P2_DB_GUARD_URL"]?.trim() ?? "";
if (!/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) {
  throw new Error(
    "TEST BUG: set P2_DB_GUARD_URL to a throwaway loopback postgres:15 (see api.yml db-guard)",
  );
}

const STATEMENT_TIMEOUT_MS = 300;
// Same code path as product oracles, with the client guard switched off to test the server alone.
const server = createReadOnlyDb("db-guard", {
  connectionString: url,
  statementTimeoutMs: STATEMENT_TIMEOUT_MS,
  unsafeDisableGuardForServerTests: true,
});
const guarded = createReadOnlyDb("db-guard", {
  connectionString: url,
  statementTimeoutMs: STATEMENT_TIMEOUT_MS,
});

after(async () => {
  await Promise.all([server.close(), guarded.close()]);
});

const sqlstate = (expected: string) => (error: unknown) =>
  error instanceof DbQueryError && error.sqlstate === expected && !error.message.includes(url);

async function tableExists(name: string): Promise<boolean> {
  const rows = await guarded.select<{ t: string | null }>("SELECT to_regclass($1)::text AS t", [
    name,
  ]);
  return rows[0]?.t !== null && rows[0]?.t !== undefined;
}

describe("read-only oracle against a real postgres:15", () => {
  test("server is Postgres 15 and the session is read-only with the timeout", async () => {
    const rows = await guarded.select<{
      v: string;
      ro: string;
      tro: string;
      st: string;
      app: string;
    }>(
      `SELECT current_setting('server_version_num') AS v,
              current_setting('default_transaction_read_only') AS ro,
              current_setting('transaction_read_only') AS tro,
              current_setting('statement_timeout') AS st,
              current_setting('application_name') AS app`,
    );
    const row = rows[0];
    assert.ok(row);
    assert.match(row.v, /^15\d{4}$/);
    assert.deepEqual(
      [row.ro, row.tro, row.st, row.app],
      ["on", "on", "300ms", "p2-qa-oracle-db-guard"],
    );
  });

  test("a write is refused by the server with SQLSTATE 25006", async () => {
    await assert.rejects(server.select("CREATE TABLE p2_guard_write(x int)"), sqlstate("25006"));
    assert.equal(await tableExists("p2_guard_write"), false);
  });

  test("a second statement is refused by the server with SQLSTATE 42601", async () => {
    await assert.rejects(
      server.select("SELECT 1; CREATE TABLE p2_guard_multi(x int)"),
      sqlstate("42601"),
    );
    assert.equal(await tableExists("p2_guard_multi"), false);
  });

  test("a statement past statement_timeout is cancelled with SQLSTATE 57014", async () => {
    await assert.rejects(server.select("SELECT pg_sleep(2)"), sqlstate("57014"));
  });

  test("set_config cannot reopen writes: the per-query READ ONLY transaction still refuses", async () => {
    await server.select("SELECT set_config('default_transaction_read_only', 'off', false)");
    await assert.rejects(server.select("CREATE TABLE p2_guard_flip(x int)"), sqlstate("25006"));
    assert.equal(await tableExists("p2_guard_flip"), false);
  });

  test("baseline: read-only settings do not refuse EXPLAIN ANALYZE CREATE TABLE AS; only ROLLBACK discards it", async () => {
    const plan = await server.select<{ "QUERY PLAN": string }>(
      "EXPLAIN ANALYZE CREATE TABLE p2_guard_gap AS SELECT 1 AS x",
    );
    assert.ok(plan.length > 0, "the server refused it: Postgres closed the gap, update plan D5");
    assert.equal(
      await tableExists("p2_guard_gap"),
      false,
      "the per-query ROLLBACK must discard the write",
    );
  });

  test("the guard rejects EXPLAIN ANALYZE CREATE TABLE AS before it reaches the server", async () => {
    await assert.rejects(
      guarded.select("EXPLAIN ANALYZE CREATE TABLE p2_guard_blocked AS SELECT 1 AS x"),
      (error: unknown) => error instanceof ReadOnlyGuardError && error.reason === "not-select",
    );
    assert.equal(await tableExists("p2_guard_blocked"), false);
  });
});
