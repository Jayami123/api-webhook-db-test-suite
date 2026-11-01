import { test, expect } from "../../src/fixtures/index.ts";
import { mintMedusa } from "../../src/auth/medusa.ts";
import { loadAuthEnv, requireVar } from "../../src/auth/env.ts";
import { revokeAndVerify } from "../../src/auth/lifecycle.ts";
import { RUN_ID_HEADER } from "../../src/clients/base.ts";
import { readOnlyDb } from "../../src/db/pg.ts";
import { apiBaseUrl } from "../../src/env.ts";
import { runSweep } from "../../src/invariants/engine.ts";
import { retained } from "../../src/invariants/fixture.ts";
import { rulesFor } from "../../src/invariants/rules.ts";
import { connectedRole } from "../../src/readiness/checks.ts";
import { currentRunPrefix, runScopedName } from "../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../src/slo.ts";
import { signStripe } from "../../src/webhooks/sign.ts";

/**
 * Medusa readiness. Needs MEDUSA_REDIS=1 and MEDUSA_STRIPE=1 plus STRIPE_API_KEY and
 * STRIPE_WEBHOOK_SECRET in the environment of `up` (plan Task 5). The round trip uses a payment session of
 * the system provider: the Stripe-signed event carries its id as metadata.session_id and payment-stripe's
 * getWebhookActionAndData needs no Stripe API call. Label: route/signature reachability only (not a MED-WH case).
 * The region's provider list is read, changed and restored exactly (D6).
 */
test.describe("medusa readiness", () => {
  test("the backend answers and the run-id header is not rejected", async ({ request }) => {
    const url = `${apiBaseUrl("medusa")}/health`;
    const plain = await request.get(url);
    const tagged = await request.get(url, { headers: { [RUN_ID_HEADER]: currentRunPrefix() } });
    expect([plain.status(), tagged.status()]).toEqual([200, 200]);
    expect(await tagged.text()).toBe("OK");
  });

  test("the oracle connects as qa_ro in a read-only session", async () => {
    expect(await connectedRole("medusa")).toEqual({ user: "qa_ro", readOnly: "on" });
  });

  test("API keys are minted from the admin login and revoked again; the secret key then answers 401", async () => {
    const env = loadAuthEnv();
    const auth = await mintMedusa({
      baseUrl: apiBaseUrl("medusa"),
      email: requireVar("MEDUSA_ADMIN_EMAIL", env.MEDUSA_ADMIN_EMAIL),
      password: requireVar("MEDUSA_ADMIN_PASSWORD", env.MEDUSA_ADMIN_PASSWORD),
      name: (label) => runScopedName(`ready-${label}`),
    });
    expect(await auth.isAccepted()).toBe(true);
    await revokeAndVerify(auth, () => auth.isAccepted());
  });

  test("route/signature reachability only: a Stripe-signed event authorizes a system-provider payment session", async ({
    med,
  }) => {
    const secret = requireVar("STRIPE_WEBHOOK_SECRET", process.env["STRIPE_WEBHOOK_SECRET"]);
    const regions = (await med.admin.regions()).body.regions;
    const us = regions.find((r) => r.currency_code === "usd");
    expect(us, "the seed has a USD region").toBeDefined();
    const regionId = us?.id ?? "";
    // The exact provider list before any change (not []); restored and asserted in finally.
    const previous = await med.admin.paymentProviders(regionId);
    await med.admin.setPaymentProviders(regionId, ["pp_system_default"]);
    expect(await med.admin.paymentProviders(regionId)).toEqual(["pp_system_default"]);
    const buyer = runScopedName("ready-buyer");
    try {
      const cartId = await med.store.createCart(regionId, `${buyer}@example.test`);
      await med.store.addLineItem(cartId, await med.store.firstVariantId(regionId));
      const sessionId = await med.store.createPaymentSession(cartId, "pp_system_default");
      const payload = JSON.stringify({
        id: `evt_${runScopedName("ready").slice(-12).replaceAll("-", "")}`,
        object: "event",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_ready",
            object: "payment_intent",
            currency: "usd",
            amount: 1000,
            amount_received: 1000,
            metadata: { session_id: sessionId },
          },
        },
      });
      const signed = signStripe({
        payload,
        secret,
        timestampSeconds: Math.floor(Date.now() / 1000),
      });
      expect(
        (await med.hooks.payment("stripe_stripe", signed.body, { ...signed.headers })).status,
      ).toBe(200);
      await expect
        .poll(
          async () =>
            (
              await readOnlyDb("medusa").select<{ status: string }>(
                `SELECT "status" AS status FROM "payment_session" WHERE "id" = $1`,
                [sessionId],
              )
            )[0]?.status,
          {
            timeout: SLO.medWebhookProcessing.ms,
            intervals: POLL_INTERVALS,
            message: "Medusa payment webhook processing",
          },
        )
        .toBe("authorized");
    } finally {
      await med.admin.deleteCustomersByEmailPrefix(buyer);
      await med.admin.setPaymentProviders(regionId, previous);
      expect(await med.admin.paymentProviders(regionId)).toEqual(previous);
    }
  });

  test("every Medusa invariant rule runs against the live schema and finds nothing", async () => {
    const found = await runSweep(readOnlyDb("medusa"), rulesFor("medusa"), {
      runPrefix: currentRunPrefix(),
      retained,
      includeLeaks: true,
    });
    expect(found).toEqual([]);
  });
});
