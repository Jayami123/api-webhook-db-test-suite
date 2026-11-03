import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { requireDocKey } from "../../../../src/lanes/doc/env-gate.ts";

const shape = /^sk_test_/;

describe("requireDocKey (A2: CI fails when the Stripe key is missing or wrong)", () => {
  test("a value of the expected shape passes locally and in CI", () => {
    assert.equal(requireDocKey("STRIPE_API_KEY", shape, { STRIPE_API_KEY: "sk_test_x" }), true);
    assert.equal(
      requireDocKey("STRIPE_API_KEY", shape, { CI: "true", STRIPE_API_KEY: "sk_test_x" }),
      true,
    );
  });

  test("a missing value skips locally and throws in CI, naming the variable", () => {
    assert.equal(requireDocKey("STRIPE_API_KEY", shape, {}), false);
    assert.throws(
      () => requireDocKey("STRIPE_API_KEY", shape, { CI: "true" }),
      (e: Error) => {
        assert.match(e.message, /STRIPE_API_KEY is not set in CI/);
        return true;
      },
    );
  });

  test("a value of the wrong shape skips locally and throws in CI, never printing the value", () => {
    const secret = "sk_live_should_not_appear";
    assert.equal(requireDocKey("STRIPE_API_KEY", shape, { STRIPE_API_KEY: secret }), false);
    assert.throws(
      () => requireDocKey("STRIPE_API_KEY", shape, { CI: "true", STRIPE_API_KEY: secret }),
      (e: Error) => {
        assert.match(e.message, /STRIPE_API_KEY is not in the expected shape/);
        assert.equal(e.message.includes(secret), false);
        return true;
      },
    );
  });
});
