import assert from "node:assert/strict";
import { test } from "node:test";
import { apiVersionFor, fillPath, listGetOperations } from "../../../../src/lanes/cal/oas-walk.ts";
import smallDoc from "../../../fixtures/cal/oas-small.json" with { type: "json" };

test("listGetOperations returns only the GET operations of the fixture document", () => {
  const ops = listGetOperations(smallDoc);
  assert.deepEqual(
    ops.map((o) => `${o.method} ${o.path}`),
    ["get /v2/me", "get /v2/bookings/{bookingUid}"],
  );
});

test("listGetOperations reports the path parameters of each GET operation", () => {
  const ops = listGetOperations(smallDoc);
  assert.deepEqual(ops.find((o) => o.path === "/v2/bookings/{bookingUid}")?.params, ["bookingUid"]);
  assert.deepEqual(ops.find((o) => o.path === "/v2/me")?.params, []);
});

test("fillPath substitutes values and throws a TEST BUG error when a parameter has no value", () => {
  assert.equal(fillPath("/v2/bookings/{bookingUid}", { bookingUid: "a b" }), "/v2/bookings/a%20b");
  assert.throws(
    () => fillPath("/v2/bookings/{bookingUid}", {}),
    /TEST BUG: no value for path parameter bookingUid/,
  );
});

const VERSION = {
  name: "cal-api-version",
  in: "header",
  schema: { type: "string", default: "2024-06-14" },
};
const NO_DEFAULT = { name: "cal-api-version", in: "header", schema: { type: "string" } };

test("apiVersionFor returns the header default of an operation-level parameter", () => {
  const doc = { paths: { "/v2/a": { get: { parameters: [VERSION] } } } };
  assert.equal(apiVersionFor(doc, "/v2/a"), "2024-06-14");
});

test("apiVersionFor returns a path-level default when the operation declares no header", () => {
  const doc = { paths: { "/v2/a": { parameters: [VERSION], get: {} } } };
  assert.equal(apiVersionFor(doc, "/v2/a"), "2024-06-14");
});

test("an operation-level header without a default overrides a path-level default: no version is sent", () => {
  const doc = { paths: { "/v2/a": { parameters: [VERSION], get: { parameters: [NO_DEFAULT] } } } };
  assert.equal(apiVersionFor(doc, "/v2/a"), undefined);
});

test("apiVersionFor matches the header name case-insensitively and ignores non-header parameters", () => {
  const doc = {
    paths: {
      "/v2/a": {
        get: {
          parameters: [
            { name: "Cal-Api-Version", in: "header", schema: { default: "2024-09-04" } },
            { name: "cal-api-version", in: "query", schema: { default: "1999-01-01" } },
          ],
        },
      },
    },
  };
  assert.equal(apiVersionFor(doc, "/v2/a"), "2024-09-04");
});

test("apiVersionFor returns undefined for an operation without the header and for a path with no GET", () => {
  const doc = { paths: { "/v2/a": { get: {} }, "/v2/b": { post: { parameters: [VERSION] } } } };
  assert.equal(apiVersionFor(doc, "/v2/a"), undefined);
  assert.equal(apiVersionFor(doc, "/v2/b"), undefined, "POST-only paths are not crawled");
  assert.equal(apiVersionFor(doc, "/v2/missing"), undefined);
});

test("against the committed contract: 15 of the 55 GET operations declare a version, in the documented values", async () => {
  const { readFileSync } = await import("node:fs");
  const doc = JSON.parse(readFileSync("contracts/cal/openapi-v2.json", "utf8")) as {
    paths: Record<string, Record<string, unknown>>;
  };
  const ops = listGetOperations(doc);
  assert.equal(ops.length, 55);
  const versions = ops.map((o) => apiVersionFor(doc, o.path)).filter((v) => v !== undefined);
  assert.equal(versions.length, 15);
  assert.equal(apiVersionFor(doc, "/v2/bookings"), "2024-08-13");
  assert.equal(apiVersionFor(doc, "/v2/me"), undefined, "no version header is declared for /v2/me");
});
