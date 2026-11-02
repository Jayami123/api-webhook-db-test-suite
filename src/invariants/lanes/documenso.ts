import type { Rule } from "../engine.ts";

/**
 * Owned by the documenso lane. Appended to RULES.documenso in ../rules.ts. Empty until the lane has
 * probed the soft-delete column of Organisation (doc-leak-organisation-name), see docs/lane-ownership.md.
 */
export const documensoLaneRules: readonly Rule[] = [];
