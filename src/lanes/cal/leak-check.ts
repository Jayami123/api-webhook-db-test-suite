import { readOnlyDb } from "../../db/pg.ts";
import { runSweep } from "../../invariants/engine.ts";
import { rulesFor } from "../../invariants/rules.ts";
import { currentRunPrefix } from "../../run/prefix.ts";

/**
 * Lane leak check, run by CI after the tests (review addendum). Runs the cal leak rules (scheduled rows, active bookings,
 * and the foundation's Cal leak rules) for this run's prefix and exits non-zero on any violation. Prints rule ids and
 * counts only: no row values, no secrets. Reads through the qa_ro role only.
 */
async function main(): Promise<void> {
  const prefix = currentRunPrefix();
  const violations = await runSweep(readOnlyDb("cal"), rulesFor("cal"), {
    runPrefix: prefix,
    includeLeaks: true,
  });
  console.log(`cal leak check for run ${prefix}: ${String(violations.length)} violation(s)`);
  for (const v of violations) console.log(`  LEAK ${v.ruleId}: ${v.description}`);
  if (violations.length > 0) process.exitCode = 1;
}

await main();
