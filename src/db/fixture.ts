import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { roleDbUrl, type ProductId } from "../env.ts";
import { FIXTURE_ALLOWLIST, type FixtureColumn } from "./fixture-allowlist.ts";
import { quoteIdent } from "./roles.ts";

/**
 * The only way a test writes to a product database (plan Task 3, decision D2). It accepts
 * `UPDATE <allow-listed table> SET <allow-listed column> = <value> WHERE <pk> = <id>` and nothing
 * else, refuses the rest here, and the qa_fixture grants refuse it again on the server. Every call,
 * applied or refused, is one JSONL line.
 */
/** Where the writer logs by default: one JSONL file per run, gitignored. */
export function defaultFixtureLogFile(runPrefix: string): string {
  return path.join("fixture-logs", `${runPrefix}.jsonl`);
}

export class FixtureRefusedError extends Error {
  override readonly name = "FixtureRefusedError";
  constructor(reason: string) {
    super(`TEST BUG: fixture write refused: ${reason}`);
  }
}

export interface FixtureUpdate {
  readonly table: string;
  readonly column: string;
  readonly pk: string | number;
  readonly value: Date;
  /** Master-plan case id; must be one of the allow-list entry's cases. */
  readonly caseId: string;
}

export interface FixtureWriter {
  update(update: FixtureUpdate): Promise<void>;
  close(): Promise<void>;
}

interface QueryablePool {
  connect(): Promise<{
    query(config: { text: string; values?: unknown[] }): Promise<{ rowCount: number | null }>;
    release(destroy?: boolean): void;
  }>;
  end(): Promise<void>;
}

export interface FixtureWriterOptions {
  readonly product: ProductId;
  readonly logFile: string;
  readonly connectionString?: string;
  readonly allowlist?: readonly FixtureColumn[];
  readonly pool?: QueryablePool;
  readonly now?: () => Date;
}

const CASE_ID = /^P2-[A-Z0-9]+(?:-[A-Z0-9]+)+$/;

export function findAllowed(
  allowlist: readonly FixtureColumn[],
  update: FixtureUpdate,
): FixtureColumn {
  if (!CASE_ID.test(update.caseId)) throw new FixtureRefusedError("caseId is not a P2 case id");
  const entry = allowlist.find((c) => c.table === update.table && c.column === update.column);
  if (!entry) {
    throw new FixtureRefusedError(`${update.table}.${update.column} is not in the allow-list`);
  }
  if (!entry.cases.includes(update.caseId)) {
    throw new FixtureRefusedError(
      `${update.caseId} is not a case for ${update.table}.${update.column}`,
    );
  }
  if (!(update.value instanceof Date) || Number.isNaN(update.value.getTime())) {
    throw new FixtureRefusedError("value must be a valid Date");
  }
  if (
    entry.pkKind === "int" &&
    !(typeof update.pk === "number" && Number.isSafeInteger(update.pk))
  ) {
    throw new FixtureRefusedError(`${entry.table}.${entry.pk} needs an integer key`);
  }
  if (entry.pkKind === "text" && !(typeof update.pk === "string" && update.pk.length > 0)) {
    throw new FixtureRefusedError(`${entry.table}.${entry.pk} needs a non-empty text key`);
  }
  return entry;
}

/** Text of the one statement the writer can send. Identifiers come from the allow-list only. */
export function updateSql(entry: FixtureColumn): string {
  return `UPDATE ${quoteIdent(entry.table)} SET ${quoteIdent(entry.column)} = $1 WHERE ${quoteIdent(entry.pk)} = $2`;
}

export function createFixtureWriter(options: FixtureWriterOptions): FixtureWriter {
  const allowlist = options.allowlist ?? FIXTURE_ALLOWLIST[options.product];
  const now = options.now ?? ((): Date => new Date());
  mkdirSync(path.dirname(options.logFile), { recursive: true });
  let pool = options.pool;
  const getPool = (): QueryablePool => {
    pool ??= new pg.Pool({
      connectionString: options.connectionString ?? roleDbUrl(options.product, "qa_fixture"),
      max: 1,
      application_name: `p2-qa-fixture-${options.product}`,
      connectionTimeoutMillis: 5_000,
    }) as unknown as QueryablePool;
    return pool;
  };
  const log = (line: Record<string, unknown>): void => {
    appendFileSync(
      options.logFile,
      `${JSON.stringify({ v: 1, ts: now().toISOString(), product: options.product, ...line })}\n`,
    );
  };

  return {
    async update(update) {
      let entry: FixtureColumn;
      try {
        entry = findAllowed(allowlist, update);
      } catch (error) {
        log({
          outcome: "refused",
          reason: error instanceof Error ? error.message : "unknown",
          table: update.table,
          column: update.column,
          caseId: update.caseId,
        });
        throw error;
      }
      const client = await getPool().connect();
      try {
        await client.query({ text: "BEGIN" });
        const result = await client.query({
          text: updateSql(entry),
          values: [update.value, update.pk],
        });
        if (result.rowCount !== 1) {
          await client.query({ text: "ROLLBACK" });
          log({
            outcome: "refused",
            reason: `matched ${String(result.rowCount)} rows`,
            table: entry.table,
            column: entry.column,
            pk: update.pk,
            caseId: update.caseId,
          });
          throw new FixtureRefusedError(
            `${entry.table} ${String(update.pk)} matched ${String(result.rowCount)} rows, expected 1`,
          );
        }
        await client.query({ text: "COMMIT" });
        log({
          outcome: "applied",
          table: entry.table,
          column: entry.column,
          pk: update.pk,
          value: update.value.toISOString(),
          caseId: update.caseId,
        });
      } catch (error) {
        if (!(error instanceof FixtureRefusedError)) {
          await client.query({ text: "ROLLBACK" }).catch(() => undefined);
          log({
            outcome: "failed",
            table: entry.table,
            column: entry.column,
            pk: update.pk,
            caseId: update.caseId,
            sqlstate: (error as { code?: string }).code,
          });
        }
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      const current = pool;
      pool = undefined;
      await current?.end();
    },
  };
}
