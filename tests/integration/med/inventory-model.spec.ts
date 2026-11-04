import { randomInt } from "node:crypto";
import { test, expect } from "../../../src/fixtures/index.ts";
import { laneOf } from "../../../src/lanes/med/lane-client.ts";
import { cleanupLabel, runAllThenRethrow } from "../../../src/lanes/med/cleanup.ts";
import { openPaidSession } from "../../../src/lanes/med/cart-flow.ts";
import { liveOrdersLinkedToCart } from "../../../src/lanes/med/oracle.ts";
import {
  apply,
  EMPTY,
  identityHolds,
  mulberry32,
  nextOp,
  type LevelModel,
  type Op,
} from "../../../src/lanes/med/inventory-model.ts";

/**
 * Model-based check of one inventory item over a seeded sequence of 12 operations. Live mapping:
 * restock = admin level update; reserve = cart completion (reserves the quantity, P-MED-16b); release
 * = order cancellation (releases the order's reservation). The model says what the product must show
 * after each step. A release is only sent when a live order of that quantity exists; otherwise the
 * step is a restock (the model and the product both see the same operation).
 */
test.describe("medusa inventory model", () => {
  test("P2-MED-INV-001 a seeded operation sequence keeps reserved plus available equal to stocked after every step", async ({
    request,
    medAuth,
    med,
  }) => {
    const label = "inv001";
    const seed = Number.parseInt(
      process.env["P2_INV_SEED"] ?? String(randomInt(1, 2 ** 31 - 1)),
      10,
    );
    test.info().annotations.push({ type: "seed", description: String(seed) });
    const lane = laneOf({ request, medAuth });
    const liveOrders: { orderId: string; qty: number }[] = [];
    let locationId: string | undefined;
    try {
      const region = await lane.regionFor("usd");
      const product = await lane.productWithPrice(label, "usd", 10, { managedInventory: true });
      const itemId = product.inventoryItemId ?? "";
      expect(itemId, "managed inventory item").not.toBe("");
      locationId = await lane.stockLocation(label);
      await lane.inventoryLevel(itemId, locationId, 0);

      const rnd = mulberry32(seed);
      let model: LevelModel = EMPTY;
      for (let step = 0; step < 12; step++) {
        let op: Op = nextOp(model, rnd);
        if (op.kind === "release" && !liveOrders.some((o) => o.qty === op.qty)) {
          op = { kind: "restock", qty: op.qty };
        }
        const detail = `step ${String(step)} ${JSON.stringify(op)} seed ${String(seed)}`;
        if (op.kind === "restock") {
          await lane.restock(itemId, locationId, model.stocked + op.qty);
        } else if (op.kind === "reserve") {
          const { cartId } = await openPaidSession(lane.store, {
            regionId: region.id,
            variantId: product.variantId,
            label: `${label}s${String(step)}`,
            quantity: op.qty,
          });
          const complete = await lane.rawPost(`/store/carts/${cartId}/complete`, {});
          expect(complete.status, `${detail}: completion`).toBe(200);
          liveOrders.push({
            orderId: (complete.body as { order: { id: string } }).order.id,
            qty: op.qty,
          });
          expect(
            await liveOrdersLinkedToCart(cartId),
            `${detail}: live orders through any link`,
          ).toBe(1);
        } else {
          const index = liveOrders.map((o) => o.qty).lastIndexOf(op.qty);
          const [order] = liveOrders.splice(index, 1);
          const cancel = await lane.admin("POST", `/admin/orders/${order?.orderId ?? ""}/cancel`, {
            body: {},
          });
          expect(cancel.status, `${detail}: cancellation`).toBe(200);
        }
        model = apply(model, op);

        // The product's own figures (admin location-levels: available_quantity, probe P-MED-20). Compared with
        // the model. The available value is the product's, not stocked minus reserved from the database.
        const level = await lane.levelFromProduct(itemId, locationId);
        expect(level, `${detail}: level exists`).toBeDefined();
        expect(level?.stocked, `${detail}: product stocked`).toBe(model.stocked);
        expect(level?.reserved, `${detail}: product reserved`).toBe(model.reserved);
        expect(level?.available, `${detail}: product available`).toBe(
          model.stocked - model.reserved,
        );
        expect(identityHolds(model, level?.available ?? NaN), `${detail}: identity`).toBe(true);
      }
    } finally {
      // Every step is tried even after a failure, in this order, and the first error is rethrown at the end.
      // Live orders hold reservations: they are cancelled first, or the product cannot be removed.
      const cleanups: (() => Promise<unknown>)[] = liveOrders.map(
        (order) => () =>
          lane.admin("POST", `/admin/orders/${order.orderId}/cancel`, { body: {}, expect: [200] }),
      );
      cleanups.push(() => cleanupLabel(lane, med, label));
      if (locationId !== undefined) {
        const stockLocationId = locationId;
        cleanups.push(() => lane.removeStockLocation(stockLocationId));
      }
      await runAllThenRethrow(cleanups);
    }
  });
});
