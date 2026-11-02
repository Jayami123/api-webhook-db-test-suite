import type { APIRequestContext } from "@playwright/test";
import Stripe from "stripe";
import { test as base, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import {
  assertTestModeKey,
  attachRunSubscription,
  teardownRunStripe,
  type RunStripeFixture,
} from "../../../src/lanes/doc/stripe-fixture.ts";
import { currentRunPrefix, runScopedName } from "../../../src/run/prefix.ts";

/** Session cookie and team header for a tRPC call (the same context the documenso client uses). */
function sessionHeaders(cookie: string, teamId: number): Record<string, string> {
  return { cookie, "x-team-id": String(teamId), "content-type": "application/json" };
}

/** Creates an organisation through the product (organisation.create). Refuses a payment-required answer. */
async function createOrganisationThroughProduct(
  request: APIRequestContext,
  headers: Record<string, string>,
  name: string,
): Promise<void> {
  const res = await request.fetch(`${apiBaseUrl("documenso")}/api/trpc/organisation.create`, {
    method: "POST",
    headers,
    data: JSON.stringify({ json: { name } }),
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { result: { data: { json: { paymentRequired: boolean } } } };
  if (body.result.data.json.paymentRequired) {
    throw new Error(
      "ENV: organisation.create answered paymentRequired; the lane stops (no payment setup without approval recorded in the plan)",
    );
  }
}

/** Deletes the organisation through the product (organisation.delete). */
async function deleteOrganisationThroughProduct(
  request: APIRequestContext,
  headers: Record<string, string>,
  organisationId: string,
): Promise<void> {
  const res = await request.fetch(`${apiBaseUrl("documenso")}/api/trpc/organisation.delete`, {
    method: "POST",
    headers,
    data: JSON.stringify({ json: { organisationId } }),
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  if (res.status() !== 200)
    throw new Error(`TEST BUG: organisation.delete answered ${String(res.status())}`);
}

/**
 * Per-run Stripe fixture (OD-15, OD-16). Setup creates the organisation through the product, reads its
 * Stripe customer id (qa_ro), then tags the customer and attaches one trial subscription. Teardown runs in
 * `finally`, so it runs when the test fails and when setup fails part-way. Refuses any key that is not sk_test_.
 */
export const stripeTest = base.extend<{ stripeRun: RunStripeFixture }>({
  stripeRun: async ({ request, docAuth }, use) => {
    const key = assertTestModeKey(process.env.STRIPE_API_KEY);
    const stripe = new Stripe(key);
    const runId = currentRunPrefix();
    const orgName = runScopedName("stripe-org");
    const headers = sessionHeaders(docAuth.sessionCookie.reveal(), docAuth.teamId);
    // Built up during setup; the readonly view is applied only when the test receives it.
    const partial: { -readonly [K in keyof RunStripeFixture]?: RunStripeFixture[K] } = { runId };
    const db = readOnlyDb("documenso");
    try {
      await createOrganisationThroughProduct(request, headers, orgName);
      const org = await db.select<{ id: string; customerId: string | null }>(
        `SELECT "id" AS id, "customerId" AS "customerId" FROM "Organisation" WHERE "name" = $1`,
        [orgName],
      );
      const row = org[0];
      if (row === undefined)
        throw new Error("TEST BUG: organisation not found by its run-scoped name");
      if (row.customerId === null)
        throw new Error(
          "ENV: the product did not create a Stripe customer for the organisation (OD-16 must be re-decided)",
        );
      partial.organisationId = row.id;
      partial.customerId = row.customerId;
      Object.assign(partial, await attachRunSubscription(stripe, runId, row.customerId));
      await use(partial as RunStripeFixture);
    } finally {
      await teardownRunStripe(stripe, partial);
      if (partial.organisationId !== undefined) {
        await deleteOrganisationThroughProduct(request, headers, partial.organisationId);
      }
    }
  },
});
