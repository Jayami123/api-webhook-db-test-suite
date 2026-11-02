import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

const WORKFLOW = readFileSync(path.join(".github", "workflows", "p2-doc.yml"), "utf8");
const CONFIG = readFileSync("playwright.config.ts", "utf8");

/** Every file the documenso lane owns, read recursively (FC-2 scope). */
function laneFiles(dirs: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (p: string): void => {
    for (const entry of readdirSync(p)) {
      const full = path.join(p, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(full);
    }
  };
  for (const d of dirs) walk(d);
  return out;
}

describe("documenso lane workflow (.github/workflows/p2-doc.yml)", () => {
  test("it has the doc-api job (API and serial steps) and the doc-billing-api job", () => {
    assert.ok(WORKFLOW.includes("\n  doc-api:\n"));
    assert.ok(WORKFLOW.includes("test --project=doc-api\n"));
    // Serial runs on its own, with no dependency on doc-api, and always runs after the API step.
    assert.ok(WORKFLOW.includes("test --project=doc-serial --no-deps"));
    const serialStep = WORKFLOW.slice(WORKFLOW.indexOf("Serial project"));
    assert.ok(serialStep.slice(0, 400).includes("if: ${{ always() }}"));
    assert.ok(WORKFLOW.includes("\n  doc-billing-api:\n"));
    assert.match(WORKFLOW, /--project=doc-billing-api/);
  });

  test("it runs on pull requests and never on workflow_run (a PR branch would not trigger it)", () => {
    assert.ok(WORKFLOW.includes("on:\n  pull_request:\n  workflow_dispatch:"));
    // The explanatory comment names workflow_run; the trigger key itself must not exist.
    assert.equal(new RegExp("^\\s{2}workflow_run:", "m").test(WORKFLOW), false);
  });

  test("every step has its own timeout-minutes and nothing is continue-on-error", () => {
    const stepStarts = WORKFLOW.split("\n").filter((l) => /^ {6}- (name|uses): /.test(l));
    const stepTimeouts = WORKFLOW.split("\n").filter((l) => /^ {8}timeout-minutes: \d+$/.test(l));
    const steps = stepStarts.length;
    const timeouts = stepTimeouts.length;
    assert.ok(steps > 0);
    assert.equal(timeouts, steps);
    assert.doesNotMatch(WORKFLOW, /continue-on-error/);
  });

  test("fork pull requests are not run (secrets are never offered to them)", () => {
    const gate = "github.event.pull_request.head.repo.full_name == github.repository";
    const count = WORKFLOW.split(gate).length - 1;
    assert.equal(count, 2, "both jobs carry the same-repository gate");
  });

  test("the Playwright config names every project this workflow runs", () => {
    for (const name of ["doc-api", "doc-serial", "doc-billing-api"]) {
      assert.ok(
        CONFIG.includes(`"${name}"`) || CONFIG.includes(`name: "${name}"`),
        `${name} not in config`,
      );
    }
  });

  test("FC-2: the rate-limit bypass flag appears in neither the workflow nor the lane's code", () => {
    // Built at runtime so this file does not contain the flag itself.
    const flag = ["DANGEROUS", "BYPASS", "RATE", "LIMITS"].join("_");
    assert.equal(WORKFLOW.includes(flag), false);
    for (const file of laneFiles([
      "src/lanes/doc",
      "tests/unit/lanes/doc",
      "tests/contracts/doc",
      "tests/integration/doc",
      "tests/webhooks/doc",
      "tests/serial/doc",
      "tests/billing/doc",
      "tests/fixtures/doc",
    ])) {
      assert.equal(readFileSync(file, "utf8").includes(flag), false, `${file} sets the bypass`);
    }
  });
});
