import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../../../src/fixtures/index.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import { loadSpec } from "../../../src/contracts/oas.ts";
import { productsRoot } from "../../../src/readiness/checks.ts";
import { currentRunPrefix, runScopedName } from "../../../src/run/prefix.ts";

/** The OpenAPI 3.0.3 document the fork serves at /api/v2/openapi.json (committed copy, probed 2026-11-02). */
const SPEC_FILE = "contracts/doc/openapi.json";

test("P2-DOC-CON-001 GET /api/v2/envelope/{envelopeId} matches the served OpenAPI document", async ({
  doc,
  request,
  docAuth,
}) => {
  const spec = await loadSpec("doc", SPEC_FILE);
  const pdf = readFileSync(path.join(productsRoot(), "documenso", "assets", "example.pdf"));
  const envelopeId = await doc.envelopes.create({
    title: runScopedName("con-001"),
    pdf,
    recipients: [{ email: `${currentRunPrefix()}-con001@example.test`, name: "Con" }],
  });
  try {
    const res = await request.fetch(`${apiBaseUrl("documenso")}/api/v2/envelope/${envelopeId}`, {
      headers: { authorization: docAuth.headerValue.reveal() },
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(200);
    const result = spec.validate(
      { method: "get", path: "/envelope/{envelopeId}" },
      { status: 200 },
      await res.json(),
    );
    expect(result.matchedStatus).toBe("200");
    expect(result.errors).toEqual([]); // each entry is one formatted AJV violation
    expect(result.valid).toBe(true);
  } finally {
    await doc.envelopes.remove(envelopeId);
  }
});
