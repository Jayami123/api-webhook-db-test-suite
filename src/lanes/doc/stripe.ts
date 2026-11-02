import { signStripe } from "../../webhooks/sign.ts";

/** Live Stripe rows run only with a real test-mode key present (OD-2). The condition is named, never silent. */
export const hasStripeKey = (env: NodeJS.ProcessEnv): boolean =>
  Boolean(env.STRIPE_API_KEY?.trim());

/** Shared with the billing stack (same value in `up` and in the test environment). Never defaulted. */
export function stripeWebhookSecret(env: NodeJS.ProcessEnv): string {
  const secret = env.P2_STRIPE_TEST_WH_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "ENV: P2_STRIPE_TEST_WH_SECRET is not set (the billing stack needs the same value)",
    );
  }
  return secret;
}

/** `Stripe-Signature` header for a body, signed with the webhook secret at a given time. */
export function signedStripeHeaders(
  secret: string,
  body: string,
  timestampSeconds: number,
): Record<string, string> {
  return signStripe({ payload: body, secret, timestampSeconds }).headers;
}
