import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { randomSecret } from "../../../src/readiness/checks.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";
import { ZWebhookPayloadSchema } from "../../../src/lanes/doc/webhook-schema.ts";
import { verifyDocumenso } from "../../../src/webhooks/verify.ts";
import { distributedEnvelope } from "../../fixtures/doc/distributed-envelope.ts";
import { runAllThenRethrow } from "../../../src/shared/cleanup.ts";
import { expectedDefect } from "../../../src/ci/known-defect.ts";

/**
 * WH-005 (master plan): "Payload contract per event", priority P1. Oracle: every payload is valid, and no
 * recipient tokens of other recipients are in the payload.
 *
 * Setup asserts (must pass): each delivery parses against the fork's document payload schema
 * (src/lanes/doc/webhook-schema.ts, cited line by line), carries a valid Documenso signature, and names this run's
 * recipients. Only then is the oracle asserted: the receiver is not a recipient, so any recipient token in the
 * payload is exposure to the endpoint. The fork's schema carries every recipient's `token` in each document payload
 * (webhook-payload.ts:22-29 and :84). Proven live 2026-11-03 (probe B-38): both payloads carried both recipients'
 * tokens. Product finding, P5-DOC-TOK-002; `test.fail` is the owner's decision. The assertion is not loosened.
 */
test("P2-DOC-WH-005 every delivered payload matches the schema and carries no recipient token", async ({
  doc,
  receiverHandle,
  request,
  docAuth,
}) => {
  const key = receiverHandle.key("p2-wh-005");
  const db = readOnlyDb("documenso");
  const runPrefix = currentRunPrefix();
  const secret = randomSecret();
  const id = await doc.webhooks.create({
    webhookUrl: receiverHandle.urlFor("p2-wh-005"),
    eventTriggers: ["DOCUMENT_CREATED", "DOCUMENT_SENT"],
    secret,
  });
  let envelopeId: string | undefined;
  // Captured in setup, asserted after the cleanup (see the oracle below).
  const tokensInPayloads: string[] = [];
  try {
    const env = await distributedEnvelope({
      label: "wh-005",
      signers: 2,
      doc,
      request,
      authorization: () => docAuth.headerValue.reveal(),
      db,
      runPrefix,
    });
    envelopeId = env.envelopeId;
    await expect
      .poll(() => receiverHandle.receiver.deliveries(key).length, {
        timeout: SLO.docWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "CREATED and SENT delivered",
      })
      .toBeGreaterThanOrEqual(2);
    const runEmails = env.prepared.signers.map((s) => s.email).sort();
    const events = new Set<string>();
    for (const d of receiverHandle.receiver.deliveries(key)) {
      // Setup: the body parses against the schema, the signature verifies, and this run's recipients are named.
      const parsed = ZWebhookPayloadSchema.safeParse(JSON.parse(d.rawBody.toString("utf8")));
      expect(
        parsed.success,
        parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3)),
      ).toBe(true);
      expect(verifyDocumenso({ secret, headers: d.headers })).toEqual({ ok: true });
      if (!parsed.success) continue;
      events.add(parsed.data.event);
      const named = parsed.data.payload.recipients.map((r) => r.email).sort();
      expect(named).toEqual(runEmails);
      tokensInPayloads.push(...parsed.data.payload.recipients.map((r) => r.token));
    }
    expect(events.has("DOCUMENT_CREATED")).toBe(true);
    expect(events.has("DOCUMENT_SENT")).toBe(true);
  } finally {
    await runAllThenRethrow([
      () => (envelopeId ? doc.envelopes.remove(envelopeId) : Promise.resolve()),
      () => doc.webhooks.remove(id),
    ]);
  }
  // Oracle (expected to fail: P5-DOC-TOK-002), asserted only after the cleanup has finished, on the values captured in
  // setup. Under test.fail a cleanup error would count as the expected failure; here it fails the test before this line.
  // No recipient token may reach the webhook endpoint.
  expectedDefect(
    "P5-DOC-TOK-002: every document payload carries every recipient's token (webhook-payload.ts:22-29, :84) (docs/probes/2026-11-02-p2-lane-documenso-probes.md:521)",
  );
  expect(tokensInPayloads).toEqual([]);
});
