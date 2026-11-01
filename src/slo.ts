/**
 * Named SLO budgets for async chains (AGENTS.md: expect.poll with an explicit deadline). A budget
 * is a policy bound derived from a CODE-DEFINED timeout plus a stated margin, never from an
 * observed latency (observed values go in test annotations only).
 */
export interface Slo {
  readonly ms: number;
  readonly basis: string;
}

/** Twenty re-reads its database configuration every 15 s (config-variables-refresh-cron, plan 2.3). */
export const TWENTY_CONFIG_REFRESH_MS = 15_000;

/** Twenty's workspace-cache memo lifetime (workspace-cache.service.ts:56, MEMOIZER_TTL_MS): a new webhook is invisible to the worker for this long. */
export const TWENTY_WEBHOOK_MEMO_MS = 10_000;

/** A new Twenty webhook becomes visible to the worker after one memo window (same source as the memo constant). */
export const TWENTY_WEBHOOK_VISIBLE_MS = TWENTY_WEBHOOK_MEMO_MS;

/**
 * Poll step for every readiness expect.poll (plan Task 5 D4 budgets are per call). Playwright 1.64.0 stops a poll up to
 * one step before its deadline: node_modules/playwright-core/lib/coreBundle.js:4769 `if (deadline && deadline <=
 * monotonicTime() + interval) break;`, with the default last step 1000 ms (line 4755). A 100 ms step bounds that loss
 * to 100 ms per wait, so each wait ends at its budget. The predicates are cheap (a receiver lookup or one SELECT).
 */
export const POLL_INTERVALS: number[] = [100];

/** Margin added to the memo window before the canary precondition is judged (a policy bound, section 6.2 canary). */
export const CANARY_MARGIN_MS = 500;

export const SLO = {
  calWebhookDelivery: {
    ms: 10_000,
    basis:
      "sendPayload has no timeout (sendPayload.ts:312-322); one request on the web process, 10 s policy bound",
  },
  docWebhookDelivery: {
    ms: 20_000,
    basis:
      "executeWebhookCall times out at 10_000 ms (execute-webhook-call.ts WEBHOOK_TIMEOUT_MS) + 10 s for job dispatch",
  },
  twConfigPropagation: {
    ms: 35_000,
    basis:
      "two 15 s config refresh cycles (config-variables-refresh-cron, plan 2.3) plus a 5 s margin",
  },
  twWebhookDelivery: {
    ms: 35_000,
    basis:
      "a new webhook reaches the worker after its workspace-cache memo (10 s, TWENTY_WEBHOOK_MEMO_MS); the canary precondition waits one memo window, then the call (5 s, call-webhook.job.ts) and a 20 s margin",
  },
  medWebhookProcessing: {
    ms: 25_000,
    basis:
      "hooks/payment/[provider]/route.js emits with delay webhook_delay || 5000 ms; 20 s margin for the subscriber and workflow",
  },
} as const satisfies Record<string, Slo>;
