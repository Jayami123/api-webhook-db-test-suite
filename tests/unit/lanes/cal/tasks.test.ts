import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeLike } from "../../../../src/run/prefix.ts";
import { TASK_ROWS_SQL, taskPayloadPattern } from "../../../../src/lanes/cal/tasks.ts";

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
