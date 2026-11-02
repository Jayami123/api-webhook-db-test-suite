/** Stateful model for P2-MED-INV-001. Pure: the same seed gives the same sequence, printed by the spec. */
export interface LevelModel {
  readonly stocked: number;
  readonly reserved: number;
}
export type Op =
  | { readonly kind: "restock"; readonly qty: number }
  | { readonly kind: "reserve"; readonly qty: number }
  | { readonly kind: "release"; readonly qty: number };

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const EMPTY: LevelModel = { stocked: 0, reserved: 0 };

/** Legal-by-construction: the generator asks the model before choosing reserve or release. */
export function nextOp(model: LevelModel, rnd: () => number): Op {
  const available = model.stocked - model.reserved;
  const pick = rnd();
  const qty = 1 + Math.floor(rnd() * 3);
  if (pick < 0.3 || (available === 0 && model.reserved === 0)) return { kind: "restock", qty };
  if (pick < 0.8 && available >= qty) return { kind: "reserve", qty };
  if (model.reserved >= qty) return { kind: "release", qty };
  return { kind: "restock", qty };
}

export function apply(model: LevelModel, op: Op): LevelModel {
  switch (op.kind) {
    case "restock":
      return { ...model, stocked: model.stocked + op.qty };
    case "reserve":
      if (op.qty > model.stocked - model.reserved)
        throw new Error("model refuses a reserve above available");
      return { ...model, reserved: model.reserved + op.qty };
    case "release":
      if (op.qty > model.reserved) throw new Error("model refuses a release above reserved");
      return { ...model, reserved: model.reserved - op.qty };
  }
}

/** The identity checked against the product after every step. */
export function identityHolds(model: LevelModel, availableFromProduct: number): boolean {
  return (
    model.reserved >= 0 &&
    model.stocked - model.reserved >= 0 &&
    model.stocked - model.reserved === availableFromProduct
  );
}
