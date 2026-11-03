import type Stripe from "stripe";

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

/** Tags the customer, creates one product and price, and attaches one trial subscription (all tagged). */
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
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: 100,
    recurring: { interval: "month" },
    metadata: tags,
  });
  await stripe.customers.update(customerId, { metadata: tags });
  const sub = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: price.id }],
    trial_period_days: 1,
    metadata: tags,
  });
  return { productId: product.id, subscriptionId: sub.id };
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
