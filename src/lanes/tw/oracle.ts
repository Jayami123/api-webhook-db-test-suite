import {
  TWENTY_NONCE_HEADER,
  TWENTY_SIGNATURE_HEADER,
  TWENTY_TIMESTAMP_HEADER,
} from "../../webhooks/sign.ts";
import type { Delivery } from "../../webhooks/receiver.ts";
import { verifyTwenty, type VerifyResult } from "../../webhooks/verify.ts";
import { TW_RECEIPT_TOLERANCE_MS } from "./slo.ts";

type Headers = Delivery["headers"];

/**
 * Verifies a recorded delivery with the receipt time as the clock (TW-WH-001: |timestamp - receipt| <= 5 s).
 * The product signs `${timestamp}:${JSON.stringify(payload)}`; the receiver keeps the raw bytes, so this checks the
 * exact bytes sent (call-webhook.job.ts:38-47; P-TW-1 CONFIRMED).
 */
export function verifyDelivery(
  delivery: Pick<Delivery, "rawBody" | "headers" | "receivedAt">,
  secret: string,
): VerifyResult {
  return verifyTwenty({
    secret,
    rawBody: delivery.rawBody,
    headers: delivery.headers,
    nowMs: Date.parse(delivery.receivedAt),
    toleranceMs: TW_RECEIPT_TOLERANCE_MS,
  });
}

/** TW-WH-007: the same delivery with another nonce. The nonce is not signed (P-TW-1), so this must still verify. */
export function withNonce(headers: Headers, nonce: string): Headers {
  return { ...headers, [TWENTY_NONCE_HEADER.toLowerCase()]: nonce };
}

/** TW-WH-001 negative control: one byte flipped near the end of the body (same length). Must fail verification. */
export function flipOneBodyByte(rawBody: Buffer): Buffer {
  const out = Buffer.from(rawBody);
  const at = out.length - 2;
  const byte = out[at];
  if (byte === undefined) throw new Error("TEST BUG: body too short to flip a byte");
  out[at] = byte ^ 0x01;
  return out;
}

/** Lower-cased header names as the receiver stores them (receiver.ts Delivery.headers). */
export function lowerCaseHeaders(input: Record<string, string>): Headers {
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [k.toLowerCase(), v]));
}

export { TWENTY_SIGNATURE_HEADER, TWENTY_TIMESTAMP_HEADER };
