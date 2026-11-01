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
