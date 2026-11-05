import type { Rule } from "../engine.ts";
import { RUN_START } from "../lane-kit.ts";

/**
 * Owned by the medusa lane. Appended to RULES.medusa in ../rules.ts. Both rules judge only rows
 * created since the run started (RUN_START). Table and column names are the ones the live schema
 * reports through qa_ro (probe record, P-MED-8). The probe record documents the basis of each rule.
 */
export const medusaLaneRules: readonly Rule[] = [
  {
    id: "med-inv-level-reserved-matches-reservations",
    kind: "consistency",
    description:
      "For each inventory level created by this run, reserved_quantity equals the sum of its live reservation rows at the same location and item",
    cite: "@medusajs/inventory 2.21.2 inventory_level.reserved_quantity; reservation_item (probe P-MED-16b: complete reserves, cancel releases)",
    basis: "live",
    verified: "2026-11-02",
    param: RUN_START,
    sql: `SELECT l."id" AS id, l."reserved_quantity"::text AS value FROM "inventory_level" l LEFT JOIN (SELECT "location_id", "inventory_item_id", SUM("quantity") AS q FROM "reservation_item" WHERE "deleted_at" IS NULL GROUP BY "location_id", "inventory_item_id") r ON r."location_id" = l."location_id" AND r."inventory_item_id" = l."inventory_item_id" WHERE l."created_at" >= $1::timestamptz AND l."deleted_at" IS NULL AND l."reserved_quantity" <> COALESCE(r.q, 0)`,
  },
  {
    id: "med-order-total-conservation",
    kind: "consistency",
    description:
      "For each order created by this run, the stored current total equals the latest version's line amounts plus shipping minus line and shipping discounts, at the currency's minor unit (no tax term: lane regions have no tax rates)",
    cite: "order_summary.totals.current_order_total (probe P-MED-8/P-MED-5); order_item x order_line_item.unit_price; order_shipping x order_shipping_method.amount; order_line_item_adjustment and order_shipping_method_adjustment (probe P-MED-8, latest version)",
    basis: "live",
    verified: "2026-11-02",
    param: RUN_START,
    sql: `WITH latest AS (SELECT DISTINCT ON ("order_id") "order_id", "version" AS v FROM "order_summary" WHERE "deleted_at" IS NULL ORDER BY "order_id", "version" DESC), items AS (SELECT oi."order_id" AS order_id, SUM(oi."quantity" * li."unit_price") AS amt FROM "order_item" oi JOIN latest lt ON lt."order_id" = oi."order_id" AND oi."version" = lt.v JOIN "order_line_item" li ON li."id" = oi."item_id" WHERE oi."deleted_at" IS NULL GROUP BY oi."order_id"), item_disc AS (SELECT oi."order_id" AS order_id, SUM(a."amount") AS amt FROM "order_item" oi JOIN latest lt ON lt."order_id" = oi."order_id" AND oi."version" = lt.v JOIN "order_line_item_adjustment" a ON a."item_id" = oi."item_id" AND a."version" = lt.v AND a."deleted_at" IS NULL WHERE oi."deleted_at" IS NULL GROUP BY oi."order_id"), ship AS (SELECT s."order_id" AS order_id, SUM(m."amount") AS amt FROM "order_shipping" s JOIN latest lt ON lt."order_id" = s."order_id" AND s."version" = lt.v JOIN "order_shipping_method" m ON m."id" = s."shipping_method_id" WHERE s."deleted_at" IS NULL AND m."deleted_at" IS NULL GROUP BY s."order_id"), ship_disc AS (SELECT s."order_id" AS order_id, SUM(a."amount") AS amt FROM "order_shipping" s JOIN latest lt ON lt."order_id" = s."order_id" AND s."version" = lt.v JOIN "order_shipping_method_adjustment" a ON a."shipping_method_id" = s."shipping_method_id" AND a."version" = lt.v AND a."deleted_at" IS NULL WHERE s."deleted_at" IS NULL GROUP BY s."order_id"), scale AS (SELECT o."id" AS order_id, CASE LOWER(o."currency_code") WHEN 'jpy' THEN 0 WHEN 'kwd' THEN 3 ELSE 2 END AS dp FROM "order" o) SELECT o."id" AS id, (os."totals"->>'current_order_total') AS value FROM "order" o JOIN latest lt ON lt."order_id" = o."id" JOIN "order_summary" os ON os."order_id" = o."id" AND os."version" = lt.v AND os."deleted_at" IS NULL JOIN scale sc ON sc.order_id = o."id" LEFT JOIN items i ON i.order_id = o."id" LEFT JOIN item_disc idc ON idc.order_id = o."id" LEFT JOIN ship sh ON sh.order_id = o."id" LEFT JOIN ship_disc sd ON sd.order_id = o."id" WHERE o."created_at" >= $1::timestamptz AND o."deleted_at" IS NULL AND ROUND(COALESCE(i.amt, 0) + COALESCE(sh.amt, 0) - COALESCE(idc.amt, 0) - COALESCE(sd.amt, 0), sc.dp) <> ROUND((os."totals"->>'current_order_total')::numeric, sc.dp)`,
  },
];
