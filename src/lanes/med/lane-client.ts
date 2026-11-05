import type { MedusaAuth } from "../../auth/medusa.ts";
import type { MedusaClient } from "../../clients/medusa.ts";
import { apiBaseUrl } from "../../env.ts";
import { currentRunPrefix } from "../../run/prefix.ts";
import {
  createCaller,
  type ApiRequestLike,
  type Caller,
  type CallResult,
} from "../../clients/base.ts";
import { runScopedName } from "../../run/prefix.ts";
import { runAllThenRethrow } from "../../shared/cleanup.ts";

/**
 * The medusa lane's own calls: regions, products, price lists, inventory and raw store reads and
 * writes. The shared MedusaClient (src/clients/medusa.ts) is not edited; this wraps the same
 * createCaller plumbing with the lane's needs. Request shapes are the ones probed on 2026-11-02
 * (probe record, P-MED-16, P-MED-13, P-MED-16b).
 */
export type LaneCurrency = "usd" | "jpy" | "kwd";

/** Country per lane region. None of these is used by the harness seed (dk fr de it es se gb us). */
export const LANE_COUNTRY: Readonly<Record<LaneCurrency, string>> = {
  usd: "ca",
  jpy: "jp",
  kwd: "kw",
};

export interface LaneRegion {
  readonly id: string;
  readonly currency: LaneCurrency;
}

export interface LaneProduct {
  readonly id: string;
  readonly variantId: string;
  readonly inventoryItemId: string | undefined;
}

export interface LaneClient {
  readonly admin: Caller;
  readonly store: Caller;
  /** Creates (or reuses, by run-scoped name) the lane's region for a currency. Pays with pp_system_default only. */
  regionFor(currency: LaneCurrency): Promise<LaneRegion>;
  /**
   * Deletes every region this client created or reused, one cleanup step per region (src/shared/cleanup.ts): a failed
   * delete does not stop the others, and only the regions that were deleted are forgotten.
   */
  releaseRegions(): Promise<void>;
  productWithPrice(
    label: string,
    currency: LaneCurrency,
    amountMajor: number,
    options?: { readonly managedInventory?: boolean },
  ): Promise<LaneProduct>;
  setVariantPrice(
    productId: string,
    variantId: string,
    currency: LaneCurrency,
    amountMajor: number,
  ): Promise<void>;
  /** Store price of a product in a region (calculated amount, major units). undefined if absent. */
  productPrice(productId: string, regionId: string): Promise<number | undefined>;
  createPriceList(input: {
    readonly variantId: string;
    readonly currency: LaneCurrency;
    readonly amountMajor: number;
    readonly startsAt: string;
    readonly title: string;
  }): Promise<string>;
  removeProduct(productId: string): Promise<void>;
  /**
   * Removes every product whose title starts with the prefix (a failed test may not have kept the id). Re-queries the
   * first page after each pass of deletes until no product with the prefix is listed; it never pages by offset while
   * deleting, since each delete shifts the rows after it.
   */
  removeProductsByPrefix(prefix: string): Promise<number>;
  /** Deletes a price list by id (price lists are not removed with the product). */
  removePriceList(priceListId: string): Promise<void>;
  /** Id of the seed's default sales channel (stock locations are linked to it). */
  salesChannelId(): Promise<string>;
  /** Adds a stock location with run-scoped name, linked to the default sales channel. */
  stockLocation(label: string): Promise<string>;
  /** One inventory level of an item at a location (creates it with the given stock). */
  inventoryLevel(inventoryItemId: string, locationId: string, stocked: number): Promise<void>;
  /** The product's own level figures at a location (admin read, not the database). */
  levelFromProduct(
    inventoryItemId: string,
    locationId: string,
  ): Promise<{ stocked: number; reserved: number; available: number } | undefined>;
  /** Restock an existing level (admin inventory update). */
  restock(inventoryItemId: string, locationId: string, stocked: number): Promise<void>;
  /** Deletes a stock location through the admin API: 200, or 404 when it is already gone; anything else throws. */
  removeStockLocation(locationId: string): Promise<void>;
  /** Store GET with the publishable key; returns status and text for contract checks. */
  rawGet(path: string): Promise<CallResult<unknown>>;
  /** Store POST with the publishable key; expects any status (the caller asserts it). */
  rawPost(path: string, body: unknown): Promise<CallResult<unknown>>;
}

/** Page size of the product search in removeProductsByPrefix (the admin list's limit). */
const PRODUCT_PAGE = 100;

export function laneClient(input: {
  request: ApiRequestLike;
  baseUrl: string;
  runPrefix: string;
  auth: MedusaAuth;
}): LaneClient {
  const { request, baseUrl, runPrefix, auth } = input;
  const admin = createCaller({
    request,
    baseUrl,
    runPrefix,
    auth: { headerName: auth.headerName, headerValue: auth.headerValue },
  });
  const storeCall = createCaller({
    request,
    baseUrl,
    runPrefix,
    extraHeaders: () => ({ "x-publishable-api-key": auth.publishableKey.reveal() }),
  });
  const anyStatus = [200, 201, 400, 401, 404, 409, 422, 500] as const;
  const regions = new Map<LaneCurrency, LaneRegion>();
  let channelId: string | undefined;

  const defaultChannel = async (): Promise<string> => {
    if (channelId !== undefined) return channelId;
    const res = await admin<{ sales_channels: { id: string; name: string }[] }>(
      "GET",
      "/admin/sales-channels?limit=100&fields=id,name",
    );
    const list = res.body.sales_channels;
    const channel = list.find((c) => c.name === "Default Sales Channel") ?? list[0];
    if (channel === undefined) throw new Error("TEST BUG: no sales channel in the seed");
    channelId = channel.id;
    return channelId;
  };

  return {
    admin,
    store: storeCall,
    async regionFor(currency) {
      const existing = regions.get(currency);
      if (existing) return existing;
      const name = runScopedName(`region-${currency}`);
      const created = await admin<{ region: { id: string } }>("POST", "/admin/regions", {
        body: {
          name,
          currency_code: currency,
          countries: [LANE_COUNTRY[currency]],
          payment_providers: ["pp_system_default"],
        },
      });
      const region: LaneRegion = { id: created.body.region.id, currency };
      regions.set(currency, region);
      return region;
    },
    async releaseRegions() {
      await runAllThenRethrow(
        [...regions].map(([currency, region]) => async () => {
          await admin("DELETE", `/admin/regions/${region.id}`, { expect: [200, 404] });
          regions.delete(currency);
        }),
      );
    },
    async productWithPrice(label, currency, amountMajor, options = {}) {
      const title = runScopedName(label);
      const sales = await defaultChannel();
      const res = await admin<{ product: { id: string; variants: { id: string }[] } }>(
        "POST",
        "/admin/products",
        {
          body: {
            title,
            status: "published",
            sales_channels: [{ id: sales }],
            options: [{ title: "Size", values: ["One"] }],
            variants: [
              {
                title: `${title}-v`,
                sku: `${title}-v`,
                options: { Size: "One" },
                manage_inventory: options.managedInventory ?? false,
                prices: [{ currency_code: currency, amount: amountMajor }],
              },
            ],
          },
        },
      );
      const variantId = res.body.product.variants[0]?.id;
      if (variantId === undefined) throw new Error("TEST BUG: product created without a variant");
      let inventoryItemId: string | undefined;
      if (options.managedInventory === true) {
        const link = await admin<{
          product: {
            variants: { id: string; inventory_items?: { inventory_item_id: string }[] }[];
          };
        }>(
          "GET",
          `/admin/products/${res.body.product.id}?fields=id,variants.id,variants.inventory_items.inventory_item_id`,
        );
        const variant = link.body.product.variants.find((v) => v.id === variantId);
        inventoryItemId = variant?.inventory_items?.[0]?.inventory_item_id;
        // A managed variant without a shipping method needs requires_shipping:false (probe P-MED-16).
        if (inventoryItemId !== undefined) {
          await admin("POST", `/admin/inventory-items/${inventoryItemId}`, {
            body: { requires_shipping: false },
          });
        }
      }
      return { id: res.body.product.id, variantId, inventoryItemId };
    },
    async setVariantPrice(productId, variantId, currency, amountMajor) {
      await admin("POST", `/admin/products/${productId}/variants/${variantId}`, {
        body: { prices: [{ currency_code: currency, amount: amountMajor }] },
      });
    },
    async productPrice(productId, regionId) {
      const res = await storeCall<{
        product: { variants: { calculated_price?: { calculated_amount?: number } }[] };
      }>(
        "GET",
        `/store/products/${productId}?region_id=${regionId}&fields=*variants.calculated_price`,
      );
      return res.body.product.variants[0]?.calculated_price?.calculated_amount;
    },
    async createPriceList(input) {
      const res = await admin<{ price_list: { id: string } }>("POST", "/admin/price-lists", {
        body: {
          title: runScopedName(input.title),
          description: "P2 medusa lane",
          type: "sale",
          status: "active",
          starts_at: input.startsAt,
          rules: {},
          prices: [
            {
              amount: input.amountMajor,
              currency_code: input.currency,
              variant_id: input.variantId,
            },
          ],
        },
      });
      return res.body.price_list.id;
    },
    async salesChannelId() {
      return defaultChannel();
    },
    async stockLocation(label) {
      const created = await admin<{ stock_location: { id: string } }>(
        "POST",
        "/admin/stock-locations",
        {
          body: { name: runScopedName(label) },
        },
      );
      const channel = await defaultChannel();
      await admin(
        "POST",
        `/admin/stock-locations/${created.body.stock_location.id}/sales-channels`,
        {
          body: { add: [channel] },
        },
      );
      return created.body.stock_location.id;
    },
    async inventoryLevel(inventoryItemId, locationId, stocked) {
      await admin("POST", `/admin/inventory-items/${inventoryItemId}/location-levels`, {
        body: { location_id: locationId, stocked_quantity: stocked },
      });
    },
    async levelFromProduct(inventoryItemId, locationId) {
      const res = await admin<{
        inventory_levels: {
          location_id: string;
          stocked_quantity: number;
          reserved_quantity: number;
          available_quantity: number;
        }[];
      }>("GET", `/admin/inventory-items/${inventoryItemId}/location-levels`);
      const level = res.body.inventory_levels.find((l) => l.location_id === locationId);
      if (level === undefined) return undefined;
      return {
        stocked: level.stocked_quantity,
        reserved: level.reserved_quantity,
        available: level.available_quantity,
      };
    },
    async restock(inventoryItemId, locationId, stocked) {
      await admin(
        "POST",
        `/admin/inventory-items/${inventoryItemId}/location-levels/${locationId}`,
        {
          body: { stocked_quantity: stocked },
        },
      );
    },
    async removeStockLocation(locationId) {
      await admin("DELETE", `/admin/stock-locations/${locationId}`, { expect: [200, 404] });
    },
    async removePriceList(priceListId) {
      await admin("DELETE", `/admin/price-lists/${priceListId}`, { expect: [200, 404] });
    },
    async removeProductsByPrefix(prefix) {
      // A prefix can match more rows than one page. Offset paging while deleting skips rows (each delete shifts the
      // rest up a page), so every pass reads the first page again until none with the prefix is listed.
      const deleted = new Set<string>();
      for (;;) {
        const page = await admin<{ products: { id: string; title: string }[] }>(
          "GET",
          `/admin/products?q=${encodeURIComponent(prefix)}&fields=id,title&limit=${String(PRODUCT_PAGE)}&offset=0`,
        );
        const mine = page.body.products.filter((p) => p.title.startsWith(prefix));
        if (mine.length === 0) {
          if (page.body.products.length === PRODUCT_PAGE)
            throw new Error(
              `TEST BUG: removeProductsByPrefix(${prefix}): a full first page matches the search but no title starts with the prefix, so the rest cannot be reached without offset paging`,
            );
          return deleted.size;
        }
        const relisted = mine.filter((p) => deleted.has(p.id)).map((p) => p.id);
        if (relisted.length > 0)
          throw new Error(
            `cleanup: removeProductsByPrefix(${prefix}): still listed after a delete: ${relisted.join(", ")}`,
          );
        await runAllThenRethrow(
          mine.map((product) => async () => {
            await admin("DELETE", `/admin/products/${product.id}`, { expect: [200, 404] });
            deleted.add(product.id);
          }),
        );
      }
    },
    async removeProduct(productId) {
      await admin("DELETE", `/admin/products/${productId}`, { expect: [200, 404] });
    },
    async rawGet(path) {
      return storeCall("GET", path, { expect: anyStatus as unknown as number[] });
    },
    async rawPost(path, body) {
      return storeCall("POST", path, { body, expect: anyStatus as unknown as number[] });
    },
  };
}

/** The lane client for a spec, from its Playwright request context and the worker's minted credential. */
export function laneOf(fixtures: {
  readonly request: ApiRequestLike;
  readonly medAuth: MedusaAuth;
}): LaneClient {
  return laneClient({
    request: fixtures.request,
    baseUrl: apiBaseUrl("medusa"),
    runPrefix: currentRunPrefix(),
    auth: fixtures.medAuth,
  });
}

/**
 * Removes everything one test label created: products (by run-scoped title prefix), guest customers (by email prefix)
 * and the lane's regions. One step each through runAllThenRethrow (src/shared/cleanup.ts): every step runs even when an
 * earlier one fails, and the first failure is then rethrown, so a cleanup problem is never hidden (AGENTS.md).
 */
export async function cleanupLabel(
  lane: LaneClient,
  med: MedusaClient,
  label: string,
): Promise<void> {
  await runAllThenRethrow([
    () => lane.removeProductsByPrefix(runScopedName(label)),
    () => med.admin.deleteCustomersByEmailPrefix(runScopedName(label)),
    () => lane.releaseRegions(),
  ]);
}
