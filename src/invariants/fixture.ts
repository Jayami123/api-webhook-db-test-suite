import { test as base } from "@playwright/test";
import { readOnlyDb } from "../db/pg.ts";
import { currentRunPrefix } from "../run/prefix.ts";
import { sweepAfterTest, sweepAnnotation } from "./after-test.ts";
import { RetainRegistry } from "./engine.ts";
import { productOfProject, rulesFor } from "./rules.ts";

/**
 * P2-X-DB-001: after EVERY test of a product project, sweep that product's database. Playwright
 * tears auto fixtures down after the test's own fixtures (probed on 1.64.0, also when the body
 * fails), so a test's atomic cleanup has already run when the sweep looks. Zero violations are
 * required: any violation fails the test, with the SQL and the rows attached.
 */
export const retained = new RetainRegistry();

export const test = base.extend<{ dbInvariants: undefined }>({
  dbInvariants: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring pattern
    async ({}, use, testInfo) => {
      // The sweep is scoped by run prefix, not by worker: two workers in one run would see each other's rows.
      // Asserted here, not assumed (the alternative, rules scoped per test, is not chosen). UNPROBED: the
      // `testInfo.config.workers` field on Playwright 1.64.0.
      if (testInfo.config.workers !== 1) {
        throw new Error(
          `TEST BUG: the P2-X-DB-001 sweep needs workers 1 (found ${String(testInfo.config.workers)}); scope the rules per test first`,
        );
      }
      await use(undefined);
      const product = productOfProject(testInfo.project.name);
      if (product === undefined) return;
      const rules = rulesFor(product);
      const outcome = await sweepAfterTest({
        db: readOnlyDb(product),
        rules,
        runPrefix: currentRunPrefix(),
        retained,
      });
      // Written on every covered test, clean or not, so a JUnit report shows that the sweep ran and what it found.
      testInfo.annotations.push(
        sweepAnnotation(product, rules.length, outcome?.violations.length ?? 0),
      );
      if (outcome === undefined) return;
      await testInfo.attach("p2-x-db-001-violations.txt", {
        body: outcome.report,
        contentType: "text/plain",
      });
      throw new Error(
        `P2-X-DB-001: ${String(outcome.violations.length)} violation(s)\n${outcome.report}`,
      );
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
