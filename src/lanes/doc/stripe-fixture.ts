import type Stripe from "stripe";
import { runAllThenRethrow } from "../../shared/cleanup.ts";

/** Metadata key that tags every Stripe object this lane creates (OD-15). */
export const RUN_TAG = "run_id";
export const TEST_KEY_PREFIX = "sk_test_";
/** Metadata key naming the master-plan case that created a Stripe object. */
export const CASE_TAG = "case_id";

/**
 * Refuses anything that is not a secret test-mode key. The message never contains the value.
 * Restricted keys (rk_) and live keys (sk_live_) are both refused.
 */
export function assertTestModeKey(key: string | undefined): string {
  if (key === undefined || key.trim() === "") throw new Error("ENV: STRIPE_API_KEY is not set");
  if (!key.startsWith(TEST_KEY_PREFIX)) {
    throw new Error(
      "ENV: STRIPE_API_KEY is not a secret test-mode key (sk_test_); the lane refuses to run. The value is not shown.",
    );
  }
  return key;
}

export interface RunStripeFixture {
  readonly runId: string;
  /** The run user (created through signup, see tests/fixtures/doc/stripe-run.ts). */
  readonly userId: string;
  /** The run user's personal Organisation.customerId (read through qa_ro); tagged with run_id. */
  readonly customerId: string;
  readonly productId: string;
  readonly subscriptionId: string;
}

/**
 * Tags the customer, creates one product and price, and attaches one trial subscription (all tagged).
 * If a step after the product fails, the product (and the price, if it was created) is archived before the original
 * error is rethrown: teardownRunStripe only knows the ids this function returns, so nothing else would archive them.
 */
export async function attachRunSubscription(
  stripe: Stripe,
  runId: string,
  customerId: string,
  caseId: string,
): Promise<{ productId: string; subscriptionId: string }> {
  // Every object is tagged with the run and the master-plan case that created it (OD-15, step 4 fixture).
  const tags = { [RUN_TAG]: runId, [CASE_TAG]: caseId };
  const product = await stripe.products.create({
    name: `p2-lane ${runId}`,
    metadata: tags,
  });
  let price: Stripe.Price | undefined;
  try {
    price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: 100,
      recurring: { interval: "month" },
      // The sync reads the claim from the price (sync-stripe-customer-subscription.ts:259) and rejects a price
      // without one ("Subscription claim on price ... not found"). "individual" is a real claim (types/subscription.ts:169-176).
      metadata: { ...tags, claimId: "individual" },
    });
    await stripe.customers.update(customerId, { metadata: tags });
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price.id }],
      trial_period_days: 1,
      metadata: tags,
    });
    return { productId: product.id, subscriptionId: sub.id };
  } catch (error) {
    const createdPrice = price;
    await runAllThenRethrow([
      () => {
        throw error; // the original value, unchanged
      },
      () =>
        createdPrice === undefined
          ? Promise.resolve()
          : stripe.prices.update(createdPrice.id, { active: false }),
      () => stripe.products.update(product.id, { active: false }),
    ]);
    throw error;
  }
}

/**
 * Teardown: cancel the subscription, delete the customer, archive the product. Every step is
 * attempted; failures are collected and thrown once, with error codes only (never messages, never ids).
 */
export async function teardownRunStripe(
  stripe: Stripe,
  f: Partial<RunStripeFixture>,
): Promise<void> {
  const failures: string[] = [];
  const step = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
    } catch (e) {
      const code = e instanceof Error && "code" in e ? String(e.code) : "error";
      failures.push(`${label}:${code}`);
    }
  };
  if (f.subscriptionId !== undefined) {
    const id = f.subscriptionId;
    await step("subscription", () => stripe.subscriptions.cancel(id));
  }
  if (f.customerId !== undefined) {
    const id = f.customerId;
    await step("customer", () => stripe.customers.del(id));
  }
  if (f.productId !== undefined) {
    const id = f.productId;
    await step("product", () => stripe.products.update(id, { active: false }));
  }
  if (failures.length > 0) {
    throw new Error(
      `Stripe teardown incomplete for run ${f.runId ?? "unknown"}: ${failures.join(", ")}`,
    );
  }
}

/** A signed-event body (Stripe v1 shape) for the sync path. The ids are fixture ids; the text is never printed. */
export function subscriptionEvent(input: {
  id: string;
  type: string;
  customerId: string;
  subscriptionId: string;
  status: string;
  created: number;
}): string {
  return JSON.stringify({
    id: input.id,
    object: "event",
    type: input.type,
    created: input.created,
    data: {
      object: {
        id: input.subscriptionId,
        object: "subscription",
        customer: input.customerId,
        status: input.status,
      },
    },
  });
}

/**
 * The product's Subscription.status for a live Stripe status (sync-stripe-customer-subscription.ts:166-169):
 * active and trialing are ACTIVE, past_due is PAST_DUE, anything else is INACTIVE.
 */
export function productStatusFor(stripeStatus: string): "ACTIVE" | "PAST_DUE" | "INACTIVE" {
  if (stripeStatus === "active" || stripeStatus === "trialing") return "ACTIVE";
  if (stripeStatus === "past_due") return "PAST_DUE";
  return "INACTIVE";
}
