import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { laneClient } from "../../../../src/lanes/med/lane-client.ts";
import type { MedusaAuth } from "../../../../src/auth/medusa.ts";
import type { ApiRequestLike, ApiResponseLike } from "../../../../src/clients/base.ts";
import { SecretString } from "../../../../src/auth/secret.ts";

const AUTH: MedusaAuth = {
  product: "medusa",
  headerName: "authorization",
  headerValue: new SecretString("Basic fake-lane-client-key"),
  publishableKey: new SecretString("pk_fake_lane_client"),
  label: "fake",
  titles: [],
  isAccepted: () => Promise.resolve(true),
  revoke: () => Promise.resolve(),
};

function reply(status: number, body: unknown): ApiResponseLike {
  return {
    status: () => status,
    headers: () => ({}),
    text: () => Promise.resolve(body === undefined ? "" : JSON.stringify(body)),
  };
}

interface Product {
  readonly id: string;
  readonly title: string;
}

/**
 * A fake admin API over an in-memory product table: GET /admin/products honours limit and offset (in insertion order,
 * like a list that shifts up as rows are deleted), DELETE removes one row, and `deleteStatus` overrides a delete reply.
 */
function fakeProducts(
  rows: Product[],
  deleteStatus: (id: string) => number | undefined = () => undefined,
): { request: ApiRequestLike; gets: string[]; deletes: string[]; table: Product[] } {
  const table = [...rows];
  const gets: string[] = [];
  const deletes: string[] = [];
  const request: ApiRequestLike = {
    fetch(url, options) {
      const { pathname, searchParams } = new URL(url);
      if (options?.method === "GET" && pathname === "/admin/products") {
        gets.push(searchParams.toString());
        const limit = Number(searchParams.get("limit"));
        const offset = Number(searchParams.get("offset"));
        const q = searchParams.get("q") ?? "";
        const hits = table.filter((p) => p.title.includes(q));
        return Promise.resolve(reply(200, { products: hits.slice(offset, offset + limit) }));
      }
      const del = /^\/admin\/products\/(.+)$/.exec(pathname);
      if (options?.method === "DELETE" && del?.[1] !== undefined) {
        const id = del[1];
        deletes.push(id);
        const forced = deleteStatus(id);
        if (forced !== undefined) return Promise.resolve(reply(forced, { message: "forced" }));
        const index = table.findIndex((p) => p.id === id);
        if (index === -1) return Promise.resolve(reply(404, { message: "not found" }));
        table.splice(index, 1);
        return Promise.resolve(reply(200, { id, deleted: true }));
      }
      throw new Error(`unexpected call: ${options?.method ?? "GET"} ${url}`);
    },
  };
  return { request, gets, deletes, table };
}

const rowsOf = (prefix: string, n: number): Product[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-id-${String(i)}`,
    title: `${prefix}-${String(i)}`,
  }));

function laneOver(request: ApiRequestLike) {
  return laneClient({ request, baseUrl: "http://fake.invalid", runPrefix: "p2-unit", auth: AUTH });
}

describe("removeProductsByPrefix", () => {
  test("250 matching rows: every one is deleted, and every list read starts at offset 0", async () => {
    const fake = fakeProducts([...rowsOf("p2-run-a", 250), ...rowsOf("other", 3)]);
    const removed = await laneOver(fake.request).removeProductsByPrefix("p2-run-a");
    assert.equal(removed, 250);
    assert.deepEqual(
      fake.table.map((p) => p.title),
      ["other-0", "other-1", "other-2"],
    );
    assert.equal(fake.gets.length, 4, "three passes of at most 100, then one empty read");
    for (const query of fake.gets) assert.match(query, /(^|&)offset=0(&|$)/);
  });

  test("a failed delete still lets the rest of its pass run, then the error is rethrown", async () => {
    const fake = fakeProducts(rowsOf("p2-run-b", 120), (id) =>
      id === "p2-run-b-id-5" ? 500 : undefined,
    );
    await assert.rejects(
      laneOver(fake.request).removeProductsByPrefix("p2-run-b"),
      /DELETE \/admin\/products\/p2-run-b-id-5 -> HTTP 500/,
    );
    assert.equal(fake.deletes.length, 100, "the whole first pass was tried");
    assert.deepEqual(
      fake.table.map((p) => p.id),
      [
        "p2-run-b-id-5",
        ...rowsOf("p2-run-b", 120)
          .slice(100)
          .map((p) => p.id),
      ],
    );
  });

  test("a row still listed after its delete answered fails instead of looping", async () => {
    const fake = fakeProducts(rowsOf("p2-run-c", 2), (id) =>
      id === "p2-run-c-id-1" ? 404 : undefined,
    );
    await assert.rejects(
      laneOver(fake.request).removeProductsByPrefix("p2-run-c"),
      /still listed after a delete: p2-run-c-id-1/,
    );
  });
});

describe("removeStockLocation", () => {
  const locationRequest = (status: number): ApiRequestLike => ({
    fetch: () => Promise.resolve(reply(status, { message: "x" })),
  });
  for (const status of [200, 404])
    test(`HTTP ${String(status)} resolves`, async () => {
      await laneOver(locationRequest(status)).removeStockLocation("sloc_1");
    });
  for (const status of [400, 409, 500])
    test(`HTTP ${String(status)} throws`, async () => {
      await assert.rejects(
        laneOver(locationRequest(status)).removeStockLocation("sloc_1"),
        new RegExp(`HTTP ${String(status)}`),
      );
    });
});
