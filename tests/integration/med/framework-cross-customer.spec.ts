import { test, expect } from "../../../src/fixtures/index.ts";
import { laneOf } from "../../../src/lanes/med/lane-client.ts";
import { openPaidSession, renewPaymentSession } from "../../../src/lanes/med/cart-flow.ts";
import { cartQuantity } from "../../../src/lanes/med/oracle.ts";
import { cleanupLabel } from "../../../src/lanes/med/cleanup.ts";

/**
 * Framework check (F2, observed; OD-16): a guest cart id is a bearer capability. The check asserts the
 * OBSERVED behaviour, not a verdict: an anonymous write to an open guest cart is accepted and changes
 * only that cart's rows; a completed cart refuses the write. P5 owns the verdict.
 * Observed (P-MED-6, re-measured 2026-11-02): victim quantity 1 -> 4; bystander unchanged; completed
 * cart refused with 400 "Cart ... is already completed."
 */
test.describe("medusa guest cart capability", () => {
  test("Framework check: a guest cart id is a bearer capability; an anonymous write changes only that cart's rows, and a completed cart refuses it (F2, observed)", async ({
    request,
    medAuth,
    med,
  }) => {
    const lane = laneOf({ request, medAuth });
    const label = "fca";
    try {
      const region = await lane.regionFor("usd");
      const product = await lane.productWithPrice(label, "usd", 10);
      const victim = await openPaidSession(lane.store, {
        regionId: region.id,
        variantId: product.variantId,
        label: `${label}-victim`,
      });
      const bystander = await openPaidSession(lane.store, {
        regionId: region.id,
        variantId: product.variantId,
        label: `${label}-bystander`,
      });
      const victimBefore = await cartQuantity(victim.cartId);
      const bystanderBefore = await cartQuantity(bystander.cartId);
      expect(victimBefore).toBe(1);

      await test.step("an anonymous write to an open guest cart is accepted (observed)", async () => {
        const write = await lane.rawPost(`/store/carts/${victim.cartId}/line-items`, {
          variant_id: product.variantId,
          quantity: 3,
        });
        expect(write.status).toBe(200);
        expect(await cartQuantity(victim.cartId)).toBe(victimBefore + 3);
        expect(await cartQuantity(bystander.cartId), "only that cart changed").toBe(
          bystanderBefore,
        );
      });

      await test.step("a completed guest cart refuses the same write (observed)", async () => {
        // The write voided the open session (observed): a new one is created before completion.
        await renewPaymentSession(lane.store, victim.cartId);
        const complete = await lane.rawPost(`/store/carts/${victim.cartId}/complete`, {});
        expect(complete.status).toBe(200);
        const after = await cartQuantity(victim.cartId);
        const write = await lane.rawPost(`/store/carts/${victim.cartId}/line-items`, {
          variant_id: product.variantId,
          quantity: 1,
        });
        expect(write.status).toBe(400);
        expect((write.body as { message: string }).message).toMatch(/already completed/);
        expect(await cartQuantity(victim.cartId)).toBe(after);
      });
    } finally {
      await cleanupLabel(lane, med, label);
    }
  });
});
