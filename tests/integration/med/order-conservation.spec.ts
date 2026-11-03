import { test, expect } from "../../../src/fixtures/index.ts";
import { laneOf, type LaneCurrency } from "../../../src/lanes/med/lane-client.ts";
import { openPaidSession, renewPaymentSession } from "../../../src/lanes/med/cart-flow.ts";
import {
  orderItemDiscountText,
  orderLineSumText,
  orderShippingText,
  orderTaxLineCount,
  orderTotalMinor as orderTotalFromDb,
} from "../../../src/lanes/med/oracle.ts";
import { orderTotalMinor, toMinor } from "../../../src/lanes/med/money.ts";
import { cleanupLabel } from "../../../src/lanes/med/cleanup.ts";
import { runScopedName } from "../../../src/run/prefix.ts";

/**
 * Conservation identity for completed orders, in minor units: total = items + shipping + tax - discounts.
 * The lane's regions have no shipping option and no tax rate, so shipping and tax are zero by
 * construction (asserted through the database). The USD order carries a 1.00 USD fixed discount.
 */
test.describe("medusa order conservation", () => {
  test("P2-MED-ORD-001 order total equals item totals plus shipping plus tax minus discounts, in minor units", async ({
    request,
    medAuth,
    med,
  }) => {
    const lane = laneOf({ request, medAuth });
    const label = "ord001";
    const promotionIds: string[] = [];
    try {
      const cases: {
        currency: LaneCurrency;
        unitMajor: number;
        quantity: number;
        discountMajor: number;
      }[] = [
        { currency: "jpy", unitMajor: 1500, quantity: 3, discountMajor: 0 },
        { currency: "kwd", unitMajor: 1.234, quantity: 3, discountMajor: 0 },
        { currency: "usd", unitMajor: 10, quantity: 2, discountMajor: 1 },
      ];
      for (const c of cases) {
        const caseLabel = `${label}-${c.currency}`;
        const region = await lane.regionFor(c.currency);
        const product = await lane.productWithPrice(caseLabel, c.currency, c.unitMajor);
        const { cartId } = await openPaidSession(lane.store, {
          regionId: region.id,
          variantId: product.variantId,
          label: caseLabel,
          quantity: c.quantity,
        });
        if (c.discountMajor > 0) {
          const promo = await lane.admin("POST", "/admin/promotions", {
            body: {
              code: `${runScopedName(`${caseLabel}-promo`)}-${Date.now().toString(36)}`.toUpperCase(),
              type: "standard",
              status: "active",
              application_method: {
                type: "fixed",
                target_type: "items",
                allocation: "across",
                value: c.discountMajor,
                currency_code: c.currency,
              },
            },
            expect: [200, 201],
          });
          const created = promo.body as { promotion: { id: string; code: string } };
          promotionIds.push(created.promotion.id);
          const code = created.promotion.code;
          const applied = await lane.store("POST", `/store/carts/${cartId}/promotions`, {
            body: { promo_codes: [code] },
          });
          expect(applied.status, "promotion applied to the cart").toBe(200);
          // A promotion changes the cart total, which voids the open session (observed): renew it.
          await renewPaymentSession(lane.store, cartId);
        }

        const complete = await lane.rawPost(`/store/carts/${cartId}/complete`, {});
        expect(complete.status).toBe(200);
        const orderId = (complete.body as { order: { id: string } }).order.id;

        // Components from the database (minor units), then the identity.
        const itemsMinor = toMinor(Number(await orderLineSumText(orderId)), c.currency);
        const discountMinor = toMinor(Number(await orderItemDiscountText(orderId)), c.currency);
        // Zero terms, asserted from the database before the identity is applied (probe P-MED-21):
        // no shipping method on the order, and no live tax line on its items or shipping methods.
        const shippingMinor = toMinor(Number(await orderShippingText(orderId)), c.currency);
        expect(shippingMinor, `${c.currency} shipping: no shipping method on the order`).toBe(0);
        expect(await orderTaxLineCount(orderId), `${c.currency} live tax lines`).toBe(0);
        const totalMinor = await orderTotalFromDb(orderId, c.currency);
        const expectedMinor = orderTotalMinor({
          items: [{ unitMinor: toMinor(c.unitMajor, c.currency), quantity: c.quantity }],
          shippingMinor,
          taxMinor: 0,
          discountMinor,
        });
        expect(itemsMinor, `${c.currency} items in minor units`).toBe(
          toMinor(c.unitMajor, c.currency) * c.quantity,
        );
        expect(discountMinor, `${c.currency} discount in minor units`).toBe(
          toMinor(c.discountMajor, c.currency),
        );
        expect(totalMinor, `${c.currency} order total equals the identity`).toBe(expectedMinor);
        if (c.currency === "kwd") {
          // Known gap, recorded not asserted (RD-13, OD-7): a Stripe charge for KWD rounds up to 10 fils.
          // This account refuses KWD through Stripe (P-MED-18), so the Stripe variant is not run.
          test.info().annotations.push({
            type: "not-run",
            description:
              "KWD through Stripe: this Stripe account refuses KWD (Invalid currency: kwd; P-MED-18, OD-18)",
          });
        }
      }
    } finally {
      for (const id of promotionIds)
        await lane.admin("DELETE", `/admin/promotions/${id}`, { expect: [200, 404] });
      await cleanupLabel(lane, med, label);
    }
  });
});
