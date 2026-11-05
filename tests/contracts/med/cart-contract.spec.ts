import { test, expect } from "../../../src/fixtures/index.ts";
import { loadSpec } from "../../../src/contracts/oas.ts";
import { buyerEmail } from "../../../src/lanes/med/buyer.ts";
import { expectContract, MED_SPEC_FILE } from "../../../src/lanes/med/contract.ts";
import { laneOf } from "../../../src/lanes/med/lane-client.ts";
import { orderCountForCart } from "../../../src/lanes/med/oracle.ts";
import { runScopedName } from "../../../src/run/prefix.ts";
import { runAllThenRethrow } from "../../../src/shared/cleanup.ts";

test.describe("medusa store cart contract", () => {
  test("P2-MED-CON-001 cart create, add item, payment session and complete each match the store OAS, and the order row exists", async ({
    request,
    medAuth,
    med,
  }) => {
    const spec = await loadSpec("medusa-store", MED_SPEC_FILE);
    const lane = laneOf({ request, medAuth });
    const label = "con001";
    try {
      const region = await lane.regionFor("usd");
      const product = await lane.productWithPrice(label, "usd", 10);

      const cart = await lane.store<{ cart: { id: string } }>("POST", "/store/carts", {
        body: { region_id: region.id, email: buyerEmail(label) },
      });
      expectContract(spec, { method: "post", path: "/store/carts" }, cart.status, cart.body);
      const cartId = cart.body.cart.id;

      const line = await lane.store("POST", `/store/carts/${cartId}/line-items`, {
        body: { variant_id: product.variantId, quantity: 1 },
      });
      expectContract(
        spec,
        { method: "post", path: "/store/carts/{id}/line-items" },
        line.status,
        line.body,
      );

      const collection = await lane.store<{ payment_collection: { id: string } }>(
        "POST",
        "/store/payment-collections",
        { body: { cart_id: cartId } },
      );
      expectContract(
        spec,
        { method: "post", path: "/store/payment-collections" },
        collection.status,
        collection.body,
      );

      const session = await lane.store(
        "POST",
        `/store/payment-collections/${collection.body.payment_collection.id}/payment-sessions`,
        { body: { provider_id: "pp_system_default" } },
      );
      expectContract(
        spec,
        { method: "post", path: "/store/payment-collections/{id}/payment-sessions" },
        session.status,
        session.body,
      );

      const complete = await lane.store<{ type: string; order: { id: string } }>(
        "POST",
        `/store/carts/${cartId}/complete`,
        { body: {} },
      );
      expectContract(
        spec,
        { method: "post", path: "/store/carts/{id}/complete" },
        complete.status,
        complete.body,
      );
      expect(complete.body.type).toBe("order");
      expect(await orderCountForCart(cartId)).toBe(1);
    } finally {
      await runAllThenRethrow([
        () => lane.removeProductsByPrefix(runScopedName(label)),
        () => med.admin.deleteCustomersByEmailPrefix(runScopedName("con001")),
        () => lane.releaseRegions(),
      ]);
    }
  });
});
