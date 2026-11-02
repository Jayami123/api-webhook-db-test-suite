import type { Slo } from "../slo.ts";

/**
 * Owned by the medusa lane. Merged into SLO in ../slo.ts. Each basis cites a line the lane verified
 * against the installed packages on 2026-11-02 (docs/probes/2026-11-02-p2-medusa-l0-probes.md, section 0).
 */
export const medusaSlo = {
  medPriceListBoundary: {
    ms: 20_000,
    basis:
      "starts_at is set to the database now() plus 5 s (test choice); the pricing query reads now() (@medusajs/pricing dist/repositories/pricing.js:137, 188); 15 s covers the poll and the store request. Observed: the change appears after 4.9 s (P-MED-11)",
  },
  medCacheVisibility: {
    ms: 10_000,
    basis:
      "equals expect.timeout (playwright.config.ts:40, 10 s). The invalidation is observed at 51 ms after an admin price update with the cache on (P-MED-7, 0.3.1)",
  },
  medPoisonParked: {
    ms: 30_000,
    basis:
      "attempts = webhook_retries || 3 (@medusajs/medusa dist/api/hooks/payment/[provider]/route.js:22), emit delay = webhook_delay || 5000 ms (route.js:21), and event-bus-redis has no backoff (no backoff setting in dist, event-bus-redis.js:48-50 reads job.opts.attempts); 20 s margin for the attempts and the parking",
  },
} as const satisfies Record<string, Slo>;
