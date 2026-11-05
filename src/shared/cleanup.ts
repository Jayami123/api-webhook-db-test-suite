/** One cleanup step: removes one resource. A step that throws (or rejects) does not stop the steps after it. */
export type CleanupStep = () => Promise<unknown>;

/**
 * Runs every step in order, even after one fails, then rethrows the first failure (the original error
 * object, so `toThrow`/`rejects` identity checks still hold). A cleanup that stops at its first error
 * leaves the later rows behind, so every cleanup goes through this, one step per resource.
 *
 * Later failures are never dropped: they are attached to the first error's `cause` as an AggregateError
 * (`errors` holds them in step order). A `cause` the first error already had is kept as that
 * AggregateError's own `cause`, so the original chain is still reachable. A first failure that is not
 * an extensible Error (a thrown string, a frozen error) cannot carry them, so an AggregateError of every
 * failure, first one first, is thrown instead.
 *
 * Teardown asserts belong after this call, never in a `finally` that would replace the original error.
 */
export async function runAllThenRethrow(steps: readonly CleanupStep[]): Promise<void> {
  const errors: unknown[] = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 0) return;
  const [first, ...later] = errors;
  if (later.length === 0) throw first;
  if (!(first instanceof Error) || !Object.isExtensible(first) || isLocked(first, "cause")) {
    throw new AggregateError(errors, `${errors.length} cleanup steps failed: ${summary(errors)}`);
  }
  const message = `${later.length} later cleanup step(s) also failed: ${summary(later)}`;
  const laterErrors =
    "cause" in first
      ? new AggregateError(later, message, { cause: first.cause })
      : new AggregateError(later, message);
  Object.defineProperty(first, "cause", {
    value: laterErrors,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  throw first;
}

/** True when `key` is an own property that cannot be redefined. */
function isLocked(target: object, key: string): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  return descriptor !== undefined && descriptor.configurable === false;
}

function summary(errors: readonly unknown[]): string {
  return errors.map((e) => (e instanceof Error ? e.message : String(e))).join("; ");
}
