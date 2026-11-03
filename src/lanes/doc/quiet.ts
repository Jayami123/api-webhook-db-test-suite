/**
 * A6: "exactly once", "N attempts" and "none" are only proven after a quiet window with no extra arrival.
 *
 * quietState reads the count of what arrived (mails, deliveries, jobs, reminders) against the expected count:
 * - "over":    more arrived than expected. Fails at once; an extra arrival never heals.
 * - "under":   fewer arrived so far. Keep polling until the deadline.
 * - "quiet":   the expected count is reached, but the window since it was reached has not elapsed.
 * - "settled": the expected count is reached and the window has elapsed with no extra arrival.
 *
 * Pure: the caller supplies the clock (windowStartedMs is when the count first reached expected).
 */
export type QuietState = "over" | "under" | "quiet" | "settled";

export function quietState(
  count: number,
  expected: number,
  windowStartedMs: number,
  nowMs: number,
  windowMs: number,
): QuietState {
  if (count > expected) return "over";
  if (count < expected) return "under";
  return nowMs - windowStartedMs >= windowMs ? "settled" : "quiet";
}
