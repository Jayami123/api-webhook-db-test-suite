import type { Rule } from "../engine.ts";

/**
 * Owned by the medusa lane. Appended to RULES.medusa in ../rules.ts. Empty until the lane's probes
 * have run. The second rule (med-order-total-conservation) needs its SQL written from the probe
 * output, and that needs the real payment webhook route at f677db4 (docs/lane-ownership.md).
 */
export const medusaLaneRules: readonly Rule[] = [];
