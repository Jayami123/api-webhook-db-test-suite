import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  discoverSpecs,
  isSpecFile,
  NEGATIVE_FIXTURES,
  validateSpecs,
} from "../../../src/contracts/validate-specs.ts";

describe("offline OAS validity", () => {
  test("isSpecFile accepts json, yaml and yml only", () => {
    assert.deepEqual(
      ["a.json", "a.YAML", "a.yml", "SOURCE.md", "a.json.bak", "a.ts"].map(isSpecFile),
      [true, true, true, false, false, false],
    );
  });

  test("discoverSpecs walks directories, sorts, skips non-specs and tolerates a missing root", () => {
    const tree: Record<string, { name: string; isDirectory: boolean }[]> = {
      contracts: [
        { name: "medusa", isDirectory: true },
        { name: "cal", isDirectory: true },
        { name: "README.md", isDirectory: false },
      ],
      "contracts/medusa": [
        { name: "store.openapi.full.yaml", isDirectory: false },
        { name: "SOURCE.md", isDirectory: false },
      ],
      "contracts/cal": [{ name: "openapi.json", isDirectory: false }],
    };
    const list = (dir: string): { name: string; isDirectory: boolean }[] => {
      const entries = tree[dir];
      if (entries === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return entries;
    };
    assert.deepEqual(discoverSpecs(["contracts", "nowhere"], list), [
      "contracts/cal/openapi.json",
      "contracts/medusa/store.openapi.full.yaml",
    ]);
  });

  test("discoverSpecs rethrows any error other than a missing directory", () => {
    assert.throws(
      () =>
        discoverSpecs(["contracts"], () => {
          throw Object.assign(new Error("denied"), { code: "EACCES" });
        }),
      /denied/,
    );
  });

  test("the committed positive fixtures all validate, and the negative fixture is excluded by name", async () => {
    const files = discoverSpecs(["tests/fixtures/oas"]).filter(
      (f) => !NEGATIVE_FIXTURES.includes(f),
    );
    assert.ok(files.length >= 3);
    const results = await validateSpecs(files);
    assert.deepEqual(
      results.filter((r) => !r.ok),
      [],
    );
    assert.deepEqual(NEGATIVE_FIXTURES, ["tests/fixtures/oas/swagger-2.0.json"]);
    assert.equal((await validateSpecs(NEGATIVE_FIXTURES))[0]?.ok, false);
  });

  test("a spec with a dangling $ref fails with a one-line reason", async () => {
    const results = await validateSpecs(["tests/fixtures/oas-invalid/broken-ref.yaml"]);
    assert.equal(results.length, 1);
    const detail = results[0]?.detail ?? "";
    assert.equal(results[0]?.ok, false);
    assert.match(detail, /Missing \$ref pointer/);
    assert.ok(!detail.includes("\n"));
  });
});
