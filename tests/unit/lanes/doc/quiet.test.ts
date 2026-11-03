import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { quietState } from "../../../../src/lanes/doc/quiet.ts";

describe("quietState (A6: 'exactly once', 'N attempts' and 'none' need a quiet window)", () => {
  test("fewer than expected is under, and keeps polling", () => {
    assert.equal(quietState(0, 1, 0, 0, 5_000), "under");
    assert.equal(quietState(3, 4, 0, 99_999, 5_000), "under");
  });

  test("more than expected is over at once, even inside the window", () => {
    assert.equal(quietState(2, 1, 0, 0, 5_000), "over");
    assert.equal(quietState(5, 4, 0, 10_000, 5_000), "over");
  });

  test("the expected count inside the window is quiet, not settled", () => {
    assert.equal(quietState(1, 1, 1_000, 3_999, 3_000), "quiet");
  });

  test("the expected count with the window elapsed and no extra arrival is settled", () => {
    assert.equal(quietState(1, 1, 1_000, 4_000, 3_000), "settled");
    assert.equal(quietState(4, 4, 0, 9_000, 3_000), "settled");
  });

  test("an extra arrival in the window turns settled into over", () => {
    assert.equal(quietState(1, 1, 1_000, 4_000, 3_000), "settled");
    assert.equal(quietState(2, 1, 1_000, 4_000, 3_000), "over");
  });
});
