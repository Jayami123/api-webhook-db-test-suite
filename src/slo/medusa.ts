import type { Slo } from "../slo.ts";

/**
 * Owned by the medusa lane. Merged into SLO in ../slo.ts. Empty until the lane has the verified
 * citations for its budgets (the payment webhook route must be found at f677db4 first).
 */
export const medusaSlo = {} as const satisfies Record<string, Slo>;
