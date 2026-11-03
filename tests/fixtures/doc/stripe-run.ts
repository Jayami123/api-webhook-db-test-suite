import { randomBytes } from "node:crypto";
import { request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import Stripe from "stripe";
import { test as base, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb, type ReadOnlyDb } from "../../../src/db/pg.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import {
  assertTestModeKey,
  attachRunSubscription,
  teardownRunStripe,
  type RunStripeFixture,
} from "../../../src/lanes/doc/stripe-fixture.ts";
import { bodyOf, listMail, mailboxOf } from "../../../src/lanes/doc/mail.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";

/**
 * Per-run Stripe fixture (OD-15, OD-16 as overridden for step 4).
 *
 * Organisation creation is refused by the product on the billing stack: a new user already owns a personal
 * organisation, and organisation.create answers LIMIT_EXCEEDED for a further free one (probe B-26). So the
 * run creates a USER through signup instead. Signup writes the personal organisation and its Stripe customer
 * (lib/server-only/organisation/create-organisation.ts:26-46 via onCreateUserHook, create-user.ts:63-70).
 *
 * Scope: one user per worker, so a run makes one signup (signup is limited to 3 per 3 h per IP:
 * rate-limits.ts:5-9). Each test attaches its own subscription tagged run_id and case_id.
 */

interface RunUser {
  readonly email: string;
  readonly userId: string;
  readonly customerId: string;
  readonly ctx: APIRequestContext;
}

const RUN_USER_NAME = "p2-run-user";

/** The confirmation token from the Inbucket mail for this address (undefined until the mail arrives). */
async function confirmationToken(email: string): Promise<string | undefined> {
  const mailbox = mailboxOf(email);
  for (const m of await listMail(mailbox)) {
    const hit = /verify-email\/([A-Za-z0-9_-]+)/.exec(await bodyOf(mailbox, m.id));
    if (hit?.[1] !== undefined) return hit[1];
  }
  return undefined;
}

/** Personal organisation of the user: its id and Stripe customer id, read through qa_ro. */
async function personalOrganisation(
  db: ReadOnlyDb,
  email: string,
): Promise<{ userId: string; customerId: string | null }[]> {
  const rows = await db.select<{ userId: number; customerId: string | null }>(
    `SELECT u."id" AS "userId", o."customerId" AS "customerId" FROM "User" u JOIN "Organisation" o ON o."ownerUserId" = u."id" WHERE u."email" = $1 AND o."type" = 'PERSONAL'`,
    [email],
  );
  return rows.map((r) => ({ userId: String(r.userId), customerId: r.customerId }));
}

/** Creates the run user through the product: signup, confirmation mail, verify-email, sign-in (cookie in ctx). */
async function createRunUser(runId: string): Promise<RunUser> {
  const email = `${runId}-str@example.test`;
  // Generated per run, held in memory only; never printed or written anywhere.
  const password = `${randomBytes(12).toString("base64url")}Aa1!`;
  const ctx = await playwrightRequest.newContext();
  const base0 = apiBaseUrl("documenso");
  try {
    const signup = await ctx.fetch(`${base0}/api/auth/email-password/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ name: RUN_USER_NAME, email, password, signature: null }),
      failOnStatusCode: false,
    });
    if (signup.status() === 429) {
      throw new Error(
        "ENV: signup rate limit (3 per 3 h per IP) reached; wait for the window to reset",
      );
    }
    expect(signup.status()).toBe(201);
    const token = await expect
      .poll(() => confirmationToken(email), {
        timeout: SLO.docWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "confirmation mail",
      })
      .toBeDefined()
      .then(() => confirmationToken(email));
    if (token === undefined)
      throw new Error("TEST BUG: confirmation token not found after the mail arrived");
    const verify = await ctx.fetch(`${base0}/api/auth/email-password/verify-email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ token }),
      failOnStatusCode: false,
    });
    expect(verify.status()).toBe(200);
    const csrf = (await (
      await ctx.fetch(`${base0}/api/auth/csrf`, { failOnStatusCode: false })
    ).json()) as {
      csrfToken: string;
    };
    const signin = await ctx.fetch(`${base0}/api/auth/email-password/authorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ email, password, csrfToken: csrf.csrfToken }),
      failOnStatusCode: false,
    });
    expect(signin.status()).toBe(201);
    const db = readOnlyDb("documenso");
    const org = await personalOrganisation(db, email);
    expect(org).toHaveLength(1);
    const row = org[0];
    if (row === undefined || row.customerId === null) {
      throw new Error(
        "ENV: the personal organisation has no Stripe customer (createCustomer failed; see the web log)",
      );
    }
    return { email, userId: row.userId, customerId: row.customerId, ctx };
  } catch (error) {
    await ctx.dispose();
    throw error;
  }
}

/**
 * Worker teardown for the run user, in order, each step attempted and failures collected:
 * (b) delete the account through the product, (c) delete the Stripe customer and retrieve it to check
 * deleted: true, (d) the User and Organisation rows are gone (qa_ro). Codes only; no ids in messages.
 */
async function teardownRunUser(stripe: Stripe, user: RunUser): Promise<void> {
  const failures: string[] = [];
  const step = async (label: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch (e) {
      failures.push(`${label}:${e instanceof Error ? e.name : "error"}`);
    }
  };
  await step("account", async () => {
    const res = await user.ctx.fetch(`${apiBaseUrl("documenso")}/api/trpc/profile.deleteAccount`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ json: {} }),
      failOnStatusCode: false,
    });
    if (res.status() !== 200) throw new Error(`status ${String(res.status())}`);
  });
  await step("customer", async () => {
    await stripe.customers.del(user.customerId);
    const gone = (await stripe.customers.retrieve(user.customerId)) as { deleted?: boolean };
    if (gone.deleted !== true) throw new Error("customer not deleted");
  });
  await step("rows", async () => {
    const db = readOnlyDb("documenso");
    const users = await db.select<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM "User" WHERE "email" = $1`,
      [user.email],
    );
    const orgs = await db.select<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM "Organisation" o JOIN "User" u ON u."id" = o."ownerUserId" WHERE u."email" = $1`,
      [user.email],
    );
    if ((users[0]?.n ?? -1) !== 0 || (orgs[0]?.n ?? -1) !== 0)
      throw new Error("user or organisation rows remain");
  });
  await user.ctx.dispose();
  if (failures.length > 0) throw new Error(`run user teardown incomplete: ${failures.join(", ")}`);
}

/** The master-plan case named in the test title (P2-DOC-STR-002, P2-DOC-STR-003, ...). */
function caseIdOf(title: string): string {
  const id = /P2-DOC-STR-\d{3}/.exec(title)?.[0];
  if (id === undefined) throw new Error("TEST BUG: the test title names no P2-DOC-STR case");
  return id;
}

export const stripeTest = base.extend<{ stripeRun: RunStripeFixture }, { runUser: RunUser }>({
  runUser: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring pattern
    async ({}, use) => {
      const key = assertTestModeKey(process.env.STRIPE_API_KEY);
      const stripe = new Stripe(key);
      const user = await createRunUser(currentRunPrefix());
      try {
        await use(user);
      } finally {
        await teardownRunUser(stripe, user);
      }
    },
    { scope: "worker" },
  ],
  stripeRun: async ({ runUser }, use, testInfo) => {
    const stripe = new Stripe(assertTestModeKey(process.env.STRIPE_API_KEY));
    const runId = currentRunPrefix();
    const partial: { -readonly [K in keyof RunStripeFixture]?: RunStripeFixture[K] } = {
      runId,
      userId: runUser.userId,
      customerId: runUser.customerId,
    };
    try {
      Object.assign(
        partial,
        await attachRunSubscription(stripe, runId, runUser.customerId, caseIdOf(testInfo.title)),
      );
      await use(partial as RunStripeFixture);
    } finally {
      // Cancels this test's subscription and archives its product; the customer belongs to the worker user.
      await teardownRunStripe(stripe, {
        runId,
        ...(partial.subscriptionId !== undefined ? { subscriptionId: partial.subscriptionId } : {}),
        ...(partial.productId !== undefined ? { productId: partial.productId } : {}),
      });
    }
  },
});
