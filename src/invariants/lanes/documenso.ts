import type { Rule } from "../engine.ts";
import { ESC, LEAK_LIKE_PREFIX } from "../lane-kit.ts";

/**
 * Owned by the documenso lane. Appended to RULES.documenso in ../rules.ts (documensoLaneRules).
 *
 * Organisation has no soft-delete column (probed 2026-11-02 on the running Documenso database through
 * information_schema.columns: Organisation has id, name, customerId and no deletedAt; schema.prisma:812-835),
 * so the rule matches the run prefix on the name with no deletedAt filter.
 */
export const documensoLaneRules: readonly Rule[] = [
  {
    id: "doc-leak-organisation-name",
    kind: "leak",
    description: "No organisation created by this run is left",
    cite: "packages/prisma/schema.prisma:812-835 (Organisation; no deletedAt column, probed 2026-11-02)",
    basis: "live",
    verified: "2026-11-02",
    param: LEAK_LIKE_PREFIX,
    sql: `SELECT "id" AS id, "name" AS value FROM "Organisation" WHERE "name" LIKE $1 ${ESC}`,
  },
];
