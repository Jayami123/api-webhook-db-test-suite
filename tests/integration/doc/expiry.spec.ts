import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { documensoFixtureWriter, setRecipientExpiresAt } from "../../../src/lanes/doc/fixtures.ts";
import { completeRecipient, trpcPost } from "../../../src/lanes/doc/envelope.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";
import { distributedEnvelope } from "../../fixtures/doc/distributed-envelope.ts";

// EXP-003 (a recipient moved back into its window) uses the Recipient.expiresAt allow-list entry in
// src/db/fixture-allowlist.ts (merged with #16). Master plan row: P2-DOC-EXP-003, scope OD-10.

test("P2-DOC-EXP-001 signing before expiry succeeds", async ({ doc, request, docAuth }) => {
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
    // A5: the window is set from the DB clock plus a named budget, so a slow run is a setup error, not a product one.
    const dbNow = async (): Promise<Date> =>
      (await db.select<{ now: Date }>(`SELECT now() AS now`))[0]?.now ?? new Date(0);
    const at = new Date((await dbNow()).getTime() + SLO.docSignWindow.ms);
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
    // Setup assert before completion: the window still holds on the DB clock (else the run was too slow).
    expect(
      (await dbNow()).getTime(),
      "the expiry window elapsed before completion (setup, not a product failure)",
    ).toBeLessThan(at.getTime());
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

test("P2-DOC-EXP-003 a recipient moved back into its window signs again", async ({
  doc,
  request,
  docAuth,
}) => {
  const runPrefix = currentRunPrefix();
  const db = readOnlyDb("documenso");
  const w = documensoFixtureWriter(runPrefix);
  const env = await distributedEnvelope({
    label: "exp-003",
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
    // Precondition: the expired window is refused (the EXP-002 behaviour), so the move back is what changes the answer.
    await setRecipientExpiresAt(
      w,
      signer.recipientId,
      new Date(Date.now() - 1_000),
      "P2-DOC-EXP-003",
    );
    const expired = await trpcPost(env.http, "field.signFieldWithToken", {
      token: signer.token,
      fieldId: signer.fieldId,
      value: "probe",
    });
    expect(expired.status).toBeGreaterThanOrEqual(400);
    expect(expired.text).toContain("RECIPIENT_EXPIRED");
    // Move the window back into the future and sign again.
    const future = new Date(Date.now() + 60 * 60 * 1_000);
    await setRecipientExpiresAt(w, signer.recipientId, future, "P2-DOC-EXP-003");
    const row = await db.select<{ expiresAt: Date }>(
      `SELECT "expiresAt" AS "expiresAt" FROM "Recipient" WHERE "id" = $1`,
      [signer.recipientId],
    );
    expect(row[0]?.expiresAt.getTime()).toBe(future.getTime()); // the move back landed exactly
    const res = await trpcPost(env.http, "field.signFieldWithToken", {
      token: signer.token,
      fieldId: signer.fieldId,
      value: "probe",
    });
    expect(res.status).toBe(200);
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
