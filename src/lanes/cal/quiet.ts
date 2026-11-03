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
 * Per-test budget for the three SCH tests that hold a quiet window (test.setTimeout, only those tests; the shared
 * 60 s timeout in playwright.config.ts is unchanged). Derived: the quiet window (one tick plus the margin, which is
 * already inside CAL_QUIET_WINDOW_MS) plus a setup budget for the booking, the webhook and the fire. The setup bound of
 * 15 s is a policy bound; the measured setup is about 2 s locally.
 */
export const CAL_SETUP_BUDGET_MS = 15_000;
export const CAL_QUIET_TEST_BUDGET_MS: number = CAL_QUIET_WINDOW_MS + CAL_SETUP_BUDGET_MS;

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
