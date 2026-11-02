import { test, expect } from "../../../src/fixtures/index.ts";
import { laneOf } from "../../../src/lanes/med/lane-client.ts";
import { openPaidSession } from "../../../src/lanes/med/cart-flow.ts";
import { isWithinPrecision, toMinor } from "../../../src/lanes/med/money.ts";
import { orderTotalMinor, paymentSessionAmountText } from "../../../src/lanes/med/oracle.ts";
import { cleanupLabel } from "../../../src/lanes/med/cleanup.ts";

/**
 * Minor units end to end through the system provider: the cart total, the payment session amount and
 * the order's stored total all agree in the currency's minor unit (JPY 0 decimals, KWD 3 decimals).
 * Observed (P-MED-5): JPY 3 x 1500 = 4500; KWD 3 x 1.234 = 3.702.
 */
test.describe("medusa minor units", () => {
  test("P2-MED-MON-001 JPY and KWD carts keep their minor units end to end", async ({
    request,
    medAuth,
    med,
  }) => {
    const lane = laneOf({ request, medAuth });
    const label = "mon001";
    try {
      const cases = [
        { currency: "jpy" as const, unitMajor: 1500, expectedMajor: "4500", expectedMinor: 4500 },
        { currency: "kwd" as const, unitMajor: 1.234, expectedMajor: "3.702", expectedMinor: 3702 },
      ];
      for (const c of cases) {
        const caseLabel = `${label}-${c.currency}`;
        const region = await lane.regionFor(c.currency);
        const product = await lane.productWithPrice(caseLabel, c.currency, c.unitMajor);
        const { cartId, sessionId } = await openPaidSession(lane.store, {
          regionId: region.id,
          variantId: product.variantId,
          label: caseLabel,
          quantity: 3,
        });

        // Cart total from the store (major units as the API returns them).
        const cart = await lane.rawGet(`/store/carts/${cartId}`);
        const total = (cart.body as { cart: { total: number } }).cart.total;
        expect(String(total), `${c.currency} cart total`).toBe(c.expectedMajor);
        expect(toMinor(total, c.currency), `${c.currency} cart total in minor units`).toBe(
          c.expectedMinor,
        );

        // The payment session stores the same amount.
        expect(await paymentSessionAmountText(sessionId), `${c.currency} session amount`).toBe(
          c.expectedMajor,
        );

        // The order keeps the minor units.
        const complete = await lane.rawPost(`/store/carts/${cartId}/complete`, {});
        expect(complete.status).toBe(200);
        const orderId = (complete.body as { order: { id: string } }).order.id;
        expect(
          await orderTotalMinor(orderId, c.currency),
          `${c.currency} order total in minor units`,
        ).toBe(c.expectedMinor);
      }

      // The oracle refuses a decimal the currency cannot hold (no silent rounding).
      expect(isWithinPrecision(3.702, "KWD")).toBe(true);
      expect(isWithinPrecision(3.7025, "KWD")).toBe(false);
    } finally {
      await cleanupLabel(lane, med, label);
    }
  });
});
