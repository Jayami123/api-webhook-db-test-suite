import type { Slo } from "../slo.ts";

/** Measured on this VM on 2026-11-05 (probe B-48): Gotenberg restart to a 200 on /health, the slowest of three cycles. */
const GOTENBERG_HEALTH_SAMPLE_MAX_MS = 700;
/**
 * Allowance for a shared CI runner over the measured VM. No CI runner has been measured for this answer, so the factor
 * is a judgement, not a measurement: 100x lets a runner that is far slower than this VM pass, and a container that is
 * really stuck still fails within 70 s, inside the 90 s recovery budget that follows it.
 */
const RUNNER_SLOWDOWN_FACTOR = 100;
/** The circuit's open window after a real conversion failure: circuit-breaker.ts:14 (`const COOLDOWN_MS = 30_000`). */
const CONVERSION_CIRCUIT_COOLDOWN_MS = 30_000;
/**
 * Slack after the cooldown for the half-open upload and one poll interval of the recovery poll. A poll that needs more
 * than this after the cooldown has a real delay, not a timing one; the value is a judgement, not a measurement.
 */
const HALF_OPEN_POLL_SLACK_MS = 60_000;

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
      "EXP-001 sign + complete + SIGNED over 10 samples (probe B-40, 2026-11-03): min 309 ms, median 375 ms, max 896 ms; 10 s is about 11x the slowest sample, so a slow run fails as a setup error",
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
  docConvertFail: {
    ms: 5_000,
    basis:
      "a refused attempt returns at once (connection refused on a stopped container); the conversion timeout is 30 s (packages/lib/constants/document-conversion.ts:6), so 5 s separates the refusal from the timeout path",
  },
  docConvertHealth: {
    ms: GOTENBERG_HEALTH_SAMPLE_MAX_MS * RUNNER_SLOWDOWN_FACTOR,
    basis:
      "GOTENBERG_HEALTH_SAMPLE_MAX_MS (700 ms, probe B-48: restart to a 200 on /health, samples 210, 201, 700 ms) times RUNNER_SLOWDOWN_FACTOR (100, a judgement for a shared runner); the harness compose overlay defines no healthcheck budget to reuse",
  },
  docConvertRecover: {
    ms: CONVERSION_CIRCUIT_COOLDOWN_MS + HALF_OPEN_POLL_SLACK_MS,
    basis:
      "CONVERSION_CIRCUIT_COOLDOWN_MS (circuit-breaker.ts:14) + HALF_OPEN_POLL_SLACK_MS (the half-open upload and one poll interval)",
  },
  docCronTick: {
    ms: 17 * 60_000,
    basis: "*/15 cron (seal-document-sweep.ts:18) + 2 min margin",
  },
} as const satisfies Record<string, Slo>;
