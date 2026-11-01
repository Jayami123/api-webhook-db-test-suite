import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../../src/fixtures/index.ts";
import { mintDocumenso } from "../../src/auth/documenso.ts";
import { loadAuthEnv } from "../../src/auth/env.ts";
import { revokeAndVerify } from "../../src/auth/lifecycle.ts";
import { RUN_ID_HEADER } from "../../src/clients/base.ts";
import { readOnlyDb } from "../../src/db/pg.ts";
import { apiBaseUrl } from "../../src/env.ts";
import { runSweep } from "../../src/invariants/engine.ts";
import { retained } from "../../src/invariants/fixture.ts";
import { rulesFor } from "../../src/invariants/rules.ts";
import { connectedRole, productsRoot, randomSecret } from "../../src/readiness/checks.ts";
import { currentRunPrefix, runScopedName } from "../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../src/slo.ts";
import { verifyDocumenso } from "../../src/webhooks/verify.ts";

/**
 * Documenso readiness. Needs Node 24 and a 7 GB heap for the harness build (plan Task 5), the
 * receiver hostname in the hosts file and NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=<that hostname>
 * in the environment of `up` (the list is read once at process start).
 */
test.describe("documenso readiness", () => {
  test("the app answers and the run-id header is not rejected", async ({ request }) => {
    const url = `${apiBaseUrl("documenso")}/api/auth/csrf`;
    const plain = await request.get(url);
    const tagged = await request.get(url, { headers: { [RUN_ID_HEADER]: currentRunPrefix() } });
    expect([plain.status(), tagged.status()]).toEqual([200, 200]);
  });

  test("the oracle connects as qa_ro in a read-only session", async () => {
    expect(await connectedRole("documenso")).toEqual({ user: "qa_ro", readOnly: "on" });
  });

  test("an API token is minted through the session and revoked again, and then answers 401", async () => {
    const env = loadAuthEnv();
    const db = readOnlyDb("documenso");
    const auth = await mintDocumenso({
      baseUrl: apiBaseUrl("documenso"),
      email: env.P2_DOC_USER_EMAIL,
      password: env.P2_DOC_USER_PASSWORD,
      name: (label) => runScopedName(`ready-${label}`),
      teamId: async () => {
        const rows = await db.select<{ id: number }>(
          `SELECT t."id" AS id FROM "Team" t JOIN "Organisation" o ON o."id" = t."organisationId" JOIN "User" u ON u."id" = o."ownerUserId" WHERE u."email" = $1 ORDER BY t."id" LIMIT 1`,
          [env.P2_DOC_USER_EMAIL],
        );
        return rows[0]?.id ?? Number.NaN;
      },
    });
    expect(await auth.isAccepted()).toBe(true);
    await revokeAndVerify(auth, () => auth.isAccepted());
  });

  test("DOCUMENT_CREATED reaches the receiver path with the configured secret header", async ({
    doc,
    receiverHandle,
  }) => {
    const secret = randomSecret();
    const key = receiverHandle.key("doc-ready-wh");
    const webhookId = await doc.webhooks.create({
      webhookUrl: receiverHandle.urlFor("doc-ready-wh"),
      eventTriggers: ["DOCUMENT_CREATED"],
      secret,
    });
    let envelopeId: string | undefined;
    try {
      const pdf = readFileSync(path.join(productsRoot(), "documenso", "assets", "example.pdf"));
      envelopeId = await doc.envelopes.create({
        title: runScopedName("ready-envelope"),
        pdf,
        recipients: [],
      });
      await expect
        .poll(() => receiverHandle.receiver.deliveries(key).length, {
          timeout: SLO.docWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
          message: "Documenso webhook delivery",
        })
        .toBe(1);
      const delivery = receiverHandle.receiver.deliveries(key)[0];
      expect(verifyDocumenso({ secret, headers: delivery?.headers ?? {} })).toEqual({ ok: true });
      expect(
        (JSON.parse(delivery?.rawBody.toString("utf8") ?? "{}") as { event?: string }).event,
      ).toBe("DOCUMENT_CREATED");
    } finally {
      if (envelopeId !== undefined) await doc.envelopes.remove(envelopeId);
      await doc.webhooks.remove(webhookId);
    }
  });

  test("every Documenso invariant rule runs against the live schema and finds nothing", async () => {
    const found = await runSweep(readOnlyDb("documenso"), rulesFor("documenso"), {
      runPrefix: currentRunPrefix(),
      retained,
      includeLeaks: true,
    });
    expect(found).toEqual([]);
  });
});
