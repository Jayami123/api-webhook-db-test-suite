import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isWithinPrecision,
  minorUnits,
  orderTotalMinor,
  stripeChargeMinor,
  toMinor,
} from "../../../../src/lanes/med/money.ts";

describe("money oracle (medusa lane)", () => {
  test("minorUnits: JPY 0, KWD 3, USD 2", () => {
    assert.equal(minorUnits("JPY"), 0);
    assert.equal(minorUnits("KWD"), 3);
    assert.equal(minorUnits("usd"), 2);
  });

  test("minorUnits throws a TEST BUG for an unlisted currency", () => {
    assert.throws(() => minorUnits("XYZ"), /TEST BUG: no minor-unit entry for XYZ/);
  });

  test("isWithinPrecision accepts 1234 JPY and rejects 1234.5 JPY", () => {
    assert.equal(isWithinPrecision(1234, "JPY"), true);
    assert.equal(isWithinPrecision(1234.5, "JPY"), false);
  });

  test("isWithinPrecision accepts 1.234 KWD and rejects 1.2345 KWD", () => {
    assert.equal(isWithinPrecision(1.234, "KWD"), true);
    assert.equal(isWithinPrecision(1.2345, "KWD"), false);
  });

  test("toMinor converts 1.234 KWD to 1234 and throws on 1.2345 KWD (no silent rounding)", () => {
    assert.equal(toMinor(1.234, "KWD"), 1234);
    assert.throws(() => toMinor(1.2345, "KWD"), /more decimals than the currency allows/);
  });

  test("orderTotalMinor sums items, shipping and tax and subtracts discounts in integers", () => {
    const total = orderTotalMinor({
      items: [
        { unitMinor: 1234, quantity: 3 },
        { unitMinor: 500, quantity: 2 },
      ],
      shippingMinor: 700,
      taxMinor: 120,
      discountMinor: 250,
    });
    assert.equal(total, 3702 + 1000 + 700 + 120 - 250);
    assert.equal(Number.isInteger(total), true);
  });

  test("orderTotalMinor changes by one minor unit when tax changes by one (conservation mutation)", () => {
    const base = { items: [{ unitMinor: 1000, quantity: 1 }], shippingMinor: 0, discountMinor: 0 };
    assert.equal(
      orderTotalMinor({ ...base, taxMinor: 50 }) - orderTotalMinor({ ...base, taxMinor: 49 }),
      1,
    );
  });

  test("stripeChargeMinor: 1.234 KWD -> 1240, 5.124 KWD -> 5130 (upstream rule), 1234 JPY -> 1234", () => {
    assert.equal(stripeChargeMinor(1.234, "KWD"), 1240);
    assert.equal(stripeChargeMinor(5.124, "KWD"), 5130);
    assert.equal(stripeChargeMinor(1234, "JPY"), 1234);
  });
});
