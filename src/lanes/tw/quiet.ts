/**
 * Pure state for a bounded quiet check (no sleep). The spec polls it:
 *   await expect.poll(() => quietState({...}), { timeout: TW_QUIET_TIMEOUT_MS, intervals: POLL_INTERVALS }).toBe("quiet");
 * "quiet" only when the count is unchanged AND the window has passed; a second delivery is "changed:N" and never quiet.
 */
export interface QuietInput {
  readonly count: number;
  readonly expected: number;
  readonly startedMs: number;
  readonly nowMs: number;
  readonly windowMs: number;
}

export function quietState(input: QuietInput): string {
  if (input.count !== input.expected) return `changed:${input.count}`;
  return input.nowMs - input.startedMs >= input.windowMs ? "quiet" : "waiting";
}
