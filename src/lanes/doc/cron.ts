/** Every quarter hour: the cron expression "every 15 minutes" (seal-document-sweep.ts:18 and the other three sweeps). */
export const CRON_PERIOD_MS = 15 * 60_000;
/** Dispatch lag allowed after the quarter hour (RR-TICK: 10 to 34 s observed; margin 2 min). */
export const CRON_TICK_MARGIN_MS = 120_000;

/** The next quarter hour strictly after nowMs (UTC minutes 00, 15, 30, 45; seconds and ms zero). */
export function nextQuarterHourMs(nowMs: number): number {
  return Math.floor(nowMs / CRON_PERIOD_MS) * CRON_PERIOD_MS + CRON_PERIOD_MS;
}

/** Deadline for one tick, in ms from now: the next quarter hour plus the margin. */
export function tickDeadlineMs(nowMs: number): number {
  return nextQuarterHourMs(nowMs) + CRON_TICK_MARGIN_MS - nowMs;
}
