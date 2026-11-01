import { escapeLike } from "../run/prefix.ts";
import { assertSelectOnly } from "../db/select-guard.ts";
import type { ReadOnlyDb } from "../db/pg.ts";

/**
 * P2-X-DB-001 engine (plan Task 3). A rule is one SELECT that returns the rows that BREAK an
 * invariant, as columns `id` and `value` (text). Zero rows means the invariant holds.
 */
export type RuleKind = "consistency" | "orphan" | "leak";
export type RuleParam = "prefix-like" | "contains-like" | "run-start";

export interface Rule {
  readonly id: string;
  readonly kind: RuleKind;
  readonly description: string;
  /** Source line the rule relies on, at the pinned product ref. */
  readonly cite: string;
  /** "live" = run against the real schema on the date in `verified`; "source" = read from schema files. */
  readonly basis: "live" | "source";
  readonly verified: string;
  readonly sql: string;
  /**
   * `$1` is the run prefix as `prefix%` (prefix-like) or `%prefix%` (contains-like), or the run's
   * start instant as an ISO string (run-start). Consistency and orphan rules use run-start so they
   * judge only rows created by this run, never the harness seed data.
   */
  readonly param?: RuleParam;
  /** SQL contains `{schema}`, replaced by each schema in `perSchemaQuery`. Twenty: one per workspace. */
  readonly perSchemaQuery?: string;
}

export interface Violation {
  readonly ruleId: string;
  readonly kind: RuleKind;
  readonly description: string;
  readonly cite: string;
  readonly sql: string;
  readonly params: readonly string[];
  readonly schema: string | undefined;
  readonly rows: readonly { readonly id: string; readonly value: string }[];
}

/** Rows a long-lived (worker-scoped) fixture keeps on purpose. Matching is by exact rule id + value. */
export class RetainRegistry {
  private readonly kept = new Map<string, Set<string>>();
  retain(ruleId: string, value: string): () => void {
    const values = this.kept.get(ruleId) ?? new Set<string>();
    values.add(value);
    this.kept.set(ruleId, values);
    return () => {
      values.delete(value);
    };
  }
  has(ruleId: string, value: string): boolean {
    return this.kept.get(ruleId)?.has(value) ?? false;
  }
}

const SCHEMA_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const MAX_ROWS_REPORTED = 20;

export function assertRuleShape(rule: Rule): void {
  assertSelectOnly(rule.sql.replaceAll("{schema}", "s"));
  if (/select\s+\*/i.test(rule.sql) || /\.\*/.test(rule.sql)) {
    throw new Error(`TEST BUG: rule ${rule.id} selects *; list id and value only`);
  }
  const placeholders = new Set(rule.sql.match(/\$\d+/g) ?? []);
  const expected = rule.param === undefined ? 0 : 1;
  if (placeholders.size !== expected) {
    throw new Error(
      `TEST BUG: rule ${rule.id} uses ${String(placeholders.size)} parameters, expected ${String(expected)}`,
    );
  }
  if ((rule.perSchemaQuery !== undefined) !== rule.sql.includes("{schema}")) {
    throw new Error(
      `TEST BUG: rule ${rule.id} must use {schema} exactly when perSchemaQuery is set`,
    );
  }
  if (rule.kind === "leak" && (rule.param === undefined || rule.param === "run-start")) {
    throw new Error(`TEST BUG: leak rule ${rule.id} needs a run-prefix parameter`);
  }
  if (rule.kind !== "leak" && rule.param !== "run-start") {
    throw new Error(
      `TEST BUG: ${rule.kind} rule ${rule.id} must be scoped with the run-start parameter`,
    );
  }
}

/** The UTC start encoded in the run prefix: p2-qa-20261101t090000z-0a1b2c3d -> 2026-11-01T09:00:00.000Z. */
export function runStartIso(runPrefix: string): string {
  const match = /^p2-qa-(\d{4})(\d{2})(\d{2})t(\d{2})(\d{2})(\d{2})z-[0-9a-f]{8}$/.exec(runPrefix);
  if (!match) throw new Error(`TEST BUG: not a run prefix: ${JSON.stringify(runPrefix)}`);
  const [, y, mo, d, h, mi, sec] = match;
  return `${y ?? ""}-${mo ?? ""}-${d ?? ""}T${h ?? ""}:${mi ?? ""}:${sec ?? ""}.000Z`;
}

export function paramFor(rule: Rule, runPrefix: string): string[] {
  if (rule.param === undefined) return [];
  if (rule.param === "run-start") return [runStartIso(runPrefix)];
  const escaped = escapeLike(runPrefix);
  return [rule.param === "prefix-like" ? `${escaped}%` : `%${escaped}%`];
}

export interface SweepContext {
  readonly runPrefix: string;
  readonly retained?: RetainRegistry;
  /** Leak rules are skipped in the per-test sweep when false (consistency and orphan still run). */
  readonly includeLeaks: boolean;
}

export async function runSweep(
  db: ReadOnlyDb,
  rules: readonly Rule[],
  context: SweepContext,
): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const rule of rules) {
    assertRuleShape(rule);
    if (rule.kind === "leak" && !context.includeLeaks) continue;
    const params = paramFor(rule, context.runPrefix);
    const schemas: (string | undefined)[] =
      rule.perSchemaQuery === undefined
        ? [undefined]
        : (await db.select<{ schema_name: string }>(rule.perSchemaQuery)).map((r) => r.schema_name);
    for (const schema of schemas) {
      if (schema !== undefined && !SCHEMA_NAME.test(schema)) {
        throw new Error(`TEST BUG: rule ${rule.id} got an unexpected schema name from the catalog`);
      }
      const sql = schema === undefined ? rule.sql : rule.sql.replaceAll("{schema}", `"${schema}"`);
      const rows = (await db.select<{ id: unknown; value: unknown }>(sql, params))
        .map((r) => ({ id: String(r.id), value: String(r.value) }))
        .filter((r) => !(rule.kind === "leak" && context.retained?.has(rule.id, r.value)));
      if (rows.length > 0) {
        violations.push({
          ruleId: rule.id,
          kind: rule.kind,
          description: rule.description,
          cite: rule.cite,
          sql,
          params,
          schema,
          rows,
        });
      }
    }
  }
  return violations;
}

const SECRET_NAME = /(secret|token|password|passwd|hash|signature|authorization)/i;
const clip = (text: string): string => (text.length > 120 ? `${text.slice(0, 117)}...` : text);

/** Text for the failure message and the attachment: SQL, parameters and the offending rows. */
export function formatViolations(violations: readonly Violation[]): string {
  return violations
    .map((v) => {
      const shown = v.rows.slice(0, MAX_ROWS_REPORTED).map((r) => {
        const value = SECRET_NAME.test(v.ruleId) ? "<redacted>" : clip(r.value);
        return `  id=${clip(r.id)} value=${value}`;
      });
      const more =
        v.rows.length > MAX_ROWS_REPORTED
          ? [`  ... ${String(v.rows.length - MAX_ROWS_REPORTED)} more`]
          : [];
      return [
        `${v.ruleId} [${v.kind}${v.schema === undefined ? "" : ` ${v.schema}`}] ${v.description}`,
        `  relies on: ${v.cite}`,
        `  sql: ${v.sql}`,
        `  params: ${JSON.stringify(v.params)}`,
        ...shown,
        ...more,
      ].join("\n");
    })
    .join("\n\n");
}
