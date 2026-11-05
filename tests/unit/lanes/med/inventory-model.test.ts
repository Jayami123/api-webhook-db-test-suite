import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  apply,
  EMPTY,
  identityHolds,
  mulberry32,
  nextOp,
  type LevelModel,
} from "../../../../src/lanes/med/inventory-model.ts";

function sequence(seed: number, steps: number): LevelModel[] {
  const rnd = mulberry32(seed);
  let model = EMPTY;
  const out: LevelModel[] = [];
  for (let i = 0; i < steps; i++) {
    model = apply(model, nextOp(model, rnd));
    out.push(model);
  }
  return out;
}

describe("inventory model (medusa lane)", () => {
  test("the same seed gives the same operation sequence", () => {
    assert.deepEqual(sequence(42, 12), sequence(42, 12));
  });

  test("a different seed gives a different first operation within 20 steps", () => {
    const first = (seed: number) => {
      const rnd = mulberry32(seed);
      return JSON.stringify(nextOp(EMPTY, rnd));
    };
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) seen.add(first(seed));
    assert.ok(seen.size > 1, "at least two distinct first operations across 20 seeds");
  });

  test("nextOp never chooses an illegal reserve or release; identityHolds stays true for 200 steps", () => {
    const rnd = mulberry32(7);
    let model = EMPTY;
    for (let step = 0; step < 200; step++) {
      const op = nextOp(model, rnd);
      model = apply(model, op);
      assert.ok(model.reserved >= 0 && model.stocked - model.reserved >= 0, `step ${step}`);
      assert.equal(identityHolds(model, model.stocked - model.reserved), true, `step ${step}`);
    }
  });

  test("apply refuses a reserve above available (the model can fail)", () => {
    const model: LevelModel = { stocked: 2, reserved: 1 };
    assert.throws(
      () => apply(model, { kind: "reserve", qty: 2 }),
      /refuses a reserve above available/,
    );
    assert.throws(
      () => apply(EMPTY, { kind: "release", qty: 1 }),
      /refuses a release above reserved/,
    );
  });
});
