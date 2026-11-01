import { readOnlyDb } from "../db/pg.ts";
import { apiBaseUrl, loadEnv, type ProductId } from "../env.ts";
import { currentRunPrefix } from "../run/prefix.ts";
import { loadAuthEnv, requireVar } from "./env.ts";
import { JOB_TIMEOUT_MS, selectStaleLeftovers, type Leftover } from "./reaper.ts";
import {
  revokeCalKey,
  revokeDocumensoToken,
  revokeMedusaKey,
  revokeTwentyKey,
} from "./reaper-revoke.ts";

/**
 * Worker-start reaper (plan Task 4 section 6.2b, Task 5 step 5b). Before a worker mints its first credential it
 * finds run-prefixed credentials left by DEAD runs (a teardown that never ran) and revokes them. The list comes
 * from the read-only oracle (the same tables as the P2-X-DB-001 leak rules, one row per credential, run prefix in
 * its name), not from a product list endpoint: a single source of truth, read as qa_ro. Selection is pure
 * (src/auth/reaper.ts): another run's credentials are only touched once that run is older than the job timeout.
 */
const PREFIX_LIKE = "p2-qa-%";

const LIST: Readonly<Record<ProductId, string>> = {
  cal: `SELECT "id"::text AS id, "note" AS name FROM "ApiKey" WHERE "note" LIKE '${PREFIX_LIKE}'`,
  documenso: `SELECT "id"::text AS id, "name" AS name FROM "ApiToken" WHERE "name" LIKE '${PREFIX_LIKE}'`,
  medusa: `SELECT "id" AS id, "title" AS name FROM "api_key" WHERE "title" LIKE '${PREFIX_LIKE}' AND "deleted_at" IS NULL`,
  twenty: `SELECT "id"::text AS id, "name" AS name FROM "core"."apiKey" WHERE "name" LIKE '${PREFIX_LIKE}' AND "revokedAt" IS NULL`,
};

export interface ReapReport {
  readonly product: ProductId;
  readonly selected: number;
  readonly revoked: number;
  readonly failures: readonly string[];
}

async function listLeftovers(product: ProductId): Promise<Leftover[]> {
  const rows = await readOnlyDb(product).select<{ id: string; name: string }>(LIST[product]);
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

async function documensoTeamId(email: string): Promise<number> {
  const rows = await readOnlyDb("documenso").select<{ id: number }>(
    `SELECT t."id" AS id FROM "Team" t JOIN "Organisation" o ON o."id" = t."organisationId" JOIN "User" u ON u."id" = o."ownerUserId" WHERE u."email" = $1 ORDER BY t."id" LIMIT 1`,
    [email],
  );
  const id = rows[0]?.id;
  if (id === undefined)
    throw new Error("TEST BUG: no personal team for the Documenso user (reaper)");
  return id;
}

/** Revokes one leftover through its product, signing in as the seeded account. Throws on any refusal. */
async function revokeOne(product: ProductId, id: string): Promise<void> {
  const env = loadAuthEnv();
  switch (product) {
    case "cal":
      return revokeCalKey({
        baseUrl: loadEnv().CAL_BASE_URL.replace(/\/$/, ""),
        email: env.P2_CAL_USER_EMAIL,
        password: env.P2_CAL_USER_PASSWORD,
        id,
      });
    case "documenso":
      return revokeDocumensoToken({
        baseUrl: apiBaseUrl("documenso"),
        email: env.P2_DOC_USER_EMAIL,
        password: env.P2_DOC_USER_PASSWORD,
        id,
        teamId: await documensoTeamId(env.P2_DOC_USER_EMAIL),
      });
    case "medusa":
      return revokeMedusaKey({
        baseUrl: apiBaseUrl("medusa"),
        email: requireVar("MEDUSA_ADMIN_EMAIL", env.MEDUSA_ADMIN_EMAIL),
        password: requireVar("MEDUSA_ADMIN_PASSWORD", env.MEDUSA_ADMIN_PASSWORD),
        id,
      });
    case "twenty":
      return revokeTwentyKey({
        baseUrl: apiBaseUrl("twenty"),
        email: env.TWENTY_EMAIL,
        password: env.TWENTY_PASSWORD,
        id,
      });
  }
}

export async function reapStaleLeftovers(
  product: ProductId,
  nowMs: number = Date.now(),
): Promise<ReapReport> {
  const selected = selectStaleLeftovers({
    leftovers: await listLeftovers(product),
    currentPrefix: currentRunPrefix(),
    nowMs,
    jobTimeoutMs: JOB_TIMEOUT_MS,
  });
  const failures: string[] = [];
  let revoked = 0;
  for (const leftover of selected) {
    try {
      await revokeOne(product, leftover.id);
      revoked += 1;
    } catch (error) {
      // The message names the step and the HTTP status; it never carries a token or a password.
      failures.push(
        `${leftover.name}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
  return { product, selected: selected.length, revoked, failures };
}

/** Called once per worker before its first mint. A leftover that cannot be revoked fails the worker. */
export async function reapOrThrow(product: ProductId): Promise<ReapReport> {
  const report = await reapStaleLeftovers(product);
  if (report.failures.length > 0) {
    throw new Error(
      `TEST BUG: ${product} reaper could not revoke ${String(report.failures.length)} leftover(s):\n  ${report.failures.join("\n  ")}`,
    );
  }
  return report;
}
