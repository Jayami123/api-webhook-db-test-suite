import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type Stripe from "stripe";
import {
  assertTestModeKey,
  attachRunSubscription,
  productStatusFor,
  teardownRunStripe,
} from "../../../../src/lanes/doc/stripe-fixture.ts";

describe("assertTestModeKey (FC-6: test-mode guard)", () => {
  test("an unset key is refused with the ENV message", () => {
    assert.throws(() => assertTestModeKey(undefined), /ENV: STRIPE_API_KEY is not set/);
  });

  test("a live key is refused and its value is not in the message", () => {
    const live = "sk_live_FAKE";
    assert.throws(
      () => assertTestModeKey(live),
      (e: Error) => /sk_test_/.test(e.message) && !e.message.includes(live),
    );
  });

  test("a restricted key is refused (only secret test-mode keys run)", () => {
    assert.throws(() => assertTestModeKey("rk_test_FAKE"), /ENV: STRIPE_API_KEY is not a secret/);
  });

  test("a secret test-mode key is returned unchanged", () => {
    assert.equal(assertTestModeKey("sk_test_FAKE"), "sk_test_FAKE");
  });
});

describe("teardownRunStripe (every step attempted, codes only)", () => {
  test("a failed subscription cancel does not stop customer and product cleanup, and the message holds the code only", async () => {
    const calls: string[] = [];
    const fake = {
      subscriptions: {
        cancel: () => {
          calls.push("subscription.cancel");
          return Promise.reject(
            Object.assign(new Error("No such subscription: sub_FAKE"), {
              code: "resource_missing",
            }),
          );
        },
      },
      customers: {
        del: () => {
          calls.push("customer.del");
          return Promise.resolve({});
        },
      },
      products: {
        update: () => {
          calls.push("product.update");
          return Promise.resolve({});
        },
      },
    } as unknown as Stripe;
    await assert.rejects(
      teardownRunStripe(fake, {
        runId: "p2-qa-fake",
        subscriptionId: "sub_FAKE",
        customerId: "cus_FAKE",
        productId: "prod_FAKE",
      }),
      (e: Error) =>
        e.message.includes("subscription:resource_missing") &&
        !e.message.includes("No such subscription") &&
        !e.message.includes("sub_FAKE"),
    );
    assert.deepEqual(calls, ["subscription.cancel", "customer.del", "product.update"]);
  });
});

describe("attachRunSubscription (every object carries run_id and case_id)", () => {
  test("the product, price, customer update and subscription are all tagged with the run and the case", async () => {
    const writes: { call: string; metadata: Record<string, string> | undefined }[] = [];
    const fake = {
      products: {
        create: (args: { metadata?: Record<string, string> }) => {
          writes.push({ call: "product.create", metadata: args.metadata });
          return Promise.resolve({ id: "prod_FAKE" });
        },
      },
      prices: {
        create: (args: { metadata?: Record<string, string> }) => {
          writes.push({ call: "price.create", metadata: args.metadata });
          return Promise.resolve({ id: "price_FAKE" });
        },
      },
      customers: {
        update: (_id: string, args: { metadata?: Record<string, string> }) => {
          writes.push({ call: "customer.update", metadata: args.metadata });
          return Promise.resolve({});
        },
      },
      subscriptions: {
        create: (args: { metadata?: Record<string, string> }) => {
          writes.push({ call: "subscription.create", metadata: args.metadata });
          return Promise.resolve({ id: "sub_FAKE" });
        },
      },
    } as unknown as Stripe;
    const out = await attachRunSubscription(fake, "p2-qa-unit", "cus_FAKE", "P2-DOC-STR-002");
    assert.deepEqual(out, { productId: "prod_FAKE", subscriptionId: "sub_FAKE" });
    assert.equal(writes.length, 4);
    const tagged = { run_id: "p2-qa-unit", case_id: "P2-DOC-STR-002" };
    for (const w of writes) {
      const expected = w.call === "price.create" ? { ...tagged, claimId: "individual" } : tagged;
      assert.deepEqual(w.metadata, expected, w.call);
    }
  });
});

describe("productStatusFor (the product's status mapping, sync-stripe-customer-subscription.ts:166-169)", () => {
  test("active and trialing map to ACTIVE, past_due to PAST_DUE, every other status to INACTIVE", () => {
    assert.equal(productStatusFor("active"), "ACTIVE");
    assert.equal(productStatusFor("trialing"), "ACTIVE");
    assert.equal(productStatusFor("past_due"), "PAST_DUE");
    assert.equal(productStatusFor("canceled"), "INACTIVE");
    assert.equal(productStatusFor("incomplete"), "INACTIVE");
  });
});

describe("attachRunSubscription failure after the product (archive what was created, rethrow the original)", () => {
  /** A client whose calls are recorded; `failAt` names the call that rejects. */
  function stubStripe(failAt: "prices.create" | "customers.update" | "subscriptions.create"): {
    stripe: Stripe;
    calls: string[];
  } {
    const calls: string[] = [];
    const reject = (name: string, error: Error): Promise<never> => {
      calls.push(name);
      return Promise.reject(error);
    };
    const ok = <T>(name: string, value: T): Promise<T> => {
      calls.push(name);
      return Promise.resolve(value);
    };
    const stripe = {
      products: {
        create: () => ok("products.create", { id: "prod_1" }),
        update: (id: string, params: unknown) =>
          ok(`products.update ${id} ${JSON.stringify(params)}`, {}),
      },
      prices: {
        create: () =>
          failAt === "prices.create"
            ? reject("prices.create", new Error("price refused"))
            : ok("prices.create", { id: "price_1" }),
        update: (id: string, params: unknown) =>
          ok(`prices.update ${id} ${JSON.stringify(params)}`, {}),
      },
      customers: {
        update: () =>
          failAt === "customers.update"
            ? reject("customers.update", new Error("customer refused"))
            : ok("customers.update", {}),
      },
      subscriptions: {
        create: () =>
          failAt === "subscriptions.create"
            ? reject("subscriptions.create", new Error("subscription refused"))
            : ok("subscriptions.create", { id: "sub_1" }),
      },
    };
    return { stripe: stripe as unknown as Stripe, calls };
  }

  test("subscriptions.create rejects: the original error is rethrown and the price and product are archived", async () => {
    const { stripe, calls } = stubStripe("subscriptions.create");
    await assert.rejects(
      attachRunSubscription(stripe, "run-1", "cus_1", "P2-DOC-STR-002"),
      (error: unknown) => error instanceof Error && error.message === "subscription refused",
    );
    assert.ok(calls.includes('prices.update price_1 {"active":false}'), "the price is archived");
    assert.ok(calls.includes('products.update prod_1 {"active":false}'), "the product is archived");
  });

  test("prices.create rejects: no price exists, so only the product is archived, and the original error is rethrown", async () => {
    const { stripe, calls } = stubStripe("prices.create");
    await assert.rejects(
      attachRunSubscription(stripe, "run-2", "cus_1", "P2-DOC-STR-002"),
      (error: unknown) => error instanceof Error && error.message === "price refused",
    );
    assert.ok(
      !calls.some((c) => c.startsWith("prices.update")),
      "no price archive call without a price",
    );
    assert.ok(calls.includes('products.update prod_1 {"active":false}'));
  });
});
