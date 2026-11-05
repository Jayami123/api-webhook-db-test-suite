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
 * Every `<test>.fail` property access where <test> is Playwright's test: the bare identifier `test` (always),
 * a named import `test` under any alias, or `ns.test` for a namespace import of @playwright/test.
 * Calls and bare references both count, and so does `test.fail.only`.
 */
export function findDirectFailUses(path: string, source: string): Finding[] {
  const sf = ts.createSourceFile(path, source, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
  const testNames = new Set<string>(["test"]);
  const namespaces = new Set<string>();
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const spec = statement.moduleSpecifier;
    if (!ts.isStringLiteral(spec) || spec.text !== "@playwright/test") continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const imported = (element.propertyName ?? element.name).text;
        if (imported === "test") testNames.add(element.name.text);
      }
    } else {
      namespaces.add(bindings.name.text);
    }
  }

  const findings: Finding[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && node.name.text === "fail") {
      const object = node.expression;
      const direct = ts.isIdentifier(object) && testNames.has(object.text);
      const namespaced =
        ts.isPropertyAccessExpression(object) &&
        ts.isIdentifier(object.expression) &&
        namespaces.has(object.expression.text) &&
        object.name.text === "test";
      if (direct || namespaced) {
        findings.push({ path, line: lineOf(sf, node), text: node.getText(sf) });
      }
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
