import SwaggerParser from "@apidevtools/swagger-parser";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { OpenAPI } from "openapi-types";

// ajv-formats is CommonJS; under NodeNext its default import is the module object.
const addFormats = addFormatsModule.default;

export type HttpMethod = "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace";

/** Either an operationId or a method + path template exactly as written in the spec. */
export type OperationRef =
  { readonly operationId: string } | { readonly method: HttpMethod; readonly path: string };

export interface ResponseRef {
  readonly status: number;
  /** Defaults to application/json. Parameters such as `; charset=utf-8` are ignored. */
  readonly contentType?: string;
}

export interface ContractResult {
  readonly valid: boolean;
  /** Spec response key actually used: "201", "2XX" or "default". */
  readonly matchedStatus: string;
  readonly errors: readonly string[];
}

export class ContractError extends Error {
  override readonly name = "ContractError";
}

const MAX_ERRORS = 10;
const MAX_VALUE_CHARS = 80;
const METHODS: readonly HttpMethod[] = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
];

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null;

const normaliseMediaType = (value: string): string =>
  value.split(";")[0]?.trim().toLowerCase() ?? "";

/**
 * Pick the spec's content key for an actual media type by precedence, never by key order:
 * exact match, then a type-level range (image/ plus a star), then the full wildcard (star/star).
 * Keys and the actual type are compared normalised.
 */
function pickContentKey(keys: readonly string[], mediaType: string): string | undefined {
  const type = mediaType.split("/")[0] ?? "";
  const matchers = [
    (key: string) => key === mediaType,
    (key: string) => type !== "" && key === `${type}/*`,
    (key: string) => key === "*/*",
  ];
  for (const matches of matchers) {
    const found = keys.find((key) => matches(normaliseMediaType(key)));
    if (found !== undefined) return found;
  }
  return undefined;
}

/** RFC 6901 JSON Pointer token. */
const pointerToken = (token: string): string => token.replace(/~/g, "~0").replace(/\//g, "~1");

/**
 * OAS 3.0 schemas use draft-04 style boolean exclusiveMinimum/Maximum, which JSON Schema 2020-12
 * rejects at compile time. Rewrite them in place; also drop a `nullable` that has no sibling
 * `type`. Leave everything else alone. Cycle-safe.
 */
export function normaliseOas30Exclusives(node: unknown, seen = new WeakSet<object>()): void {
  if (!isObject(node) || seen.has(node)) return;
  seen.add(node);
  for (const [flag, bound] of [
    ["exclusiveMinimum", "minimum"],
    ["exclusiveMaximum", "maximum"],
  ] as const) {
    const value = node[flag];
    if (typeof value === "boolean") {
      if (value && typeof node[bound] === "number") {
        node[flag] = node[bound];
        Reflect.deleteProperty(node, bound);
      } else {
        Reflect.deleteProperty(node, flag);
      }
    }
  }
  // OAS 3.0: `nullable` only has effect next to a `type`; without one it is dropped, not wrapped.
  if (typeof node["nullable"] === "boolean" && !("type" in node)) {
    Reflect.deleteProperty(node, "nullable");
  }
  for (const child of Object.values(node)) normaliseOas30Exclusives(child, seen);
}

function describeValue(data: unknown, instancePath: string): string {
  let value: unknown = data;
  for (const raw of instancePath.split("/").slice(1)) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    value = isObject(value) ? value[key] : undefined;
  }
  const text = value === undefined ? "undefined" : JSON.stringify(value);
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text;
}

/** One line per error: `at /items/0/id: must be string (got 1) [#/properties/id/type]`. */
export function formatAjvErrors(
  errors: readonly ErrorObject[] | null | undefined,
  data: unknown,
): string[] {
  const list = errors ?? [];
  const lines = list.slice(0, MAX_ERRORS).map((error) => {
    const at = error.instancePath === "" ? "(root)" : error.instancePath;
    const extra =
      error.keyword === "additionalProperties"
        ? ` '${String(error.params["additionalProperty"])}'`
        : "";
    return `at ${at}: ${error.message ?? error.keyword}${extra} (got ${describeValue(data, error.instancePath)}) [${error.schemaPath}]`;
  });
  if (list.length > MAX_ERRORS) lines.push(`… and ${String(list.length - MAX_ERRORS)} more`);
  return lines;
}

export class ContractSpec {
  readonly id: string;
  readonly openapi: string;
  /** Ajv warnings (for example unknown formats such as "phone"), collected instead of printed. */
  readonly warnings: string[];
  private readonly doc: JsonObject;
  private readonly ajv: Ajv2020;
  private readonly cache = new Map<
    string,
    { fn: ValidateFunction; matchedStatus: string; label: string }
  >();

  constructor(id: string, doc: JsonObject, warnings: string[]) {
    this.id = id;
    this.doc = doc;
    this.openapi = String(doc["openapi"]);
    this.warnings = warnings;
    this.ajv = new Ajv2020({
      strict: false,
      allErrors: true,
      logger: {
        log: () => undefined,
        warn: (...args: unknown[]) => warnings.push(args.map(String).join(" ")),
        error: console.error,
      },
    });
    addFormats(this.ajv);
    // The whole document is one schema resource; response schemas are reached by JSON Pointer, so
    // $refs left in place for circular schemas still resolve against it.
    this.ajv.addSchema(doc, this.schemaId());
  }

  private schemaId(): string {
    return `https://p2.local/oas/${encodeURIComponent(this.id)}.json`;
  }

  private resolveOperation(ref: OperationRef): {
    method: HttpMethod;
    path: string;
    operation: JsonObject;
  } {
    const paths = isObject(this.doc["paths"]) ? this.doc["paths"] : {};
    if ("operationId" in ref) {
      for (const [path, item] of Object.entries(paths)) {
        if (!isObject(item)) continue;
        for (const method of METHODS) {
          const operation = item[method];
          if (isObject(operation) && operation["operationId"] === ref.operationId)
            return { method, path, operation };
        }
      }
      throw new ContractError(
        `${this.id}: operationId ${JSON.stringify(ref.operationId)} is not in the spec`,
      );
    }
    const item = paths[ref.path];
    const operation = isObject(item) ? item[ref.method] : undefined;
    if (!isObject(operation)) {
      throw new ContractError(
        `${this.id}: ${ref.method.toUpperCase()} ${ref.path} is not in the spec (${String(Object.keys(paths).length)} paths)`,
      );
    }
    return { method: ref.method, path: ref.path, operation };
  }

  /** Compiled validator for one operation + status + content type. Cached; same function on reuse. */
  validator(
    op: OperationRef,
    response: ResponseRef,
  ): { fn: ValidateFunction; matchedStatus: string; label: string } {
    const { method, path, operation } = this.resolveOperation(op);
    const mediaType =
      (response.contentType ?? "application/json").split(";")[0]?.trim().toLowerCase() ?? "";
    const cacheKey = `${method} ${path} ${String(response.status)} ${mediaType}`;
    const hit = this.cache.get(cacheKey);
    if (hit) return hit;

    const responses = isObject(operation["responses"]) ? operation["responses"] : {};
    const exact = String(response.status);
    const range = `${exact.charAt(0)}XX`;
    const matchedStatus = [exact, range, range.toLowerCase(), "default"].find(
      (key) => key in responses,
    );
    if (matchedStatus === undefined) {
      throw new ContractError(
        `${this.id}: ${method.toUpperCase()} ${path} documents no response for ${exact} (documented: ${Object.keys(responses).join(", ")})`,
      );
    }
    const content = isObject(responses[matchedStatus])
      ? responses[matchedStatus]["content"]
      : undefined;
    const contentKeys = isObject(content) ? Object.keys(content) : [];
    const contentKey = pickContentKey(contentKeys, mediaType);
    if (
      contentKey === undefined ||
      !isObject(content) ||
      !isObject(content[contentKey]) ||
      !("schema" in content[contentKey])
    ) {
      throw new ContractError(
        `${this.id}: ${method.toUpperCase()} ${path} ${matchedStatus} has no ${mediaType} schema (content: ${contentKeys.join(", ") || "none"})`,
      );
    }
    const pointer = [
      "paths",
      path,
      method,
      "responses",
      matchedStatus,
      "content",
      contentKey,
      "schema",
    ]
      .map(pointerToken)
      .join("/");
    const fn = this.ajv.getSchema(`${this.schemaId()}#/${pointer}`);
    if (!fn) throw new ContractError(`${this.id}: could not compile #/${pointer}`);
    const entry = {
      fn,
      matchedStatus,
      label: `${this.id} ${method.toUpperCase()} ${path} ${matchedStatus} ${mediaType}`,
    };
    this.cache.set(cacheKey, entry);
    return entry;
  }

  validate(op: OperationRef, response: ResponseRef, body: unknown): ContractResult {
    const { fn, matchedStatus } = this.validator(op, response);
    const valid = fn(body);
    return { valid, matchedStatus, errors: valid ? [] : formatAjvErrors(fn.errors, body) };
  }

  /** Throws a ContractError whose message names the operation and lists readable errors. */
  assertValid(op: OperationRef, response: ResponseRef, body: unknown): void {
    const { label } = this.validator(op, response);
    const result = this.validate(op, response, body);
    if (!result.valid) {
      throw new ContractError(
        `${label} does not match the contract:\n  ${result.errors.join("\n  ")}`,
      );
    }
  }
}

const specCache = new Map<string, Promise<ContractSpec>>();

/**
 * Load a committed OAS file (YAML or JSON), dereference it and build validators lazily.
 * Circular $refs are left in place (`circular: "ignore"`) because a fully dereferenced cycle
 * overflows Ajv's compiler. One load per file per worker.
 */
export function loadSpec(id: string, file: string): Promise<ContractSpec> {
  const key = `${id}\u0000${file}`;
  let pending = specCache.get(key);
  if (!pending) {
    pending = (async () => {
      const api: OpenAPI.Document = await SwaggerParser.dereference(file, {
        dereference: { circular: "ignore" },
      });
      const doc = api as unknown as JsonObject;
      const version = typeof doc["openapi"] === "string" ? doc["openapi"] : "";
      if (!/^3\.[01]\./.test(version))
        throw new ContractError(
          `${id}: only OpenAPI 3.0 and 3.1 are supported, got ${JSON.stringify(version)}`,
        );
      if (version.startsWith("3.0.")) normaliseOas30Exclusives(doc);
      return new ContractSpec(id, doc, []);
    })();
    specCache.set(key, pending);
    pending.catch(() => specCache.delete(key));
  }
  return pending;
}
