import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { runAllThenRethrow, type CleanupStep } from "../../../src/shared/cleanup.ts";

/** A step that records its name when it runs, then fails with `error` (or succeeds when none is given). */
function step(log: string[], name: string, error?: Error): CleanupStep {
  return async () => {
    await Promise.resolve();
    log.push(name);
    if (error !== undefined) throw error;
  };
}

/** A step that throws `value` as is, which need not be an Error (some libraries throw strings). */
function throwsValue(value: unknown): CleanupStep {
  return async () => {
    await Promise.resolve();
    throw value;
  };
}

describe("runAllThenRethrow", () => {
  test("every step runs in order and the call resolves when none fails", async () => {
    const log: string[] = [];
    await runAllThenRethrow([step(log, "a"), step(log, "b"), step(log, "c")]);
    assert.deepEqual(log, ["a", "b", "c"]);
  });

  test("the 2nd step fails: the 3rd still runs, then the 2nd's error is rethrown unchanged", async () => {
    const log: string[] = [];
    const second = new Error("second");
    await assert.rejects(
      runAllThenRethrow([step(log, "a"), step(log, "b", second), step(log, "c")]),
      (err: unknown) => err === second,
    );
    assert.deepEqual(log, ["a", "b", "c"], "no step is skipped");
    assert.equal(second.cause, undefined, "a single failure gets no added cause");
  });

  test("a step that throws synchronously does not stop the later steps", async () => {
    const log: string[] = [];
    const boom = new Error("sync");
    const throwsSync: CleanupStep = () => {
      log.push("sync");
      throw boom;
    };
    await assert.rejects(
      runAllThenRethrow([throwsSync, step(log, "after")]),
      (err: unknown) => err === boom,
    );
    assert.deepEqual(log, ["sync", "after"]);
  });

  test("two steps fail: the first error is the one thrown and both are reported", async () => {
    const log: string[] = [];
    const first = new Error("first");
    const second = new Error("second");
    await assert.rejects(
      runAllThenRethrow([step(log, "a", first), step(log, "b", second), step(log, "c")]),
      (err: unknown) => err === first,
    );
    assert.deepEqual(log, ["a", "b", "c"]);
    assert.ok(first.cause instanceof AggregateError, "later failures ride on the first's cause");
    assert.deepEqual(first.cause.errors, [second]);
    assert.match(first.cause.message, /1 later cleanup step\(s\) also failed: second/);
  });

  test("a cause the first error already had stays reachable under the added AggregateError", async () => {
    const original = new Error("root");
    const first = new Error("first", { cause: original });
    const second = new Error("second");
    await assert.rejects(
      runAllThenRethrow([step([], "a", first), step([], "b", second)]),
      (err: unknown) => err === first,
    );
    assert.ok(first.cause instanceof AggregateError);
    assert.deepEqual(first.cause.errors, [second]);
    assert.equal(first.cause.cause, original);
  });

  test("a first failure that cannot carry a cause: an AggregateError of every failure, first first", async () => {
    const second = new Error("second");
    const frozen = Object.freeze(new Error("frozen"));
    for (const first of ["not an Error", frozen]) {
      await assert.rejects(
        runAllThenRethrow([throwsValue(first), step([], "b", second)]),
        (err: unknown) => {
          assert.ok(err instanceof AggregateError);
          assert.deepEqual(err.errors, [first, second]);
          assert.match(err.message, /^2 cleanup steps failed: /);
          return true;
        },
      );
    }
  });
});
