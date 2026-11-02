import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type Stripe from "stripe";
import { assertTestModeKey, teardownRunStripe } from "../../../../src/lanes/doc/stripe-fixture.ts";

describe("assertTestModeKey (FC-6: test-mode guard)", () => {
  test("an unset key is refused with the ENV message", () => {
    assert.throws(() => assertTestModeKey(undefined), /ENV: STRIPE_API_KEY is not set/);
  });

  test("a live key is refused and its value is not in the message", () => {
    const live = "sk_live_FAKE";
    assert.throws(
      () => assertTestModeKey(live),
      (e: Error) => /sk_test_/.test(e.message) && !e.message.includes(live),
    );
  });

  test("a restricted key is refused (only secret test-mode keys run)", () => {
    assert.throws(() => assertTestModeKey("rk_test_FAKE"), /ENV: STRIPE_API_KEY is not a secret/);
  });

  test("a secret test-mode key is returned unchanged", () => {
    assert.equal(assertTestModeKey("sk_test_FAKE"), "sk_test_FAKE");
  });
});

describe("teardownRunStripe (every step attempted, codes only)", () => {
  test("a failed subscription cancel does not stop customer and product cleanup, and the message holds the code only", async () => {
    const calls: string[] = [];
    const fake = {
      subscriptions: {
        cancel: () => {
          calls.push("subscription.cancel");
          return Promise.reject(
            Object.assign(new Error("No such subscription: sub_FAKE"), {
              code: "resource_missing",
            }),
          );
        },
      },
      customers: {
        del: () => {
          calls.push("customer.del");
          return Promise.resolve({});
        },
      },
      products: {
        update: () => {
          calls.push("product.update");
          return Promise.resolve({});
        },
      },
    } as unknown as Stripe;
    await assert.rejects(
      teardownRunStripe(fake, {
        runId: "p2-qa-fake",
        subscriptionId: "sub_FAKE",
        customerId: "cus_FAKE",
        productId: "prod_FAKE",
      }),
      (e: Error) =>
        e.message.includes("subscription:resource_missing") &&
        !e.message.includes("No such subscription") &&
        !e.message.includes("sub_FAKE"),
    );
    assert.deepEqual(calls, ["subscription.cancel", "customer.del", "product.update"]);
  });
});
