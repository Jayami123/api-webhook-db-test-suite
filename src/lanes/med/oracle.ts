import { readOnlyDb } from "../../db/pg.ts";
import { toMinor } from "./money.ts";

// Every query goes through readOnlyDb("medusa") (qa_ro, select-guard.ts). Table and column names are
// the ones the live schema reports through qa_ro (probe record, P-MED-8 and the 2026-11-02 schema read).
const db = () => readOnlyDb("medusa");

export interface SessionRow {
  readonly id: string;
  readonly status: string;
  readonly authorizedAt: string | null;
}

/** Every SQL string in this module. The unit tests run the select guard over each one. */
export const ORACLE_QUERIES = {
  paymentSession: `SELECT "id" AS id, "status" AS status, "authorized_at" AS authorized_at FROM "payment_session" WHERE "id" = $1`,
  paymentRowCount: `SELECT COUNT(*)::text AS n FROM "payment" WHERE "payment_session_id" = $1 AND "deleted_at" IS NULL`,
  orderCountForCart: `SELECT COUNT(*)::text AS n FROM "order_cart" WHERE "cart_id" = $1 AND "deleted_at" IS NULL`,
  cartLineCount: `SELECT COUNT(*)::text AS n FROM "cart_line_item" WHERE "cart_id" = $1 AND "deleted_at" IS NULL`,
  cartQuantity: `SELECT COALESCE(SUM("quantity"), 0)::text AS q FROM "cart_line_item" WHERE "cart_id" = $1 AND "deleted_at" IS NULL`,
  inventoryRow: `SELECT "stocked_quantity"::text AS stocked, "reserved_quantity"::text AS reserved FROM "inventory_level" WHERE "id" = $1`,
  dbNow: `SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS now`,
  orderTotal: `SELECT "totals"->>'current_order_total' AS total, "version" AS version FROM "order_summary" WHERE "order_id" = $1 AND "deleted_at" IS NULL ORDER BY "version" DESC LIMIT 1`,
  inventoryLevelsForItem: `SELECT "location_id" AS location, "stocked_quantity"::text AS stocked, "reserved_quantity"::text AS reserved FROM "inventory_level" WHERE "inventory_item_id" = $1 AND "deleted_at" IS NULL ORDER BY "location_id"`,
  cartCompleted: `SELECT ("completed_at" IS NOT NULL) AS done FROM "cart" WHERE "id" = $1`,
  productsWithTitlePrefix: `SELECT COUNT(*)::text AS n FROM "product" WHERE "title" LIKE $1 ESCAPE '\\' AND "deleted_at" IS NULL`,
  reservationLiveCount: `SELECT COUNT(*)::text AS n FROM "reservation_item" WHERE "inventory_item_id" = $1 AND "deleted_at" IS NULL`,
  orderLineSum: `SELECT COALESCE(SUM(oi."quantity" * li."unit_price"), 0)::text AS items FROM "order_item" oi JOIN "order_line_item" li ON li."id" = oi."item_id" JOIN LATERAL (SELECT MAX("version") AS v FROM "order_summary" os WHERE os."order_id" = oi."order_id" AND os."deleted_at" IS NULL) latest ON oi."version" = latest.v WHERE oi."order_id" = $1 AND oi."deleted_at" IS NULL`,
} as const;

export interface OrderTotalsRow {
  readonly currency: string;
  readonly totalText: string;
}

export async function paymentSession(sessionId: string): Promise<SessionRow | undefined> {
  const rows = await db().select<{ id: string; status: string; authorized_at: string | null }>(
    ORACLE_QUERIES.paymentSession,
    [sessionId],
  );
  const row = rows[0];
  return row === undefined
    ? undefined
    : { id: row.id, status: row.status, authorizedAt: row.authorized_at };
}

/** Live (not soft-deleted) payments created for one payment session. */
export async function paymentRowCount(sessionId: string): Promise<number> {
  const rows = await db().select<{ n: string }>(ORACLE_QUERIES.paymentRowCount, [sessionId]);
  return Number(rows[0]?.n ?? "0");
}

/**
 * Live links from a cart to an order. A rejected completion leaves soft-deleted link rows pointing
 * at no order (probe P-MED-LOC-002, 2026-11-02): those are not orders, so they are not counted.
 */
export async function orderCountForCart(cartId: string): Promise<number> {
  const rows = await db().select<{ n: string }>(ORACLE_QUERIES.orderCountForCart, [cartId]);
  return Number(rows[0]?.n ?? "0");
}

/** Live lines of one cart. */
export async function cartLineCount(cartId: string): Promise<number> {
  const rows = await db().select<{ n: string }>(ORACLE_QUERIES.cartLineCount, [cartId]);
  return Number(rows[0]?.n ?? "0");
}

/** Sum of live line quantities of one cart. */
export async function cartQuantity(cartId: string): Promise<number> {
  const rows = await db().select<{ q: string }>(ORACLE_QUERIES.cartQuantity, [cartId]);
  return Number(rows[0]?.q ?? "0");
}

/** stocked, reserved and available of one inventory level (the level id, not the item id). */
export async function inventoryRow(
  levelId: string,
): Promise<{ stocked: number; reserved: number; available: number }> {
  const rows = await db().select<{ stocked: string; reserved: string }>(
    ORACLE_QUERIES.inventoryRow,
    [levelId],
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`TEST BUG: inventory level ${levelId} not found`);
  const stocked = Number(row.stocked);
  const reserved = Number(row.reserved);
  return { stocked, reserved, available: stocked - reserved };
}

/**
 * Order total in minor units, from order_summary.totals.current_order_total (jsonb text). A decimal
 * the currency cannot hold makes toMinor throw: no rounding (money.ts).
 */
export async function orderTotalMinor(orderId: string, currency: string): Promise<number> {
  const rows = await db().select<{ total: string | null; version: string }>(
    ORACLE_QUERIES.orderTotal,
    [orderId],
  );
  const total = rows[0]?.total;
  if (total === null || total === undefined) {
    throw new Error(`TEST BUG: no order total for order ${orderId}`);
  }
  return toMinor(Number(total), currency);
}

/** Sum of quantity x line unit price for the latest version of one order, in major units (text). */
export async function orderLineSumText(orderId: string): Promise<string> {
  const rows = await db().select<{ items: string }>(ORACLE_QUERIES.orderLineSum, [orderId]);
  return rows[0]?.items ?? "0";
}

/** Database clock as an ISO string. The product compares to now() (pricing.js:137, 188). */
export async function dbNowIso(): Promise<string> {
  const rows = await db().select<{ now: string }>(ORACLE_QUERIES.dbNow, []);
  const now = rows[0]?.now;
  if (now === undefined) throw new Error("TEST BUG: database clock returned no row");
  return now;
}

/** Live reservation rows for one inventory item (any location). */
export async function reservationLiveCount(inventoryItemId: string): Promise<number> {
  const rows = await db().select<{ n: string }>(ORACLE_QUERIES.reservationLiveCount, [
    inventoryItemId,
  ]);
  return Number(rows[0]?.n ?? "0");
}

export interface LevelRow {
  readonly location: string;
  readonly stocked: number;
  readonly reserved: number;
}

/** Live inventory levels of one item, one row per location (ordered by location id). */
export async function inventoryLevelsForItem(inventoryItemId: string): Promise<LevelRow[]> {
  const rows = await db().select<{ location: string; stocked: string; reserved: string }>(
    ORACLE_QUERIES.inventoryLevelsForItem,
    [inventoryItemId],
  );
  return rows.map((r) => ({
    location: r.location,
    stocked: Number(r.stocked),
    reserved: Number(r.reserved),
  }));
}

/** Whether the cart row has completed_at set. */
export async function cartCompleted(cartId: string): Promise<boolean> {
  const rows = await db().select<{ done: boolean }>(ORACLE_QUERIES.cartCompleted, [cartId]);
  return rows[0]?.done === true;
}
