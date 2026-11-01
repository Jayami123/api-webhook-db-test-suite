import { createHmac } from "node:crypto";
import Stripe from "stripe";

/**
 * Signers for the five schemes P2 simulates or checks (plan section 2, facts 1-5). Pure: every
 * input, including timestamps and nonces, is a parameter. Each signer returns the exact bytes to
 * send together with the headers, so a test cannot sign one byte sequence and send another.
 * Source lines are at the pinned product refs (scripts/bootstrap.sh).
 */
export type BodyInput = string | Uint8Array;

export interface SignedRequest {
  /** Header names exactly as the product sends them. */
  readonly headers: Readonly<Record<string, string>>;
  /** The bytes that were signed and must be sent unchanged. */
  readonly body: Buffer;
}

export function toBuffer(body: BodyInput): Buffer {
  return typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
}

// ---- Cal outgoing: packages/features/webhooks/lib/sendPayload.ts:296-299 and :316 ----
export const CAL_SIGNATURE_HEADER = "X-Cal-Signature-256";
/** sendPayload.ts:299: the literal Cal sends when the webhook has no secret. */
export const CAL_NO_SECRET_SIGNATURE = "no-secret-provided";

/** HMAC-SHA256 hex over the body's UTF-8 bytes. No timestamp. `null` secret = Cal's literal. */
export function signCal(input: { secret: string | null; body: BodyInput }): SignedRequest {
  const body = toBuffer(input.body);
  const signature = input.secret
    ? createHmac("sha256", input.secret).update(body).digest("hex")
    : CAL_NO_SECRET_SIGNATURE;
  return { headers: { [CAL_SIGNATURE_HEADER]: signature }, body };
}

// ---- Documenso outgoing: packages/lib/server-only/webhooks/execute-webhook-call.ts ----
export const DOCUMENSO_SECRET_HEADER = "X-Documenso-Secret";

/** No HMAC and no timestamp: the configured secret is sent as-is (`secret ?? ''`). */
export function signDocumenso(input: { secret: string | null; body: BodyInput }): SignedRequest {
  return {
    headers: { [DOCUMENSO_SECRET_HEADER]: input.secret ?? "" },
    body: toBuffer(input.body),
  };
}

// ---- Twenty outgoing: .../webhook/jobs/call-webhook.job.ts (generateSignature + headers) ----
export const TWENTY_TIMESTAMP_HEADER = "X-Twenty-Webhook-Timestamp";
export const TWENTY_SIGNATURE_HEADER = "X-Twenty-Webhook-Signature";
export const TWENTY_NONCE_HEADER = "X-Twenty-Webhook-Nonce";

/**
 * HMAC-SHA256 hex over `${timestamp}:${body}`. The timestamp is Date.now() in milliseconds as a
 * decimal string. The nonce is random per delivery and is NOT part of the signed text.
 */
export function signTwenty(input: {
  secret: string;
  body: BodyInput;
  timestampMs: number;
  nonce: string;
}): SignedRequest {
  const body = toBuffer(input.body);
  const timestamp = String(input.timestampMs);
  const signature = createHmac("sha256", input.secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}:`, "utf8"), body]))
    .digest("hex");
  return {
    headers: {
      [TWENTY_TIMESTAMP_HEADER]: timestamp,
      [TWENTY_SIGNATURE_HEADER]: signature,
      [TWENTY_NONCE_HEADER]: input.nonce,
    },
    body,
  };
}

// ---- Cal inbound (Daily): apps/web/app/api/recorded-daily-video/route.ts:40-45, :70-73 ----
export const DAILY_TIMESTAMP_HEADER = "x-webhook-timestamp";
export const DAILY_SIGNATURE_HEADER = "x-webhook-signature";

/**
 * Mirror of Cal's `computeSignature(hmacSecret, reqBody, webhookTimestampHeader)`: HMAC-SHA256
 * keyed with the base64-DECODED secret over `${timestamp}.${JSON.stringify(parsedBody)}`, base64
 * digest. A missing timestamp header becomes the text "null" (template literal, route.ts:41).
 */
export function computeDailySignature(
  secretBase64: string,
  parsedBody: unknown,
  timestamp: string | null,
): string {
  return createHmac("sha256", Buffer.from(secretBase64, "base64"))
    .update(`${String(timestamp)}.${JSON.stringify(parsedBody)}`)
    .digest("base64");
}

/**
 * `raw`: sign the bytes as sent. Valid at Cal only when those bytes already equal
 * JSON.stringify(JSON.parse(bytes)) (compact, key order kept).
 * `reserialised`: sign what Cal recomputes after parsing (route.ts:40-45), so the signature stays
 * valid for any whitespace or escaping in the sent bytes.
 */
export type DailySigningMode = "raw" | "reserialised";

export function signDaily(input: {
  secretBase64: string;
  body: BodyInput;
  timestamp: string | null;
  mode: DailySigningMode;
}): SignedRequest {
  const body = toBuffer(input.body);
  const text = body.toString("utf8");
  const signedText = input.mode === "raw" ? text : JSON.stringify(JSON.parse(text));
  const signature = createHmac("sha256", Buffer.from(input.secretBase64, "base64"))
    .update(`${String(input.timestamp)}.${signedText}`)
    .digest("base64");
  const headers: Record<string, string> = { [DAILY_SIGNATURE_HEADER]: signature };
  if (input.timestamp !== null) headers[DAILY_TIMESTAMP_HEADER] = input.timestamp;
  return { headers, body };
}

// ---- Stripe (Medusa /hooks/payment/..., Documenso and Twenty billing): official SDK only ----
export const STRIPE_SIGNATURE_HEADER = "Stripe-Signature";
/** The SDK's own tolerance in seconds (300 at stripe 23.0.1). Never hard-coded here. */
export const STRIPE_DEFAULT_TOLERANCE_SECONDS: number = Stripe.webhooks.DEFAULT_TOLERANCE;

/** `Stripe-Signature: t=<seconds>,v1=<hex>` from stripe-node's generateTestHeaderString. */
export function signStripe(input: {
  payload: BodyInput;
  secret: string;
  timestampSeconds: number;
}): SignedRequest {
  const body = toBuffer(input.payload);
  const header = Stripe.webhooks.generateTestHeaderString({
    payload: body.toString("utf8"),
    secret: input.secret,
    timestamp: input.timestampSeconds,
  });
  return { headers: { [STRIPE_SIGNATURE_HEADER]: header }, body };
}
