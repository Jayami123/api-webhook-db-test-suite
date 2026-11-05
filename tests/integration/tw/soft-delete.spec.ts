import { test, expect } from "../../../src/fixtures/index.ts";
import type { APIRequestContext } from "@playwright/test";
import { apiBaseUrl } from "../../../src/env.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { twAuthHeaders } from "../../../src/lanes/tw/http.ts";
import { rowsById } from "../../../src/lanes/tw/rows.ts";
import { softRemovePerson } from "../../../src/lanes/tw/soft-delete.ts";
import { POLL_INTERVALS, TW_COMMITTED_READ_BUDGET_MS } from "../../../src/lanes/tw/slo.ts";
import type { TwentyAuth } from "../../../src/auth/twenty.ts";
import { runScopedName } from "../../../src/run/prefix.ts";

/** Ids of people whose first name starts with `prefix` (the REST list, one page of 60). */
async function listIds(
  request: APIRequestContext,
  auth: TwentyAuth,
  prefix: string,
): Promise<string[]> {
  const filter = encodeURIComponent(`name.firstName[like]:${prefix}%`);
  const res = await request.get(`${apiBaseUrl("twenty")}/rest/people?limit=60&filter=${filter}`, {
    headers: twAuthHeaders(auth),
  });
  expect(res.status(), "list: 200").toBe(200);
  const body = (await res.json()) as { data: { people: { id: string }[] } };
  return body.data.people.map((p) => p.id);
}

/** Record ids the GraphQL `search` returns for `term` (any object type). */
async function searchIds(
  request: APIRequestContext,
  auth: TwentyAuth,
  term: string,
): Promise<string[]> {
  const res = await request.post(`${apiBaseUrl("twenty")}/graphql`, {
    headers: { ...twAuthHeaders(auth), "content-type": "application/json" },
    data: {
      query: `query($term:String!){ search(searchInput:$term, limit:20){ edges { node { recordId } } } }`,
      variables: { term },
    },
  });
  expect(res.status(), "search: 200").toBe(200);
  const body = (await res.json()) as {
    data?: { search: { edges: { node: { recordId: string } }[] } };
    errors?: { message: string }[];
  };
  expect(body.errors, "search: no errors").toBeUndefined();
  return (body.data?.search.edges ?? []).map((e) => e.node.recordId);
}

test("P2-TW-DEL-002: a soft-deleted person is absent from the REST list and from search", async ({
  tw,
  request,
  twAuth,
}) => {
  const db = readOnlyDb("twenty");
  const name = runScopedName("del002");
  const headers = { ...twAuthHeaders(twAuth), "content-type": "application/json" };
  let id: string | undefined;
  try {
    // Setup, asserted: create is 201, the soft delete is 200, and deletedAt is set on the row that remains.
    const created = await request.post(`${apiBaseUrl("twenty")}/rest/people`, {
      headers,
      data: { name: { firstName: name, lastName: "Qa" } },
    });
    expect(created.status(), "setup: create is 201").toBe(201);
    id = ((await created.json()) as { data: { createPerson: { id: string } } }).data.createPerson
      .id;

    // Positive control: before the delete, the list and search both find the person. Without this, the absence
    // checks below could pass for a reason other than the delete.
    expect(await listIds(request, twAuth, name), "control: list finds the person").toContain(id);
    await expect
      .poll(() => searchIds(request, twAuth, name), {
        message: "control: search finds the person before the delete",
        timeout: TW_COMMITTED_READ_BUDGET_MS,
        intervals: POLL_INTERVALS,
      })
      .toContain(id);

    const del = await softRemovePerson(tw, id);
    expect(del.status, "setup: soft delete is 200").toBe(200);
    const kept = await rowsById(db, "person", id, `"deletedAt"::text AS "deletedAt"`);
    expect(kept, "setup: the row still exists").toHaveLength(1);
    expect(kept[0]?.["deletedAt"], "setup: deletedAt is set").not.toBeNull();

    // Oracle: the list and search no longer return the person.
    expect(await listIds(request, twAuth, name), "oracle: absent from the REST list").not.toContain(
      id,
    );
    await expect
      .poll(() => searchIds(request, twAuth, name), {
        message: "oracle: absent from search",
        timeout: TW_COMMITTED_READ_BUDGET_MS,
        intervals: POLL_INTERVALS,
      })
      .not.toContain(id);
  } finally {
    // Cleanup: hard delete (no soft_delete parameter), then the row is gone from every workspace schema.
    if (id !== undefined) {
      const hard = await request.delete(`${apiBaseUrl("twenty")}/rest/people/${id}`, { headers });
      expect(hard.status(), "cleanup: hard delete is 200").toBe(200);
      expect(await rowsById(db, "person", id, `"id"`), "cleanup: no row remains").toHaveLength(0);
    }
  }
});
