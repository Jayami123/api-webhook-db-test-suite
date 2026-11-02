import { execFile } from "node:child_process";
import type { APIRequestContext } from "@playwright/test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import { productsRoot } from "../../../src/readiness/checks.ts";
import {
  completeRecipient,
  createSignableEnvelope,
  distribute,
  signField,
  v2Post,
  type LaneHttp,
} from "../../../src/lanes/doc/envelope.ts";
import { currentRunPrefix, runScopedName } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";

const run = promisify(execFile);

/** Kathmandu is UTC+05:45 all year (no DST). Used as the exact offset for the rendering check. */
const ZONE = "Asia/Kathmandu";
const OFFSET_MINUTES = 5 * 60 + 45;

/** Formats an instant the way the sealed PDF does for a German `dd.MM.yyyy` (or `HH:mm`) date. */
function inZone(at: Date, zone: string, withTime: boolean): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const date = `${get("day")}.${get("month")}.${get("year")}`;
  return withTime ? `${date} ${get("hour")}:${get("minute")}` : date;
}

function minutesOfDay(at: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return h * 60 + m;
}

/**
 * Creates a PENDING envelope with a German meta block, one SIGNATURE field and one DATE field,
 * distributes it, signs it and completes it. Returns the rendered DATE value and the bracket of
 * instants in which completion ran. The envelope is deleted in `finally`.
 */
async function completeGermanEnvelope(input: {
  dateFormat: string;
  label: string;
  http: LaneHttp;
  db: ReturnType<typeof readOnlyDb>;
  doc: import("../../../src/clients/documenso.ts").DocumensoClient;
  pdf: Buffer;
  artefactDir: string;
  request: APIRequestContext;
}): Promise<{ envelopeId: string; dateValue: string; before: Date; after: Date; sealed: Buffer }> {
  const { http, db, doc } = input;
  const envelopeId = await doc.envelopes.create({
    title: runScopedName(input.label),
    pdf: input.pdf,
    recipients: [{ email: `${currentRunPrefix()}-${input.label}@example.test`, name: "De" }],
  });
  const metaStatus = (
    await v2Post(http, "/api/v2/envelope/update", {
      envelopeId,
      meta: { dateFormat: input.dateFormat, timezone: ZONE, language: "de" },
    })
  ).status;
  expect(metaStatus).toBe(200);
  const prepared = await createSignableEnvelope({ http, db, envelopeId });
  const signer = prepared.signers[0];
  if (signer === undefined) throw new Error("TEST BUG: no signer on the prepared envelope");
  expect(signer.fieldId).toBeDefined();
  const dateField = await v2Post(http, "/api/v2/envelope/field/create-many", {
    envelopeId,
    data: [
      {
        recipientId: signer.recipientId,
        type: "DATE",
        page: 1,
        positionX: 60,
        positionY: 60,
        width: 30,
        height: 5,
      },
    ],
  });
  expect(dateField.status).toBe(200);
  expect(await distribute(http, envelopeId)).toBe(200);
  expect(await signField(http, signer)).toBe(200);
  const before = new Date();
  expect(await completeRecipient(http, prepared, signer)).toBe(200);
  const after = new Date();
  await expect
    .poll(
      async () =>
        (
          await db.select<{ status: string }>(
            `SELECT "status" AS status FROM "Envelope" WHERE "id" = $1`,
            [envelopeId],
          )
        )[0]?.status,
      { timeout: SLO.docWebhookDelivery.ms, intervals: POLL_INTERVALS, message: "COMPLETED" },
    )
    .toBe("COMPLETED");
  const rows = await db.select<{ customText: string | null }>(
    `SELECT f."customText" AS "customText" FROM "Field" f WHERE f."recipientId" = $1 AND f."type" = 'DATE'`,
    [signer.recipientId],
  );
  expect(rows).toHaveLength(1);
  const dateValue = rows[0]?.customText ?? "";
  const items = await db.select<{ id: string }>(
    `SELECT "id" AS id FROM "EnvelopeItem" WHERE "envelopeId" = $1`,
    [envelopeId],
  );
  expect(items).toHaveLength(1);
  const item = items[0];
  if (item === undefined) throw new Error("TEST BUG: no envelope item");
  const dl = await input.request.fetch(`${http.baseUrl}/api/v2/envelope/item/${item.id}/download`, {
    headers: { authorization: http.authorization() },
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  expect(dl.status()).toBe(200);
  const sealed = Buffer.from(await dl.body());
  mkdirSync(input.artefactDir, { recursive: true });
  writeFileSync(path.join(input.artefactDir, `${input.label}.pdf`), sealed);
  return { envelopeId, dateValue, before, after, sealed };
}

async function pdfText(file: string): Promise<string> {
  return (await run("pdftotext", [file, "-"])).stdout;
}

test.describe("German date and timezone in the sealed PDF", () => {
  const artefactDir = path.join("test-results", "doc-i18n", currentRunPrefix());

  test.afterAll(() => {
    rmSync(artefactDir, { recursive: true, force: true }); // never committed; removed after the run
  });

  test("P2-DOC-I18N-001 the sealed PDF shows the German date format dd.MM.yyyy", async ({
    doc,
    request,
    docAuth,
  }) => {
    const db = readOnlyDb("documenso");
    const http: LaneHttp = {
      request,
      baseUrl: apiBaseUrl("documenso"),
      authorization: () => docAuth.headerValue.reveal(),
    };
    const pdf = readFileSync(path.join(productsRoot(), "documenso", "assets", "example.pdf"));
    let envelopeId: string | undefined;
    try {
      const done = await completeGermanEnvelope({
        dateFormat: "dd.MM.yyyy",
        label: "i18n-001",
        http,
        db,
        doc,
        pdf,
        artefactDir,
        request,
      });
      envelopeId = done.envelopeId;
      // The DATE value is the product's own rendering (complete-document-with-token.ts:254).
      expect(done.dateValue).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
      // It is the signing day in Kathmandu, at either end of the completion bracket.
      expect([inZone(done.before, ZONE, false), inZone(done.after, ZONE, false)]).toContain(
        done.dateValue,
      );
      const text = await pdfText(path.join(artefactDir, "i18n-001.pdf"));
      expect(text).toContain(done.dateValue);
    } finally {
      if (envelopeId) await doc.envelopes.remove(envelopeId);
    }
  });

  test("P2-DOC-I18N-002 the sealed PDF renders the Asia/Kathmandu time as UTC+05:45", async ({
    doc,
    request,
    docAuth,
  }) => {
    const db = readOnlyDb("documenso");
    const http: LaneHttp = {
      request,
      baseUrl: apiBaseUrl("documenso"),
      authorization: () => docAuth.headerValue.reveal(),
    };
    const pdf = readFileSync(path.join(productsRoot(), "documenso", "assets", "example.pdf"));
    let envelopeId: string | undefined;
    try {
      const done = await completeGermanEnvelope({
        dateFormat: "dd.MM.yyyy HH:mm",
        label: "i18n-002",
        http,
        db,
        doc,
        pdf,
        artefactDir,
        request,
      });
      envelopeId = done.envelopeId;
      expect(done.dateValue).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
      // The rendered value is the Kathmandu wall clock of an instant inside the completion bracket.
      expect([inZone(done.before, ZONE, true), inZone(done.after, ZONE, true)]).toContain(
        done.dateValue,
      );
      // Exact offset: at the same instant, Kathmandu minus UTC is 5 h 45 min (mod 24 h).
      for (const at of [done.before, done.after]) {
        const diff = (minutesOfDay(at, ZONE) - minutesOfDay(at, "UTC") + 1440) % 1440;
        expect(diff).toBe(OFFSET_MINUTES);
      }
      const text = await pdfText(path.join(artefactDir, "i18n-002.pdf"));
      expect(text).toContain(done.dateValue);
    } finally {
      if (envelopeId) await doc.envelopes.remove(envelopeId);
    }
  });
});
