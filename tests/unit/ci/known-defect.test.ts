import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { parseDefectDescription } from "../../../src/ci/known-defect.ts";
import {
  findDefectCallArguments,
  findDirectFailUses,
  listTsFiles,
  scanRepo,
} from "../../../src/ci/known-defect-guard.ts";

describe("expected defects: the bare-call guard (K1 to K4)", () => {
  test("K1 no direct test.fail use in any product or test file (the helper is the only exception)", () => {
    const findings = scanRepo(process.cwd());
    const lines = findings.map(
      (f) =>
        `${f.path}:${String(f.line)}: direct test.fail use; call expectedDefect("<ID>: <evidence>") instead`,
    );
    assert.deepEqual(lines, []);
  });

  test("K2 the guard catches a spaced call and a call split across lines", () => {
    const spaced = findDirectFailUses(
      "a.ts",
      'import { test } from "@playwright/test";\ntest.fail (true, "x");\n',
    );
    assert.equal(spaced.length, 1);
    const multi = findDirectFailUses(
      "b.ts",
      'import { test } from "@playwright/test";\ntest.fail(\n  true,\n  "x",\n);\n',
    );
    assert.equal(multi.length, 1);
    assert.equal(multi[0]?.line, 2);
  });

  test("K3 the guard ignores comments and string literals", () => {
    const source = [
      'import { test } from "@playwright/test";',
      '// test.fail(true, "x");',
      "/* test.fail(); */",
      'const s = "test.fail(true)";',
      "const t = `test.fail()`;",
    ].join("\n");
    assert.deepEqual(findDirectFailUses("c.ts", source), []);
  });

  test("K4 the guard follows aliases and the namespace form", () => {
    const alias = findDirectFailUses(
      "d.ts",
      'import { test as t } from "@playwright/test";\nt.fail();\n',
    );
    assert.equal(alias.length, 1);
    const namespace = findDirectFailUses(
      "e.ts",
      'import * as ns from "@playwright/test";\nns.test.fail();\n',
    );
    assert.equal(namespace.length, 1);
  });
});

describe("expected defects: the description rules and the migration (K5, K6)", () => {
  test("K5 parseDefectDescription: an ID then a colon then evidence, nothing else", () => {
    assert.deepEqual(parseDefectDescription("B2: a receiver 500 is acknowledged as success"), {
      id: "B2",
      evidence: "a receiver 500 is acknowledged as success",
    });
    assert.deepEqual(parseDefectDescription("P2-MED-CON-PRODUCT: known product deviations (x)"), {
      id: "P2-MED-CON-PRODUCT",
      evidence: "known product deviations (x)",
    });
    assert.throws(
      () => parseDefectDescription("P2-MED-CON-PRODUCT known product deviations"),
      /must start with an ID/,
    );
    assert.throws(() => parseDefectDescription("B2:"), /has no evidence/);
  });

  test("K6 migration audit: every expectedDefect argument in tests/ resolves and parses", () => {
    const seen: string[] = [];
    for (const file of listTsFiles(process.cwd(), ["tests"])) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("expectedDefect(")) continue;
      for (const call of findDefectCallArguments(file, source)) {
        assert.notEqual(
          call.value,
          undefined,
          `${call.path}:${String(call.line)}: argument is not a string literal or constant`,
        );
        parseDefectDescription(call.value ?? "");
        seen.push(`${call.path}:${String(call.line)}`);
      }
    }
    assert.equal(seen.length, 16, `expected 16 migrated call sites, found ${String(seen.length)}`);
  });
});
