import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

  test("api.yml triggers are workflow_call and workflow_dispatch only", () => {
    assert.deepEqual(triggersOf(live.split("\n")), ["workflow_call", "workflow_dispatch"]);
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
        `Available projects: "cal-api", "doc-api", "med-api", "tw-api", "doc-billing-api", "cal-serial", "doc-serial", "med-serial", "tw-serial"`,
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

/** Secret names a lane workflow may reference. Any other name fails the checker. */
export const ALLOWED_LANE_SECRETS: readonly string[] = ["STRIPE_API_KEY"];

const SAME_REPO_GUARD = "github.event.pull_request.head.repo.full_name == github.repository";
const PINNED_USES = /uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+\s*$/;

/** The indented lines under a top-level key (e.g. `on:`), or null when the key is absent. */
function blockUnder(lines: readonly string[], key: string): string[] | null {
  const start = lines.findIndex((line) => line === `${key}:`);
  if (start < 0) return null;
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && !/^\s/.test(line)) break;
    out.push(line);
  }
  return out;
}

/** Trigger names: the two-space keys under `on:`. Null when `on:` is absent or not a block. */
function triggersOf(lines: readonly string[]): string[] | null {
  const on = blockUnder(lines, "on");
  if (on === null) return null;
  return on
    .map((line) => /^ {2}([a-z_]+):\s*$/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined);
}

function splitJobs(lines: readonly string[]): { id: string; lines: string[] }[] {
  const jobs: { id: string; lines: string[] }[] = [];
  for (const line of lines) {
    const header = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (header) jobs.push({ id: header[1] ?? "", lines: [] });
    else jobs[jobs.length - 1]?.lines.push(line);
  }
  return jobs;
}

function splitSteps(jobLines: readonly string[]): string[][] {
  const steps: string[][] = [];
  for (const line of jobLines) {
    if (/^ {6}- /.test(line)) steps.push([line]);
    else steps[steps.length - 1]?.push(line);
  }
  return steps;
}

function stepName(step: readonly string[]): string {
  return /^ {6}- name: (.*)$/.exec(step[0] ?? "")?.[1] ?? "(unnamed)";
}

/**
 * Checks one lane workflow file and returns its violations (empty = pass). A file is either an
 * inert stub (manual trigger only, every job `if: ${{ false }}`, no secrets) or a live lane with
 * the safe shape below. Pure: takes the file name and the text, reads nothing.
 */
export function checkLaneWorkflow(file: string, text: string): string[] {
  const violations: string[] = [];
  const fail = (message: string): void => {
    violations.push(`${file}: ${message}`);
  };
  const live = text.split("\n").filter((line) => !line.trimStart().startsWith("#"));
  const body = live.join("\n");

  const triggers = triggersOf(live);
  if (triggers === null) {
    fail("has no `on:` block (inline triggers are not accepted)");
    return violations;
  }
  const inert = triggers.length === 1 && triggers[0] === "workflow_dispatch";
  const allowed = new Set(
    file === "tw-study.yml"
      ? ["schedule", "workflow_dispatch"]
      : ["workflow_call", "workflow_dispatch"],
  );
  for (const trigger of triggers) {
    if (!allowed.has(trigger)) fail(`trigger "${trigger}" is not allowed in this file`);
  }
  if (/pull_request_target|workflow_run/.test(body))
    fail("mentions pull_request_target or workflow_run");

  const permissions = (blockUnder(live, "permissions") ?? []).filter((line) => line.trim() !== "");
  if (permissions.join("\n") !== "  contents: read")
    fail("top-level permissions must be exactly `contents: read`");

  if (/continue-on-error/.test(body)) fail("continue-on-error is not allowed");
  for (const line of live) {
    if (/\bif:/.test(line) && line.includes("github.event_name == 'workflow_call'")) {
      fail("dead workflow_call clause in an if: (event_name is never workflow_call in a callee)");
    }
  }

  for (const line of live) {
    if (/^\s*-?\s*uses:/.test(line) && !PINNED_USES.test(line)) {
      fail(`action is not pinned to a full commit SHA with a version comment: ${line.trim()}`);
    }
  }

  for (const match of body.matchAll(/\bsecrets\.([A-Za-z0-9_]+)/g)) {
    const name = match[1] ?? "";
    if (inert) fail(`references secret "${name}"; an inert stub may not reference secrets`);
    else if (!ALLOWED_LANE_SECRETS.includes(name)) {
      fail(
        `references secret "${name}", which is not in the allowlist (${ALLOWED_LANE_SECRETS.join(", ")})`,
      );
    }
  }

  const jobs = splitJobs(blockUnder(live, "jobs") ?? []);
  if (jobs.length === 0) fail("defines no jobs");
  for (const job of jobs) {
    const ifLine = job.lines
      .map((line) => /^ {4}if: (.*)$/.exec(line)?.[1])
      .find((value) => value !== undefined);
    if (!job.lines.some((line) => /^ {4}timeout-minutes: \d+\s*$/.test(line))) {
      fail(`job ${job.id} has no timeout-minutes`);
    }
    if (inert) {
      if (ifLine !== "${{ false }}") fail(`job ${job.id} is not skipped (if: \${{ false }})`);
      continue;
    }
    if (triggers.includes("workflow_call") && !(ifLine ?? "").includes(SAME_REPO_GUARD)) {
      fail(`job ${job.id} is callable (workflow_call) without the same-repo guard in its if:`);
    }
    const steps = splitSteps(job.lines);
    for (const step of steps) {
      if (!step.some((line) => /^ {8}timeout-minutes: \d+\s*$/.test(line))) {
        fail(`job ${job.id}: step "${stepName(step)}" has no timeout-minutes`);
      }
    }
    if (job.lines.some((line) => line.includes("scripts/up.mjs"))) {
      const downSteps = steps.filter((step) =>
        step.some((line) => line.includes("scripts/down.mjs")),
      );
      const alwaysDown = downSteps.some((step) =>
        step.some((line) => /^ {8}if: (\$\{\{ always\(\) \}\}|always\(\))\s*$/.test(line)),
      );
      if (!alwaysDown)
        fail(
          `job ${job.id} runs scripts/up.mjs without an always() step that runs scripts/down.mjs`,
        );
    }
  }
  return violations;
}

/**
 * Each lane owns one workflow file (docs/lane-ownership.md). A file is an inert stub until its lane
 * goes live; a live lane must pass the checker. api.yml never gains lane jobs.
 */
describe("per-lane workflows", () => {
  const lanes = ["p2-cal.yml", "p2-med.yml", "p2-doc.yml", "p2-tw.yml", "tw-study.yml"];

  test("each lane workflow is either an inert stub or a safe live lane", () => {
    for (const file of lanes) {
      const text = readFileSync(`.github/workflows/${file}`, "utf8");
      assert.deepEqual(checkLaneWorkflow(file, text), [], file);
    }
  });

  test("every lane workflow is callable and has no pull_request or push trigger", () => {
    for (const file of lanes.filter((f) => f !== "tw-study.yml")) {
      const triggers =
        triggersOf(readFileSync(`.github/workflows/${file}`, "utf8").split("\n")) ?? [];
      assert.ok(triggers.includes("workflow_call"), file);
      assert.ok(!triggers.includes("pull_request") && !triggers.includes("push"), file);
    }
  });

  test("api.yml keeps only the foundation jobs; no lane job is defined there", () => {
    assert.deepEqual([...jobs().keys()], ["check", "unit", "db-guard", "specs", "foundation"]);
    for (const file of lanes) assert.ok(!live.includes(`/${file}`), file);
  });
});

describe("lane workflow checker: fixtures", () => {
  const safeLive = [
    "name: p2-fixture",
    "on:",
    "  workflow_call:",
    "permissions:",
    "  contents: read",
    "jobs:",
    "  lane-api:",
    "    name: lane-api",
    "    if: ${{ github.event.pull_request.head.repo.full_name == github.repository }}",
    "    runs-on: ubuntu-24.04",
    "    timeout-minutes: 30",
    "    steps:",
    "      - name: Checkout",
    "        timeout-minutes: 5",
    "        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
    "        with:",
    "          persist-credentials: false",
    "      - name: Harness up",
    "        timeout-minutes: 16",
    "        run: node node_modules/qa-portfolio-harness/scripts/up.mjs cal",
    "      - name: Harness down",
    "        if: always()",
    "        timeout-minutes: 5",
    "        run: node node_modules/qa-portfolio-harness/scripts/down.mjs cal",
    "",
  ].join("\n");
  const inertStub = [
    "name: p2-fixture",
    "on:",
    "  workflow_dispatch:",
    "permissions:",
    "  contents: read",
    "jobs:",
    "  lane-api:",
    "    name: lane-api",
    "    if: ${{ false }}",
    "    runs-on: ubuntu-24.04",
    "    timeout-minutes: 30",
    "    steps:",
    "      - name: Stub",
    '        run: echo "stub"',
    "",
  ].join("\n");

  test("a safe live lane passes", () => {
    assert.deepEqual(checkLaneWorkflow("fixture.yml", safeLive), []);
  });

  test("an inert stub passes", () => {
    assert.deepEqual(checkLaneWorkflow("fixture.yml", inertStub), []);
  });

  // Each mutation of the safe live lane must fail, with the named reason.
  const mutations: [name: string, from: string, to: string, reason: string][] = [
    [
      "pull_request_target trigger",
      "  workflow_call:",
      "  pull_request_target:",
      'trigger "pull_request_target"',
    ],
    [
      "workflow_run trigger",
      "  workflow_call:",
      "  workflow_run:\n    workflows: [api]\n    types: [completed]",
      'trigger "workflow_run"',
    ],
    [
      "missing job timeout",
      "    runs-on: ubuntu-24.04\n    timeout-minutes: 30\n",
      "    runs-on: ubuntu-24.04\n",
      "has no timeout-minutes",
    ],
    [
      "missing same-repo guard",
      "    if: ${{ github.event.pull_request.head.repo.full_name == github.repository }}\n",
      "",
      "same-repo guard",
    ],
    [
      "unknown secret",
      "    runs-on: ubuntu-24.04\n",
      "    runs-on: ubuntu-24.04\n    env:\n      TOKEN: ${{ secrets.OTHER_TOKEN }}\n",
      'secret "OTHER_TOKEN"',
    ],
    [
      "continue-on-error",
      "    runs-on: ubuntu-24.04\n",
      "    runs-on: ubuntu-24.04\n    continue-on-error: true\n",
      "continue-on-error",
    ],
    [
      "step without timeout",
      "      - name: Checkout\n        timeout-minutes: 5\n",
      "      - name: Checkout\n",
      'step "Checkout" has no timeout-minutes',
    ],
    [
      "down step without always()",
      "        if: always()\n        timeout-minutes: 5\n        run: node node_modules/qa-portfolio-harness/scripts/down.mjs cal",
      "        timeout-minutes: 5\n        run: node node_modules/qa-portfolio-harness/scripts/down.mjs cal",
      "without an always() step",
    ],
    [
      "no down step at all",
      "      - name: Harness down\n        if: always()\n        timeout-minutes: 5\n        run: node node_modules/qa-portfolio-harness/scripts/down.mjs cal\n",
      "",
      "without an always() step",
    ],
    [
      "pull_request re-added",
      "  workflow_call:",
      "  workflow_call:\n  pull_request:",
      'trigger "pull_request" is not allowed',
    ],
    [
      "lane job guard contains the dead workflow_call clause",
      "    if: ${{ github.event.pull_request.head.repo.full_name == github.repository }}\n",
      "    if: ${{ github.event_name == 'workflow_call' || github.event.pull_request.head.repo.full_name == github.repository }}\n",
      "dead workflow_call clause",
    ],
  ];
  for (const [name, from, to, reason] of mutations) {
    test(`fails: ${name}`, () => {
      assert.ok(safeLive.includes(from), `fixture contains ${JSON.stringify(from)}`);
      const violations = checkLaneWorkflow("fixture.yml", safeLive.replace(from, to));
      assert.ok(
        violations.some((violation) => violation.includes(reason)),
        JSON.stringify(violations),
      );
    });
  }
});

/** The run script of one step, dedented: the same bash script the job runs for it. */
function stepScript(file: string, name: string): string {
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.indexOf(`      - name: ${name}`);
  assert.ok(start >= 0, `step: ${name}`);
  const body: string[] = [];
  let inRun = false;
  for (const line of lines.slice(start + 1)) {
    if (/^ {6}- name: /.test(line)) break;
    if (line === "        run: |") {
      inRun = true;
      continue;
    }
    if (inRun) body.push(line.startsWith("          ") ? line.slice(10) : line);
  }
  assert.ok(body.length > 0, `run block of ${name}`);
  return body.join("\n");
}

describe("p2-med Stripe test-key gate", () => {
  function runGate(stripeKey: string | undefined) {
    const env: NodeJS.ProcessEnv = { PATH: process.env["PATH"] ?? "" };
    if (stripeKey !== undefined) env["STRIPE_API_KEY"] = stripeKey;
    const res = spawnSync(
      "bash",
      ["-c", stepScript(".github/workflows/p2-med.yml", "Require the Stripe test key")],
      {
        env,
        encoding: "utf8",
      },
    );
    return { status: res.status, output: res.stdout + res.stderr };
  }

  test("a missing secret fails with the missing-secret message", () => {
    const res = runGate(undefined);
    assert.notEqual(res.status, 0);
    assert.match(res.output, /::error title=STRIPE_API_KEY missing::/);
  });

  test("a live key fails before the harness starts, and neither the value nor a fragment of it is printed", () => {
    const res = runGate("sk_live_unitfixture");
    assert.notEqual(res.status, 0);
    assert.match(res.output, /::error title=STRIPE_API_KEY is not a test-mode key::/);
    assert.ok(!res.output.includes("unitfixture"), "the key value is never echoed");
  });

  test("a test-mode key passes, and the value is not printed", () => {
    const res = runGate("sk_test_unitfixture");
    assert.equal(res.status, 0, res.output);
    assert.match(res.output, /STRIPE_API_KEY is a test-mode key \(value not printed\)/);
    assert.ok(!res.output.includes("unitfixture"), "the key value is never echoed");
  });
});

describe("scripts/ci-changes.sh: which lane flags are set", () => {
  /** Runs the classifier with an event name and changed paths; returns its four flags. */
  function classify(event: string, paths: string[]): Record<string, string> {
    const res = spawnSync("bash", ["scripts/ci-changes.sh"], {
      input: paths.join("\n"),
      env: { PATH: process.env["PATH"] ?? "", EVENT_NAME: event },
      encoding: "utf8",
    });
    assert.equal(res.status, 0, res.stderr);
    return Object.fromEntries(
      res.stdout
        .trim()
        .split("\n")
        .map((line) => line.split("=") as [string, string]),
    );
  }
  const ALL = { p2_cal: "true", p2_doc: "true", p2_med: "true", p2_tw: "true" };
  const NONE = { p2_cal: "false", p2_doc: "false", p2_med: "false", p2_tw: "false" };
  const only = (lane: keyof typeof ALL): Record<string, string> => ({ ...NONE, [lane]: "true" });

  test("G1 workflow_dispatch runs every lane", () => {
    assert.deepEqual(classify("workflow_dispatch", []), ALL);
  });
  test("G2 push runs no lane, whatever changed", () => {
    assert.deepEqual(classify("push", ["src/lanes/cal/cron.ts"]), NONE);
  });
  test("G3 a pull request with no changed paths runs every lane (fail-safe)", () => {
    assert.deepEqual(classify("pull_request", []), ALL);
  });
  test("G4 a docs-only change runs no lane", () => {
    assert.deepEqual(classify("pull_request", ["docs/lane-ownership.md"]), NONE);
  });
  test("G5 a README-only change runs no lane", () => {
    assert.deepEqual(classify("pull_request", ["README.md"]), NONE);
  });
  test("G6 a cal lane path runs only cal", () => {
    assert.deepEqual(classify("pull_request", ["src/lanes/cal/cron.ts"]), only("p2_cal"));
  });
  test("G7 the medusa slo file runs only med", () => {
    assert.deepEqual(classify("pull_request", ["src/slo/medusa.ts"]), only("p2_med"));
  });
  test("G8 a documenso billing test runs only doc", () => {
    assert.deepEqual(classify("pull_request", ["tests/billing/doc/x.spec.ts"]), only("p2_doc"));
  });
  test("G9 a twenty serial test runs only tw", () => {
    assert.deepEqual(classify("pull_request", ["tests/serial/tw/x.spec.ts"]), only("p2_tw"));
  });
  test("G10 a shared file runs every lane", () => {
    assert.deepEqual(classify("pull_request", ["src/invariants/rules.ts"]), ALL);
  });
  test("G11 a change to api.yml runs every lane", () => {
    assert.deepEqual(classify("pull_request", [".github/workflows/api.yml"]), ALL);
  });
  test("G12 two lane paths run exactly those two lanes", () => {
    assert.deepEqual(classify("pull_request", ["src/lanes/cal/cron.ts", "src/lanes/med/x.ts"]), {
      ...NONE,
      p2_cal: "true",
      p2_med: "true",
    });
  });
  test("G13 a lane path plus a shared path runs every lane", () => {
    assert.deepEqual(
      classify("pull_request", ["src/lanes/cal/cron.ts", "src/invariants/rules.ts"]),
      ALL,
    );
  });
  test("G14 a docs path plus a doc lane path runs only doc", () => {
    assert.deepEqual(classify("pull_request", ["docs/x.md", "src/lanes/doc/y.ts"]), only("p2_doc"));
  });
});

/**
 * Checks the caller (ci.yml) and returns its violations (empty = pass). Pure: the callee texts come in
 * through `calleeText`, so a test can hand it a broken callee. Rules: docs/plans/2026-11-05-p2-ci-gate.md, 6.4 (E-group).
 */
export function checkCallerWorkflow(
  text: string,
  calleeText: (file: string) => string | null,
): string[] {
  const violations: string[] = [];
  const fail = (message: string): void => {
    violations.push(`ci.yml: ${message}`);
  };
  const live = text.split("\n").filter((line) => !line.trimStart().startsWith("#"));
  const body = live.join("\n");

  const triggers = triggersOf(live) ?? [];
  if ([...triggers].sort().join(",") !== "pull_request,push,workflow_dispatch") {
    fail(`triggers are ${triggers.join(", ")}; expected pull_request, push, workflow_dispatch`);
  }
  if (!/^ {2}push:\n {4}branches: \[main\]$/m.test(body))
    fail("push must be limited to branches: [main]");
  if (!/^permissions:\n {2}contents: read$/m.test(body))
    fail("permissions must be exactly contents: read");
  if (
    !/^concurrency:\n {2}group: ci-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: true$/m.test(
      body,
    )
  ) {
    fail("concurrency must be ci-${{ github.ref }} with cancel-in-progress: true");
  }
  if (/continue-on-error|pull_request_target|workflow_run/.test(body)) {
    fail("continue-on-error, pull_request_target and workflow_run are not allowed");
  }
  if (/\bsecrets\.[A-Za-z_]/.test(body))
    fail("ci.yml may not reference a secret value (only secrets: inherit)");
  for (const line of live) {
    if (!/^\s*-?\s*uses:/.test(line)) continue;
    const local = /^\s*(- )?uses: \.\/\.github\/workflows\/[\w.-]+\.yml$/.test(line);
    if (!local && !PINNED_USES.test(line))
      fail(`action is not pinned to a full commit SHA: ${line.trim()}`);
  }

  const jobList = splitJobs(blockUnder(live, "jobs") ?? []);
  const expected = ["changes", "api", "env-check", "p2-cal", "p2-doc", "p2-med", "p2-tw", "gate"];
  const ids = jobList.map((job) => job.id);
  if (ids.join(",") !== expected.join(","))
    fail(`jobs are ${ids.join(", ")}; expected ${expected.join(", ")}`);

  for (const job of jobList) {
    const jobBody = job.lines.join("\n");
    const ifLine = /^ {4}if: (.*)$/m.exec(jobBody)?.[1] ?? "";
    const uses = /^ {4}uses: \.\/\.github\/workflows\/([\w.-]+\.yml)$/m.exec(jobBody)?.[1];
    if (uses !== undefined) {
      const callee = calleeText(uses);
      if (
        callee === null ||
        !(triggersOf(callee.split("\n"))?.includes("workflow_call") ?? false)
      ) {
        fail(`job ${job.id}: ${uses} is missing or not workflow_call`);
      }
      const refsSecrets = callee !== null && /\bsecrets\./.test(callee);
      const inherits = /^ {4}secrets: inherit$/m.test(jobBody);
      if (refsSecrets !== inherits) {
        fail(
          `job ${job.id}: secrets: inherit must be present exactly when ${uses} references a secret`,
        );
      }
    }
    if (job.id.startsWith("p2-")) {
      if (!ifLine.includes("needs.changes.outputs.p2_"))
        fail(`job ${job.id} has no changes flag in its if:`);
      if (!ifLine.includes("github.event.pull_request.head.repo.full_name == github.repository")) {
        fail(`job ${job.id} has no same-repo guard in its if:`);
      }
    }
  }

  const gateBody = jobList.find((job) => job.id === "gate")?.lines.join("\n") ?? "";
  if (!/^ {4}needs: \[changes, api, env-check, p2-cal, p2-doc, p2-med, p2-tw\]$/m.test(gateBody)) {
    fail("gate needs must be exactly changes, api, env-check, p2-cal, p2-doc, p2-med, p2-tw");
  }
  if (!/^ {4}if: \$\{\{ always\(\) \}\}$/m.test(gateBody)) fail("gate must be if: ${{ always() }}");
  if (!/^ {4}timeout-minutes: 5$/m.test(gateBody)) fail("gate timeout must be 5 minutes");
  if (!/^ {4}runs-on: ubuntu-24\.04$/m.test(gateBody)) fail("gate must run on ubuntu-24.04");
  return violations;
}

describe("ci.yml caller and gate shape", () => {
  const caller = readFileSync(".github/workflows/ci.yml", "utf8");
  const calleeFile = (file: string): string | null => {
    try {
      return readFileSync(`.github/workflows/${file}`, "utf8");
    } catch {
      return null;
    }
  };
  /** Applies one textual change to ci.yml (the from text must occur once) and checks it. */
  const mutate = (from: string, to: string): string[] => {
    assert.equal(caller.split(from).length - 1, 1, `fixture contains ${JSON.stringify(from)} once`);
    return checkCallerWorkflow(caller.replace(from, to), calleeFile);
  };

  test("E1 ci.yml passes the caller checker", () => {
    assert.deepEqual(checkCallerWorkflow(caller, calleeFile), []);
  });
  test("E2 fails: a trigger outside pull_request, push and workflow_dispatch", () => {
    const v = mutate(
      "  push:\n    branches: [main]\n",
      '  push:\n    branches: [main]\n  schedule:\n    - cron: "17 5 * * 1"\n',
    );
    assert.ok(
      v.some((m) => m.includes("triggers are")),
      JSON.stringify(v),
    );
  });
  test("E3 fails: the gate does not need every caller job", () => {
    const v = mutate(
      "needs: [changes, api, env-check, p2-cal, p2-doc, p2-med, p2-tw]",
      "needs: [changes, api, env-check, p2-cal, p2-doc, p2-med]",
    );
    assert.ok(
      v.some((m) => m.includes("gate needs")),
      JSON.stringify(v),
    );
  });
  test("E4 fails: the gate is not always()", () => {
    const v = mutate("if: ${{ always() }}", "if: ${{ success() }}");
    assert.ok(
      v.some((m) => m.includes("always()")),
      JSON.stringify(v),
    );
  });
  test("E5 fails: a lane caller job has no same-repo guard", () => {
    const v = mutate(
      "(github.event_name == 'workflow_dispatch' || github.event.pull_request.head.repo.full_name == github.repository) }}\n    uses: ./.github/workflows/p2-cal.yml",
      "(github.event_name == 'workflow_dispatch') }}\n    uses: ./.github/workflows/p2-cal.yml",
    );
    assert.ok(
      v.some((m) => m.includes("same-repo guard")),
      JSON.stringify(v),
    );
  });
  test("E6 fails: secrets: inherit missing on a callee that references secrets", () => {
    const v = mutate(
      "    uses: ./.github/workflows/p2-cal.yml\n    secrets: inherit\n",
      "    uses: ./.github/workflows/p2-cal.yml\n",
    );
    assert.ok(
      v.some((m) => m.includes("secrets: inherit must be present")),
      JSON.stringify(v),
    );
  });
  test("E7 fails: secrets: inherit present on a callee that references none", () => {
    const v = mutate(
      "    uses: ./.github/workflows/p2-tw.yml\n",
      "    uses: ./.github/workflows/p2-tw.yml\n    secrets: inherit\n",
    );
    assert.ok(
      v.some((m) => m.includes("p2-tw.yml references a secret")),
      JSON.stringify(v),
    );
  });
  test("E8 fails: a secret expression in ci.yml itself", () => {
    const v = mutate(
      "      NEEDS: ${{ toJSON(needs) }}",
      "      NEEDS: ${{ toJSON(needs) }}\n      TOKEN: ${{ secrets.STRIPE_API_KEY }}",
    );
    assert.ok(
      v.some((m) => m.includes("may not reference a secret")),
      JSON.stringify(v),
    );
  });
  test("E9 fails: a uses target that is not workflow_call", () => {
    const v = checkCallerWorkflow(caller, (file) =>
      file === "p2-med.yml"
        ? (calleeFile(file) ?? "").replace("  workflow_call:\n", "")
        : calleeFile(file),
    );
    assert.ok(
      v.some((m) => m.includes("p2-med.yml is missing or not workflow_call")),
      JSON.stringify(v),
    );
  });
  test("E10 fails: a third-party action not pinned by full SHA", () => {
    const v = mutate(
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
      "actions/checkout@v7",
    );
    assert.ok(
      v.some((m) => m.includes("not pinned")),
      JSON.stringify(v),
    );
  });
  test("E11 fails: continue-on-error on the gate", () => {
    const v = mutate(
      "    if: ${{ always() }}\n",
      "    if: ${{ always() }}\n    continue-on-error: true\n",
    );
    assert.ok(
      v.some((m) => m.includes("continue-on-error")),
      JSON.stringify(v),
    );
  });
});

describe("ci.yml gate block (executed)", () => {
  const gateScript = stepScript(
    ".github/workflows/ci.yml",
    "Every required job passed (skipped counts as a pass only when its lane flag is false)",
  );
  const ALL_PASS: Record<string, string> = {
    changes: "success",
    api: "success",
    "env-check": "success",
    "p2-cal": "success",
    "p2-doc": "success",
    "p2-med": "success",
    "p2-tw": "success",
  };
  /** Runs the gate's run block with the given job results and lane flags (default "false"). */
  function runGate(results: Record<string, string>, flags: Record<string, string> = {}) {
    const needs: Record<string, { result: string }> = {};
    for (const [job, result] of Object.entries(results)) needs[job] = { result };
    const env: NodeJS.ProcessEnv = {
      PATH: process.env["PATH"] ?? "",
      NEEDS: JSON.stringify(needs),
      P2_CAL: flags["P2_CAL"] ?? "false",
      P2_DOC: flags["P2_DOC"] ?? "false",
      P2_MED: flags["P2_MED"] ?? "false",
      P2_TW: flags["P2_TW"] ?? "false",
    };
    const res = spawnSync("bash", ["-c", gateScript], { env, encoding: "utf8" });
    return { status: res.status, output: res.stdout + res.stderr };
  }
  const ALL_TRUE = { P2_CAL: "true", P2_DOC: "true", P2_MED: "true", P2_TW: "true" };
  const SKIPPED = {
    "p2-cal": "skipped",
    "p2-doc": "skipped",
    "p2-med": "skipped",
    "p2-tw": "skipped",
  };

  test("F1 every job passed and every flag is true: green", () => {
    assert.equal(runGate(ALL_PASS, ALL_TRUE).status, 0);
  });
  test("F2 docs-only (every lane skipped, flags false): green", () => {
    assert.equal(runGate({ ...ALL_PASS, ...SKIPPED }).status, 0);
  });
  test("F3 a flagged lane failed: red and named", () => {
    const res = runGate({ ...ALL_PASS, "p2-cal": "failure" }, { P2_CAL: "true" });
    assert.notEqual(res.status, 0);
    assert.match(res.output, /p2-cal finished with result 'failure'/);
  });
  test("F4 a flagged lane was cancelled: red", () => {
    assert.notEqual(runGate({ ...ALL_PASS, "p2-doc": "cancelled" }, { P2_DOC: "true" }).status, 0);
  });
  test("F5 a flagged lane was skipped: red (the silent-pass case)", () => {
    const res = runGate({ ...ALL_PASS, "p2-med": "skipped" }, { P2_MED: "true" });
    assert.notEqual(res.status, 0);
    assert.match(res.output, /p2-med was skipped/);
  });
  test("F6 changes failed (lanes skipped, flags false): red", () => {
    assert.notEqual(runGate({ ...ALL_PASS, changes: "failure", ...SKIPPED }).status, 0);
  });
  test("F7 api failed: red", () => {
    assert.notEqual(runGate({ ...ALL_PASS, api: "failure" }).status, 0);
  });
  test("F8 api skipped: red", () => {
    assert.notEqual(runGate({ ...ALL_PASS, api: "skipped" }).status, 0);
  });
  test("F9 env-check missing from needs: red and named as missing", () => {
    const rest: Record<string, string> = { ...ALL_PASS };
    delete rest["env-check"];
    const res = runGate(rest);
    assert.notEqual(res.status, 0);
    assert.match(res.output, /env-check finished with result 'missing'/);
  });
  test("F10 a lane flag that is empty: red", () => {
    const res = runGate(ALL_PASS, { P2_TW: "" });
    assert.notEqual(res.status, 0);
    assert.match(res.output, /lane flag is ''/);
  });
});
