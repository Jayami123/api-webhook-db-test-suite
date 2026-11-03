import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";
import type { ContractSpec, OperationRef } from "../../contracts/oas.ts";

/** The upstream store OpenAPI at tag v2.21.2 (sha256 in contracts/med/upstream/PROVENANCE.md). */
export const MED_SPEC_FILE = "contracts/med/upstream/store.openapi.full.yaml";
/** The deviation register (lane data, not a spec: kept out of contracts/, which specs:validate reads). */
export const DEVIATION_REGISTER = "src/lanes/med/deviation-register.json";

export interface RegisterEntry {
  readonly op: string;
  readonly status: number;
  readonly class: "SPEC" | "PRODUCT";
  readonly key: string;
  readonly keyword: string;
  readonly path: string;
  readonly missing: string;
  readonly detail: string;
  readonly schemaPath: string;
  readonly count: number;
}

export function loadRegister(): RegisterEntry[] {
  const parsed = JSON.parse(readFileSync(DEVIATION_REGISTER, "utf8")) as {
    entries: RegisterEntry[];
  };
  return parsed.entries;
}

/** `${METHOD} ${template}`: the operation name used in the register. */
export function opName(op: OperationRef): string {
  if (!("method" in op)) throw new Error("TEST BUG: the register is keyed by method and path");
  return `${op.method.toUpperCase()} ${op.path}`;
}

interface AjvError {
  readonly instancePath: string;
  readonly keyword: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly schemaPath: string;
}
interface RawValidate {
  (body: unknown): boolean;
  errors?: AjvError[] | null;
}
type RawValidator = (op: OperationRef, response: { status: number }) => { fn: RawValidate };

/**
 * The compiled validator of the shared ContractSpec. ContractSpec.validate() formats and TRUNCATES the
 * errors ("... and N more"); the lane needs every error, so it reads the raw Ajv errors. The shared module
 * is not edited.
 */
function rawValidator(spec: ContractSpec): RawValidator {
  return (spec as unknown as { validator: RawValidator }).validator.bind(spec);
}

const normPath = (p: string): string => p.replace(/\/\d+/g, "/N");

function valueAt(body: unknown, pointer: string): unknown {
  if (pointer === "") return body;
  return pointer
    .split("/")
    .slice(1)
    .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((node, token) => {
      if (node === null || typeof node !== "object") return undefined;
      return (node as Record<string, unknown>)[token];
    }, body);
}

/** Every raw error of one response, as the register keys it. A value the lane cannot classify is its own key. */
export function observedDeviations(
  spec: ContractSpec,
  op: OperationRef,
  status: number,
  body: unknown,
): Map<string, number> {
  const { fn } = rawValidator(spec)(op, { status });
  fn(body);
  const seen = new Map<string, number>();
  for (const error of fn.errors ?? []) {
    const path = normPath(error.instancePath);
    let key: string;
    if (error.keyword === "type") {
      key =
        valueAt(body, error.instancePath) === null
          ? `type-null|${path}|`
          : `type-unclassified|${path}|`;
    } else if (error.keyword === "required") {
      key = `required|${path}|${String(error.params["missingProperty"])}`;
    } else if (error.keyword === "oneOf") {
      key = `oneOf|${path}|`;
    } else {
      key = `${error.keyword}-unclassified|${path}|`;
    }
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return seen;
}

/**
 * Asserts a response against the upstream contract, through the deviation register: the observed set of
 * deviation signatures for this operation and status must equal the registered set. A new deviation or a
 * vanished one fails. Counts are not compared: list lengths depend on the data. PRODUCT entries are known
 * bugs and are asserted red by a separate test.fail (product-contract.spec.ts); they are not hidden here.
 */
export function expectContract(
  spec: ContractSpec,
  op: OperationRef,
  status: number,
  body: unknown,
): void {
  const name = opName(op);
  const registered = loadRegister()
    .filter((e) => e.op === name && e.status === status && e.keyword !== "content-type")
    .map((e) => e.key)
    .sort();
  const observed = [...observedDeviations(spec, op, status, body).keys()].sort();
  expect(observed, `${name} ${String(status)}: deviations differ from the register`).toEqual(
    registered,
  );
}

/** A response the upstream contract documents as text/plain (401). The shared validator cannot read it. */
export function documentedTextPlain(op: OperationRef, status: number): RegisterEntry {
  const name = opName(op);
  const entry = loadRegister().find(
    (e) => e.op === name && e.status === status && e.keyword === "content-type",
  );
  expect(entry, `${name}: the register records its text/plain documentation (SPEC)`).toBeDefined();
  if (entry === undefined) throw new Error("unreachable");
  return entry;
}
