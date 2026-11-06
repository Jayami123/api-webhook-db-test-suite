// Syntax-aware guard for the expected-defect rule (docs/plans/2026-11-06-p2-run-summary-nightly.md, 4.4).
// Used by tests/unit/ci/known-defect.test.ts only. It parses TypeScript with the compiler API, so comments,
// string literals and whitespace or line breaks between tokens are handled by the parser, not by text matching.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import ts from "typescript";

/** The one file allowed to call test.fail directly. */
export const EXEMPT_FILE = "src/ci/known-defect.ts";

export interface Finding {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/**
 * Every direct use of Playwright's `test.fail` in a file, in any of these forms:
 * - property access: `<test>.fail` (also `<test>.fail.only`);
 * - element access: `<test>["fail"]` (string literal or no-substitution template);
 * - destructured: `const { fail } = <test>` and then a call `fail(...)` (also `{ fail: f }` and `f(...)`);
 * where <test> is a tracked binding: the bare identifier `test`, any local name bound to the `test` export of
 * any module (so the project fixtures and their aliases count, for example `import { test as it }`), a plain
 * `const x = <test>` alias, or `ns.test` for a namespace import of @playwright/test.
 * The sets are file-scoped and not scope-aware: a same-named local elsewhere in the file is also tracked.
 */
export function findDirectFailUses(path: string, source: string): Finding[] {
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
  const testNames = new Set<string>(["test"]);
  const namespaces = new Set<string>();
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const spec = statement.moduleSpecifier;
    if (!ts.isStringLiteral(spec)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const imported = (element.propertyName ?? element.name).text;
        if (imported === "test") testNames.add(element.name.text);
      }
    } else if (spec.text === "@playwright/test") {
      namespaces.add(bindings.name.text);
    }
  }

  // Pre-pass: plain aliases of a tracked test, and destructured `fail` bindings from a tracked test.
  const failFns = new Set<string>();
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
      const init = node.initializer;
      const fromTest = ts.isIdentifier(init) && testNames.has(init.text);
      if (ts.isIdentifier(node.name) && fromTest) testNames.add(node.name.text);
      if (ts.isObjectBindingPattern(node.name) && fromTest) {
        for (const element of node.name.elements) {
          const key = element.propertyName ?? element.name;
          const keyName = ts.isIdentifier(key) || ts.isStringLiteral(key) ? key.text : undefined;
          if (keyName === "fail" && ts.isIdentifier(element.name)) failFns.add(element.name.text);
        }
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(sf);

  const isTrackedTest = (object: ts.Expression): boolean =>
    (ts.isIdentifier(object) && testNames.has(object.text)) ||
    (ts.isPropertyAccessExpression(object) &&
      ts.isIdentifier(object.expression) &&
      namespaces.has(object.expression.text) &&
      object.name.text === "test");

  const findings: Finding[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "fail" &&
      isTrackedTest(node.expression)
    ) {
      findings.push({ path, line: lineOf(sf, node), text: node.getText(sf) });
    } else if (
      ts.isElementAccessExpression(node) &&
      (ts.isStringLiteral(node.argumentExpression) ||
        ts.isNoSubstitutionTemplateLiteral(node.argumentExpression)) &&
      node.argumentExpression.text === "fail" &&
      isTrackedTest(node.expression)
    ) {
      findings.push({ path, line: lineOf(sf, node), text: node.getText(sf) });
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      failFns.has(node.expression.text)
    ) {
      findings.push({ path, line: lineOf(sf, node), text: node.getText(sf) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return findings;
}

/** Every .ts file under the given roots (relative to `root`), skipping node_modules and scratch output. */
export function listTsFiles(root: string, roots: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts")) out.push(relative(root, full).split(sep).join(posix.sep));
    }
  };
  for (const r of roots) walk(join(root, r));
  return out;
}

/** Findings across the product and test code, with the exempt helper excluded. */
export function scanRepo(root: string): Finding[] {
  const files = [...listTsFiles(root, ["tests", "src", "scripts"]), "playwright.config.ts"];
  return files
    .filter((file) => file !== EXEMPT_FILE)
    .flatMap((file) => findDirectFailUses(file, readFileSync(join(root, file), "utf8")));
}

export interface DefectCallArgument {
  readonly path: string;
  readonly line: number;
  /** The resolved string, or undefined when the argument is neither a literal nor a string constant. */
  readonly value: string | undefined;
}

/**
 * Every `expectedDefect(<arg>)` call in a file. The argument resolves when it is a string literal, or an
 * identifier bound to a `const` string literal in the same file (the constants PB_DOC_001 and P5_CONV_001).
 */
export function findDefectCallArguments(path: string, source: string): DefectCallArgument[] {
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
  const constants = new Map<string, string>();
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        ts.isStringLiteral(declaration.initializer)
      ) {
        constants.set(declaration.name.text, declaration.initializer.text);
      }
    }
  }
  const out: DefectCallArgument[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "expectedDefect"
    ) {
      const arg = node.arguments[0];
      let value: string | undefined;
      if (arg !== undefined && ts.isStringLiteral(arg)) value = arg.text;
      else if (arg !== undefined && ts.isIdentifier(arg)) value = constants.get(arg.text);
      out.push({ path, line: lineOf(sf, node), value });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}
