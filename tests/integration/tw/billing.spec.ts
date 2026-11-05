import { test } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { liveGate } from "../../../src/lanes/tw/gates.ts";

/**
 * P2-TW-STR-001: two subscription events sent out of order leave the newest one stored. The row needs the billing schema
 * (core.billingProduct). It is absent on twentycrm/twenty:v2.44.0 (P-TW-7b), so the case is a gated skip with the
 * blocker named. The gate is checked at run time, not assumed: if the schema appears, the test fails loudly until the
 * body is written, instead of skipping silently.
 */
test("P2-TW-STR-001: two subscription events sent out of order leave the newest one stored", async () => {
  const rows = await readOnlyDb("twenty").select<{ present: boolean }>(
    `SELECT to_regclass('core."billingProduct"') IS NOT NULL AS present`,
  );
  const gate = liveGate(
    "P2-TW-STR-001",
    rows[0]?.present === true,
    "billing tables absent on twentycrm/twenty:v2.44.0 (core.billingProduct missing, P-TW-7b)",
  );
  test.skip(gate.skip, gate.reason);
  throw new Error("TEST BUG: the billing schema exists but the STR-001 body is not written yet");
});
