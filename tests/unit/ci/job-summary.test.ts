import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import {
  escapeCell,
  evidenceCell,
  formatJobSummary,
  parseJobReport,
  requireTests,
  splitDefect,
} from "../../../src/ci/playwright-json-summary.ts";

/** A Playwright-shaped JSON report with one spec per entry, all in the given project. */
function report(tests: readonly Record<string, unknown>[], project = "cal-api"): unknown {
  return {
    suites: [
      {
        specs: tests.map((t, i) => ({
          title: typeof t["title"] === "string" ? t["title"] : `spec ${String(i)}`,
          tests: [{ projectName: project, ...withoutTitle(t) }],
        })),
        suites: [],
      },
    ],
  };
}

function withoutTitle(t: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...t };
  delete copy["title"];
  return copy;
}

const ENV = { repo: "o/r", sha: "abc", runUrl: "https://example.test/run/1" };
const PROBE_FIXTURE = "tests/unit/ci/fixtures/playwright-contract.json";

describe("P2 job summary: parser (S1 to S16)", () => {
  test("S1 per-project totals come from projectName (probe fixture and a two-project report)", () => {
    const probe = JSON.parse(readFileSync(PROBE_FIXTURE, "utf8")) as unknown;
    assert.deepEqual(parseJobReport("probe", probe).projects, [
      { project: "summary-probe", passed: 1, failed: 2, skipped: 1, expectedFailures: 1, flaky: 1 },
    ]);
    const twoProjects = {
      suites: [
        {
          specs: [
            {
              title: "a",
              tests: [{ projectName: "cal-api", status: "expected", expectedStatus: "passed" }],
            },
          ],
          suites: [],
        },
        {
          specs: [
            {
              title: "b",
              tests: [
                { projectName: "cal-serial", status: "unexpected", expectedStatus: "passed" },
              ],
            },
          ],
          suites: [],
        },
      ],
    };
    assert.deepEqual(
      parseJobReport("cal", twoProjects).projects.map((p) => [p.project, p.passed, p.failed]),
      [
        ["cal-api", 1, 0],
        ["cal-serial", 0, 1],
      ],
    );
  });

  test("S2 the defect ID and evidence come from the issue annotation", () => {
    assert.deepEqual(splitDefect("B2: a receiver 500 is acknowledged as success"), {
      id: "B2",
      evidence: "a receiver 500 is acknowledged as success",
    });
    const summary = parseJobReport(
      "cal",
      report([
        {
          title: "P2-CAL-WH-003 a 500 is retried",
          status: "expected",
          expectedStatus: "failed",
          annotations: [{ type: "issue", description: "B2: evidence text (docs/a.md:338)" }],
        },
      ]),
    );
    assert.deepEqual(
      summary.expectedFailures.map((row) => [row.testId, row.defectId]),
      [["P2-CAL-WH-003", "B2"]],
    );
  });

  test("S3 a bare expected failure is listed with an empty defect and NO DEFECT ID", () => {
    const summary = parseJobReport(
      "cal",
      report([{ title: "P2-CAL-CON-001 x", status: "expected", expectedStatus: "failed" }]),
    );
    assert.equal(summary.expectedFailures[0]?.defectId, "");
    assert.match(formatJobSummary(summary, ENV), /\*\*NO DEFECT ID\*\*/);
  });

  test("S4 the invariant sweep aggregates per product", () => {
    const annotation = (text: string) => ({ type: "invariant-sweep", description: text });
    const summary = parseJobReport(
      "cal",
      report([
        {
          status: "expected",
          expectedStatus: "passed",
          annotations: [annotation("cal: 2 rules, 0 violations")],
        },
        {
          status: "expected",
          expectedStatus: "passed",
          annotations: [annotation("cal: 2 rules, 1 violations")],
        },
        {
          status: "expected",
          expectedStatus: "passed",
          annotations: [annotation("cal: 2 rules, 0 violations")],
        },
      ]),
    );
    assert.deepEqual(summary.sweeps, [{ product: "cal", rules: 2, violations: 1, tests: 3 }]);
  });

  test("S5 unexpected tests count as failed and are listed by title", () => {
    const summary = parseJobReport(
      "cal",
      report([{ title: "t-one", status: "unexpected", expectedStatus: "passed" }]),
    );
    assert.equal(summary.projects[0]?.failed, 1);
    assert.deepEqual(summary.unexpectedFailures, ["t-one"]);
  });

  test("S6 flaky and skipped count, and neither counts as passed", () => {
    const summary = parseJobReport(
      "cal",
      report([
        { status: "flaky", expectedStatus: "passed" },
        { status: "skipped", expectedStatus: "skipped" },
      ]),
    );
    assert.deepEqual(summary.projects[0], {
      project: "cal-api",
      passed: 0,
      failed: 0,
      skipped: 1,
      expectedFailures: 0,
      flaky: 1,
    });
  });

  test("S7 an expected failure that unexpectedly passed is not listed (P6 unit test: does not list an expected failure that unexpectedly passed)", () => {
    const summary = parseJobReport(
      "cal",
      report([
        {
          title: "P2-CAL-CON-003 passed after all",
          status: "expected",
          expectedStatus: "passed",
          annotations: [{ type: "issue", description: "B2: evidence" }],
        },
      ]),
    );
    assert.deepEqual(summary.expectedFailures, []);
    assert.equal(summary.projects[0]?.passed, 1);
  });

  test("S8 annotations whose type is not issue are ignored (P6 unit test: ignores annotations whose type is not issue)", () => {
    const summary = parseJobReport(
      "cal",
      report([
        {
          title: "P2-CAL-CON-004 x",
          status: "expected",
          expectedStatus: "failed",
          annotations: [{ type: "fail", description: "B2: not an issue annotation" }],
        },
      ]),
    );
    assert.equal(summary.expectedFailures[0]?.defectId, "");
  });

  test("S9 a non-object root is rejected (P6 unit test: rejects a non-object root)", () => {
    assert.throws(() => parseJobReport("x", []), /root must be an object/);
  });

  test("S10 zero tests is rejected and names the path (P6 unit test: requireTests throws on zero tests)", () => {
    const summary = parseJobReport("x", { suites: [] });
    assert.throws(() => {
      requireTests(summary, "results/x.json");
    }, /results\/x\.json contains zero tests/);
  });

  test("S11 an unsupported status fails fast with its name", () => {
    assert.throws(
      () =>
        parseJobReport("x", report([{ title: "odd", status: "weird", expectedStatus: "passed" }])),
      /unsupported test status "weird" for "odd"/,
    );
  });

  test("S12 markup in titles and evidence is escaped", () => {
    assert.equal(escapeCell("a|b\nc<b>"), "a\\|b c&lt;b&gt;");
  });

  test("S13 a docs path in evidence adds a commit-pinned link and keeps the text", () => {
    const cell = evidenceCell("x docs/a.md:5", "o/r", "abc");
    assert.ok(cell.includes("x docs/a.md:5"));
    assert.ok(cell.includes("https://github.com/o/r/blob/abc/docs/a.md#L5"));
  });

  test("S14 prose evidence stays prose", () => {
    assert.equal(evidenceCell("product bug", "o/r", "abc"), "product bug");
  });

  test("S15 a missing sweep annotation is reported as not reported", () => {
    const summary = parseJobReport(
      "cal",
      report([{ status: "expected", expectedStatus: "passed" }]),
    );
    assert.equal(summary.sweeps, undefined);
    assert.match(formatJobSummary(summary, ENV), /not reported/);
  });

  test("S16 the title list truncates at 20 and says how many were omitted", () => {
    const failing = Array.from({ length: 23 }, (_, i) => ({
      title: `t${String(i).padStart(2, "0")}`,
      status: "unexpected",
      expectedStatus: "passed",
    }));
    const text = formatJobSummary(parseJobReport("cal", report(failing)), ENV);
    assert.equal(text.split("\n").filter((line) => /^- t\d\d$/.test(line)).length, 20);
    assert.match(text, /\.\.\. and 3 more/);
  });
});

describe("P2 job summary: CLI (S17 to S20)", () => {
  const CLI = "scripts/write-ci-job-summary.ts";
  const run = (args: string[], env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [CLI, ...args], {
      encoding: "utf8",
      env: { PATH: process.env["PATH"] ?? "", ...env },
    });

  test("S17 the wrong argument count exits 1 with usage", () => {
    const res = run(["cal"]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /usage:/);
  });

  test("S18 malformed JSON exits 1 and names the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "p2-summary-"));
    try {
      const file = join(dir, "bad.json");
      writeFileSync(file, "{");
      const res = run(["cal", file]);
      assert.equal(res.status, 1);
      assert.match(res.stderr, /is not valid JSON/);
      assert.ok(res.stderr.includes(file));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("S19 a missing report exits 0, warns, and writes the placeholder", () => {
    const res = run(["cal", "results/does-not-exist.json"]);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /::warning::/);
    assert.match(res.stdout, /No Playwright JSON report/);
  });

  test("S20 the CLI appends to GITHUB_STEP_SUMMARY when it is set, and prints without it", () => {
    const dir = mkdtempSync(join(tmpdir(), "p2-summary-"));
    try {
      const summaryFile = join(dir, "step-summary.md");
      const withSummary = run(["cal", PROBE_FIXTURE], { GITHUB_STEP_SUMMARY: summaryFile });
      assert.equal(withSummary.status, 0, withSummary.stderr);
      assert.ok(readFileSync(summaryFile, "utf8").includes("## P2 cal: run summary"));
      const without = run(["cal", PROBE_FIXTURE]);
      assert.equal(without.status, 0, without.stderr);
      assert.ok(without.stdout.includes("## P2 cal: run summary"));
      assert.equal(existsSync(join(dir, "unused")), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
