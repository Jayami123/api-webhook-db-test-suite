import type { MedusaAuth } from "../auth/medusa.ts";
import { createCaller, type ApiRequestLike, type CallResult } from "./base.ts";

/** Medusa 2.21.2. Routes the lanes need first (plan Task 4): regions, a store cart, the payment hook. */
export interface MedusaClient {
  admin: {
    regions(): Promise<
      CallResult<{ regions: { id: string; name: string; currency_code: string }[] }>
    >;
    /** The exact provider ids of a region (GET /admin/regions/{id}); the shape is checked, never guessed. */
    paymentProviders(regionId: string): Promise<string[]>;
    /** POST /admin/regions/{id}: the seed links only Stripe to Europe and nothing to the US region. */
    setPaymentProviders(regionId: string, providerIds: string[]): Promise<void>;
    /**
     * A cart created with an email also creates a guest customer that the store API cannot
     * delete (probe 2026-11-01, caught by the P2-X-DB-001 leak rule). Deletes every customer whose
     * email starts with `emailPrefix` through the admin API; returns how many.
     */
    deleteCustomersByEmailPrefix(emailPrefix: string): Promise<number>;
  };
  store: {
    createCart(regionId: string, email: string): Promise<string>;
    addLineItem(cartId: string, variantId: string): Promise<void>;
    firstVariantId(regionId: string): Promise<string>;
    /** Payment collection for the cart, then a session for the provider; returns the session id. */
    createPaymentSession(cartId: string, providerId: string): Promise<string>;
  };
  hooks: {
    /** POST /hooks/payment/{provider}: always 200; verification happens later in a subscriber. */
    payment(
      provider: string,
      rawBody: string | Buffer,
      headers: Record<string, string>,
    ): Promise<CallResult<unknown>>;
  };
}

export function medusaClient(input: {
  request: ApiRequestLike;
  baseUrl: string;
  runPrefix: string;
  auth: MedusaAuth;
}): MedusaClient {
  const { request, baseUrl, runPrefix, auth } = input;
  const admin = createCaller({ request, baseUrl, runPrefix, auth });
  const store = createCaller({
    request,
    baseUrl,
    runPrefix,
    extraHeaders: () => ({ "x-publishable-api-key": auth.publishableKey.reveal() }),
  });
  const anonymous = createCaller({ request, baseUrl, runPrefix });
  return {
    admin: {
      regions: () => admin("GET", "/admin/regions?limit=20&fields=id,name,currency_code"),
      async paymentProviders(regionId) {
        const res = await admin<{ region?: { payment_providers?: unknown } }>(
          "GET",
          `/admin/regions/${regionId}?fields=id,payment_providers.id`,
        );
        const raw = res.body.region?.payment_providers;
        if (!Array.isArray(raw)) throw new Error("TEST BUG: region has no payment_providers array");
        return raw.map((entry: unknown) => {
          if (typeof entry === "string") return entry;
          const id = (entry as { id?: unknown }).id;
          if (typeof id !== "string") throw new Error("TEST BUG: payment provider without an id");
          return id;
        });
      },
      async deleteCustomersByEmailPrefix(emailPrefix) {
        const found = await admin<{ customers: { id: string; email: string }[] }>(
          "GET",
          `/admin/customers?q=${encodeURIComponent(emailPrefix)}&fields=id,email&limit=100`,
        );
        const mine = found.body.customers.filter((c) => c.email.startsWith(emailPrefix));
        for (const customer of mine) await admin("DELETE", `/admin/customers/${customer.id}`);
        return mine.length;
      },
      async setPaymentProviders(regionId, providerIds) {
        await admin("POST", `/admin/regions/${regionId}`, {
          body: { payment_providers: providerIds },
        });
      },
    },
    store: {
      async createCart(regionId, email) {
        const res = await store<{ cart: { id: string } }>("POST", "/store/carts", {
          body: { region_id: regionId, email },
        });
        return res.body.cart.id;
      },
      async addLineItem(cartId, variantId) {
        await store("POST", `/store/carts/${cartId}/line-items`, {
          body: { variant_id: variantId, quantity: 1 },
        });
      },
      async firstVariantId(regionId) {
        const res = await store<{ products: { variants: { id: string }[] }[] }>(
          "GET",
          `/store/products?limit=1&region_id=${regionId}&fields=id,*variants`,
        );
        const id = res.body.products[0]?.variants[0]?.id;
        if (id === undefined) throw new Error("TEST BUG: the seed has no product variant");
        return id;
      },
      async createPaymentSession(cartId, providerId) {
        const collection = await store<{ payment_collection: { id: string } }>(
          "POST",
          "/store/payment-collections",
          { body: { cart_id: cartId } },
        );
        const session = await store<{
          payment_collection: { payment_sessions: { id: string }[] };
        }>(
          "POST",
          `/store/payment-collections/${collection.body.payment_collection.id}/payment-sessions`,
          {
            body: { provider_id: providerId },
          },
        );
        const id = session.body.payment_collection.payment_sessions[0]?.id;
        if (id === undefined) throw new Error("TEST BUG: no payment session was created");
        return id;
      },
    },
    hooks: {
      payment: (provider, rawBody, headers) =>
        anonymous("POST", `/hooks/payment/${provider}`, {
          rawBody,
          headers: { "content-type": "application/json", ...headers },
        }),
    },
  };
}
