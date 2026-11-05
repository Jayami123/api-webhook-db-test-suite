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

/** The Playwright annotation type the sweep writes on every test it covers (the JUnit reporter emits it as a property). */
export const SWEEP_ANNOTATION_TYPE = "invariant-sweep";

/** `{ type: "invariant-sweep", description: "<product>: <N> rules, <V> violations" }`, always written, clean or not. */
export function sweepAnnotation(
  product: string,
  ruleCount: number,
  violationCount: number,
): { type: string; description: string } {
  return {
    type: SWEEP_ANNOTATION_TYPE,
    description: `${product}: ${String(ruleCount)} rules, ${String(violationCount)} violations`,
  };
}
