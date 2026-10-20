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
  'SELECT "id" FROM "Booking" WHERE "startTime" > now()',
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
  ['SELECT "pg_advisory_lock"(1)', "forbidden-function"],
  ['SELECT "PG_ADVISORY_LOCK"(1)', "forbidden-function"],
  ["SELECT \"set_config\"('a','b',false)", "forbidden-function"],
  ["SELECT U&\"\\0073et_config\"('a','b',false)", "escape-string"],
  ["SELECT query_to_xml('select 1', true, false, '')", "forbidden-function"],
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
