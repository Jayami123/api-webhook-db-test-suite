/** Lane job timeout (Task 6 D4: `timeout-minutes: 30`). A run older than this is dead, not running. */
export const JOB_TIMEOUT_MS = 30 * 60 * 1000;

const PREFIX_IN_NAME = /^(p2-qa-(\d{4})(\d{2})(\d{2})t(\d{2})(\d{2})(\d{2})z-[0-9a-f]{8})(?:-|$)/;

/** The UTC start of a run, read from its name's prefix `p2-qa-<yyyymmddThhmmssZ>-<8 hex>` (Task 1 D9). */
export function runStartedAt(name: string): number | undefined {
  const m = PREFIX_IN_NAME.exec(name);
  if (m === null) return undefined;
  return Date.UTC(
    Number(m[2]),
    Number(m[3]) - 1,
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
    Number(m[7]),
  );
}

export interface Leftover {
  readonly id: string;
  readonly name: string;
}

/**
 * Pure. Selects only leftovers whose name carries a run prefix (the pattern of Task 1 D9), that do NOT belong to the
 * current run, and whose run started at least `jobTimeoutMs` ago. Anything else is never touched.
 */
export function selectStaleLeftovers(input: {
  readonly leftovers: readonly Leftover[];
  readonly currentPrefix: string;
  readonly nowMs: number;
  readonly jobTimeoutMs: number;
}): Leftover[] {
  return input.leftovers.filter((leftover) => {
    const m = PREFIX_IN_NAME.exec(leftover.name);
    if (m === null || m[1] === input.currentPrefix) return false;
    const started = runStartedAt(leftover.name);
    return started !== undefined && input.nowMs - started >= input.jobTimeoutMs;
  });
}
