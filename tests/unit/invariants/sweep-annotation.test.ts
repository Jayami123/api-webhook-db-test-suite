import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SWEEP_ANNOTATION_TYPE, sweepAnnotation } from "../../../src/invariants/after-test.ts";

describe("the invariant-sweep annotation", () => {
  test("names the sweep and gives the product, rule count and violation count", () => {
    assert.equal(SWEEP_ANNOTATION_TYPE, "invariant-sweep");
    assert.deepEqual(sweepAnnotation("documenso", 12, 0), {
      type: "invariant-sweep",
      description: "documenso: 12 rules, 0 violations",
    });
  });

  test("reports a violation count when the sweep finds rows", () => {
    assert.equal(
      sweepAnnotation("documenso", 12, 2).description,
      "documenso: 12 rules, 2 violations",
    );
  });

  test("a zero-rule product still writes the annotation with zero", () => {
    assert.equal(sweepAnnotation("cal", 0, 0).description, "cal: 0 rules, 0 violations");
  });
});
