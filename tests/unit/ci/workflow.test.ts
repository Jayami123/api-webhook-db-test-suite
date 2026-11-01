import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/**
 * Guards the CI shape of plan Task 6 without a YAML parser: the workflow files are small and
 * regular. A change that renames a required check, raises a timeout, loosens an action pin or adds
 * a lane before its task fails here.
 */
const workflow = readFileSync(".github/workflows/api.yml", "utf8");
const live = workflow
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("#"))
  .join("\n");

function jobs(): Map<string, string> {
  const section = live.slice(live.indexOf("\njobs:\n") + 7);
  const out = new Map<string, string>();
  const parts = section.split(/^ {2}([a-z][a-z0-9-]*):\s*$/m);
  for (let i = 1; i < parts.length; i += 2) out.set(parts[i] ?? "", parts[i + 1] ?? "");
  return out;
}
const timeoutOf = (body: string): number =>
  Number(/^ {4}timeout-minutes: (\d+)\s*$/m.exec(body)?.[1]);

describe("api.yml foundation shape", () => {
  test("the jobs are exactly check, unit, db-guard, specs and foundation, each named like its id", () => {
    assert.deepEqual([...jobs().keys()], ["check", "unit", "db-guard", "specs", "foundation"]);
    for (const [id, body] of jobs()) {
      assert.match(body, new RegExp(`^ {4}name: ${id}\\s*$`, "m"), id);
    }
  });

  test("existing timeouts are unchanged, new ones are set, and nothing exceeds 10 minutes", () => {
    const timeouts = Object.fromEntries([...jobs()].map(([id, body]) => [id, timeoutOf(body)]));
    assert.deepEqual(timeouts, { check: 10, unit: 10, "db-guard": 10, specs: 10, foundation: 5 });
  });

  test("every action is pinned by full commit SHA with a version comment", () => {
    const uses = workflow.split("\n").filter((line) => /^\s*-?\s*uses:/.test(line));
    assert.ok(uses.length >= 8);
    for (const line of uses) {
      assert.match(line, /uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+\s*$/, line);
    }
  });

  test("permissions are read-only and the dangerous triggers and flags are absent", () => {
    assert.match(live, /^permissions:\n {2}contents: read\n/m);
    assert.ok(!/pull_request_target/.test(live));
    assert.ok(!/continue-on-error/.test(live));
    assert.ok(!/\bsecrets\./.test(live));
  });

  test("foundation waits for every other job, always runs, and fails unless all succeeded", () => {
    const body = jobs().get("foundation") ?? "";
    assert.match(body, /^ {4}needs: \[check, unit, db-guard, specs\]\s*$/m);
    assert.match(body, /^ {4}if: \$\{\{ always\(\) \}\}\s*$/m);
    assert.match(body, /jq -e 'all\(\.\[\]; \.result == "success"\)'/);
  });

  test("the check job still asserts the four API projects, their serial twins and no browser", () => {
    assert.ok(
      workflow.includes(
        `Available projects: "cal-api", "doc-api", "med-api", "tw-api", "cal-serial", "doc-serial", "med-serial", "tw-serial"`,
      ),
    );
    assert.ok(workflow.includes("ms-playwright"));
  });

  test("the lane skeleton is guidance only: it is commented and names the budget", () => {
    assert.match(workflow, /^\s*# +cal-api:/m);
    assert.match(workflow, /^\s*# +needs: foundation/m);
    assert.ok(!/^ {2}(cal|doc|med|tw)-api:/m.test(live));
    assert.match(workflow, /25 min budget/);
  });
});
