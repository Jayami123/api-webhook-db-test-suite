import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { hasStripeKey, stripeWebhookSecret } from "../../../../src/lanes/doc/stripe.ts";

describe("stripe lane helpers (OD-2: named condition, never silent)", () => {
  test("hasStripeKey is false when the key is absent", () => {
    assert.equal(hasStripeKey({}), false);
  });

  test("hasStripeKey is false for a blank key (blank does not count as set)", () => {
    assert.equal(hasStripeKey({ STRIPE_API_KEY: "   " }), false);
  });

  test("stripeWebhookSecret throws without the variable (no default is used)", () => {
    assert.throws(() => stripeWebhookSecret({}), /ENV: P2_STRIPE_TEST_WH_SECRET is not set/);
  });
});
