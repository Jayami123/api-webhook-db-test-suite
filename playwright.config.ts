import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig, type Project } from "@playwright/test";
import { ensureRunPrefix } from "./src/run/prefix.ts";

// Local convenience only: values already in the shell (CI) win over .env.
if (existsSync(".env")) loadEnvFile(".env");
// Runs in the runner process before workers start; workers inherit P2_RUN_ID (one prefix per run).
ensureRunPrefix();

const isCI = Boolean(process.env["CI"]);

/** One project per product. Folder codes match the project names: cal, doc, med, tw. */
function apiProject(name: string, code: string): Project {
  return { name, testMatch: [`{contracts,webhooks,integration}/${code}/**/*.spec.ts`] };
}

export default defineConfig({
  testDir: "tests",
  // API tests assert exact DB counts: one worker, no retries (a retry would hide a flaky oracle).
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: isCI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results",
  reporter: isCI
    ? [
        ["list"],
        ["junit", { outputFile: "results/junit.xml" }],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ]
    : [["list"]],
  use: {
    // No browserName and no page fixture: these projects use APIRequestContext only.
    extraHTTPHeaders: { accept: "application/json" },
    trace: "retain-on-failure",
  },
  projects: [
    apiProject("cal-api", "cal"),
    apiProject("doc-api", "doc"),
    apiProject("med-api", "med"),
    apiProject("tw-api", "tw"),
  ],
});
