// Independent money oracle for the medusa lane. Minor units follow ISO 4217, the same table the
// product ships (@medusajs/utils currencies.js:518-524 JPY 0, :563-569 KWD 3). Integers only; a value
// with more decimals than its currency is refused, never rounded silently.
const MINOR_UNITS: Readonly<Record<string, number>> = { USD: 2, EUR: 2, JPY: 0, KWD: 3 };

export function minorUnits(currency: string): number {
  const digits = MINOR_UNITS[currency.toUpperCase()];
  if (digits === undefined) throw new Error(`TEST BUG: no minor-unit entry for ${currency}`);
  return digits;
}

export function toMinor(amount: number, currency: string): number {
  const scaled = amount * 10 ** minorUnits(currency);
  const nearest = Math.round(scaled);
  if (Math.abs(scaled - nearest) > 1e-9) {
    throw new Error(
      `TEST BUG: ${String(amount)} ${currency} has more decimals than the currency allows`,
    );
  }
  return nearest;
}

export function isWithinPrecision(amount: number, currency: string): boolean {
  try {
    toMinor(amount, currency);
    return true;
  } catch {
    return false;
  }
}

export interface OrderLinesMinor {
  readonly items: readonly { readonly unitMinor: number; readonly quantity: number }[];
  readonly shippingMinor: number;
  readonly taxMinor: number;
  readonly discountMinor: number;
}

/** Conservation identity: sum(unit x qty) + shipping + tax - discounts, in integers. */
export function orderTotalMinor(lines: OrderLinesMinor): number {
  const items = lines.items.reduce((sum, line) => sum + line.unitMinor * line.quantity, 0);
  return items + lines.shippingMinor + lines.taxMinor - lines.discountMinor;
}

/**
 * The charge the product sends for an amount, under the upstream rule for 3-decimal currencies:
 * round UP to a multiple of 10 minor units (payment-stripe get-smallest-unit.ts:9 asserts
 * 5.124 KWD -> 5130; product code get-smallest-unit.js:52-54). Used only to compare; a gap is
 * recorded (RD-13), never hidden.
 */
export function stripeChargeMinor(amount: number, currency: string): number {
  const minor = toMinor(amount, currency);
  return minorUnits(currency) === 3 ? Math.ceil(minor / 10) * 10 : minor;
}
