import type { MedusaClient } from "../../clients/medusa.ts";
import { runScopedName } from "../../run/prefix.ts";
import type { LaneClient } from "./lane-client.ts";

/**
 * Removes everything one test label created: products (by run-scoped title prefix, every page),
 * guest customers (by email prefix) and the lane's regions. Every step runs even when an earlier one
 * fails; the first failure is then rethrown, so a cleanup problem is never hidden (AGENTS.md).
 */
export async function cleanupLabel(
  lane: LaneClient,
  med: MedusaClient,
  label: string,
): Promise<void> {
  const steps: (() => Promise<unknown>)[] = [
    () => lane.removeProductsByPrefix(runScopedName(label)),
    () => med.admin.deleteCustomersByEmailPrefix(runScopedName(label)),
    () => lane.releaseRegions(),
  ];
  await runAllThenRethrow(steps);
}

/**
 * Runs every step in order, even after one fails, then rethrows the first failure (the original error object).
 * A cleanup that stops at its first error leaves the later rows behind, so every cleanup uses this.
 */
export async function runAllThenRethrow(steps: readonly (() => Promise<unknown>)[]): Promise<void> {
  let first: { readonly error: unknown } | undefined;
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      first ??= { error };
    }
  }
  if (first !== undefined) throw first.error;
}
