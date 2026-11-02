import type { Slo } from "../slo.ts";

/** Owned by the documenso lane. Merged into SLO in ../slo.ts. */
export const documensoSlo = {
  docWebhookTimeoutChain: {
    ms: 50_000,
    basis: "4 attempts x WEBHOOK_TIMEOUT_MS 10 000 (execute-webhook-call.ts:6) + 10 s margin",
  },
  docCronTick: {
    ms: 17 * 60_000,
    basis: "*/15 cron (seal-document-sweep.ts:18) + 2 min margin",
  },
} as const satisfies Record<string, Slo>;
