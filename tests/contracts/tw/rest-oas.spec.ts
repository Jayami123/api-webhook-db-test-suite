import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../../../src/fixtures/index.ts";
import { loadSpec } from "../../../src/contracts/oas.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import { twAuthHeaders } from "../../../src/lanes/tw/http.ts";
import { runScopedName } from "../../../src/run/prefix.ts";

/**
 * The OpenAPI document is served only to an authenticated caller (P-TW-10: 403 without the bearer). The test saves the
 * authenticated document to the run's results folder and loads that file, because the loader takes a file, not a URL.
 */
/** One OAS file per object (a shared file rewritten per case is not evidence). */
const oasFileFor = (label: string): string => path.join("results", `tw-oas-${label}.json`);
/** The list filter field: people are searched by firstName, the other objects by name. */
const NAME_FILTER: Record<string, string> = {
  people: "name.firstName",
  companies: "name",
  opportunities: "name",
};
/** The validator's print cap (src/contracts/oas.ts:32, MAX_ERRORS = 10). The count guard below stays under it. */
const MAX_ERRORS = 10;

test.beforeAll(() => {
  mkdirSync("results", { recursive: true });
});

/** Body for a create of one record of each object (the lane's own run-scoped name). */
const CREATE: Record<string, (name: string) => unknown> = {
  people: (name) => ({ name: { firstName: name, lastName: "Qa" } }),
  companies: (name) => ({ name }),
  opportunities: (name) => ({ name }),
};

for (const [label, route] of [
  ["people", "/people"],
  ["companies", "/companies"],
  ["opportunities", "/opportunities"],
] as const) {
  test(`P2-TW-CON-001: GET list and GET by id of ${label} conform to the OAS`, async ({
    request,
    twAuth,
  }) => {
    const headers = twAuthHeaders(twAuth);
    const oas = await request.get(`${apiBaseUrl("twenty")}/rest/open-api/core`, { headers });
    expect(oas.status()).toBe(200);
    writeFileSync(oasFileFor(label), await oas.text());
    const spec = await loadSpec(`twenty-core-oas-${label}`, oasFileFor(label));

    // One record of this run, created first: the list must contain it, and the one-id check uses it.
    const created = await request.post(`${apiBaseUrl("twenty")}/rest${route}`, {
      headers: { ...headers, "content-type": "application/json" },
      data: CREATE[label]?.(runScopedName(`con1-${label}`)),
    });
    expect(created.status(), "setup: create one record").toBe(201);
    const id = ((await created.json()) as { data: Record<string, { id: string }> }).data[
      label === "people"
        ? "createPerson"
        : label === "companies"
          ? "createCompany"
          : "createOpportunity"
    ]?.id;
    expect(id, "setup: created id").toEqual(expect.any(String));
    try {
      // The run's records only (filter by the run prefix), at the default page size. The spec key is relative to the
      // server URL (http://127.0.0.1:3002/rest/): /people is GET /rest/people.
      const prefix = runScopedName(`con1-${label}`);
      const filter = encodeURIComponent(`${NAME_FILTER[label] ?? "name"}[like]:${prefix}%`);
      const res = await request.get(`${apiBaseUrl("twenty")}/rest${route}?filter=${filter}`, {
        headers,
      });
      expect(res.status()).toBe(200);
      const body = (await res.json()) as { data: Record<string, { id: string }[]> };
      // Setup, asserted: the run's record is on the page (so the validator checks the records this run created).
      expect(
        (body.data[label] ?? []).map((r) => r.id),
        "setup: the run's record is in the filtered page",
      ).toContain(id);
      const result = spec.validate({ method: "get", path: route }, { status: 200 }, body);
      expect(result.matchedStatus).toBe("200");

      const one = await request.get(`${apiBaseUrl("twenty")}/rest${route}/${id}`, { headers });
      expect(one.status()).toBe(200);
      const oneBody = (await one.json()) as { data: Record<string, unknown> };
      const oneResult = spec.validate(
        { method: "get", path: `${route}/{id}` },
        { status: 200 },
        oneBody,
      );
      expect(oneResult.matchedStatus).toBe("200");

      // The count guard runs first: the print cap (MAX_ERRORS) must not be able to hide a non-null violation.
      expect(
        result.errors.length,
        `fewer than MAX_ERRORS (${MAX_ERRORS}, src/contracts/oas.ts:32) list violations, so truncation cannot hide one`,
      ).toBeLessThan(MAX_ERRORS);
      expect(
        oneResult.errors.length,
        `fewer than MAX_ERRORS (${MAX_ERRORS}) one-id violations, so truncation cannot hide one`,
      ).toBeLessThan(MAX_ERRORS);

      // Known product bug P2-TW-BUG-002: the OAS 3.1.1 document declares some fields non-nullable (for example
      // deletedAt, avatarFile, performanceRating) and the live responses return null for them. Every violation must be
      // a null value; any other violation is a new defect and fails here.
      expect(
        result.errors.filter((e) => !e.includes("(got null)")),
        "list: only the known null violations",
      ).toEqual([]);
      expect(
        oneResult.errors.filter((e) => !e.includes("(got null)")),
        "one id: only the known null violations",
      ).toEqual([]);
      // Evidence: docs/probes/2026-11-03-p2-lane-tw-probes.md, section 4, P2-TW-BUG-002.
      test.fail(
        true,
        "P2-TW-BUG-002: OAS 3.1.1 declares non-nullable fields that the live responses return as null",
      );
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
      expect(oneResult.errors).toEqual([]);
    } finally {
      const removed = await request.delete(`${apiBaseUrl("twenty")}/rest${route}/${id}`, {
        headers,
      });
      expect(removed.status(), "cleanup: hard delete of the record").toBe(200);
    }
  });
}
