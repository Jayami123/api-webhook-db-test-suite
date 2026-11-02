import { expect } from "@playwright/test";
import type { ContractSpec, OperationRef } from "../../contracts/oas.ts";

export const MED_SPEC_FILE = "contracts/med/store.openapi.yaml";

/** Asserts a response body against the lane's store contract; a mismatch prints the contract's own errors. */
export function expectContract(
  spec: ContractSpec,
  op: OperationRef,
  status: number,
  body: unknown,
): void {
  const result = spec.validate(op, { status }, body);
  expect(result.errors, `contract ${JSON.stringify(op)} ${String(status)}`).toEqual([]);
  expect(result.valid, `contract ${JSON.stringify(op)} ${String(status)}`).toBe(true);
}
