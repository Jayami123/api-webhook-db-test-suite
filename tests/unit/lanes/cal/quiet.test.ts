import assert from "node:assert/strict";
import { test } from "node:test";
import { SLO } from "../../../../src/slo.ts";
import {
  CAL_CRON_TICK_MS,
  CAL_QUIET_POLL_SLACK_MS,
  CAL_QUIET_POLL_TIMEOUT_MS,
  CAL_SCH002_ROW_POLL_MS,
  CAL_QUIET_TEST_BUDGET_MS,
  CAL_QUIET_WINDOW_MS,
  quietState,
} from "../../../../src/lanes/cal/quiet.ts";

const W = CAL_QUIET_WINDOW_MS;

test("the quiet window is one cron tick plus the delivery-budget margin", () => {
  assert.equal(CAL_CRON_TICK_MS, 60_000);
  assert.equal(CAL_QUIET_WINDOW_MS, 70_000);
});

test("the per-test budget is the quiet poll (window plus slack) plus SCH-002's row poll", () => {
  assert.equal(CAL_QUIET_POLL_TIMEOUT_MS, CAL_QUIET_WINDOW_MS + CAL_QUIET_POLL_SLACK_MS);
  assert.equal(CAL_QUIET_TEST_BUDGET_MS, CAL_QUIET_POLL_TIMEOUT_MS + CAL_SCH002_ROW_POLL_MS);
  assert.equal(CAL_SCH002_ROW_POLL_MS, SLO.calWebhookDelivery.ms);
  assert.ok(CAL_QUIET_TEST_BUDGET_MS > 60_000, "above the shared 60 s test timeout");
});

test("inside the window the state is waiting, whatever the count below the expected", () => {
  assert.equal(quietState(0, 1, 0, W - 1, W), "waiting");
  assert.equal(quietState(1, 1, 0, W - 1, W), "waiting");
});

test("after the window, the exact expected count is quiet (none: 0, once: 1)", () => {
  assert.equal(quietState(0, 0, 0, W, W), "quiet");
  assert.equal(quietState(1, 1, 0, W, W), "quiet");
});

test("a second delivery is exceeded at once, even inside the window", () => {
  assert.equal(quietState(2, 1, 0, 1, W), "exceeded");
  assert.equal(quietState(1, 0, 0, 1, W), "exceeded");
});

test("below the expected count after the window is missing", () => {
  assert.equal(quietState(0, 1, 0, W, W), "missing");
});
