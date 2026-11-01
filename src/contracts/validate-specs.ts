import { readdirSync } from "node:fs";
import path from "node:path";
import { loadSpec, type ContractSpec } from "./oas.ts";

/**
 * Offline OAS validity (plan Task 6): every committed spec must dereference, validate and compile
 * its response schemas with the same loader the contract tests use. No product, no network.
 */
const SPEC_FILE = /\.(json|ya?ml)$/i;

/** Fixtures that tests/unit/contracts/oas.test.ts rejects on purpose (Swagger 2.0 is unsupported). */
export const NEGATIVE_FIXTURES: readonly string[] = ["tests/fixtures/oas/swagger-2.0.json"];

export function isSpecFile(file: string): boolean {
  return SPEC_FILE.test(file);
}

/** Recursive, sorted, specs only. A missing root is not an error (lanes create `contracts/<product>` later). */
export function discoverSpecs(
  roots: readonly string[],
  list: (dir: string) => { name: string; isDirectory: boolean }[] = (dir) =>
    readdirSync(dir, { withFileTypes: true }).map((d) => ({
      name: d.name,
      isDirectory: d.isDirectory(),
    })),
): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    let entries: { name: string; isDirectory: boolean }[];
    try {
      entries = list(dir);
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const full = path.posix.join(dir.replaceAll("\\", "/"), entry.name);
      if (entry.isDirectory) walk(full);
      else if (isSpecFile(entry.name)) found.push(full);
    }
  };
  for (const root of roots) walk(root);
  return found.sort();
}

export interface SpecResult {
  readonly file: string;
  readonly ok: boolean;
  readonly detail: string;
}

export async function validateSpecs(
  files: readonly string[],
  load: (id: string, file: string) => Promise<ContractSpec> = loadSpec,
): Promise<SpecResult[]> {
  const results: SpecResult[] = [];
  for (const file of files) {
    try {
      await load(path.basename(file), file);
      results.push({ file, ok: true, detail: "valid" });
    } catch (error) {
      results.push({
        file,
        ok: false,
        detail: error instanceof Error ? (error.message.split("\n")[0] ?? "invalid") : "invalid",
      });
    }
  }
  return results;
}
