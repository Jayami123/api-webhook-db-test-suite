import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { liveGate, requireTwEnv, stripeKeyPresent } from "../../../../src/lanes/tw/gates.ts";

describe("live gates", () => {
  test("liveGate skips with the blocker named when not ready", () => {
    assert.deepEqual(liveGate("P2-TW-STR-001", false, "billing tables absent"), {
      skip: true,
      reason: "P2-TW-STR-001 blocked: billing tables absent",
    });
  });

  test("liveGate passes through when ready (empty reason)", () => {
    assert.deepEqual(liveGate("P2-TW-STR-001", true, "unused"), { skip: false, reason: "" });
  });

  test("stripeKeyPresent is false for an unset or blank key, and true for a set key", () => {
    assert.equal(stripeKeyPresent({}), false);
    assert.equal(stripeKeyPresent({ STRIPE_API_KEY: "   " }), false);
    assert.equal(stripeKeyPresent({ STRIPE_API_KEY: "set" }), true);
  });

  test("requireTwEnv passes when the flag has the required value, in CI or not", () => {
    assert.deepEqual(
      requireTwEnv("IS_MULTIWORKSPACE_ENABLED", "true", {
        IS_MULTIWORKSPACE_ENABLED: "true",
        CI: "1",
      }),
      {
        skip: false,
        reason: "",
      },
    );
  });

  test("requireTwEnv skips locally with the variable named, and throws in CI, without printing the value", () => {
    const local = requireTwEnv("IS_MULTIWORKSPACE_ENABLED", "true", {
      IS_MULTIWORKSPACE_ENABLED: "false",
    });
    assert.equal(local.skip, true);
    assert.match(local.reason, /IS_MULTIWORKSPACE_ENABLED must be "true"/);
    assert.doesNotMatch(local.reason, /false/);
    assert.throws(
      () => requireTwEnv("TWENTY_SERVER_REPLICAS", "2", { CI: "true" }),
      /CI: TWENTY_SERVER_REPLICAS must be "2"/,
    );
  });
});
