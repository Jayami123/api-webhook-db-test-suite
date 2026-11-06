// Ported from https://github.com/Jayami123/k6-load-concurrency-suite, src/ci/playwright-json-summary.ts (P6),
// itself a port of the P1 module. P2 changes: per-project totals (projectName), invariant-sweep rows,
// unexpected-failure titles, markup escaping, fail-fast on unknown statuses, one report per call.
// Keep in sync by hand. erasableSyntaxOnly: no enums, no parameter properties, no namespaces.

export interface ProjectTotals {
  readonly project: string;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly expectedFailures: number;
  readonly flaky: number;
}

export interface ExpectedFailureRow {
  readonly testId: string; // "" when the title has no ID
  readonly title: string;
  readonly defectId: string; // "" when there is no issue annotation
  readonly evidence: string;
}

export interface SweepRow {
  readonly product: string;
  readonly rules: number;
  readonly violations: number;
  readonly tests: number;
}

export interface JobSummary {
  readonly label: string;
  readonly projects: readonly ProjectTotals[];
  readonly expectedFailures: readonly ExpectedFailureRow[];
  readonly unexpectedFailures: readonly string[];
  readonly sweeps: readonly SweepRow[] | undefined; // undefined = no sweep annotation in the report
}

const ISSUE = "issue";
const SWEEP = "invariant-sweep";
const KNOWN_STATUSES = ["expected", "unexpected", "flaky", "skipped"] as const;
const TEST_ID = /^(P[0-9]?-[A-Z0-9]+(?:-[A-Z0-9]+)+)/;
const SWEEP_TEXT = /^(.+?): (\d+) rules, (\d+) violations$/;
const LIST_CAP = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The description of the first annotation of this type, or undefined. Other types are ignored (P6 :191). */
export function annotationOf(annotations: unknown, type: string): string | undefined {
  if (!Array.isArray(annotations)) return undefined;
  for (const annotation of annotations) {
    if (!isRecord(annotation) || annotation["type"] !== type) continue;
    const description = annotation["description"];
    if (typeof description === "string" && description.trim() !== "") return description;
  }
  return undefined;
}

/** "B2: a receiver 500 ..." becomes { id: "B2", evidence: "a receiver 500 ..." }. */
export function splitDefect(description: string): { id: string; evidence: string } {
  const at = description.indexOf(":");
  if (at < 0) return { id: description.trim(), evidence: "" };
  return { id: description.slice(0, at).trim(), evidence: description.slice(at + 1).trim() };
}

interface Visited {
  readonly title: string;
  readonly project: string;
  readonly node: Record<string, unknown>;
}

function visit(suites: unknown, out: Visited[]): void {
  if (!Array.isArray(suites)) return;
  for (const suite of suites) {
    if (!isRecord(suite)) continue;
    if (Array.isArray(suite["specs"])) {
      for (const spec of suite["specs"]) {
        if (!isRecord(spec) || !Array.isArray(spec["tests"])) continue;
        for (const node of spec["tests"]) {
          if (!isRecord(node)) continue;
          const project =
            typeof node["projectName"] === "string" ? node["projectName"] : "(no project)";
          out.push({
            title: typeof spec["title"] === "string" ? spec["title"] : "",
            project,
            node,
          });
        }
      }
    }
    visit(suite["suites"], out);
  }
}

/** Throws (fail fast) on a non-object root or an unknown test status. */
export function parseJobReport(label: string, raw: unknown): JobSummary {
  if (!isRecord(raw)) throw new Error("Playwright JSON report root must be an object");
  const tests: Visited[] = [];
  visit(raw["suites"], tests);

  type Counts = {
    passed: number;
    failed: number;
    skipped: number;
    expectedFailures: number;
    flaky: number;
  };
  const byProject = new Map<string, Counts>();
  const expectedFailures: ExpectedFailureRow[] = [];
  const unexpectedFailures: string[] = [];
  const sweeps = new Map<string, { rules: number; violations: number; tests: number }>();
  let sawSweep = false;

  for (const { title, project, node } of tests) {
    const counts: Counts = byProject.get(project) ?? {
      passed: 0,
      failed: 0,
      skipped: 0,
      expectedFailures: 0,
      flaky: 0,
    };
    const status = node["status"];
    if (typeof status !== "string" || !(KNOWN_STATUSES as readonly string[]).includes(status)) {
      throw new Error(
        `unsupported test status ${JSON.stringify(status)} for "${title}" in project ${project}`,
      );
    }
    if (status === "skipped") counts.skipped += 1;
    else if (status === "flaky") counts.flaky += 1;
    else if (status === "unexpected") {
      counts.failed += 1;
      unexpectedFailures.push(title);
    } else if (node["expectedStatus"] === "failed") {
      counts.expectedFailures += 1;
      const defect = annotationOf(node["annotations"], ISSUE);
      const parts = defect === undefined ? { id: "", evidence: "" } : splitDefect(defect);
      expectedFailures.push({
        testId: TEST_ID.exec(title)?.[1] ?? "",
        title,
        defectId: parts.id,
        evidence: parts.evidence,
      });
    } else {
      counts.passed += 1;
    }
    byProject.set(project, counts);

    const sweep = annotationOf(node["annotations"], SWEEP);
    if (sweep !== undefined) {
      sawSweep = true;
      const match = SWEEP_TEXT.exec(sweep);
      if (match !== null) {
        const product = match[1] ?? "";
        const current = sweeps.get(product) ?? { rules: Number(match[2]), violations: 0, tests: 0 };
        current.violations += Number(match[3]);
        current.tests += 1;
        sweeps.set(product, current);
      }
    }
  }

  return {
    label,
    projects: [...byProject].map(([project, c]) => ({ project, ...c })),
    expectedFailures,
    unexpectedFailures,
    sweeps: sawSweep ? [...sweeps].map(([product, s]) => ({ product, ...s })) : undefined,
  };
}

/** Throws when the report ran no tests, naming the path (P6 :199). */
export function requireTests(summary: JobSummary, path: string): void {
  const total = summary.projects.reduce(
    (sum, p) => sum + p.passed + p.failed + p.skipped + p.expectedFailures + p.flaky,
    0,
  );
  if (total === 0) throw new Error(`${path} contains zero tests`);
}

/** Markdown table safety for arbitrary text (titles and evidence). */
export function escapeCell(text: string): string {
  return text
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Evidence that names a docs/ path adds a commit-pinned link. The evidence text is always kept. */
export function evidenceCell(evidence: string, repo: string, sha: string): string {
  if (evidence === "") return "(none)";
  const text = escapeCell(evidence);
  const path = /(docs\/[\w./-]+?\.md)(?::(\d+))?/.exec(evidence);
  if (path === null) return text;
  const file = path[1] ?? "";
  const line = path[2] !== undefined ? `#L${path[2]}` : "";
  return `${text} ([${file}](https://github.com/${repo}/blob/${sha}/${file}${line}))`;
}

export function formatJobSummary(
  s: JobSummary,
  env: { repo: string; sha: string; runUrl: string },
): string {
  const lines: string[] = [`## P2 ${s.label}: run summary`, ""];
  lines.push(
    "| project | passed | failed | skipped | expected failures | flaky |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  );
  const total = { passed: 0, failed: 0, skipped: 0, expectedFailures: 0, flaky: 0 };
  for (const row of s.projects) {
    lines.push(
      `| ${escapeCell(row.project)} | ${row.passed} | ${row.failed} | ${row.skipped} | ${row.expectedFailures} | ${row.flaky} |`,
    );
    total.passed += row.passed;
    total.failed += row.failed;
    total.skipped += row.skipped;
    total.expectedFailures += row.expectedFailures;
    total.flaky += row.flaky;
  }
  lines.push(
    `| **total** | **${total.passed}** | **${total.failed}** | **${total.skipped}** | **${total.expectedFailures}** | **${total.flaky}** |`,
    "",
  );

  if (s.expectedFailures.length > 0) {
    lines.push(
      "### Expected failures (known defects, still reproducing)",
      "",
      "| test ID | test | defect | evidence |",
      "| --- | --- | --- | --- |",
    );
    for (const row of s.expectedFailures) {
      const defect = row.defectId === "" ? "**NO DEFECT ID**" : escapeCell(row.defectId);
      lines.push(
        `| ${escapeCell(row.testId || "(no ID)")} | ${escapeCell(row.title)} | ${defect} | ${evidenceCell(row.evidence, env.repo, env.sha)} |`,
      );
    }
    lines.push("");
  } else {
    lines.push("Known defects still reproducing: none", "");
  }

  if (s.unexpectedFailures.length > 0) {
    lines.push("### Unexpected failures", "");
    for (const title of s.unexpectedFailures.slice(0, LIST_CAP))
      lines.push(`- ${escapeCell(title)}`);
    const omitted = s.unexpectedFailures.length - LIST_CAP;
    if (omitted > 0) lines.push(`- ... and ${omitted} more (see the JUnit or the HTML report)`);
    lines.push("");
  }

  lines.push("### Invariant sweep", "");
  if (s.sweeps === undefined) {
    lines.push("Invariant sweep: not reported in this run's JSON (no sweep annotation found).", "");
  } else {
    for (const sweep of s.sweeps) {
      lines.push(
        `- ${escapeCell(sweep.product)}: ${sweep.rules} rules, ${sweep.violations} violations (${sweep.tests} tests swept)`,
      );
    }
    lines.push("");
  }

  lines.push(`Run page with the artifacts: ${env.runUrl}`, "");
  return lines.join("\n");
}
