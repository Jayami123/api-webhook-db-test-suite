import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import { productsRoot } from "../../../src/readiness/checks.ts";

/** Session-only upload (P-DOC-12, R27). The API token is refused with 401 on this route. */
const UPLOAD_PATH = "/api/files/upload-pdf";
const FIFTY_MB = 50 * 1024 * 1024;
/** Known product bug PB-DOC-001: files.ts:56-57 answers 500 "Upload failed" for every upload error. */
const PB_DOC_001 = "PB-DOC-001: files.ts:56-57 answers 500 for any upload error (P-DOC-12, RR-UP)";

const examplePdf = (): Buffer =>
  readFileSync(path.join(productsRoot(), "documenso", "assets", "example.pdf"));

const upload = (
  request: import("@playwright/test").APIRequestContext,
  cookie: string,
  buffer: Buffer,
  name: string,
) =>
  request.fetch(`${apiBaseUrl("documenso")}${UPLOAD_PATH}`, {
    method: "POST",
    headers: { cookie },
    multipart: { file: { name, mimeType: "application/pdf", buffer } },
    maxRedirects: 0,
    failOnStatusCode: false,
  });

/** DocumentData rows, read through qa_ro. The upload route writes one per stored file (files.ts:52). */
const docDataCount = async (): Promise<number> =>
  (
    await readOnlyDb("documenso").select<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM "DocumentData"`,
    )
  )[0]?.n ?? -1;

/**
 * A positive control. It stores one DocumentData row and nothing deletes it: the upload route has no
 * delete path for an orphan file (files.ts:29-54; the only deletes are envelope-bound, delete-envelope-item.ts:59
 * and replace-envelope-item-pdf.ts:205, both at f4105e4). So the row persists by design; the test asserts
 * the count grew by exactly one (the leak rules cannot match DocumentData, which has no name column).
 */
const positiveControl = async (
  request: import("@playwright/test").APIRequestContext,
  cookie: string,
): Promise<void> => {
  const before = await docDataCount();
  const control = await upload(request, cookie, examplePdf(), "control.pdf");
  expect(control.status()).toBe(200); // positive control first: a broken route would prove nothing
  expect(await docDataCount()).toBe(before + 1);
};

test("P2-DOC-UP-001 a valid PDF upload with the session is accepted (positive control)", async ({
  request,
  docAuth,
}) => {
  const before = await docDataCount();
  const res = await upload(request, docAuth.sessionCookie.reveal(), examplePdf(), "control.pdf");
  expect(await docDataCount()).toBe(before + (res.status() === 200 ? 1 : 0));
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { id?: unknown };
  expect(typeof body.id).toBe("string");
});

test("P2-DOC-UP-001 a zero-byte PDF is refused with 4xx, not 500 (KNOWN PRODUCT BUG PB-DOC-001: P-DOC-12)", async ({
  request,
  docAuth,
}) => {
  await positiveControl(request, docAuth.sessionCookie.reveal());
  const before = await docDataCount();
  const res = await upload(request, docAuth.sessionCookie.reveal(), Buffer.alloc(0), "empty.pdf");
  // Setup asserts, before the expected failure: the proven 500 must hold; any other status is a change to triage.
  expect(res.status(), "the proven answer is 500 Upload failed (B-4, P-DOC-12)").toBe(500);
  expect(await docDataCount()).toBe(before);
  test.fail(true, PB_DOC_001);
  expect([400, 415, 422]).toContain(res.status());
});

test("P2-DOC-UP-002 an EXE renamed to .pdf is refused with 4xx (KNOWN PRODUCT BUG PB-DOC-001)", async ({
  request,
  docAuth,
}) => {
  await positiveControl(request, docAuth.sessionCookie.reveal());
  const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(4096, 0x41)]); // MZ header, not a PDF
  const before = await docDataCount();
  const res = await upload(request, docAuth.sessionCookie.reveal(), exe, "x.pdf");
  // Setup asserts, before the expected failure: the proven 500 must hold; any other status is a change to triage.
  expect(res.status(), "the proven answer is 500 Upload failed (B-4, P-DOC-12)").toBe(500);
  expect(await docDataCount()).toBe(before);
  test.fail(true, PB_DOC_001);
  expect([400, 415, 422]).toContain(res.status());
});

test("P2-DOC-UP-003 a truncated PDF is refused with 4xx (KNOWN PRODUCT BUG PB-DOC-001)", async ({
  request,
  docAuth,
}) => {
  await positiveControl(request, docAuth.sessionCookie.reveal());
  const truncated = examplePdf().subarray(0, 1000);
  const before = await docDataCount();
  const res = await upload(request, docAuth.sessionCookie.reveal(), truncated, "trunc.pdf");
  // Setup asserts, before the expected failure: the proven 500 must hold; any other status is a change to triage.
  expect(res.status(), "the proven answer is 500 Upload failed (B-4, P-DOC-12)").toBe(500);
  expect(await docDataCount()).toBe(before);
  test.fail(true, PB_DOC_001);
  expect([400, 415, 422]).toContain(res.status());
});

test("P2-DOC-UP-004 a file one byte over 50 MB is refused with 400 and stores nothing", async ({
  request,
  docAuth,
}) => {
  // Read-only count of DocumentData rows before and after (the lane's own oracle, qa_ro).
  const count = async () =>
    (
      await readOnlyDb("documenso").select<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM "DocumentData"`,
      )
    )[0]?.n;
  const before = await count();
  // A PDF header followed by padding: one byte over the 50 MB limit (files.ts:45-49).
  const oversize = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(FIFTY_MB + 1 - 9, 0x20)]);
  const res = await upload(request, docAuth.sessionCookie.reveal(), oversize, "big.pdf");
  expect(res.status()).toBe(400);
  expect(await res.json()).toEqual({ error: "File too large" });
  expect(await count()).toBe(before);
});

test("P2-DOC-UP-005 an encrypted PDF is refused with 4xx and stores nothing (KNOWN PRODUCT BUG PB-DOC-001)", async ({
  request,
  docAuth,
}) => {
  await positiveControl(request, docAuth.sessionCookie.reveal());
  const encrypted = readFileSync(path.join("tests", "fixtures", "doc", "encrypted-example.pdf"));
  const before = await docDataCount();
  const res = await upload(request, docAuth.sessionCookie.reveal(), encrypted, "enc.pdf");
  // Setup asserts, before the expected failure: the proven 500 must hold; any other status is a change to triage.
  expect(res.status(), "the proven answer is 500 Upload failed (B-4, P-DOC-12)").toBe(500);
  expect(await docDataCount()).toBe(before); // "stores nothing" is this count check
  test.fail(true, PB_DOC_001);
  expect([400, 415, 422]).toContain(res.status());
});
