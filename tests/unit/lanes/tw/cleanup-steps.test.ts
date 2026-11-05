import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { runAllThenRethrow } from "../../../../src/shared/cleanup.ts";
import { removeEach, tenantCleanupSteps } from "../../../../src/lanes/tw/cleanup-steps.ts";

/** A fake resource: records its name in `log` when called, and throws `failWith` if given. */
function fake(log: string[], name: string, failWith?: Error): () => Promise<void> {
  return () => {
    log.push(name);
    return failWith === undefined ? Promise.resolve() : Promise.reject(failWith);
  };
}

describe("removeEach", () => {
  test("a failed removal does not stop the ids after it", async () => {
    const log: string[] = [];
    const boom = new Error("remove p2 failed");
    const steps = removeEach(["p1", "p2", "p3"], (id) =>
      fake(log, id, id === "p2" ? boom : undefined)(),
    );
    await assert.rejects(runAllThenRethrow(steps), (err) => err === boom);
    assert.deepEqual(log, ["p1", "p2", "p3"]);
  });
});

describe("tenantCleanupSteps", () => {
  test("workspace B is still deleted when hook A's removal throws, and the hook error is the one rethrown", async () => {
    const log: string[] = [];
    const hookError = new Error("cleanup: remove hook A: 500");
    const steps = tenantCleanupSteps({
      createdInA: ["a1", "a2"],
      removeInA: (id) => fake(log, `person ${id}`)(),
      createdInB: ["b1"],
      removeInB: (id) => fake(log, `person ${id}`)(),
      hookA: { remove: fake(log, "hook A", hookError) },
      hookB: { remove: fake(log, "hook B") },
      keyB: { revoke: fake(log, "key B") },
      deleteWorkspaceB: fake(log, "workspace B"),
    });
    await assert.rejects(runAllThenRethrow(steps), (err) => err === hookError);
    assert.deepEqual(log, [
      "person a1",
      "person a2",
      "person b1",
      "hook A",
      "hook B",
      "key B",
      "workspace B",
    ]);
  });

  test("workspace B is still deleted when hook B's removal and the key revoke both throw; both errors are kept", async () => {
    const log: string[] = [];
    const hookError = new Error("remove hook B");
    const keyError = new Error("revoke key B");
    const steps = tenantCleanupSteps({
      createdInA: [],
      removeInA: (id) => fake(log, id)(),
      createdInB: [],
      removeInB: (id) => fake(log, id)(),
      hookA: { remove: fake(log, "hook A") },
      hookB: { remove: fake(log, "hook B", hookError) },
      keyB: { revoke: fake(log, "key B", keyError) },
      deleteWorkspaceB: fake(log, "workspace B"),
    });
    await assert.rejects(runAllThenRethrow(steps), (err) => {
      assert.equal(err, hookError);
      assert.ok(hookError.cause instanceof AggregateError);
      assert.deepEqual(hookError.cause.errors, [keyError]);
      return true;
    });
    assert.ok(log.includes("workspace B"));
  });

  test("resources never made add no steps", async () => {
    const log: string[] = [];
    const steps = tenantCleanupSteps({
      createdInA: ["a1"],
      removeInA: (id) => fake(log, id)(),
      createdInB: [],
      removeInB: undefined,
      hookA: { remove: fake(log, "hook A") },
      hookB: undefined,
      keyB: undefined,
      deleteWorkspaceB: undefined,
    });
    await runAllThenRethrow(steps);
    assert.deepEqual(log, ["a1", "hook A"]);
  });
});
