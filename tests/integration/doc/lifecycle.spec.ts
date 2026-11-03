import { execFile } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import { v2Post, distribute, type LaneHttp } from "../../../src/lanes/doc/envelope.ts";
import { listMail, mailboxOf } from "../../../src/lanes/doc/mail.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
import { completedEnvelope } from "../../fixtures/doc/completed-envelope.ts";
import { distributedEnvelope } from "../../fixtures/doc/distributed-envelope.ts";

const run = promisify(execFile);

/** Audit action counts for one envelope (DocumentAuditLog, read through qa_ro). */
async function auditCounts(
  db: ReturnType<typeof readOnlyDb>,
  envelopeId: string,
): Promise<Record<string, number>> {
  const rows = await db.select<{ type: string; n: number }>(
    `SELECT a."type" AS type, COUNT(*)::int AS n FROM "DocumentAuditLog" a WHERE a."envelopeId" = $1 GROUP BY a."type" ORDER BY a."type"`,
    [envelopeId],
  );
  return Object.fromEntries(rows.map((r) => [r.type, r.n]));
}

/** EMAIL_SENT audit rows by emailType (the product records one row per email). */
async function emailTypeCounts(
  db: ReturnType<typeof readOnlyDb>,
  envelopeId: string,
): Promise<Record<string, number>> {
  const rows = await db.select<{ t: string; n: number }>(
    `SELECT a."data"->>'emailType' AS t, COUNT(*)::int AS n FROM "DocumentAuditLog" a WHERE a."envelopeId" = $1 AND a."type" = 'EMAIL_SENT' GROUP BY 1 ORDER BY 1`,
    [envelopeId],
  );
  return Object.fromEntries(rows.map((r) => [r.t, r.n]));
}

test("P2-DOC-SM-001 completing an envelope through the product sets completedAt (B3 oracle)", async ({
  doc,
  request,
  docAuth,
}) => {
  const runPrefix = currentRunPrefix();
  const db = readOnlyDb("documenso");
  const done = await completedEnvelope({
    label: "sm-001",
    signers: 1,
    doc,
    request,
    authorization: () => docAuth.headerValue.reveal(),
    db,
    runPrefix,
  });
  try {
    const row = await db.select<{ status: string; completedAt: Date | null }>(
      `SELECT "status" AS status, "completedAt" AS "completedAt" FROM "Envelope" WHERE "id" = $1`,
      [done.envelopeId],
    );
    expect(row[0]?.status).toBe("COMPLETED");
    expect(row[0]?.completedAt).not.toBeNull(); // B3: the runtime sets completedAt (seal-document.handler.ts:310-316)
  } finally {
    await doc.envelopes.remove(done.envelopeId);
  }
});

test("P2-DOC-SM-001 refused transitions on a COMPLETED envelope change no rows", async ({
  doc,
  request,
  docAuth,
}) => {
  const runPrefix = currentRunPrefix();
  const db = readOnlyDb("documenso");
  const done = await completedEnvelope({
    label: "sm-001-refused",
    signers: 1,
    doc,
    request,
    authorization: () => docAuth.headerValue.reveal(),
    db,
    runPrefix,
  });
  const http: LaneHttp = {
    request,
    baseUrl: apiBaseUrl("documenso"),
    authorization: () => docAuth.headerValue.reveal(),
  };
  const snapshot = async () =>
    JSON.stringify({
      envelope: await db.select(
        `SELECT "status" AS status, "title" AS title FROM "Envelope" WHERE "id" = $1`,
        [done.envelopeId],
      ),
      fields: await db.select(
        `SELECT f."id" AS id FROM "Field" f JOIN "Recipient" r ON r."id" = f."recipientId" JOIN "Envelope" e ON e."id" = r."envelopeId" WHERE e."id" = $1 ORDER BY f."id"`,
        [done.envelopeId],
      ),
    });
  try {
    const before = await snapshot();
    const redistribute = await distribute(http, done.envelopeId);
    // P-DOC-11 (observed 2026-11-03): send-document.ts:125 throws a plain Error for a completed envelope, which
    // answers 500. A P5 design finding (no documented 4xx contract), so no test.fail; the status is pinned.
    expect(redistribute).toBe(500);
    const addField = await v2Post(http, "/api/v2/envelope/field/create-many", {
      envelopeId: done.envelopeId,
      data: [
        {
          recipientId: done.prepared.signers[0]?.recipientId,
          type: "SIGNATURE",
          page: 1,
          positionX: 10,
          positionY: 10,
          width: 20,
          height: 5,
        },
      ],
    });
    expect(addField.status).toBe(400); // P-DOC-11
    expect(await snapshot()).toBe(before);
  } finally {
    await doc.envelopes.remove(done.envelopeId);
  }
});

test("P2-DOC-SM-002 distributing a PENDING envelope a second time changes no rows", async ({
  doc,
  request,
  docAuth,
}) => {
  const runPrefix = currentRunPrefix();
  const db = readOnlyDb("documenso");
  const env = await distributedEnvelope({
    label: "sm-002",
    signers: 2,
    doc,
    request,
    authorization: () => docAuth.headerValue.reveal(),
    db,
    runPrefix,
  });
  try {
    const snapshot = async () =>
      JSON.stringify({
        envelope: await db.select(`SELECT "status" AS status FROM "Envelope" WHERE "id" = $1`, [
          env.envelopeId,
        ]),
        recipients: await db.select(
          `SELECT r."id" AS id, r."signingStatus" AS "signingStatus", r."sendStatus" AS "sendStatus" FROM "Recipient" r WHERE r."envelopeId" = $1 ORDER BY r."id"`,
          [env.envelopeId],
        ),
      });
    // The first distribute's send status is written asynchronously: wait for it, so the "before" snapshot is not raced.
    await expect
      .poll(
        async () =>
          (
            await db.select<{ s: string }>(
              `SELECT r."sendStatus" AS s FROM "Recipient" r WHERE r."envelopeId" = $1`,
              [env.envelopeId],
            )
          )
            .map((r) => r.s)
            .every((s) => s === "SENT"),
        {
          timeout: SLO.docWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
          message: "first distribute sent",
        },
      )
      .toBe(true);
    const before = await snapshot();
    // Observed 2026-11-03 (B-34): a second distribute of a PENDING envelope answers 200 and changes no row.
    // EMAIL_SENT and each signer's mail count are read at the same points (no quiet window; see the report).
    const emailsBefore = await emailTypeCounts(db, env.envelopeId);
    const mailsBefore = await Promise.all(
      env.prepared.signers.map(async (x) => (await listMail(mailboxOf(x.email))).length),
    );
    const second = await distribute(env.http, env.envelopeId);
    expect(second).toBe(200);
    expect(await snapshot()).toBe(before);
    expect(await emailTypeCounts(db, env.envelopeId)).toEqual(emailsBefore);
    expect(
      await Promise.all(
        env.prepared.signers.map(async (x) => (await listMail(mailboxOf(x.email))).length),
      ),
    ).toEqual(mailsBefore);
  } finally {
    await doc.envelopes.remove(env.envelopeId);
  }
});

test("P2-DOC-AUD-001 a full lifecycle writes exactly one audit row per action type", async ({
  doc,
  request,
  docAuth,
}) => {
  const runPrefix = currentRunPrefix();
  const db = readOnlyDb("documenso");
  const done = await completedEnvelope({
    label: "aud-001",
    signers: 1,
    doc,
    request,
    authorization: () => docAuth.headerValue.reveal(),
    db,
    runPrefix,
  });
  try {
    // Wait for the real condition: both completion notices are audited (an asynchronous job, not a sleep).
    await expect
      .poll(async () => (await emailTypeCounts(db, done.envelopeId)).DOCUMENT_COMPLETED ?? 0, {
        timeout: SLO.docWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "completion notices audited",
      })
      .toBe(2);
    expect(await auditCounts(db, done.envelopeId)).toEqual(EXPECTED_AUDIT_ONE_SIGNER);
    expect(await emailTypeCounts(db, done.envelopeId)).toEqual(EXPECTED_EMAIL_TYPES_ONE_SIGNER);
  } finally {
    await doc.envelopes.remove(done.envelopeId);
  }
});

/**
 * One row per lifecycle action, and one EMAIL_SENT row per email sent. Measured 2026-11-02 on a one-signer
 * envelope: the signing request (at distribute) and two completion notices (owner and signer, written by an
 * asynchronous job after DOCUMENT_COMPLETED). The plan's "exactly one per type" holds for every type except
 * EMAIL_SENT, which is one row per email (plan statement corrected; see the PR body).
 */
const EXPECTED_AUDIT_ONE_SIGNER: Record<string, number> = {
  DOCUMENT_COMPLETED: 1,
  DOCUMENT_CREATED: 1,
  DOCUMENT_FIELDS_AUTO_INSERTED: 1,
  DOCUMENT_FIELD_INSERTED: 1,
  DOCUMENT_RECIPIENT_COMPLETED: 1,
  DOCUMENT_SENT: 1,
  EMAIL_SENT: 3,
  FIELD_CREATED: 1,
};
const EXPECTED_EMAIL_TYPES_ONE_SIGNER: Record<string, number> = {
  DOCUMENT_COMPLETED: 2,
  SIGNING_REQUEST: 1,
};

test("P2-DOC-AUD-002 the certificate PDF names each signer", async ({ doc, request, docAuth }) => {
  const runPrefix = currentRunPrefix();
  const artefactDir = path.join("test-results", "doc-aud", `${runPrefix}-002`);
  const db = readOnlyDb("documenso");
  const done = await completedEnvelope({
    label: "aud-002",
    signers: 2,
    doc,
    request,
    authorization: () => docAuth.headerValue.reveal(),
    db,
    runPrefix,
  });
  try {
    const res = await request.fetch(
      `${apiBaseUrl("documenso")}/api/v2/envelope/${done.envelopeId}/certificate/download`,
      {
        headers: { authorization: docAuth.headerValue.reveal() },
        maxRedirects: 0,
        failOnStatusCode: false,
      },
    );
    expect(res.status()).toBe(200);
    mkdirSync(artefactDir, { recursive: true });
    const file = path.join(artefactDir, "certificate.pdf");
    writeFileSync(file, Buffer.from(await res.body()));
    const text = (await run("pdftotext", [file, "-"])).stdout;
    // pdftotext wraps long values across lines: compare with all whitespace removed.
    const flat = text.replace(/\s+/g, "");
    for (const signer of done.prepared.signers) {
      expect(flat).toContain(signer.email.replace(/\s+/g, ""));
    }
  } finally {
    await doc.envelopes.remove(done.envelopeId);
    rmSync(artefactDir, { recursive: true, force: true });
  }
});
