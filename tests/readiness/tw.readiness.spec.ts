import { test, expect } from "../../src/fixtures/index.ts";
import { loadAuthEnv } from "../../src/auth/env.ts";
import { revokeAndVerify } from "../../src/auth/lifecycle.ts";
import { mintTwenty } from "../../src/auth/twenty.ts";
import { RUN_ID_HEADER } from "../../src/clients/base.ts";
import { readOnlyDb } from "../../src/db/pg.ts";
import { apiBaseUrl } from "../../src/env.ts";
import { runSweep } from "../../src/invariants/engine.ts";
import { retained } from "../../src/invariants/fixture.ts";
import { rulesFor } from "../../src/invariants/rules.ts";
import { connectedRole, randomSecret, recordIdOf } from "../../src/readiness/checks.ts";
import { canaryPrecondition, CANARY_MAX_TRIGGERS } from "../../src/readiness/canary.ts";
import { currentRunPrefix, runScopedName } from "../../src/run/prefix.ts";
import { CANARY_MARGIN_MS, SLO, TWENTY_WEBHOOK_MEMO_MS } from "../../src/slo.ts";
import { verifyTwenty } from "../../src/webhooks/verify.ts";

/**
 * Twenty readiness. The server runs in Docker; the receiver's name is on the outbound allow-list from the
 * environment of `up` (HR-2, src/webhooks/reach.ts). No product-database write and no warm-up loop.
 */
test.describe("twenty readiness", () => {
  test("the server answers and the run-id header is not rejected", async ({ request }) => {
    const url = `${apiBaseUrl("twenty")}/healthz`;
    const plain = await request.get(url);
    const tagged = await request.get(url, { headers: { [RUN_ID_HEADER]: currentRunPrefix() } });
    expect([plain.status(), tagged.status()]).toEqual([200, 200]);
  });

  test("the oracle connects as qa_ro in a read-only session", async () => {
    expect(await connectedRole("twenty")).toEqual({ user: "qa_ro", readOnly: "on" });
  });

  test("an API key is minted from the workspace login and revoked again; the key then answers 403", async () => {
    const env = loadAuthEnv();
    const auth = await mintTwenty({
      baseUrl: apiBaseUrl("twenty"),
      email: env.TWENTY_EMAIL,
      password: env.TWENTY_PASSWORD,
      name: (label) => runScopedName(`ready-${label}`),
    });
    expect(await auth.isAccepted()).toBe(true);
    await revokeAndVerify(auth, () => auth.isAccepted());
  });

  test("person.created: canary precondition, then one real event asserted once by record id", async ({
    tw,
    receiverHandle,
  }) => {
    const secret = randomSecret(); // per run; no fixed literal
    const key = receiverHandle.key("tw-ready-wh");
    const people: string[] = [];
    const createdAt = Date.now();
    let webhookId: string | undefined;
    try {
      webhookId = await tw.webhooks.create({
        targetUrl: receiverHandle.urlFor("tw-ready-wh"),
        operations: ["person.created"],
        secret,
        description: runScopedName("ready-webhook"),
      });
      let canaryId: string | undefined;
      const canaryDelivered = (): boolean =>
        canaryId !== undefined &&
        receiverHandle.receiver.deliveries(key).some((d) => recordIdOf(d) === canaryId);

      // Precondition (asserted): the webhook is visible to the worker within the memo-derived bound.
      let canarySent = 0;
      const canaryTriggers = await canaryPrecondition({
        trigger: async () => {
          canarySent += 1;
          // The bound is enforced at the send, so a regression in canaryPrecondition fails here.
          if (canarySent > CANARY_MAX_TRIGGERS) throw new Error("TEST BUG: canary bound exceeded");
          canaryId = await tw.people.create(runScopedName("ready-canary"));
          people.push(canaryId);
        },
        delivered: canaryDelivered,
        elapsedMs: () => Date.now() - createdAt,
        waitUntil: async (predicate, timeoutMs, message) => {
          await expect.poll(predicate, { timeout: timeoutMs, message }).toBe(true);
        },
        memoTtlMs: TWENTY_WEBHOOK_MEMO_MS,
        deliveryMs: SLO.twWebhookDelivery.ms,
        marginMs: CANARY_MARGIN_MS,
      });
      expect(canarySent, "triggers reported equal the canary events actually sent").toBe(
        canaryTriggers,
      );
      expect(canarySent, "canary sent within the memo-derived bound").toBeLessThanOrEqual(
        CANARY_MAX_TRIGGERS,
      );

      // The real event: fired once, asserted by its own record id.
      const realId = await tw.people.create(runScopedName("ready-real"));
      people.push(realId);
      await expect
        .poll(
          () =>
            receiverHandle.receiver.deliveries(key).filter((d) => recordIdOf(d) === realId).length,
          { timeout: SLO.twWebhookDelivery.ms, message: "Twenty real event delivered" },
        )
        .toBe(1);
      const delivery = receiverHandle.receiver
        .deliveries(key)
        .find((d) => recordIdOf(d) === realId);
      expect(
        verifyTwenty({
          secret,
          rawBody: delivery?.rawBody ?? "",
          headers: delivery?.headers ?? {},
          nowMs: Date.now(),
          toleranceMs: null,
        }),
      ).toEqual({ ok: true });
    } finally {
      for (const id of people) await tw.people.remove(id);
      if (webhookId !== undefined) await tw.webhooks.remove(webhookId);
    }
  });

  test("every Twenty invariant rule runs against the live schemas and finds nothing", async () => {
    const found = await runSweep(readOnlyDb("twenty"), rulesFor("twenty"), {
      runPrefix: currentRunPrefix(),
      retained,
      includeLeaks: true,
    });
    expect(found).toEqual([]);
  });
});
