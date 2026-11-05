import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeLike } from "../../../../src/run/prefix.ts";
import {
  payloadNamesTest,
  TASK_ROWS_SQL,
  taskPayloadPattern,
} from "../../../../src/lanes/cal/tasks.ts";

/** A LIKE matcher with ESCAPE '\' (the semantics the SQL relies on), for checking the pattern offline. */
function likeMatch(value: string, pattern: string): boolean {
  let re = "^";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i] ?? "";
    if (ch === "\\" && i + 1 < pattern.length) {
      re += (pattern[i + 1] ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      i += 1;
    } else if (ch === "%") re += ".*";
    else if (ch === "_") re += ".";
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${re}$`, "s").test(value);
}

test("taskPayloadPattern escapes the LIKE wildcards in the run prefix", () => {
  assert.equal(taskPayloadPattern("a_b%c"), "%a\\_b\\%c%");
});

test("TASK_ROWS_SQL declares ESCAPE and selects the due flag from scheduledAt", () => {
  assert.match(TASK_ROWS_SQL, /ESCAPE '\\'/);
  assert.match(TASK_ROWS_SQL, /"scheduledAt" <= now\(\)/);
});

test("a run prefix with an underscore does not match a different run's payload", () => {
  const mine = "p2-qa-run_1";
  const other = "p2-qa-runx1";
  const payload = `https://receiver/r/${other}/t1`;
  assert.equal(likeMatch(payload, taskPayloadPattern(mine)), false);
  assert.equal(likeMatch(`https://receiver/r/${mine}/t1`, taskPayloadPattern(mine)), true);
  assert.equal(escapeLike(mine), "p2-qa-run\\_1");
});

test("the task-row match is anchored: cal-task-001 does not match a cal-task-001f payload (review A9)", () => {
  const prefix = "p2-qa-20261103t040000z-0a1b2c3d";
  const short = `{"subscriberUrl":"http://127.0.0.1:4317/r/${prefix}/cal-task-001"}`;
  const longer = `{"subscriberUrl":"http://127.0.0.1:4317/r/${prefix}/cal-task-001f"}`;
  assert.equal(payloadNamesTest(short, prefix, "cal-task-001"), true);
  assert.equal(payloadNamesTest(longer, prefix, "cal-task-001"), false);
  assert.equal(payloadNamesTest(longer, prefix, "cal-task-001f"), true);
});

test("the anchored match is literal in the run prefix and the test id (no regex meaning)", () => {
  const prefix = "p2-qa-20261103t040000z-0a1b2c3d";
  const payload = `{"subscriberUrl":"http://127.0.0.1:4317/r/${prefix}/a.b"}`;
  assert.equal(payloadNamesTest(payload, prefix, "a.b"), true);
  assert.equal(payloadNamesTest(payload, prefix, "axb"), false);
});
