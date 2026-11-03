import { test, expect } from "../../../src/fixtures/index.ts";
import { laneOf } from "../../../src/lanes/med/lane-client.ts";
import { openPaidSession } from "../../../src/lanes/med/cart-flow.ts";
import {
  cartCompleted,
  inventoryLevelsForItem,
  liveOrdersLinkedToCart,
  liveOrdersViaSoftDeletedLinks,
  reservationLiveCount,
} from "../../../src/lanes/med/oracle.ts";
import { runScopedName } from "../../../src/run/prefix.ts";

/**
 * Observed on Medusa 2.21.2 (probe record, P-MED-LOC-002, 2026-11-02): with two channel-linked
 * stock locations of one unit each and a quantity-2 line, completion is REFUSED (400 not_allowed,
 * "Not enough stock available"). Nothing is split across the locations and nothing is reserved. The
 * test asserts that branch and no other: there is no oneOf.
 */
const OBSERVED_BRANCH = "reject";

test.describe("medusa stock location split", () => {
  test("P2-MED-LOC-002 stock split 1+1 for quantity 2: the recorded behaviour holds in the database", async ({
    request,
    medAuth,
    med,
  }) => {
    const label = "loc002";
    const lane = laneOf({ request, medAuth });
    const locations: string[] = [];
    try {
      const region = await lane.regionFor("usd");
      const product = await lane.productWithPrice(label, "usd", 10, { managedInventory: true });
      expect(product.inventoryItemId, "a managed variant has an inventory item").toBeDefined();
      const itemId = product.inventoryItemId ?? "";

      for (const name of ["a", "b"]) {
        const locationId = await lane.stockLocation(`${label}-${name}`);
        locations.push(locationId);
        await lane.inventoryLevel(itemId, locationId, 1);
      }
      const before = await inventoryLevelsForItem(itemId);
      expect(before.map((r) => r.stocked)).toEqual([1, 1]);
      expect(before.map((r) => r.reserved)).toEqual([0, 0]);

      const { cartId } = await openPaidSession(lane.store, {
        regionId: region.id,
        variantId: product.variantId,
        label,
        quantity: 2,
      });

      const complete = await lane.rawPost(`/store/carts/${cartId}/complete`, {});
      expect(complete.status, `${OBSERVED_BRANCH}: completion status`).toBe(400);
      const body = complete.body as { type: string; message: string };
      expect(body.type).toBe("not_allowed");
      expect(body.message).toMatch(/Not enough stock available/);

      expect(await liveOrdersLinkedToCart(cartId), "live orders through any link").toBe(0);
      expect(
        await liveOrdersViaSoftDeletedLinks(cartId),
        "live orders behind a soft-deleted link",
      ).toBe(0);
      expect(await cartCompleted(cartId), "cart completed").toBe(false);
      expect(await reservationLiveCount(itemId), "live reservations").toBe(0);
      const after = await inventoryLevelsForItem(itemId);
      expect(after.map((r) => r.stocked)).toEqual([1, 1]);
      expect(after.map((r) => r.reserved)).toEqual([0, 0]);
      test.info().annotations.push({ type: "observed-branch", description: OBSERVED_BRANCH });
    } finally {
      await lane.removeProductsByPrefix(runScopedName(label));
      for (const locationId of locations) await lane.removeStockLocation(locationId);
      await med.admin.deleteCustomersByEmailPrefix(runScopedName(label));
      await lane.releaseRegions();
    }
  });
});
