import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { runAllThenRethrow } from "../../../../src/lanes/med/cleanup.ts";

/** A step that records its name when it runs, then fails with `error` (or succeeds when none is given). */
function step(log: string[], name: string, error?: Error): () => Promise<unknown> {
  return () => {
    log.push(name);
    return error === undefined ? Promise.resolve() : Promise.reject(error);
  };
}

describe("runAllThenRethrow", () => {
  test("every step runs in order and the call resolves when none fails", async () => {
    const log: string[] = [];
    await runAllThenRethrow([step(log, "cancel-1"), step(log, "cancel-2"), step(log, "label")]);
    assert.deepEqual(log, ["cancel-1", "cancel-2", "label"]);
  });

  test("a forced first cancel failure: the later cancels, the label and the location are still tried, then the first error is rethrown", async () => {
    const log: string[] = [];
    const cancelError = new Error("cancel 500");
    await assert.rejects(
      runAllThenRethrow([
        step(log, "cancel-1", cancelError),
        step(log, "cancel-2"),
        step(log, "label"),
        step(log, "location"),
      ]),
      (err: unknown) => err === cancelError,
    );
    assert.deepEqual(log, ["cancel-1", "cancel-2", "label", "location"], "no step is skipped");
  });

  test("when two steps fail, the first failure is the one rethrown and the second does not replace it", async () => {
    const log: string[] = [];
    const first = new Error("first");
    await assert.rejects(
      runAllThenRethrow([
        step(log, "a", first),
        step(log, "b", new Error("second")),
        step(log, "c"),
      ]),
      (err: unknown) => err === first,
    );
    assert.deepEqual(log, ["a", "b", "c"]);
  });
});
