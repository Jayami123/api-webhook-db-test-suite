import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReadOnlyDb, SqlParam } from "../../../../src/db/pg.ts";
import { runSweep, type Rule } from "../../../../src/invariants/engine.ts";
import { medusaLaneRules } from "../../../../src/invariants/lanes/medusa.ts";
import { makeRunPrefix } from "../../../../src/run/prefix.ts";

const PREFIX = makeRunPrefix(new Date("2026-11-02T10:00:00Z"), "deadbeef");

function fakeDb(rows: readonly Record<string, unknown>[], seen: SqlParam[][] = []): ReadOnlyDb {
  return {
    product: "medusa",
    select: <Row extends Record<string, unknown>>(
      _sql: string,
      params: readonly SqlParam[] = [],
    ) => {
      seen.push([...params]);
      return Promise.resolve(rows as unknown as Row[]);
    },
    close: () => Promise.resolve(),
  };
}

const rule = (id: string): Rule => {
  const found = medusaLaneRules.find((r) => r.id === id);
  if (found === undefined) throw new Error(`TEST BUG: no lane rule ${id}`);
  return found;
};

describe("medusa lane invariant rules", () => {
  test("med-inv-level-reserved-matches-reservations: clean rows give no violation", async () => {
    const seen: SqlParam[][] = [];
    const found = await runSweep(
      fakeDb([], seen),
      [rule("med-inv-level-reserved-matches-reservations")],
      {
        runPrefix: PREFIX,
        includeLeaks: false,
      },
    );
    assert.deepEqual(found, []);
    assert.equal(seen.length, 1);
    assert.match(
      String(seen[0]?.[0]),
      /^2026-11-02T10:00:00\.000Z$/,
      "the run start instant is the parameter",
    );
  });

  test("med-inv-level-reserved-matches-reservations: a level with reserved 2 and reservations 1 is reported", async () => {
    const found = await runSweep(
      fakeDb([{ id: "level_1", value: "2" }]),
      [rule("med-inv-level-reserved-matches-reservations")],
      {
        runPrefix: PREFIX,
        includeLeaks: false,
      },
    );
    assert.equal(found.length, 1);
    const [first] = found;
    assert.ok(first, "one violation");
    assert.equal(first.ruleId, "med-inv-level-reserved-matches-reservations");
    assert.deepEqual(first.rows, [{ id: "level_1", value: "2" }]);
  });

  test("med-order-total-conservation: clean rows give no violation", async () => {
    const seen: SqlParam[][] = [];
    const found = await runSweep(fakeDb([], seen), [rule("med-order-total-conservation")], {
      runPrefix: PREFIX,
      includeLeaks: false,
    });
    assert.deepEqual(found, []);
    assert.equal(seen.length, 1);
  });

  test("med-order-total-conservation: an order whose total is one minor unit off is reported", async () => {
    // The stored total 3.703 KWD against a computed 3.702 KWD (one 1/1000 KWD unit apart) is reported.
    const found = await runSweep(
      fakeDb([{ id: "order_1", value: "3.703" }]),
      [rule("med-order-total-conservation")],
      {
        runPrefix: PREFIX,
        includeLeaks: false,
      },
    );
    assert.equal(found.length, 1);
    const [first] = found;
    assert.ok(first, "one violation");
    assert.equal(first.ruleId, "med-order-total-conservation");
    assert.deepEqual(first.rows, [{ id: "order_1", value: "3.703" }]);
  });
});
