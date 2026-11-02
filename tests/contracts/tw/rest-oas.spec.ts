import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../../../src/fixtures/index.ts";
import { loadSpec } from "../../../src/contracts/oas.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import { twAuthHeaders } from "../../../src/lanes/tw/http.ts";

/**
 * The OpenAPI document is served only to an authenticated caller (P-TW-10: 403 without the bearer). The test saves the
 * authenticated document to the run's results folder and loads that file, because the loader takes a file, not a URL.
 */
const OAS_FILE = path.join("results", "tw-oas-core.json");

test.beforeAll(() => {
  mkdirSync("results", { recursive: true });
});

for (const [label, route] of [
  ["people", "/people"],
  ["companies", "/companies"],
  ["opportunities", "/opportunities"],
] as const) {
  test(`P2-TW-CON-001: GET list of ${label} conforms to the OAS`, async ({ request, twAuth }) => {
    const oas = await request.get(`${apiBaseUrl("twenty")}/rest/open-api/core`, {
      headers: twAuthHeaders(twAuth),
    });
    expect(oas.status()).toBe(200);
    writeFileSync(OAS_FILE, await oas.text());
    const spec = await loadSpec("twenty-core-oas", OAS_FILE);

    // The spec key is relative to the server URL (http://127.0.0.1:3002/rest/): /people is GET /rest/people.
    const res = await request.get(`${apiBaseUrl("twenty")}/rest${route}?limit=1`, {
      headers: twAuthHeaders(twAuth),
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown[]> };
    const result = spec.validate({ method: "get", path: route }, { status: 200 }, body);
    expect(result.matchedStatus).toBe("200");
    // Setup, asserted before the known-bug marker: the response is a non-empty list the validator really checked.
    expect(body.data[label]?.length ?? 0, "setup: the list is not empty").toBeGreaterThan(0);
    // Known product bug P2-TW-BUG-002: the OAS 3.1.1 document declares some fields non-nullable (for example
    // deletedAt, avatarFile, performanceRating) and the live list returns null for them. The check below pins the
    // known shape: every violation must be a null value. Any other violation is a new defect and fails here.
    expect(
      result.errors.filter((e) => !e.includes("(got null)")),
      "only the known null violations",
    ).toEqual([]);
    // Evidence and draft: docs/probes/2026-11-03-p2-lane-tw-probes.md, section P2-TW-BUG-002.
    test.fail(
      true,
      "P2-TW-BUG-002: OAS 3.1.1 declares non-nullable fields that the list returns as null",
    );
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
}
