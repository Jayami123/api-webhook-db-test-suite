import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { quietState } from "../../../../src/lanes/tw/quiet.ts";

describe("quietState", () => {
  test("waits while the window is open and the count is unchanged", () => {
    assert.equal(
      quietState({ count: 1, expected: 1, startedMs: 0, nowMs: 4_999, windowMs: 5_000 }),
      "waiting",
    );
  });

  test("is quiet once the window has passed with the count unchanged", () => {
    assert.equal(
      quietState({ count: 1, expected: 1, startedMs: 0, nowMs: 5_000, windowMs: 5_000 }),
      "quiet",
    );
  });

  test("reports changed when a second delivery arrives inside the window", () => {
    assert.equal(
      quietState({ count: 2, expected: 1, startedMs: 0, nowMs: 1_000, windowMs: 5_000 }),
      "changed:2",
    );
  });
});
