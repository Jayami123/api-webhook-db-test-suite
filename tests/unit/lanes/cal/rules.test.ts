import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReadOnlyDb } from "../../../../src/db/pg.ts";
import { runSweep } from "../../../../src/invariants/engine.ts";
import { rulesFor } from "../../../../src/invariants/rules.ts";

const PREFIX = "p2-qa-20261102t180000z-0a1b2c3d";

function dbWith(rowsByRule: Record<string, Record<string, unknown>[]>): ReadOnlyDb {
  return {
    product: "cal",
    select: (sql: string) => {
      if (sql.includes('"WebhookScheduledTriggers"'))
        return Promise.resolve(rowsByRule["scheduled"] ?? []);
      if (sql.includes('"Booking"')) return Promise.resolve(rowsByRule["booking"] ?? []);
      return Promise.resolve([]);
    },
  } as unknown as ReadOnlyDb;
}

const leakRules = (id: string) => rulesFor("cal").filter((r) => r.id === id);

for (const [id, key] of [
  ["cal-leak-scheduled-trigger", "scheduled"],
  ["cal-leak-booking-active", "booking"],
] as const) {
  test(`${id} passes on clean data (no run rows left)`, async () => {
    const found = await runSweep(dbWith({}), leakRules(id), {
      runPrefix: PREFIX,
      includeLeaks: true,
    });
    assert.deepEqual(found, []);
  });

  test(`${id} fails on seeded data (one row of this run left)`, async () => {
    const found = await runSweep(
      dbWith({ [key]: [{ id: "1", value: "left-over" }] }),
      leakRules(id),
      { runPrefix: PREFIX, includeLeaks: true },
    );
    assert.equal(found.length, 1);
    assert.equal(found[0]?.ruleId, id);
  });
}
