import { runAllThenRethrow } from "../../shared/cleanup.ts";

/**
 * Runs the steps that follow a resource's creation. If any of them throws, the resource is removed and the original
 * error is rethrown (the same object, so the failure keeps its message and stack). A failed removal is not dropped:
 * runAllThenRethrow attaches it to the original error's `cause`. Without this, a fixture that fails after creating a
 * resource leaks it, and the leak sweep then reports the leak instead of the error.
 */
export async function withRemovedOnFailure<Id, T>(
  id: Id,
  remove: (id: Id) => Promise<unknown>,
  steps: () => Promise<T>,
): Promise<T> {
  try {
    return await steps();
  } catch (error) {
    await runAllThenRethrow([
      () => {
        throw error; // the original value, unchanged
      },
      () => remove(id),
    ]);
    // runAllThenRethrow always throws here (it was given at least one failure), so this line is not reached.
    throw error;
  }
}

/** The envelope form of withRemovedOnFailure, used by the envelope fixtures. */
export function withEnvelopeRemovedOnFailure<T>(
  envelopeId: string,
  remove: (id: string) => Promise<unknown>,
  steps: () => Promise<T>,
): Promise<T> {
  return withRemovedOnFailure(envelopeId, remove, steps);
}
