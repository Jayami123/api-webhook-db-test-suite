import { signStripe, type SignedRequest } from "../../webhooks/sign.ts";

/** Stripe event for the payment webhook. session_id absent = the NOT_SUPPORTED path (stripe-base.js:418-429). */
export interface PaymentIntentEventInput {
  readonly eventId: string; // evt_<run-scoped id>; the same string for a repeat delivery
  readonly type: "payment_intent.succeeded" | "payment_intent.amount_capturable_updated";
  readonly sessionId: string | undefined;
  readonly currency: string; // lower case, as Stripe sends it
  readonly amountMinor: number; // amount and amount_received, smallest unit
}

export function paymentIntentEvent(input: PaymentIntentEventInput): string {
  const metadata = input.sessionId === undefined ? {} : { session_id: input.sessionId };
  return JSON.stringify({
    id: input.eventId,
    object: "event",
    type: input.type,
    data: {
      object: {
        id: `pi_${input.eventId.replace(/^evt_/, "")}`,
        object: "payment_intent",
        currency: input.currency.toLowerCase(),
        amount: input.amountMinor,
        amount_received: input.amountMinor,
        metadata,
      },
    },
  });
}

/**
 * Signs with timestamp = receipt time - age at receipt. The product verifies at processing time
 * (ageAtProcessing below), so the age that matters is the processing age. Never a fixed timestamp.
 */
export function signAtAge(input: {
  readonly payload: string;
  readonly secret: string;
  readonly receiptNowSec: number;
  readonly ageAtReceiptSec: number;
}): SignedRequest {
  return signStripe({
    payload: input.payload,
    secret: input.secret,
    timestampSeconds: input.receiptNowSec - input.ageAtReceiptSec,
  });
}

/** Age at verification = age at receipt + the product's emit delay (5000 ms default, route.js:21). */
export function ageAtProcessing(ageAtReceiptSec: number, delayMs = 5_000): number {
  return ageAtReceiptSec + delayMs / 1000;
}

/** Per-run secret from the environment of the run; never printed, never a default. */
export function runWebhookSecret(env: NodeJS.ProcessEnv = process.env): string {
  const value = env["STRIPE_WEBHOOK_SECRET"];
  if (value === undefined || value === "") {
    throw new Error("TEST BUG: STRIPE_WEBHOOK_SECRET is not set for this run");
  }
  return value;
}
