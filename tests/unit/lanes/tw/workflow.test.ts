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

  test("each lane job ends with an always() harness down step, and each triggers only on its own events", () => {
    const lane = live(".github/workflows/p2-tw.yml");
    const study = live(".github/workflows/tw-study.yml");
    for (const text of [lane, study]) {
      const last = steps(text).at(-1) ?? "";
      assert.match(last, /^- name: Harness down/, "the last step is the harness down");
      assert.match(last, /^ {8}if: always\(\)\s*$/m, "down runs even after a failure");
      assert.match(last, /node node_modules\/qa-portfolio-harness\/scripts\/down\.mjs twenty/);
    }
    assert.match(lane, /^on:\n {2}pull_request:\s*\n/m, "the lane job runs on pull_request only");
    assert.doesNotMatch(
      lane,
      /schedule:|workflow_dispatch:|push:/,
      "no schedule, dispatch or push trigger on the lane",
    );
    assert.match(study, /^ {2}schedule:\n {4}- cron: /m, "the study is scheduled");
    assert.doesNotMatch(study, /pull_request:/, "the study is never a pull request check");
  });
});
