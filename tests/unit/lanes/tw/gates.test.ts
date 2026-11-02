import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { liveGate, stripeKeyPresent } from "../../../../src/lanes/tw/gates.ts";

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
});
