import { CANARY_MARGIN_MS } from "../../slo.ts";

/**
 * The second Twenty server of a two-replica stack (ADR 0003: server-2 on 127.0.0.1:3003). Only the tw-cache job sets
 * TWENTY_SERVER_REPLICAS=2, so the case is gated on that value (liveGate in the case).
 */
export const REPLICA_B_URL = "http://127.0.0.1:3003";

/**
 * CACHE-001 budget: the measured maximum visibility window (probe record, section 3a: 10 trials, 17 to 61 ms, max 61 ms)
 * plus the lane's policy margin (src/slo.ts CANARY_MARGIN_MS). A measured budget, not a raised timeout.
 */
export const CACHE_MEASURED_MAX_MS = 61;
export const CACHE_VISIBLE_BUDGET_MS = CACHE_MEASURED_MAX_MS + CANARY_MARGIN_MS;
