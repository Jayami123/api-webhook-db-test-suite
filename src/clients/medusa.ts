import type { MedusaAuth } from "../auth/medusa.ts";
import { createCaller, type ApiRequestLike, type CallResult } from "./base.ts";

/** Medusa 2.21.2. Routes the lanes need first (plan Task 4): regions, a store cart, the payment hook. */
export interface MedusaClient {
  admin: {
    regions(): Promise<
      CallResult<{ regions: { id: string; name: string; currency_code: string }[] }>
    >;
  };
  store: {
    createCart(regionId: string, email: string): Promise<string>;
    addLineItem(cartId: string, variantId: string): Promise<void>;
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
    admin: { regions: () => admin("GET", "/admin/regions?limit=20&fields=id,name,currency_code") },
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
