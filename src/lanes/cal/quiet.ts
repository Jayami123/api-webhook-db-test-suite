import { SLO } from "../../slo.ts";

/**
 * Quiet window for "none" and "once" assertions (review A8, decision 6 revised).
 *
 * Basis. One full product cron tick: the webhook-triggers cron is every minute ("* * * * *") at the pin c2b7ac4
 * (.github/workflows/cron-webhooks-triggers.yml, line 8), so a row that becomes due can be picked up on any tick.
 * Margin: the tick's start jitter is not measured here (the product cron runs on GitHub's schedulers, not on this
 * stack). The margin is the scheduled-delivery budget, SLO.calWebhookDelivery (10 s), as the stated policy bound.
 * The measured jitter is UNVERIFIED and is recorded as an open item in the probe record.
 */
export const CAL_CRON_TICK_MS = 60_000;
export const CAL_TICK_MARGIN_MS: number = SLO.calWebhookDelivery.ms;
export const CAL_QUIET_WINDOW_MS: number = CAL_CRON_TICK_MS + CAL_TICK_MARGIN_MS;

/**
 * Poll slack past the window: each quiet poll runs for the window plus this, so the poll is still running when the window
 * closes and can report "quiet" (POLL_INTERVALS ends a poll up to one 100 ms step early; src/slo.ts). Policy bound.
 */
export const CAL_QUIET_POLL_SLACK_MS = 2_000;
/** The quiet poll's own deadline: the window plus the slack. */
export const CAL_QUIET_POLL_TIMEOUT_MS: number = CAL_QUIET_WINDOW_MS + CAL_QUIET_POLL_SLACK_MS;
/**
 * SCH-002's last wait, after the quiet window: the delivered row leaves the scheduled table. Same bound as every row
 * poll in the SCH tests, the scheduled-delivery budget SLO.calWebhookDelivery.
 */
export const CAL_SCH002_ROW_POLL_MS: number = SLO.calWebhookDelivery.ms;

/**
 * Per-test budget for the three SCH tests that hold a quiet window (test.setTimeout, only those tests; the shared
 * 60 s timeout in playwright.config.ts is unchanged). Derived from its named parts: the quiet poll (window plus poll
 * slack) plus SCH-002's row poll after it, the longest tail of the three tests. Setup (booking, webhook, fire) runs
 * before the window starts and is measured at about 2 s locally; it fits in the row-poll part, which resolves on its
 * first read when the delivery has been made.
 */
export const CAL_QUIET_TEST_BUDGET_MS: number = CAL_QUIET_POLL_TIMEOUT_MS + CAL_SCH002_ROW_POLL_MS;

export type QuietState = "waiting" | "quiet" | "exceeded" | "missing";

/**
 * "waiting": still inside the window and not yet at the expected count (or fewer seen so far).
 * "exceeded": more deliveries than expected (terminal; a duplicate).
 * "quiet": the window has elapsed and the count is exactly the expected count.
 * "missing": the window has elapsed and the count is below the expected count.
 */
export function quietState(
  count: number,
  expected: number,
  startedMs: number,
  nowMs: number,
  windowMs: number,
): QuietState {
  if (count > expected) return "exceeded";
  if (nowMs - startedMs < windowMs) return "waiting";
  return count === expected ? "quiet" : "missing";
}
