import type { CleanupStep } from "../../shared/cleanup.ts";

/** One cleanup step per id (src/shared/cleanup.ts): a failed removal does not stop the ids after it. */
export function removeEach(
  ids: readonly string[],
  remove: (id: string) => Promise<unknown>,
): CleanupStep[] {
  return ids.map((id) => () => remove(id));
}

interface Removable {
  remove(): Promise<unknown>;
}

/** What P2-TW-WH-009 (tests/webhooks/tw/tenant.spec.ts) made, in the order it made it. `undefined` = never made. */
export interface TenantResources {
  readonly createdInA: readonly string[];
  readonly removeInA: (id: string) => Promise<unknown>;
  readonly createdInB: readonly string[];
  /** Present once B's client exists; B's people are only created through it. */
  readonly removeInB: ((id: string) => Promise<unknown>) | undefined;
  readonly hookA: Removable;
  readonly hookB: Removable | undefined;
  readonly keyB: { revoke(): Promise<unknown> } | undefined;
  /** Deletes workspace B (activating it first when setup never did). Present once B was created. */
  readonly deleteWorkspaceB: (() => Promise<unknown>) | undefined;
}

/**
 * The tenant case's cleanup, one step per resource: A's people, B's people, both hooks, B's key, then workspace B. Run
 * through runAllThenRethrow, so a failed hook removal or key revoke still leaves workspace B deleted.
 */
export function tenantCleanupSteps(r: TenantResources): CleanupStep[] {
  const { removeInB, hookB, keyB, deleteWorkspaceB } = r;
  return [
    ...removeEach(r.createdInA, r.removeInA),
    ...(removeInB === undefined ? [] : removeEach(r.createdInB, removeInB)),
    () => r.hookA.remove(),
    ...(hookB === undefined ? [] : [() => hookB.remove()]),
    ...(keyB === undefined ? [] : [() => keyB.revoke()]),
    ...(deleteWorkspaceB === undefined ? [] : [deleteWorkspaceB]),
  ];
}
