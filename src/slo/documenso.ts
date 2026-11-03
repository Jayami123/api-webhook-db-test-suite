import type { Slo } from "../slo.ts";

/** Owned by the documenso lane. Merged into SLO in ../slo.ts. */
export const documensoSlo = {
  docWebhookTimeoutChain: {
    ms: 50_000,
    basis: "4 attempts x WEBHOOK_TIMEOUT_MS 10 000 (execute-webhook-call.ts:6) + 10 s margin",
  },
  docSignWindow: {
    // A5: the window an expiry test gives signing, set from the DB clock (EXP-001).
    ms: 10_000,
    basis:
      "measured sign + complete + SIGNED 353 ms (probe B-34, one sample, 2026-11-03); 10 s is about 28x that, so a slow run fails as a setup error",
  },
  docWebhookQuiet: {
    ms: 10_000,
    basis:
      "one WEBHOOK_TIMEOUT_MS 10 000 (execute-webhook-call.ts:6): a late attempt can only follow an answer within one attempt window; local job retries are immediate (local.ts:386; BackgroundJob maxRetries 3, schema.prisma:1129)",
  },
  docWebhookRetryGap: {
    ms: 5_000,
    basis:
      "no back-off between attempts (local.ts:386: a 150 ms submit race, no delay); an attempt answered 500 at once, so a gap of 5 s or more would be a back-off the pin does not have",
  },
  docJobQuiet: {
    ms: 10_000,
    basis:
      "mails and seal jobs are retried by the same immediate local job retry (local.ts:386; maxRetries 3, schema.prisma:1129), not by the cron",
  },
  docCronTick: {
    ms: 17 * 60_000,
    basis: "*/15 cron (seal-document-sweep.ts:18) + 2 min margin",
  },
} as const satisfies Record<string, Slo>;
