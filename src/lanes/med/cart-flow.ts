import type { Caller } from "../../clients/base.ts";
import { buyerEmail } from "./buyer.ts";

/**
 * A cart on a lane region with one line and a system-provider payment session (probe P-MED-16:
 * POST /store/carts, /line-items, /payment-collections, /payment-sessions {provider_id}). The
 * session is the one a Stripe-signed event is matched to through metadata.session_id.
 */
export async function openPaidSession(
  store: Caller,
  input: { regionId: string; variantId: string; label: string; quantity?: number },
): Promise<{ cartId: string; sessionId: string }> {
  const cart = await store<{ cart: { id: string } }>("POST", "/store/carts", {
    body: { region_id: input.regionId, email: buyerEmail(input.label) },
  });
  const cartId = cart.body.cart.id;
  await store("POST", `/store/carts/${cartId}/line-items`, {
    body: { variant_id: input.variantId, quantity: input.quantity ?? 1 },
  });
  const collection = await store<{ payment_collection: { id: string } }>(
    "POST",
    "/store/payment-collections",
    { body: { cart_id: cartId } },
  );
  const session = await store<{
    payment_collection: { payment_sessions: { id: string; provider_id: string }[] };
  }>(
    "POST",
    `/store/payment-collections/${collection.body.payment_collection.id}/payment-sessions`,
    { body: { provider_id: "pp_system_default" } },
  );
  const sessionId = session.body.payment_collection.payment_sessions.find(
    (s) => s.provider_id === "pp_system_default",
  )?.id;
  if (sessionId === undefined) throw new Error("TEST BUG: no system payment session returned");
  return { cartId, sessionId };
}

/**
 * A cart edit voids the open payment session (observed 2026-11-02: an anonymous line write made the
 * completion fail with "Payment sessions are required to complete cart" until a new session existed).
 * This creates the session again on the cart's payment collection and returns its id.
 */
export async function renewPaymentSession(store: Caller, cartId: string): Promise<string> {
  const cart = await store<{ cart: { payment_collection?: { id: string } } }>(
    "GET",
    `/store/carts/${cartId}?fields=id,payment_collection.id`,
  );
  let collectionId = cart.body.cart.payment_collection?.id;
  if (collectionId === undefined) {
    const created = await store<{ payment_collection: { id: string } }>(
      "POST",
      "/store/payment-collections",
      {
        body: { cart_id: cartId },
      },
    );
    collectionId = created.body.payment_collection.id;
  }
  const session = await store<{
    payment_collection: { payment_sessions: { id: string; provider_id: string }[] };
  }>("POST", `/store/payment-collections/${collectionId}/payment-sessions`, {
    body: { provider_id: "pp_system_default" },
  });
  const sessionId = session.body.payment_collection.payment_sessions.find(
    (s) => s.provider_id === "pp_system_default",
  )?.id;
  if (sessionId === undefined) throw new Error("TEST BUG: no system payment session after renewal");
  return sessionId;
}
