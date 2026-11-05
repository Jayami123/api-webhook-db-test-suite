import { test, expect } from "../../../src/fixtures/index.ts";
import { loadSpec } from "../../../src/contracts/oas.ts";
import { buyerEmail } from "../../../src/lanes/med/buyer.ts";
import {
  documentedTextPlain,
  expectContract,
  MED_SPEC_FILE,
} from "../../../src/lanes/med/contract.ts";
import { cleanupLabel, laneOf } from "../../../src/lanes/med/lane-client.ts";

interface GetRoute {
  readonly template: string;
  readonly url: (cartId: string, regionId: string) => string;
  readonly status: number;
  /** The upstream contract documents this response as text/plain: asserted by hand, not validated. */
  readonly textPlain?: boolean;
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
  {
    template: "/store/customers/me",
    url: () => "/store/customers/me",
    status: 401,
    textPlain: true,
  },
  { template: "/store/orders", url: () => "/store/orders", status: 401, textPlain: true },
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
      // One line in the cart: the register's GET /store/carts/{id} signatures are those of a cart with a line.
      const product = await lane.productWithPrice(label, "usd", 10);
      const line = await lane.store("POST", `/store/carts/${cartId}/line-items`, {
        body: { variant_id: product.variantId, quantity: 1 },
      });
      expect(line.status).toBe(200);
      for (const route of GET_ROUTES) {
        const res = await lane.rawGet(route.url(cartId, region.id));
        expect(res.status, `GET ${route.template}`).toBeLessThan(500);
        expect(res.status, `GET ${route.template}`).toBe(route.status);
        if (route.textPlain === true) {
          // The validator cannot read a text/plain schema; the register records that the spec documents it so.
          documentedTextPlain({ method: "get", path: route.template }, route.status);
          expect(
            (res.body as { message?: unknown }).message,
            `GET ${route.template} message`,
          ).toEqual(expect.any(String));
        } else {
          expectContract(spec, { method: "get", path: route.template }, res.status, res.body);
        }
      }
    } finally {
      await cleanupLabel(lane, med, label);
    }
  });
});
