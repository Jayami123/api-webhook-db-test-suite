import { SLO } from "../../slo.ts";

/**
 * Quiet window for "none" and "once" assertions (review A8). Written for this lane (not imported from another lane).
 *
 * Basis of the budget. The scheduled-trigger route is fired explicitly by the lane (POST /api/cron/webhookTriggers), and the
 * lane stack runs no product cron. The product's own cron is every minute at the pin (.github/workflows/cron-webhooks-triggers.yml),
 * but a 60 s window would exceed the shared 60 s test timeout (playwright.config.ts) and would need a raised timeout, which
 * the rules forbid. So the window is the scheduled-delivery budget itself: a delivery the fire started cannot take longer.
 */
export const CAL_QUIET_WINDOW_MS: number = SLO.calWebhookDelivery.ms;

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
