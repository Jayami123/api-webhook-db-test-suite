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
