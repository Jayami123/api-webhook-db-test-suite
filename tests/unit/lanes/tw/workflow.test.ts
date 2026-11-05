import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/**
 * The twenty lane's two workflow files, read without a YAML parser (the files are small and regular, like
 * tests/unit/ci/workflow.test.ts). A change that drops a step timeout, unpins an action, or moves the always-run
 * harness `down` fails here.
 */
const LANE_FILES = [".github/workflows/p2-tw.yml", ".github/workflows/tw-study.yml"] as const;

const live = (file: string): string =>
  readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");

/** Each step block, from its `- name:` line to the next step (or the end of the file). */
function steps(text: string): string[] {
  const parts = text.split(/^ {6}- name: /m);
  return parts.slice(1).map((p) => `- name: ${p}`);
}

/** The trigger names under the top-level `on:` key (two-space keys). Empty when `on:` is absent. */
function triggersIn(text: string): string[] {
  const lines = text.split("\n");
  const start = lines.indexOf("on:");
  if (start < 0) return [];
  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && !/^\s/.test(line)) break;
    const name = /^ {2}([a-z_]+):\s*$/.exec(line)?.[1];
    if (name !== undefined) names.push(name);
  }
  return names;
}

/** The trigger rule for a lane workflow: only the allowed triggers, and never pull_request_target or workflow_run. */
function triggerViolations(text: string, allowed: readonly string[]): string[] {
  const bad = triggersIn(text).filter((name) => !allowed.includes(name));
  if (/pull_request_target|workflow_run/.test(text))
    bad.push("pull_request_target or workflow_run");
  return bad;
}

/** Each job under `jobs:`: its id and its block of lines (up to the next job header). */
function jobBlocks(text: string): Map<string, string> {
  const lines = text.split("\n");
  const start = lines.indexOf("jobs:");
  const blocks = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of lines.slice(start + 1)) {
    const header = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (header?.[1] !== undefined) {
      current = [];
      blocks.set(header[1], current);
    } else {
      current?.push(line);
    }
  }
  return new Map([...blocks].map(([id, body]) => [id, body.join("\n")]));
}

/** The `if:` line of each job under `jobs:` (job id to its condition, or undefined when it has none). */
function jobIfs(text: string): Map<string, string | undefined> {
  const lines = text.split("\n");
  const start = lines.indexOf("jobs:");
  const jobs = new Map<string, string | undefined>();
  let current: string | null = null;
  for (const line of lines.slice(start + 1)) {
    const header = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (header?.[1] !== undefined) {
      current = header[1];
      jobs.set(current, undefined);
    } else if (current !== null && /^ {4}if: /.test(line)) {
      jobs.set(current, line.replace(/^ {4}if: /, ""));
    }
  }
  return jobs;
}

const SAME_REPO = "github.event.pull_request.head.repo.full_name == github.repository";
const DISPATCH = "github.event_name == 'workflow_dispatch'";
const LANE_TRIGGERS = ["workflow_call", "workflow_dispatch"] as const;

describe("twenty lane workflows", () => {
  test("every step has a timeout, every action is pinned to a 40-hex commit, and each job has a 30 minute limit", () => {
    for (const file of LANE_FILES) {
      const text = live(file);
      assert.match(text, /^ {4}timeout-minutes: 30\s*$/m, `${file}: job timeout`);
      const all = steps(text);
      assert.ok(all.length >= 8, `${file}: the job has its steps`);
      for (const step of all) {
        const name = /- name: (.*)/.exec(step)?.[1] ?? "?";
        assert.match(
          step,
          /^ {8}timeout-minutes: \d+\s*$/m,
          `${file}: step "${name}" has timeout-minutes`,
        );
      }
      for (const line of text.split("\n").filter((l) => /^ +(- )?uses: /.test(l))) {
        assert.match(
          line.trim(),
          /^(- )?uses: [\w./-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/,
          `${file}: pinned action: ${line.trim()}`,
        );
      }
    }
  });

  test("every job's last step is an always() harness down, and each triggers only on its own events", () => {
    for (const file of LANE_FILES) {
      const jobs = jobBlocks(live(file));
      assert.ok(jobs.size >= 1, `${file}: has jobs`);
      for (const [id, body] of jobs) {
        const last = steps(body).at(-1) ?? "";
        assert.match(
          last,
          /^- name: Harness down/,
          `${file} job ${id}: the last step is the harness down`,
        );
        assert.match(
          last,
          /^ {8}if: always\(\)\s*$/m,
          `${file} job ${id}: down runs even after a failure`,
        );
        assert.match(
          last,
          /node node_modules\/qa-portfolio-harness\/scripts\/down\.mjs twenty/,
          `${file} job ${id}: the down call`,
        );
      }
    }
    const lane = live(".github/workflows/p2-tw.yml");
    const study = live(".github/workflows/tw-study.yml");
    assert.deepEqual(
      triggersIn(lane),
      [...LANE_TRIGGERS],
      "the lane allows exactly workflow_call and workflow_dispatch",
    );
    assert.deepEqual(
      triggerViolations(lane, LANE_TRIGGERS),
      [],
      "no schedule, push or workflow_run",
    );
    assert.match(study, /^ {2}schedule:\n {4}- cron: /m, "the study is scheduled");
    assert.doesNotMatch(study, /pull_request:/, "the study is never a pull request check");
  });

  test("the study runs only its own cases: no dependency projects, and the anchored case selector", () => {
    const study = live(".github/workflows/tw-study.yml");
    const run = study.match(/^ +npx playwright test .*$/m)?.[0] ?? "";
    assert.match(run, /--project=tw-serial/, "the study uses the serial project");
    assert.match(run, /--no-deps/, "tw-serial depends on tw-api; the study must not run the lane");
    assert.match(run, /--grep "P2-TW-WH-010 case"/, "the selector is anchored to the study cases");
  });

  test("every lane job carries the same-repo guard, and dispatch is allowed by event name", () => {
    const jobs = jobIfs(live(".github/workflows/p2-tw.yml"));
    assert.deepEqual(
      [...jobs.keys()].sort(),
      ["tw-api", "tw-cache", "tw-multiws"],
      "the three lane jobs",
    );
    for (const [id, condition] of jobs) {
      assert.ok(condition?.includes(SAME_REPO), `${id}: the same-repo guard in if:`);
      assert.ok(condition?.includes(DISPATCH), `${id}: manual runs allowed in if:`);
    }
  });

  test("the trigger rule rejects pull_request_target, even inline", () => {
    const inline =
      "on: { pull_request: {}, pull_request_target: {} }\njobs:\n  x:\n    runs-on: ubuntu-24.04\n";
    assert.ok(
      triggerViolations(inline, LANE_TRIGGERS).length > 0,
      "inline pull_request_target must fail",
    );
    const block = "on:\n  pull_request:\n  pull_request_target:\n";
    assert.ok(
      triggerViolations(block, LANE_TRIGGERS).includes("pull_request_target"),
      "block form fails too",
    );
  });
});
