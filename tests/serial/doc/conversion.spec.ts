import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "../../../src/fixtures/index.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import { runScopedName } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";

const run = promisify(execFile);
/** The opt-in Gotenberg service of the harness overlay (docker/documenso.gotenberg.compose.yml). Only this container is touched. */
const GOTENBERG = "qa-harness-documenso-gotenberg";
const GOTENBERG_HEALTH = "http://127.0.0.1:3010/health";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const docker = (args: string[]) => run("docker", args);

/** Creates an envelope from the DOCX fixture through the product (conversion runs in create-envelope.ts:113). */
async function createFromDocx(
  request: import("@playwright/test").APIRequestContext,
  authorization: string,
  title: string,
) {
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

test.describe.configure({ mode: "serial" });
// Safety net: whatever happens, the Gotenberg container is running again when this describe ends (only this container).
test.afterAll(async () => {
  await docker(["start", GOTENBERG]);
});

test("P2-DOC-CONV-002 Gotenberg down: DOCX upload fails fast and the circuit opens", async ({
  request,
  docAuth,
}) => {
  const title = runScopedName("conv-002");
  const authorization = docAuth.headerValue.reveal();
  await docker(["stop", GOTENBERG]);
  {
    const attempts = [];
    for (let i = 0; i < 5; i += 1) {
      attempts.push(await createFromDocx(request, authorization, `${title}-${String(i)}`));
    }
    // Every attempt is refused with the conversion-unavailable status (AppError 503, docx-to-pdf.ts:31-43).
    for (const a of attempts) {
      expect(a.status, a.body.slice(0, 200)).toBe(503);
      expect(a.ms, "a refused attempt must not wait for the 30 s conversion timeout").toBeLessThan(
        SLO.docConvertFail.ms,
      );
    }
    // The first failure opens the circuit (recordFailure, circuit-breaker.ts:35-37): later attempts fail fast
    // without a network call, inside the cooldown. Recorded: the plan's "after N failures" is one failure.
    for (const a of attempts.slice(1)) {
      expect(a.body).toMatch(/circuit|CONVERSION_SERVICE_UNAVAILABLE|unavailable/i);
    }
  }
});

test("P2-DOC-CONV-003 Gotenberg restarts: DOCX upload succeeds after the half-open window", async ({
  doc,
  request,
  docAuth,
}) => {
  const title = runScopedName("conv-003");
  const authorization = docAuth.headerValue.reveal();
  await docker(["start", GOTENBERG]);
  try {
    await expect
      .poll(
        async () => {
          const r = await request.fetch(GOTENBERG_HEALTH, { failOnStatusCode: false });
          return r.status();
        },
        {
          timeout: SLO.docConvertHealth.ms,
          intervals: POLL_INTERVALS,
          message: "Gotenberg health",
        },
      )
      .toBe(200);
    let created: string | undefined;
    await expect
      .poll(
        async () => {
          const a = await createFromDocx(request, authorization, title);
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
    expect(created).toBeDefined();
    if (created !== undefined) await doc.envelopes.remove(created);
  } finally {
    await docker(["start", GOTENBERG]);
  }
});
