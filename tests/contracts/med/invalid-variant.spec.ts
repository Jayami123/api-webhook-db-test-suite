import { test, expect } from "../../../src/fixtures/index.ts";
import { loadSpec } from "../../../src/contracts/oas.ts";
import { buyerEmail } from "../../../src/lanes/med/buyer.ts";
import { expectContract, MED_SPEC_FILE } from "../../../src/lanes/med/contract.ts";
import { laneOf } from "../../../src/lanes/med/lane-client.ts";
import { cartLineCount } from "../../../src/lanes/med/oracle.ts";
import { runScopedName } from "../../../src/run/prefix.ts";

test.describe("medusa store invalid variant", () => {
  test("P2-MED-CON-002 an invalid variant returns the documented error shape and leaves no cart line", async ({
    request,
    medAuth,
    med,
  }) => {
    const spec = await loadSpec("medusa-store", MED_SPEC_FILE);
    const lane = laneOf({ request, medAuth });
    const label = "con002";
    try {
      const region = await lane.regionFor("usd");
      const cart = await lane.store<{ cart: { id: string } }>("POST", "/store/carts", {
        body: { region_id: region.id, email: buyerEmail(label) },
      });
      const cartId = cart.body.cart.id;

      const bad = await lane.rawPost(`/store/carts/${cartId}/line-items`, {
        variant_id: "variant_does_not_exist",
        quantity: 1,
      });
      expect(bad.status).toBe(400);
      expectContract(spec, { method: "post", path: "/store/carts/{id}/line-items" }, 400, bad.body);
      const body = bad.body as { type: string; message: string };
      expect(body.type).toBe("invalid_data");
      expect(body.message).toMatch(/variant_does_not_exist do not exist/);
      expect(await cartLineCount(cartId)).toBe(0);
    } finally {
      await med.admin.deleteCustomersByEmailPrefix(runScopedName(label));
      await lane.releaseRegions();
    }
  });
});
