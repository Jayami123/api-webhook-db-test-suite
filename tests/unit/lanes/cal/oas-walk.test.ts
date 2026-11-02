import assert from "node:assert/strict";
import { test } from "node:test";
import { fillPath, listGetOperations } from "../../../../src/lanes/cal/oas-walk.ts";
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
