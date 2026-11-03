import { test, expect } from "../../../src/fixtures/index.ts";
import type { TwentyClient } from "../../../src/clients/twenty.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import { twAuthHeaders } from "../../../src/lanes/tw/http.ts";
import { runScopedName } from "../../../src/run/prefix.ts";
import type { TwentyAuth } from "../../../src/auth/twenty.ts";
import type { APIRequestContext } from "@playwright/test";

/** Pages of people whose first name starts with `tag`, limit 2, followed by the cursor endCursor. */
interface Page {
  readonly ids: string[];
  readonly hasNext: boolean;
  readonly endCursor: string;
}

async function page(
  request: APIRequestContext,
  auth: TwentyAuth,
  tag: string,
  after?: string,
): Promise<Page> {
  const filter = encodeURIComponent(`name.firstName[like]:${tag}%`);
  const cursor = after === undefined ? "" : `&starting_after=${encodeURIComponent(after)}`;
  const res = await request.get(
    `${apiBaseUrl("twenty")}/rest/people?limit=2&filter=${filter}${cursor}`,
    {
      headers: twAuthHeaders(auth),
    },
  );
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    data: { people: { id: string }[] };
    pageInfo: { hasNextPage: boolean; endCursor: string };
  };
  return {
    ids: body.data.people.map((p) => p.id),
    hasNext: body.pageInfo.hasNextPage,
    endCursor: body.pageInfo.endCursor,
  };
}

/** Follows the cursor from `first` to the last page (bounded: 10 pages). Returns every id in order. */
async function restOf(
  request: APIRequestContext,
  auth: TwentyAuth,
  tag: string,
  first: Page,
): Promise<string[]> {
  const ids: string[] = [];
  let current = first;
  for (let i = 0; i < 10 && current.hasNext; i++) {
    const next = await page(request, auth, tag, current.endCursor);
    ids.push(...next.ids);
    current = next;
  }
  expect(current.hasNext, "the cursor walk reached the last page within 10 pages").toBe(false);
  return ids;
}

async function deleteAll(tw: TwentyClient, ids: readonly string[]): Promise<void> {
  for (const id of ids) await tw.people.remove(id);
}

/** Tag of this test's people: `<run>-<label>-`. The LIKE filter's trailing `%` matches all of them. */
const tagOf = (label: string): string => `${runScopedName(label)}-`;

test("P2-TW-PAG-001: cursor pages return every created id once while new records are inserted between fetches", async ({
  tw,
  request,
  twAuth,
}) => {
  const tag = tagOf("pag1");
  const originals: string[] = [];
  const late: string[] = [];
  try {
    for (let i = 1; i <= 5; i++) originals.push(await tw.people.create(runScopedName(`pag1-${i}`)));
    const first = await page(request, twAuth, tag);
    expect(first.ids).toHaveLength(2);
    expect(
      first.ids.filter((id) => !originals.includes(id)),
      "first page: every id is one of this test's originals",
    ).toEqual([]);

    // New records arrive between the first and the later fetches (same prefix: they can appear in later pages).
    for (let i = 1; i <= 2; i++) late.push(await tw.people.create(runScopedName(`pag1-late-${i}`)));

    const rest = await restOf(request, twAuth, tag, first);
    const seen = [...first.ids, ...rest];
    // The filter held: every id any page returned is one of this test's records (a filter the API ignored would fail).
    const ownSet = new Set([...originals, ...late]);
    expect(
      seen.filter((id) => !ownSet.has(id)),
      "every paged id is one of this test's records",
    ).toEqual([]);
    // Every original id exactly once; no id twice anywhere in the walk.
    expect(new Set(seen).size, "no id appears twice across pages").toBe(seen.length);
    expect(
      seen.filter((id) => originals.includes(id)).sort(),
      "every original id appears exactly once",
    ).toEqual([...originals].sort());
  } finally {
    await deleteAll(tw, [...originals, ...late]);
  }
});

test("P2-TW-PAG-002: a record deleted between two page fetches neither duplicates nor skips another record", async ({
  tw,
  request,
  twAuth,
}) => {
  const tag = tagOf("pag2");
  const originals: string[] = [];
  let victim: string | undefined;
  try {
    for (let i = 1; i <= 5; i++) originals.push(await tw.people.create(runScopedName(`pag2-${i}`)));
    const first = await page(request, twAuth, tag);
    expect(first.ids).toHaveLength(2);
    expect(
      first.ids.filter((id) => !originals.includes(id)),
      "first page: every id is one of this test's originals",
    ).toEqual([]);

    // Delete a record that has not been fetched yet (the one a skip would hide).
    victim = originals.find((id) => !first.ids.includes(id));
    if (victim === undefined) throw new Error("TEST BUG: no unfetched record to delete");
    await tw.people.remove(victim);

    const rest = await restOf(request, twAuth, tag, first);
    const seen = [...first.ids, ...rest];
    const survivors = originals.filter((id) => id !== victim);
    // The filter held: no id outside the surviving originals appears, and the deleted record never does.
    expect(
      seen.filter((id) => !survivors.includes(id)),
      "every paged id is a surviving record of this test",
    ).toEqual([]);
    expect(new Set(seen).size, "no id appears twice across pages").toBe(seen.length);
    expect(
      seen.filter((id) => originals.includes(id)).sort(),
      "the deleted record is absent; every other one appears once",
    ).toEqual([...survivors].sort());
  } finally {
    await deleteAll(
      tw,
      originals.filter((id) => id !== victim),
    );
  }
});
