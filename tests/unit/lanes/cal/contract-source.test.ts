import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/** D14: the committed Cal OpenAPI copy must match the stored sha256 recorded in contracts/cal/SOURCE.md. */
test("the committed Cal v2 OpenAPI copy matches the stored sha256 in contracts/cal/SOURCE.md", () => {
  const bytes = readFileSync("contracts/cal/openapi-v2.json");
  const actual = createHash("sha256").update(bytes).digest("hex");
  const recorded = /Stored sha256: `([0-9a-f]{64})`/.exec(
    readFileSync("contracts/cal/SOURCE.md", "utf8"),
  )?.[1];
  assert.equal(recorded, actual);
  assert.equal(bytes.length, 560358);
});
