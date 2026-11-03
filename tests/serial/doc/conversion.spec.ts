import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import { runScopedName } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";
import type { APIRequestContext } from "@playwright/test";

const run = promisify(execFile);
/** The opt-in Gotenberg service of the harness overlay (docker/documenso.gotenberg.compose.yml). Only this container is touched. */
const GOTENBERG = "qa-harness-documenso-gotenberg";
const GOTENBERG_HEALTH = "http://127.0.0.1:3010/health";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** P5 finding: a dependency outage is answered as a client error (see the CONV-002 comment). */
const P5_CONV_001 =
  "P5-DOC-CONV-001: conversion outage answered 400, not 503 (hono-trpc-open-api.ts:27)";

const docker = (args: string[]) => run("docker", args);

async function gotenbergRunning(): Promise<boolean> {
  const { stdout } = await docker(["inspect", "-f", "{{.State.Running}}", GOTENBERG]);
  return stdout.trim() === "true";
}

/** Creates an envelope from the DOCX fixture through the product (conversion runs in create-envelope.ts:113). */
async function createFromDocx(request: APIRequestContext, authorization: string, title: string) {
  const started = Date.now();
  const res = await request.fetch(`${apiBaseUrl("documenso")}/api/v2/envelope/create`, {
    method: "POST",
    headers: { authorization },
    multipart: {
      payload: JSON.stringify({ type: "DOCUMENT", title, recipients: [] }),
      files: {
        name: "conv.docx",
        mimeType: DOCX_MIME,
        buffer: readFileSync(path.join("tests", "fixtures", "doc", "example.docx")),
      },
    },
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  const body = await res.text();
  const id = res.status() === 200 ? (JSON.parse(body) as { id?: string }).id : undefined;
  return { status: res.status(), ms: Date.now() - started, body, id };
}

/** Envelopes with exactly these titles (read-only, qa_ro). */
async function envelopesWithTitles(titles: string[]): Promise<number> {
  const placeholders = titles.map((_, i) => `$${String(i + 1)}`).join(", ");
  const rows = await readOnlyDb("documenso").select<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM "Envelope" WHERE "title" IN (${placeholders})`,
    titles,
  );
  return rows[0]?.n ?? -1;
}

test.describe.configure({ mode: "serial" });
// Safety net: whatever happens, the Gotenberg container is running again when this describe ends (only this container).
test.afterAll(async () => {
  await docker(["start", GOTENBERG]);
});

test("P2-DOC-CONV-002 Gotenberg down: DOCX create answers 503 fast (P5-DOC-CONV-001: answered 400)", async ({
  request,
  docAuth,
}) => {
  const authorization = docAuth.headerValue.reveal();
  const titles = [0, 1, 2, 3, 4].map((i) => runScopedName(`conv-002-${String(i)}`));
  await docker(["stop", GOTENBERG]);
  const attempts = [];
  for (const title of titles) attempts.push(await createFromDocx(request, authorization, title));

  // Setup asserts, before the expected failure: the outage is real, the body names it, and nothing was created.
  expect(await gotenbergRunning(), "Gotenberg must really be stopped").toBe(false);
  for (const a of attempts) {
    expect(a.body, "the body names the outage").toContain(
      '"code":"CONVERSION_SERVICE_UNAVAILABLE"',
    );
    expect(a.id, "no envelope may be created on a refused attempt").toBeUndefined();
    expect(a.ms, "a refused attempt must not wait for the 30 s conversion timeout").toBeLessThan(
      SLO.docConvertFail.ms,
    );
  }
  expect(await envelopesWithTitles(titles), "no envelope exists for this run's titles").toBe(0);

  // Oracle (expected to fail: P5-DOC-CONV-001). A dependency outage is a 5xx (AppError 503, docx-to-pdf.ts:31-43).
  test.fail(true, P5_CONV_001);
  for (const a of attempts) expect(a.status).toBe(503);
});

test("P2-DOC-CONV-003 Gotenberg restarts: DOCX create succeeds once the service is back (independent of CONV-002)", async ({
  doc,
  request,
  docAuth,
}) => {
  const authorization = docAuth.headerValue.reveal();
  // Self-contained: this case makes its own outage, so it does not depend on CONV-002 running or passing.
  await docker(["stop", GOTENBERG]);
  const outage = await createFromDocx(request, authorization, runScopedName("conv-003-outage"));
  expect(outage.body).toContain('"code":"CONVERSION_SERVICE_UNAVAILABLE"');

  await docker(["start", GOTENBERG]);
  try {
    // The service really recovered: its health answers 200 (the readiness of the restart is observed, not assumed).
    await expect
      .poll(
        async () => (await request.fetch(GOTENBERG_HEALTH, { failOnStatusCode: false })).status(),
        {
          timeout: SLO.docConvertHealth.ms,
          intervals: POLL_INTERVALS,
          message: "Gotenberg health",
        },
      )
      .toBe(200);
    // The create succeeds after the circuit's cooldown (circuit-breaker.ts:14).
    let created: string | undefined;
    await expect
      .poll(
        async () => {
          const a = await createFromDocx(request, authorization, runScopedName("conv-003"));
          if (a.status === 200) created = a.id;
          return a.status;
        },
        {
          timeout: SLO.docConvertRecover.ms,
          intervals: POLL_INTERVALS,
          message: "conversion succeeds after the cooldown",
        },
      )
      .toBe(200);
    expect(created, "a converted envelope was created").toBeDefined();
    if (created !== undefined) await doc.envelopes.remove(created);
  } finally {
    await docker(["start", GOTENBERG]);
  }
});
