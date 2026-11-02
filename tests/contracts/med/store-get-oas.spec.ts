import { test, expect } from "../../../src/fixtures/index.ts";
import { loadSpec } from "../../../src/contracts/oas.ts";
import { buyerEmail } from "../../../src/lanes/med/buyer.ts";
import { expectContract, MED_SPEC_FILE } from "../../../src/lanes/med/contract.ts";
import { laneOf } from "../../../src/lanes/med/lane-client.ts";
import { runScopedName } from "../../../src/run/prefix.ts";

interface GetRoute {
  readonly template: string;
  readonly url: (cartId: string, regionId: string) => string;
  readonly status: number;
}

/** Every GET route of the lane's contract subset, with valid parameters, and the status it answers. */
const GET_ROUTES: readonly GetRoute[] = [
  { template: "/store/regions", url: () => "/store/regions", status: 200 },
  { template: "/store/products", url: () => "/store/products?limit=2", status: 200 },
  {
    template: "/store/product-categories",
    url: () => "/store/product-categories?limit=2",
    status: 200,
  },
  { template: "/store/collections", url: () => "/store/collections?limit=2", status: 200 },
  { template: "/store/product-tags", url: () => "/store/product-tags?limit=2", status: 200 },
  { template: "/store/product-types", url: () => "/store/product-types?limit=2", status: 200 },
  { template: "/store/currencies", url: () => "/store/currencies?limit=2", status: 200 },
  { template: "/store/return-reasons", url: () => "/store/return-reasons", status: 200 },
  {
    template: "/store/payment-providers",
    url: (_c, regionId) => `/store/payment-providers?region_id=${regionId}`,
    status: 200,
  },
  {
    template: "/store/shipping-options",
    url: (cartId) => `/store/shipping-options?cart_id=${cartId}`,
    status: 200,
  },
  { template: "/store/carts/{id}", url: (cartId) => `/store/carts/${cartId}`, status: 200 },
  { template: "/store/customers/me", url: () => "/store/customers/me", status: 401 },
  { template: "/store/orders", url: () => "/store/orders", status: 401 },
];

test.describe("medusa store GET routes", () => {
  test("P2-MED-CON-003 every GET store route with valid parameters matches the OAS and returns no 5xx", async ({
    request,
    medAuth,
    med,
  }) => {
    const spec = await loadSpec("medusa-store", MED_SPEC_FILE);
    const lane = laneOf({ request, medAuth });
    const label = "con003";
    try {
      const region = await lane.regionFor("usd");
      const cart = await lane.store<{ cart: { id: string } }>("POST", "/store/carts", {
        body: { region_id: region.id, email: buyerEmail(label) },
      });
      const cartId = cart.body.cart.id;
      for (const route of GET_ROUTES) {
        const res = await lane.rawGet(route.url(cartId, region.id));
        expect(res.status, `GET ${route.template}`).toBeLessThan(500);
        expect(res.status, `GET ${route.template}`).toBe(route.status);
        expectContract(spec, { method: "get", path: route.template }, res.status, res.body);
      }
    } finally {
      await med.admin.deleteCustomersByEmailPrefix(runScopedName(label));
      await lane.releaseRegions();
    }
  });
});
