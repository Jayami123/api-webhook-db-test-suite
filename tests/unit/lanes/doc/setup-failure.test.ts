import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { withEnvelopeRemovedOnFailure } from "../../../../src/lanes/doc/setup-failure.ts";

function fakeRemove(failWith?: Error): {
  remove: (id: string) => Promise<unknown>;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    remove: (id: string) => {
      calls.push(id);
      return failWith === undefined ? Promise.resolve() : Promise.reject(failWith);
    },
  };
}

describe("withEnvelopeRemovedOnFailure", () => {
  test("a success returns the steps' value and removes nothing", async () => {
    const fake = fakeRemove();
    const value = await withEnvelopeRemovedOnFailure("env-1", fake.remove, () =>
      Promise.resolve(42),
    );
    assert.equal(value, 42);
    assert.deepEqual(fake.calls, []);
  });

  test("a failure after create removes the envelope and rethrows the original error", async () => {
    const fake = fakeRemove();
    const original = new Error("distribute answered 500");
    await assert.rejects(
      withEnvelopeRemovedOnFailure("env-2", fake.remove, () => Promise.reject(original)),
      (error: unknown) => {
        assert.equal(error, original, "the thrown error is the original object");
        assert.equal(error instanceof Error ? error.message : "", "distribute answered 500");
        return true;
      },
    );
    assert.deepEqual(fake.calls, ["env-2"]);
    assert.equal(original.cause, undefined, "no removal failure, so no cause is attached");
  });

  test("a failed removal is attached to the original error's cause, and the original still rethrows", async () => {
    const removeError = new Error("delete answered 500");
    const fake = fakeRemove(removeError);
    const original = new Error("sign answered 400");
    await assert.rejects(
      withEnvelopeRemovedOnFailure("env-3", fake.remove, () => Promise.reject(original)),
      (error: unknown) => {
        assert.equal(error, original, "the original error is the one thrown");
        return true;
      },
    );
    assert.deepEqual(fake.calls, ["env-3"]);
    const cause = original.cause;
    assert.ok(cause instanceof AggregateError, "the removal failure is kept in the cause");
    assert.equal(cause.errors[0], removeError);
  });
});
