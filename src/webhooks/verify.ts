import { createHmac, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import {
  CAL_NO_SECRET_SIGNATURE,
  CAL_SIGNATURE_HEADER,
  computeDailySignature,
  DAILY_SIGNATURE_HEADER,
  DAILY_TIMESTAMP_HEADER,
  DOCUMENSO_SECRET_HEADER,
  STRIPE_SIGNATURE_HEADER,
  toBuffer,
  TWENTY_SIGNATURE_HEADER,
  TWENTY_TIMESTAMP_HEADER,
  type BodyInput,
} from "./sign.ts";

/**
 * Verifiers: what a correct receiver (or the product, for inbound schemes) computes. All of them
 * work on the RAW body bytes. Failure reasons are fixed strings so tests can assert them.
 */
export type VerifyFailure =
  | "missing-header"
  | "malformed-header"
  | "malformed-body"
  | "signature-mismatch"
  | "stale-timestamp";

export type VerifyResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: VerifyFailure };

export type HeaderBag = Readonly<Record<string, string | readonly string[] | undefined>>;

const OK: VerifyResult = { ok: true };
const fail = (reason: VerifyFailure): VerifyResult => ({ ok: false, reason });

/** Case-insensitive single-value lookup. Repeated headers count as missing (ambiguous). */
export function headerValue(headers: HeaderBag, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== wanted || value === undefined) continue;
    return typeof value === "string" ? value : value.length === 1 ? value[0] : undefined;
  }
  return undefined;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Cal outgoing: sendPayload.ts:296-299. No timestamp, so there is no stale case. */
export function verifyCal(input: {
  secret: string | null;
  rawBody: BodyInput;
  headers: HeaderBag;
}): VerifyResult {
  const received = headerValue(input.headers, CAL_SIGNATURE_HEADER);
  if (received === undefined) return fail("missing-header");
  const expected = input.secret
    ? createHmac("sha256", input.secret).update(toBuffer(input.rawBody)).digest("hex")
    : CAL_NO_SECRET_SIGNATURE;
  return constantTimeEqual(received, expected) ? OK : fail("signature-mismatch");
}

/** Documenso outgoing: the header must equal the configured secret (no HMAC, no timestamp). */
export function verifyDocumenso(input: { secret: string; headers: HeaderBag }): VerifyResult {
  const received = headerValue(input.headers, DOCUMENSO_SECRET_HEADER);
  if (received === undefined) return fail("missing-header");
  return constantTimeEqual(received, input.secret) ? OK : fail("signature-mismatch");
}

/**
 * Twenty outgoing. `toleranceMs` is a P2 receiver policy, not a product rule (the product sends a
 * timestamp but documents no tolerance), so the caller must choose: a number, or `null` for none.
 */
export function verifyTwenty(input: {
  secret: string;
  rawBody: BodyInput;
  headers: HeaderBag;
  nowMs: number;
  toleranceMs: number | null;
}): VerifyResult {
  const timestamp = headerValue(input.headers, TWENTY_TIMESTAMP_HEADER);
  const received = headerValue(input.headers, TWENTY_SIGNATURE_HEADER);
  if (timestamp === undefined || received === undefined) return fail("missing-header");
  if (!/^\d{1,16}$/.test(timestamp)) return fail("malformed-header");
  const expected = createHmac("sha256", input.secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}:`, "utf8"), toBuffer(input.rawBody)]))
    .digest("hex");
  if (!constantTimeEqual(received, expected)) return fail("signature-mismatch");
  if (input.toleranceMs !== null && Math.abs(input.nowMs - Number(timestamp)) > input.toleranceMs) {
    return fail("stale-timestamp");
  }
  return OK;
}

/**
 * Cal inbound (Daily), as Cal itself verifies it: parse the body, re-serialise, sign. Cal checks
 * no tolerance (route.ts:62-75), so staleness is opt-in through `toleranceSeconds` (P2 policy).
 */
export function verifyDaily(input: {
  secretBase64: string;
  rawBody: BodyInput;
  headers: HeaderBag;
  nowSeconds: number;
  toleranceSeconds: number | null;
}): VerifyResult {
  const received = headerValue(input.headers, DAILY_SIGNATURE_HEADER);
  if (received === undefined) return fail("missing-header");
  const timestamp = headerValue(input.headers, DAILY_TIMESTAMP_HEADER) ?? null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(toBuffer(input.rawBody).toString("utf8"));
  } catch {
    return fail("malformed-body");
  }
  const expected = computeDailySignature(input.secretBase64, parsed, timestamp);
  if (!constantTimeEqual(received, expected)) return fail("signature-mismatch");
  if (input.toleranceSeconds !== null && timestamp !== null) {
    if (!/^\d{1,16}$/.test(timestamp)) return fail("malformed-header");
    if (Math.abs(input.nowSeconds - Number(timestamp)) > input.toleranceSeconds) {
      return fail("stale-timestamp");
    }
  }
  return OK;
}

/**
 * Stripe: the SDK verifier, so the construction can never drift from the signer. The SDK throws
 * StripeSignatureVerificationError; its message selects the failure. `nowMs` feeds the SDK's
 * `receivedAt` parameter, which keeps the stale check deterministic.
 */
export function verifyStripe(input: {
  secret: string;
  rawBody: BodyInput;
  headers: HeaderBag;
  nowMs: number;
  toleranceSeconds?: number;
}): VerifyResult {
  const header = headerValue(input.headers, STRIPE_SIGNATURE_HEADER);
  if (header === undefined) return fail("missing-header");
  try {
    Stripe.webhooks.constructEvent(
      toBuffer(input.rawBody).toString("utf8"),
      header,
      input.secret,
      input.toleranceSeconds ?? Stripe.webhooks.DEFAULT_TOLERANCE,
      undefined,
      input.nowMs,
    );
    return OK;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("tolerance zone")) return fail("stale-timestamp");
    if (message.includes("Unable to extract timestamp and signatures")) {
      return fail("malformed-header");
    }
    if (message.includes("No signatures found")) return fail("signature-mismatch");
    if (error instanceof SyntaxError) return fail("malformed-body"); // verified, then not JSON
    throw error;
  }
}
