// P2 job summary for one Playwright invocation. Usage: node scripts/write-ci-job-summary.ts <label> <report.json>
// Prints the markdown and appends it to $GITHUB_STEP_SUMMARY when that is set. Exit codes:
//   0 = summary written, or the report is missing (a warning is printed and a placeholder is written)
//   1 = wrong argument count, unreadable JSON, unsupported shape, or zero tests (named on stderr)
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import {
  formatJobSummary,
  parseJobReport,
  requireTests,
} from "../src/ci/playwright-json-summary.ts";

const args = process.argv.slice(2);
const env = process.env;
const repo = env["GITHUB_REPOSITORY"] ?? "";
const runUrl = `${env["GITHUB_SERVER_URL"] ?? "https://github.com"}/${repo}/actions/runs/${env["GITHUB_RUN_ID"] ?? ""}`;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (args.length !== 2) fail("usage: write-ci-job-summary.ts <label> <report.json>");
const [label, path] = args as [string, string];

let markdown: string;
if (!existsSync(path)) {
  process.stdout.write(
    `::warning::No Playwright JSON report at ${path} for ${label}; the job summary is incomplete.\n`,
  );
  markdown = `## P2 ${label}: run summary\n\nNo Playwright JSON report was written, so the results table is not available.\n\nRun page with the artifacts: ${runUrl}\n`;
} else {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    fail(`${path} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  try {
    const summary = parseJobReport(label, raw);
    requireTests(summary, path);
    markdown = formatJobSummary(summary, { repo, sha: env["GITHUB_SHA"] ?? "", runUrl });
  } catch (error: unknown) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

process.stdout.write(markdown);
if (env["GITHUB_STEP_SUMMARY"]) appendFileSync(env["GITHUB_STEP_SUMMARY"], markdown, "utf8");
