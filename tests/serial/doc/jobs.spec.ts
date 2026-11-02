import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { replayDispatch, readSecondaryKey, signJobOptions } from "../../../src/lanes/doc/jobs.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
import { completedEnvelope } from "../../fixtures/doc/completed-envelope.ts";

test("P2-DOC-JOB-001 a completed envelope has exactly one seal job", async ({
  doc,
  request,
  docAuth,
}) => {
  const runPrefix = currentRunPrefix();
  const db = readOnlyDb("documenso");
  const done = await completedEnvelope({
    label: "job-001",
    signers: 1,
    doc,
    request,
    authorization: () => docAuth.headerValue.reveal(),
    db,
    runPrefix,
  });
  try {
    const rows = await db.select<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM "BackgroundJob" WHERE "jobId" = 'internal.seal-document' AND "payload"::text LIKE $1`,
      [`%"documentId":${String(done.prepared.documentId)}%`],
    );
    expect(rows[0]?.n).toBe(1);
  } finally {
    await doc.envelopes.remove(done.envelopeId);
  }
});

test("P2-DOC-JOB-004 three signed re-dispatches of a terminal job are refused by compare-and-set", async ({
  doc,
  request,
  docAuth,
}) => {
  const runPrefix = currentRunPrefix();
  const db = readOnlyDb("documenso");
  const done = await completedEnvelope({
    label: "job-004",
    signers: 1,
    doc,
    request,
    authorization: () => docAuth.headerValue.reveal(),
    db,
    runPrefix,
  });
  try {
    const secondary = readSecondaryKey(process.env, (p) => {
      process.loadEnvFile(p);
    });
    const jobRows = await db.select<{
      id: string;
      jobId: string;
      payload: unknown;
      status: string;
    }>(
      `SELECT "id" AS id, "jobId" AS "jobId", "payload" AS payload, "status" AS status FROM "BackgroundJob" WHERE "jobId" = 'internal.seal-document' AND "payload"::text LIKE $1`,
      [`%"documentId":${String(done.prepared.documentId)}%`],
    );
    const job = jobRows[0];
    if (job === undefined) throw new Error("TEST BUG: no seal job row for the envelope");
    expect(job.status).toBe("COMPLETED");
    const options = { name: job.jobId, payload: job.payload };
    const signature = signJobOptions(secondary, options);
    const snapshot = JSON.stringify(
      await db.select(
        `SELECT "status" AS status, "retried" AS retried FROM "BackgroundJob" WHERE "id" = $1`,
        [job.id],
      ),
    );
    for (let i = 0; i < 3; i += 1) {
      const res = await replayDispatch({
        baseUrl: apiBaseUrl("documenso"),
        jobDefinitionId: job.jobId,
        jobId: job.id,
        options,
        signature,
      });
      expect(res.status).toBe(404);
    }
    expect(
      JSON.stringify(
        await db.select(
          `SELECT "status" AS status, "retried" AS retried FROM "BackgroundJob" WHERE "id" = $1`,
          [job.id],
        ),
      ),
    ).toBe(snapshot);
  } finally {
    await doc.envelopes.remove(done.envelopeId);
  }
});
