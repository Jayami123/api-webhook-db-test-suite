import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const GATE = "Require the Stripe test key (never printed)";
const lines = readFileSync(".github/workflows/p2-cal.yml", "utf8").split("\n");

/** The lines of one step, from its `- name:` line up to the next step. */
function step(name: string): string[] {
  const start = lines.indexOf(`      - name: ${name}`);
  assert.ok(start >= 0, `step: ${name}`);
  const end = lines.findIndex((line, i) => i > start && /^ {6}- name: /.test(line));
  return lines.slice(start, end === -1 ? undefined : end);
}

/** The run script of one step, dedented: the same bash script the job runs for it. */
function runScript(name: string): string {
  const body = step(name);
  const at = body.indexOf("        run: |");
  assert.ok(at >= 0, `run block of ${name}`);
  return body
    .slice(at + 1)
    .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
    .join("\n");
}

function runGate(stripeKey: string | undefined) {
  const env: NodeJS.ProcessEnv = { PATH: process.env["PATH"] ?? "" };
  if (stripeKey !== undefined) env["STRIPE_API_KEY"] = stripeKey;
  const res = spawnSync("bash", ["-c", runScript(GATE)], { env, encoding: "utf8" });
  return { status: res.status, output: res.stdout + res.stderr };
}

describe("p2-cal Stripe key scope", () => {
  test("STRIPE_API_KEY is read from secrets only in the gate, harness up and the lane tests", () => {
    const steps = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => line.includes("secrets.STRIPE_API_KEY"))
      .map(({ i }) => {
        const header = lines
          .slice(0, i)
          .reverse()
          .find((l) => /^ {6}- name: /.test(l));
        return header?.replace(/^ {6}- name: /, "");
      });
    assert.deepEqual(steps, [GATE, "Harness up (cal)", "Lane tests (cal-api, then cal-serial)"]);
  });

  test("each of those steps sets it in its own step env", () => {
    for (const name of [GATE, "Harness up (cal)", "Lane tests (cal-api, then cal-serial)"]) {
      const body = step(name);
      const envAt = body.indexOf("        env:");
      assert.ok(envAt >= 0, `${name}: step env`);
      assert.equal(
        body[envAt + 1],
        "          STRIPE_API_KEY: ${{ secrets.STRIPE_API_KEY }}",
        `${name}: STRIPE_API_KEY in the step env`,
      );
    }
  });
});

describe("p2-cal Stripe test-key gate", () => {
  test("a missing secret fails with the missing-secret message", () => {
    const res = runGate(undefined);
    assert.notEqual(res.status, 0);
    assert.match(res.output, /::error::STRIPE_API_KEY is not set/);
  });

  test("a live key fails, and neither the value nor a fragment of it is printed", () => {
    const res = runGate("sk_live_unitfixture");
    assert.notEqual(res.status, 0);
    assert.match(res.output, /::error::STRIPE_API_KEY must be a Stripe test-mode secret key/);
    assert.ok(!res.output.includes("unitfixture"), "the key value is never echoed");
  });

  test("a test-mode key passes, and the value is not printed", () => {
    const res = runGate("sk_test_unitfixture");
    assert.equal(res.status, 0, res.output);
    assert.match(res.output, /STRIPE_API_KEY is a test-mode key \(value not printed\)/);
    assert.ok(!res.output.includes("unitfixture"), "the key value is never echoed");
  });
});
