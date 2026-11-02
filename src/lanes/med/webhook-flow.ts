import type { MedusaClient } from "../../clients/medusa.ts";
import type { SignedRequest } from "../../webhooks/sign.ts";
import { currentRunPrefix } from "../../run/prefix.ts";
import type { LaneClient } from "./lane-client.ts";
import { openPaidSession } from "./cart-flow.ts";
import { paymentIntentEvent, runWebhookSecret, signAtAge } from "./stripe-event.ts";

/** The Stripe provider id in the webhook path (POST /hooks/payment/stripe_stripe). */
export const STRIPE_PROVIDER = "stripe_stripe";

/**
 * Event id unique to this run and this label: evt_ + the run prefix (alphanumerics only) + the label.
 * Two runs never share an id; one test never reuses another test's id.
 */
export function eventIdFor(label: string): string {
  const run = currentRunPrefix()
    .replace(/[^a-z0-9]/g, "")
    .slice(-16);
  return `evt_${run}${label.replace(/[^a-z0-9]/g, "")}`;
}

export interface BuiltEvent extends SignedRequest {
  readonly eventId: string;
}

/** A signed payment_intent event for a session, signed once: send the same object again for a repeat. */
export function buildPaymentEvent(input: {
  readonly label: string;
  readonly sessionId: string;
  readonly type?: "payment_intent.succeeded" | "payment_intent.amount_capturable_updated";
  readonly ageAtReceiptSec?: number;
  readonly amountMinor?: number;
  readonly eventId?: string;
}): BuiltEvent {
  const eventId = input.eventId ?? eventIdFor(input.label);
  const payload = paymentIntentEvent({
    eventId,
    type: input.type ?? "payment_intent.succeeded",
    sessionId: input.sessionId,
    currency: "usd",
    amountMinor: input.amountMinor ?? 1000,
  });
  const signed = signAtAge({
    payload,
    secret: runWebhookSecret(),
    receiptNowSec: Math.floor(Date.now() / 1000),
    ageAtReceiptSec: input.ageAtReceiptSec ?? 0,
  });
  return { ...signed, eventId };
}

/** Delivers a built event to the product's payment hook. The product answers 200 before it verifies. */
export async function sendEvent(med: MedusaClient, event: BuiltEvent): Promise<number> {
  const res = await med.hooks.payment(STRIPE_PROVIDER, event.body, event.headers);
  return res.status;
}

/** A usd lane region, one paid cart with one line of the given product, and its system session. */
export async function openSessionFor(
  lane: LaneClient,
  label: string,
  quantity = 1,
): Promise<{
  cartId: string;
  sessionId: string;
  variantId: string;
  productId: string;
  regionId: string;
}> {
  const region = await lane.regionFor("usd");
  const product = await lane.productWithPrice(label, "usd", 10);
  const session = await openPaidSession(lane.store, {
    regionId: region.id,
    variantId: product.variantId,
    label,
    quantity,
  });
  return {
    ...session,
    variantId: product.variantId,
    productId: product.id,
    regionId: region.id,
  };
}
