import { randomBytes } from "node:crypto";
import path from "node:path";
import { readOnlyDb } from "../db/pg.ts";
import type { ProductId } from "../env.ts";

/** Shared pieces of the four readiness specs (plan Task 5). */
export async function connectedRole(
  product: ProductId,
): Promise<{ user: string; readOnly: string }> {
  const rows = await readOnlyDb(product).select<{ u: string; ro: string }>(
    `SELECT current_user::text AS u, current_setting('transaction_read_only') AS ro`,
  );
  const row = rows[0];
  if (row === undefined) throw new Error("TEST BUG: current_user returned no row");
  return { user: row.u, readOnly: row.ro };
}

/** A throwaway webhook secret: 16 random bytes as hex. Never logged. */
export function randomSecret(): string {
  return randomBytes(16).toString("hex");
}

/** The fork checkout the harness uses; only static assets (example.pdf) are read from it. */
export function productsRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env["PRODUCTS_ROOT"]?.trim();
  return path.resolve(
    configured && configured !== "" ? configured : path.join(process.cwd(), "..", "products"),
  );
}

/**
 * The record id of a Twenty webhook payload: `record.id` in the JSON body (the body keys seen by
 * probe P4 include `record`, plan Task 2 section 2.2). `undefined` when the field is absent; the
 * readiness spec turns that into a failed assertion, which is the plan's STOP (Task 5, section 14).
 */
export function recordIdOf(delivery: { readonly rawBody: Buffer }): string | undefined {
  try {
    const body = JSON.parse(delivery.rawBody.toString("utf8")) as { record?: { id?: unknown } };
    const id = body.record?.id;
    return typeof id === "string" ? id : undefined;
  } catch {
    return undefined;
  }
}
