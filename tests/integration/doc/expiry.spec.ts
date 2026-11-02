import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { documensoFixtureWriter, setRecipientExpiresAt } from "../../../src/lanes/doc/fixtures.ts";
import { completeRecipient, trpcPost } from "../../../src/lanes/doc/envelope.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";
import { distributedEnvelope } from "../../fixtures/doc/distributed-envelope.ts";

// EXP-003 (a recipient moved back into its window) is not built: src/db/fixture-allowlist.ts allows
// Recipient.expiresAt for P2-DOC-EXP-001 and P2-DOC-EXP-002 only. Adding a case is a shared-file change.

test("P2-DOC-EXP-001 signing 1 s before expiry succeeds", async ({ doc, request, docAuth }) => {
  const runPrefix = currentRunPrefix();
  const db = readOnlyDb("documenso");
  const w = documensoFixtureWriter(runPrefix);
  const env = await distributedEnvelope({
    label: "exp-001",
    signers: 1,
    doc,
    request,
    authorization: () => docAuth.headerValue.reveal(),
    db,
    runPrefix,
  });
  try {
    const signer = env.prepared.signers[0];
    if (signer === undefined || signer.fieldId === undefined)
      throw new Error("TEST BUG: no signer field");
    const at = new Date(Date.now() + 2_000);
    await setRecipientExpiresAt(w, signer.recipientId, at, "P2-DOC-EXP-001");
    const row = await db.select<{ expiresAt: Date }>(
      `SELECT "expiresAt" AS "expiresAt" FROM "Recipient" WHERE "id" = $1`,
      [signer.recipientId],
    );
    expect(row[0]?.expiresAt.getTime()).toBe(at.getTime()); // the fixture write landed exactly
    const res = await trpcPost(env.http, "field.signFieldWithToken", {
      token: signer.token,
      fieldId: signer.fieldId,
      value: "probe",
    });
    expect(res.status).toBe(200);
    // The recipient reaches SIGNED only when it completes (P-DOC-9); the field write alone leaves NOT_SIGNED.
    expect(await completeRecipient(env.http, env.prepared, signer)).toBe(200);
    await expect
      .poll(
        async () =>
          (
            await db.select<{ signingStatus: string }>(
              `SELECT "signingStatus" AS "signingStatus" FROM "Recipient" WHERE "id" = $1`,
              [signer.recipientId],
            )
          )[0]?.signingStatus,
        { timeout: SLO.docWebhookDelivery.ms, intervals: POLL_INTERVALS, message: "SIGNED" },
      )
      .toBe("SIGNED");
  } finally {
    await w.close();
    await doc.envelopes.remove(env.envelopeId);
  }
});

test("P2-DOC-EXP-002 signing 1 s after expiry is refused with RECIPIENT_EXPIRED and the recipient is unchanged", async ({
  doc,
  request,
  docAuth,
}) => {
  const runPrefix = currentRunPrefix();
  const db = readOnlyDb("documenso");
  const w = documensoFixtureWriter(runPrefix);
  const env = await distributedEnvelope({
    label: "exp-002",
    signers: 1,
    doc,
    request,
    authorization: () => docAuth.headerValue.reveal(),
    db,
    runPrefix,
  });
  try {
    const signer = env.prepared.signers[0];
    if (signer === undefined || signer.fieldId === undefined)
      throw new Error("TEST BUG: no signer field");
    await setRecipientExpiresAt(
      w,
      signer.recipientId,
      new Date(Date.now() - 1_000),
      "P2-DOC-EXP-002",
    );
    const recipientRow = async () =>
      db.select<{ signingStatus: string; signedAt: Date | null }>(
        `SELECT "signingStatus" AS "signingStatus", "signedAt" AS "signedAt" FROM "Recipient" WHERE "id" = $1`,
        [signer.recipientId],
      );
    const before = JSON.stringify(await recipientRow());
    const res = await trpcPost(env.http, "field.signFieldWithToken", {
      token: signer.token,
      fieldId: signer.fieldId,
      value: "probe",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.text).toContain("RECIPIENT_EXPIRED");
    expect(JSON.stringify(await recipientRow())).toBe(before);
  } finally {
    await w.close();
    await doc.envelopes.remove(env.envelopeId);
  }
});
