import { test, expect } from "../../../src/fixtures/index.ts";
import { loadSpec, type ContractSpec, type OperationRef } from "../../../src/contracts/oas.ts";
import { buyerEmail } from "../../../src/lanes/med/buyer.ts";
import {
  loadRegister,
  MED_SPEC_FILE,
  observedDeviations,
  opName,
} from "../../../src/lanes/med/contract.ts";
import { cleanupLabel, laneOf } from "../../../src/lanes/med/lane-client.ts";
import { expectedDefect } from "../../../src/ci/known-defect.ts";

/**
 * The responses of the flow the PRODUCT deviations are measured on. Setup first (a normal test), then the
 * known product bugs as test.fail: the test is expected red, and it is red because the response omits a
 * key the published contract requires (see src/lanes/med/deviation-register.json, class PRODUCT).
 */
const LABEL = "conprod";

interface FlowBodies {
  readonly ops: { op: OperationRef; status: number; body: unknown }[];
  readonly cartId: string;
}

async function runFlow(
  lane: ReturnType<typeof laneOf>,
  regionId: string,
  variantId: string,
): Promise<FlowBodies> {
  const ops: FlowBodies["ops"] = [];
  const cart = await lane.store<{ cart: { id: string } }>("POST", "/store/carts", {
    body: { region_id: regionId, email: buyerEmail(LABEL) },
  });
  ops.push({ op: { method: "post", path: "/store/carts" }, status: cart.status, body: cart.body });
  const cartId = cart.body.cart.id;
  const line = await lane.store("POST", `/store/carts/${cartId}/line-items`, {
    body: { variant_id: variantId, quantity: 1 },
  });
  ops.push({
    op: { method: "post", path: "/store/carts/{id}/line-items" },
    status: line.status,
    body: line.body,
  });
  const got = await lane.store("GET", `/store/carts/${cartId}`);
  ops.push({
    op: { method: "get", path: "/store/carts/{id}" },
    status: got.status,
    body: got.body,
  });
  const pc = await lane.store<{ payment_collection: { id: string } }>(
    "POST",
    "/store/payment-collections",
    { body: { cart_id: cartId } },
  );
  ops.push({
    op: { method: "post", path: "/store/payment-collections" },
    status: pc.status,
    body: pc.body,
  });
  const ps = await lane.store(
    "POST",
    `/store/payment-collections/${pc.body.payment_collection.id}/payment-sessions`,
    {
      body: { provider_id: "pp_system_default" },
    },
  );
  ops.push({
    op: { method: "post", path: "/store/payment-collections/{id}/payment-sessions" },
    status: ps.status,
    body: ps.body,
  });
  const complete = await lane.store("POST", `/store/carts/${cartId}/complete`, { body: {} });
  ops.push({
    op: { method: "post", path: "/store/carts/{id}/complete" },
    status: complete.status,
    body: complete.body,
  });
  for (const [url, path] of [
    ["/store/regions", "/store/regions"],
    ["/store/products?limit=2", "/store/products"],
    ["/store/product-categories?limit=2", "/store/product-categories"],
    ["/store/collections?limit=2", "/store/collections"],
    ["/store/currencies?limit=2", "/store/currencies"],
  ] as const) {
    const list = await lane.store("GET", url);
    ops.push({ op: { method: "get", path }, status: list.status, body: list.body });
  }
  return { ops, cartId };
}

test.describe("medusa store product deviations", () => {
  test("P2-MED-CON-PRODUCT setup: the flow answers 200 on every step the deviations are measured on", async ({
    request,
    medAuth,
    med,
  }) => {
    const lane = laneOf({ request, medAuth });
    try {
      const region = await lane.regionFor("usd");
      const product = await lane.productWithPrice(LABEL, "usd", 10);
      const flow = await runFlow(lane, region.id, product.variantId);
      expect(flow.ops.map((o) => o.status)).toEqual([
        200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200,
      ]);
    } finally {
      await cleanupLabel(lane, med, LABEL);
    }
  });

  // The register is the measurement the expected-red test relies on. A normal test: a wrong count is a failure,
  // not a "known bug" that test.fail would hide.
  test("P2-MED-CON-PRODUCT the deviation register lists the 101 PRODUCT deviations", () => {
    const registered = loadRegister().filter((e) => e.class === "PRODUCT");
    expect(registered.length, "the register lists the product deviations").toBe(101);
  });

  // KNOWN PRODUCT BUGS (suspected, from the register). Expected red: each PRODUCT entry is a response that
  // omits a key the published contract (info.version 2.21.1 at tag v2.21.2) requires. A normal test whose setup is
  // asserted first; test.fail is called only right before the deviations assert, so a setup failure is a real red.
  // Fix the product or the spec, then regenerate the register; the unexpected pass then says to remove the marker.
  test("P2-MED-CON-PRODUCT every store response carries every key the published contract requires (expected red)", async ({
    request,
    medAuth,
    med,
  }) => {
    const lane = laneOf({ request, medAuth });
    try {
      const region = await lane.regionFor("usd");
      const product = await lane.productWithPrice(LABEL, "usd", 10);
      const flow = await runFlow(lane, region.id, product.variantId);
      for (const step of flow.ops)
        expect(step.status, `setup: ${opName(step.op)} answers 200`).toBe(200);
      const spec: ContractSpec = await loadSpec("medusa-store", MED_SPEC_FILE);
      const productDeviations: string[] = [];
      for (const step of flow.ops) {
        for (const [key] of observedDeviations(spec, step.op, step.status, step.body)) {
          if (key.startsWith("required|") || key.startsWith("oneOf|"))
            productDeviations.push(`${opName(step.op)} ${key}`);
        }
      }
      expectedDefect(
        "P2-MED-CON-PRODUCT: known product deviations: store responses omit keys the published contract requires (deviation register, class PRODUCT; src/lanes/med/contract.ts:7)",
      );
      expect(productDeviations, "product deviations observed now").toEqual([]);
    } finally {
      await cleanupLabel(lane, med, LABEL);
    }
  });
});
