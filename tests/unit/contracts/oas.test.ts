import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ContractError,
  ContractSpec,
  loadSpec,
  normaliseOas30Exclusives,
} from "../../../src/contracts/oas.ts";

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "oas",
);
const SPEC_30 = path.join(FIXTURES, "mini-3.0.yaml");
const SPEC_NULLABLE = path.join(FIXTURES, "nullable-untyped-3.0.yaml");
const SPEC_31 = path.join(FIXTURES, "mini-3.1.json");
const getItem = { operationId: "getItem" } as const;
const ok = { status: 200, contentType: "application/json; charset=utf-8" } as const;
const item = { id: "i1", created_at: "2026-10-21T09:30:05Z", price: 1 };

describe("OAS contract loader", () => {
  test("a valid body passes", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.deepEqual(spec.validate(getItem, ok, item), {
      valid: true,
      matchedStatus: "200",
      errors: [],
    });
  });

  test("operation can be addressed by method + path template", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.equal(spec.validate({ method: "get", path: "/items/{id}" }, ok, item).valid, true);
  });

  test("missing required property gives a readable line", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    const result = spec.validate(getItem, ok, { id: "i1", price: 1 });
    assert.equal(result.valid, false);
    assert.match(
      result.errors[0] ?? "",
      /^at \(root\): must have required property 'created_at' .*\[#\/required\]$/,
    );
  });

  test("format, additionalProperties and type errors name the path and value", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    const result = spec.validate(getItem, ok, {
      ...item,
      created_at: "yesterday",
      extra: true,
      id: 7,
    });
    const text = result.errors.join("\n");
    assert.match(text, /at \/created_at: must match format "date-time" \(got "yesterday"\)/);
    assert.match(text, /must NOT have additional properties 'extra'/);
    assert.match(text, /at \/id: must be string \(got 7\)/);
  });

  test("OAS 3.0 nullable is honoured", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.equal(spec.validate(getItem, ok, { ...item, note: null }).valid, true);
  });

  test("OAS 3.0 boolean exclusiveMinimum is normalised and enforced", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.equal(spec.validate(getItem, ok, { ...item, price: 0 }).valid, false);
    const node: Record<string, unknown> = {
      minimum: 0,
      exclusiveMinimum: true,
      maximum: 9,
      exclusiveMaximum: false,
    };
    normaliseOas30Exclusives(node);
    assert.deepEqual(node, { exclusiveMinimum: 0, maximum: 9 });
  });

  test("unknown formats are ignored and recorded as warnings, not printed", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.equal(spec.validate(getItem, ok, { ...item, phone: "not checked" }).valid, true);
    assert.ok(spec.warnings.some((warning) => warning.includes('unknown format "phone"')));
  });

  test("4XX range and default responses are used when the exact code is absent", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.equal(spec.validate(getItem, { status: 404 }, { message: "nope" }).matchedStatus, "4XX");
    assert.equal(
      spec.validate(getItem, { status: 503 }, { message: "down" }).matchedStatus,
      "default",
    );
  });

  test("circular schemas validate nested data", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    const op = { operationId: "listNodes" };
    assert.equal(
      spec.validate(op, { status: 200 }, { name: "a", child: { name: "b", child: { name: "c" } } })
        .valid,
      true,
    );
    assert.equal(
      spec.validate(op, { status: 200 }, { name: "a", child: { name: 1 } }).valid,
      false,
    );
  });

  test("validators are cached per operation, status and content type", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.equal(
      spec.validator(getItem, ok).fn,
      spec.validator({ method: "get", path: "/items/{id}" }, { status: 200 }).fn,
    );
    assert.equal(await loadSpec("mini30", SPEC_30), spec);
  });

  test("OAS 3.1 type arrays and numeric exclusiveMinimum work", async () => {
    const spec = await loadSpec("mini31", SPEC_31);
    const op = { operationId: "listPeople" };
    const id = "0b6f4f5e-8f8a-4c56-9f55-1d2c3b4a5e6f";
    assert.equal(
      spec.validate(op, { status: 200 }, { data: [{ id, city: null, score: 1 }] }).valid,
      true,
    );
    assert.equal(spec.validate(op, { status: 200 }, { data: [{ id: "not-a-uuid" }] }).valid, false);
    assert.equal(spec.validate(op, { status: 200 }, { data: [{ id, score: 0 }] }).valid, false);
  });

  test("assertValid throws a ContractError that names the operation", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.throws(
      () => {
        spec.assertValid(getItem, ok, {});
      },
      (error: unknown) => {
        assert.ok(error instanceof ContractError);
        assert.match(
          error.message,
          /^mini30 GET \/items\/\{id\} 200 application\/json does not match the contract:/,
        );
        return true;
      },
    );
  });

  test("lookup failures are ContractErrors with what is documented", async () => {
    const spec = await loadSpec("mini30", SPEC_30);
    assert.throws(
      () => spec.validator({ operationId: "nope" }, { status: 200 }),
      /operationId "nope" is not in the spec/,
    );
    assert.throws(
      () => spec.validator({ method: "post", path: "/items/{id}" }, { status: 200 }),
      /POST \/items\/\{id\} is not in the spec/,
    );
    assert.throws(
      () => spec.validator({ operationId: "listNodes" }, { status: 500 }),
      /documents no response for 500 \(documented: 200\)/,
    );
    assert.throws(
      () => spec.validator({ operationId: "download" }, { status: 200 }),
      /has no application\/json schema \(content: application\/pdf\)/,
    );
  });

  test("Swagger 2.0 is rejected", async () => {
    await assert.rejects(
      loadSpec("old", path.join(FIXTURES, "swagger-2.0.json")),
      /only OpenAPI 3\.0 and 3\.1/,
    );
  });

  test("OAS 3.0 nullable without a sibling type is dropped (it has no effect there)", async () => {
    const node: Record<string, unknown> = { nullable: true, properties: { a: { type: "string" } } };
    normaliseOas30Exclusives(node);
    assert.deepEqual(node, { properties: { a: { type: "string" } } });
    const typed: Record<string, unknown> = { type: "string", nullable: true };
    normaliseOas30Exclusives(typed);
    assert.deepEqual(typed, { type: "string", nullable: true });

    const spec = await loadSpec("nullable-untyped", SPEC_NULLABLE);
    const op = { operationId: "getThing" };
    assert.equal(spec.validate(op, { status: 200 }, { name: "a", note: null }).valid, true);
    assert.equal(spec.validate(op, { status: 200 }, { name: 1 }).valid, false);
  });

  describe("media-type range precedence", () => {
    const str = { schema: { type: "string" } };
    const obj = { schema: { type: "object", required: ["a"] } };
    const specFor = (content: Record<string, unknown>): ContractSpec =>
      new ContractSpec(
        "ranges",
        {
          openapi: "3.0.3",
          paths: { "/x": { get: { responses: { "200": { description: "ok", content } } } } },
        },
        [],
      );
    const op = { method: "get", path: "/x" } as const;

    test("image/* matches image/png", () => {
      const spec = specFor({ "image/*": str });
      assert.equal(
        spec.validate(op, { status: 200, contentType: "image/png" }, "bytes").valid,
        true,
      );
      assert.equal(spec.validate(op, { status: 200, contentType: "image/png" }, 1).valid, false);
    });

    test("*/* matches text/plain", () => {
      const spec = specFor({ "*/*": str });
      assert.equal(spec.validate(op, { status: 200, contentType: "text/plain" }, "hi").valid, true);
    });

    test("an exact match beats */* even when */* is listed first", () => {
      const spec = specFor({ "*/*": str, "application/json": obj });
      const json = { status: 200, contentType: "application/json; charset=utf-8" };
      assert.equal(spec.validate(op, json, { a: 1 }).valid, true);
      assert.equal(spec.validate(op, json, "just a string").valid, false);
    });

    test("image/* beats */* for image/png when */* is listed first", () => {
      const spec = specFor({ "*/*": obj, "image/*": str });
      const png = { status: 200, contentType: "image/png" };
      assert.equal(spec.validate(op, png, "bytes").valid, true);
      assert.equal(spec.validate(op, png, { a: 1 }).valid, false);
    });

    test("keys are compared normalised: parameters, case and spaces are ignored", () => {
      const spec = specFor({ " Image/* ; q=1": str });
      assert.equal(spec.validate(op, { status: 200, contentType: "IMAGE/PNG" }, "b").valid, true);
    });

    test("a non-matching type with no wildcard still throws ContractError", () => {
      const spec = specFor({ "application/json": obj, "image/*": str });
      assert.throws(
        () => spec.validator(op, { status: 200, contentType: "text/plain" }),
        (error: unknown) =>
          error instanceof ContractError &&
          /has no text\/plain schema \(content: application\/json, image\/\*\)/.test(error.message),
      );
    });
  });
});
