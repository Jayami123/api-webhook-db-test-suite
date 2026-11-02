import type { Delivery } from "../../webhooks/receiver.ts";
import { verifyCal, type VerifyResult } from "../../webhooks/verify.ts";

/** Flips the low bit of one byte. The only tamper the lane uses (negative control). */
export function tamperOneByte(raw: Buffer, index = 0): Buffer {
  if (index < 0 || index >= raw.length) {
    throw new Error(`TEST BUG: tamper index ${String(index)} outside ${String(raw.length)} bytes`);
  }
  const out = Buffer.from(raw);
  out[index] = (out[index] ?? 0) ^ 0x01;
  return out;
}

/** Recomputes the Cal signature over the RECEIVED bytes (the oracle is the receiver, never the sent body). */
export function expectCalSignature(delivery: Delivery, secret: string | null): VerifyResult {
  return verifyCal({ secret, rawBody: delivery.rawBody, headers: delivery.headers });
}
