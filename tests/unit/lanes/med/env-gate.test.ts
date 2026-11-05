import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isStripeTestKey, laneEnvGate, type Gate } from "../../../../src/lanes/med/env-gate.ts";

/** The reason of a gate that is not ready (empty when it is ready). */
const reasonOf = (gate: Gate): string => (gate.ready ? "" : gate.reason);

const stripe = {
  isValid: isStripeTestKey,
  expectText: "a Stripe test-mode key",
  reason: "the provider needs it",
};

describe("lane environment gate (medusa lane)", () => {
  test("locally a missing key skips with the reason, and does not throw", () => {
    const gate = laneEnvGate("STRIPE_API_KEY", stripe, {});
    assert.equal(gate.ready, false);
    assert.match(reasonOf(gate), /STRIPE_API_KEY is not set locally: the provider needs it/);
  });

  test("locally a live-looking key is reported as wrong, without printing it", () => {
    const gate = laneEnvGate("STRIPE_API_KEY", stripe, { STRIPE_API_KEY: "sk_live_SECRETVALUE" });
    assert.equal(gate.ready, false);
    assert.match(reasonOf(gate), /is set but is not a Stripe test-mode key/);
    assert.doesNotMatch(reasonOf(gate), /SECRETVALUE/);
  });

  test("in CI a missing key THROWS and names the variable, never a value", () => {
    assert.throws(
      () => laneEnvGate("STRIPE_API_KEY", stripe, { CI: "true" }),
      (error: Error) =>
        /STRIPE_API_KEY is not set in CI/.test(error.message) && !/whsec|sk_/.test(error.message),
    );
  });

  test("in CI a wrong key THROWS and names the variable, never the value", () => {
    assert.throws(
      () =>
        laneEnvGate("STRIPE_API_KEY", stripe, {
          CI: "true",
          STRIPE_API_KEY: "sk_live_SECRETVALUE",
        }),
      (error: Error) =>
        /STRIPE_API_KEY is set but is not a Stripe test-mode key in CI/.test(error.message) &&
        !/SECRETVALUE/.test(error.message),
    );
  });

  test("a correct value is ready both locally and in CI", () => {
    assert.deepEqual(laneEnvGate("STRIPE_API_KEY", stripe, { STRIPE_API_KEY: "sk_test_x" }), {
      ready: true,
    });
    assert.deepEqual(
      laneEnvGate("STRIPE_API_KEY", stripe, { CI: "true", STRIPE_API_KEY: "sk_test_x" }),
      { ready: true },
    );
  });

  test("the cache flag must be the string true: in CI a wrong value throws, locally it skips", () => {
    const cache = {
      isValid: (v: string) => v === "true",
      expectText: 'the string "true"',
      reason: "the core cache is off without it",
    };
    assert.equal(laneEnvGate("MEDUSA_FF_CACHING", cache, { MEDUSA_FF_CACHING: "1" }).ready, false);
    assert.throws(
      () => laneEnvGate("MEDUSA_FF_CACHING", cache, { CI: "true", MEDUSA_FF_CACHING: "1" }),
      /MEDUSA_FF_CACHING is set but is not the string "true" in CI/,
    );
    assert.deepEqual(
      laneEnvGate("MEDUSA_FF_CACHING", cache, { CI: "true", MEDUSA_FF_CACHING: "true" }),
      { ready: true },
    );
  });
});
