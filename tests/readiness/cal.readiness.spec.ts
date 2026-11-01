import { test, expect } from "../../src/fixtures/index.ts";
import { mintCal } from "../../src/auth/cal.ts";
import { loadAuthEnv } from "../../src/auth/env.ts";
import { revokeAndVerify } from "../../src/auth/lifecycle.ts";
import { RUN_ID_HEADER } from "../../src/clients/base.ts";
import { readOnlyDb } from "../../src/db/pg.ts";
import { loadEnv } from "../../src/env.ts";
import { runSweep } from "../../src/invariants/engine.ts";
import { retained } from "../../src/invariants/fixture.ts";
import { rulesFor } from "../../src/invariants/rules.ts";
import { connectedRole, randomSecret } from "../../src/readiness/checks.ts";
import { currentRunPrefix, runScopedName } from "../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../src/slo.ts";
import { verifyCal } from "../../src/webhooks/verify.ts";

/**
 * Cal readiness. The web app (3000) serves login, tRPC and webhook CRUD; API v2 (5555) is started by
 * harness v0.3.0 (HR-1) and answers on its /health route (CAL_API_BASE_URL, the plan's /v2/health is
 * corrected to /health for this build).
 */
const web = (): string => loadEnv().CAL_BASE_URL.replace(/\/$/, "");

test.describe("cal readiness", () => {
  test("the web app answers and the run-id header is not rejected", async ({ request }) => {
    const plain = await request.get(`${web()}/api/auth/csrf`);
    const tagged = await request.get(`${web()}/api/auth/csrf`, {
      headers: { [RUN_ID_HEADER]: currentRunPrefix() },
    });
    expect([plain.status(), tagged.status()]).toEqual([200, 200]);
  });

  test("the oracle connects as qa_ro in a read-only session", async () => {
    expect(await connectedRole("cal")).toEqual({ user: "qa_ro", readOnly: "on" });
  });

  test("an API key is minted through the web app and revoked again, with the row gone", async () => {
    const env = loadAuthEnv();
    const db = readOnlyDb("cal");
    const auth = await mintCal({
      baseUrl: web(),
      email: env.P2_CAL_USER_EMAIL,
      password: env.P2_CAL_USER_PASSWORD,
      name: (label) => runScopedName(`ready-${label}`),
      keyId: async (note) =>
        (
          await db.select<{ id: string }>(`SELECT "id" AS id FROM "ApiKey" WHERE "note" = $1`, [
            note,
          ])
        )[0]?.id,
    });
    expect(await auth.isPresent()).toBe(true);
    await revokeAndVerify(auth, () => auth.isPresent());
  });

  test("a signed webhook reaches the receiver path with an HMAC over the raw bytes", async ({
    cal,
    receiverHandle,
  }) => {
    const secret = randomSecret();
    const key = receiverHandle.key("cal-ready-wh");
    const id = await cal.webhooks.create({
      subscriberUrl: receiverHandle.urlFor("cal-ready-wh"),
      eventTriggers: ["BOOKING_CREATED"],
      secret,
    });
    try {
      await cal.webhooks.testTrigger({
        url: receiverHandle.urlFor("cal-ready-wh"),
        secret,
        type: "BOOKING_CREATED",
      });
      await expect
        .poll(() => receiverHandle.receiver.deliveries(key).length, {
          timeout: SLO.calWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
          message: "Cal webhook delivery",
        })
        .toBe(1);
      const delivery = receiverHandle.receiver.deliveries(key)[0];
      expect(delivery).toBeDefined();
      expect(
        verifyCal({ secret, rawBody: delivery?.rawBody ?? "", headers: delivery?.headers ?? {} }),
      ).toEqual({ ok: true });
    } finally {
      await cal.webhooks.remove(id);
    }
  });

  test("every Cal invariant rule runs against the live schema and finds nothing", async () => {
    const found = await runSweep(readOnlyDb("cal"), rulesFor("cal"), {
      runPrefix: currentRunPrefix(),
      retained,
      includeLeaks: true,
    });
    expect(found).toEqual([]);
  });

  test("API v2 answers on CAL_API_BASE_URL/health (HR-1)", async ({ request }) => {
    const res = await request.get(`${loadEnv().CAL_API_BASE_URL.replace(/\/$/, "")}/health`);
    expect(res.status()).toBe(200);
  });
});
