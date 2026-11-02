import { readFileSync } from "node:fs";
import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb, type ReadOnlyDb } from "../../../src/db/pg.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import { listMail, mailboxOf } from "../../../src/lanes/doc/mail.ts";
import { productsRoot } from "../../../src/readiness/checks.ts";
import { currentRunPrefix, escapeLike } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";

/** Bulk send is the tRPC procedure template.uploadBulkSend (template-router/router.ts:804-842). */
const BULK = "template.uploadBulkSend";

interface BulkResult {
  readonly success: boolean;
  readonly error?: unknown;
}

async function uploadBulkSend(
  request: APIRequestContext,
  cookie: string,
  teamId: number,
  templateId: number,
  csv: string,
  sendImmediately: boolean,
): Promise<BulkResult> {
  const res = await request.fetch(`${apiBaseUrl("documenso")}/api/trpc/${BULK}`, {
    method: "POST",
    headers: { cookie, "x-team-id": String(teamId), "content-type": "application/json" },
    data: JSON.stringify({ json: { templateId, teamId, csv, sendImmediately } }),
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { result: { data: { json: BulkResult } } };
  return body.result.data.json;
}

/**
 * One template with a placeholder recipient and a SIGNATURE field on it (a signer needs one before a
 * bulk send: MISSING_SIGNATURE_FIELD, observed in the product log 2026-11-02). Created through the v2 API.
 */
async function makeTemplate(
  request: APIRequestContext,
  db: ReadOnlyDb,
  authorization: string,
  label: string,
  prefix: string,
): Promise<number> {
  const pdf = readFileSync(path.join(productsRoot(), "documenso", "assets", "example.pdf"));
  const created = await request.fetch(`${apiBaseUrl("documenso")}/api/v2/template/create`, {
    method: "POST",
    headers: { authorization },
    multipart: {
      payload: JSON.stringify({ title: `${prefix}-${label}` }),
      file: { name: "example.pdf", mimeType: "application/pdf", buffer: pdf },
    },
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  expect(created.status()).toBe(200);
  const { id } = (await created.json()) as { id: number };
  const placeholder = `${prefix}-${label}-placeholder@example.test`;
  const recipients = await request.fetch(
    `${apiBaseUrl("documenso")}/api/v2/template/recipient/create-many`,
    {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      data: JSON.stringify({
        templateId: id,
        recipients: [{ email: placeholder, name: "Recipient 1", role: "SIGNER" }],
      }),
      maxRedirects: 0,
      failOnStatusCode: false,
    },
  );
  expect(recipients.status()).toBe(200);
  const rows = await db.select<{ id: number }>(
    `SELECT r."id" AS id FROM "Recipient" r WHERE r."email" = $1`,
    [placeholder],
  );
  const recipientId = rows[0]?.id;
  if (recipientId === undefined)
    throw new Error("TEST BUG: template placeholder recipient not found");
  const field = await request.fetch(
    `${apiBaseUrl("documenso")}/api/v2/template/field/create-many`,
    {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      data: JSON.stringify({
        templateId: id,
        fields: [
          {
            type: "SIGNATURE",
            recipientId,
            pageNumber: 1,
            pageX: 10,
            pageY: 10,
            width: 20,
            height: 5,
          },
        ],
      }),
      maxRedirects: 0,
      failOnStatusCode: false,
    },
  );
  expect(field.status()).toBe(200);
  return id;
}

async function deleteTemplate(
  request: APIRequestContext,
  authorization: string,
  templateId: number,
): Promise<void> {
  await request.fetch(`${apiBaseUrl("documenso")}/api/v2/template/delete`, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    data: JSON.stringify({ templateId }),
    failOnStatusCode: false,
  });
}

/** Envelope ids of recipients whose address starts with this test's tag (read through qa_ro). */
async function envelopesWithTag(db: ReadOnlyDb, tag: string): Promise<string[]> {
  const rows = await db.select<{ env: string }>(
    `SELECT DISTINCT r."envelopeId" AS env FROM "Recipient" r WHERE r."email" LIKE $1 ESCAPE '\\'`,
    [`${escapeLike(tag)}%`],
  );
  return rows.map((r) => r.env);
}

const csvOf = (rows: readonly string[]): string =>
  ["recipient_1_email,recipient_1_name", ...rows].join("\n") + "\n";

test("P2-DOC-BULK-001 a CSV with one bad row mid-file: behaviour recorded and pinned", async ({
  request,
  docAuth,
}) => {
  const prefix = currentRunPrefix();
  const db = readOnlyDb("documenso");
  const authorization = docAuth.headerValue.reveal();
  const templateId = await makeTemplate(request, db, authorization, "bulk-001", prefix);
  const tag = `${prefix}-b1-`;
  try {
    const csv = csvOf([`${tag}a@example.test,A`, "not-an-email,B", `${tag}c@example.test,C`]);
    const result = await uploadBulkSend(
      request,
      docAuth.sessionCookie.reveal(),
      docAuth.teamId,
      templateId,
      csv,
      true,
    );
    // Observed: validation refuses the whole file before any bulk job is queued, so no envelope exists for
    // this test's addresses (the other rows are not processed either).
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(await envelopesWithTag(db, tag)).toEqual([]);
  } finally {
    await deleteTemplate(request, authorization, templateId);
  }
});

test("P2-DOC-BULK-002 re-submitting the same CSV sends no duplicate mail", async ({
  request,
  docAuth,
}) => {
  const prefix = currentRunPrefix();
  const db = readOnlyDb("documenso");
  const authorization = docAuth.headerValue.reveal();
  const cookie = docAuth.sessionCookie.reveal();
  const templateId = await makeTemplate(request, db, authorization, "bulk-002", prefix);
  const tag = `${prefix}-b2-`;
  const addresses = [`${tag}a@example.test`, `${tag}c@example.test`];
  const csv = csvOf(addresses.map((a, i) => `${a},Name ${String(i + 1)}`));
  try {
    const first = await uploadBulkSend(request, cookie, docAuth.teamId, templateId, csv, true);
    expect(first.success).toBe(true);
    // Wait on the real condition: one envelope per CSV row exists, and one signing mail per recipient arrived.
    await expect
      .poll(async () => (await envelopesWithTag(db, tag)).length, {
        timeout: SLO.docWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "first bulk job envelopes",
      })
      .toBe(addresses.length);
    for (const address of addresses) {
      await expect
        .poll(async () => (await listMail(mailboxOf(address))).length, {
          timeout: SLO.docWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
          message: "one bulk mail",
        })
        .toBe(1);
    }
    const second = await uploadBulkSend(request, cookie, docAuth.teamId, templateId, csv, true);
    expect(second.success).toBe(true);
    await expect
      .poll(async () => (await envelopesWithTag(db, tag)).length, {
        timeout: SLO.docWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "second bulk job envelopes",
      })
      .toBe(addresses.length * 2);
    for (const address of addresses) expect((await listMail(mailboxOf(address))).length).toBe(1);
  } finally {
    for (const envelopeId of await envelopesWithTag(db, tag)) {
      await request.fetch(`${apiBaseUrl("documenso")}/api/v2/envelope/delete`, {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        data: JSON.stringify({ envelopeId }),
        failOnStatusCode: false,
      });
    }
    await deleteTemplate(request, authorization, templateId);
  }
});
