import pg from "pg";
import { dbStatementTimeoutMs, dbUrl, type ProductId } from "../env.ts";
import { assertSelectOnly } from "./select-guard.ts";

/** A product, or the throwaway CI database the db-guard job proves the server layers against. */
export type OracleLabel = ProductId | "db-guard";

export type SqlParam = string | number | boolean | null | Date;

export interface ReadOnlyDb {
  readonly product: OracleLabel;
  /** One guarded SELECT inside its own READ ONLY transaction. Rows are plain objects. */
  select<Row extends Record<string, unknown>>(
    sql: string,
    params?: readonly SqlParam[],
  ): Promise<Row[]>;
  /** Idempotent. */
  close(): Promise<void>;
}

/** Narrow slice of pg.Pool so unit tests can pass a fake. */
export interface PoolLike {
  connect(): Promise<ClientLike>;
  end(): Promise<void>;
}
/** pg >= 8.12 honours queryMode; @types/pg 8.23.1 does not declare it yet. */
export type ExtendedQueryConfig = pg.QueryConfig<unknown[]> & { readonly queryMode: "extended" };
export interface ClientLike {
  query(config: string | ExtendedQueryConfig): Promise<{ rows: unknown[] }>;
  release(destroy?: boolean | Error): void;
}
export type PoolFactory = (config: pg.PoolConfig) => PoolLike;

const defaultPoolFactory: PoolFactory = (config) => {
  const pool = new pg.Pool(config);
  return {
    connect: async () => {
      const client = await pool.connect();
      return {
        query: (query) => client.query(query as pg.QueryConfig<unknown[]>),
        release: (destroy) => {
          client.release(destroy);
        },
      };
    },
    end: () => pool.end(),
  };
};

export class DbQueryError extends Error {
  override readonly name = "DbQueryError";
  readonly product: OracleLabel;
  readonly sqlstate: string | undefined;
  constructor(product: OracleLabel, sqlstate: string | undefined, message: string) {
    super(`${product} oracle query failed${sqlstate ? ` (SQLSTATE ${sqlstate})` : ""}: ${message}`);
    this.product = product;
    this.sqlstate = sqlstate;
  }
}

/** Session settings sent in the startup packet, so they apply before the first statement. */
export function readOnlySessionOptions(statementTimeoutMs: number): string {
  return [
    "-c default_transaction_read_only=on",
    `-c statement_timeout=${String(statementTimeoutMs)}`,
    `-c idle_in_transaction_session_timeout=${String(statementTimeoutMs * 2)}`,
  ].join(" ");
}

export interface ReadOnlyDbOptions {
  readonly connectionString: string;
  readonly statementTimeoutMs: number;
  readonly poolFactory?: PoolFactory;
  /**
   * Only tests/db/** may set this (ESLint enforces it): it skips assertSelectOnly so the db-guard
   * job can prove that the server-side layers refuse writes on their own.
   */
  readonly unsafeDisableGuardForServerTests?: true;
}

export function createReadOnlyDb(product: OracleLabel, options: ReadOnlyDbOptions): ReadOnlyDb {
  const pool = (options.poolFactory ?? defaultPoolFactory)({
    connectionString: options.connectionString,
    max: 2,
    allowExitOnIdle: true,
    connectionTimeoutMillis: 5_000,
    application_name: `p2-qa-oracle-${product}`,
    options: readOnlySessionOptions(options.statementTimeoutMs),
  });
  let closed = false;

  return {
    product,
    async select<Row extends Record<string, unknown>>(
      sql: string,
      params: readonly SqlParam[] = [],
    ): Promise<Row[]> {
      if (closed) throw new Error(`TEST BUG: ${product} oracle used after close()`);
      if (options.unsafeDisableGuardForServerTests !== true) assertSelectOnly(sql);
      const client = await pool.connect();
      let broken: Error | undefined;
      try {
        await client.query("BEGIN TRANSACTION READ ONLY");
        // Extended protocol: Postgres itself refuses a second statement (SQLSTATE 42601).
        const result = await client.query({
          text: sql,
          values: [...params],
          queryMode: "extended",
        });
        return result.rows as Row[];
      } catch (error) {
        broken = error instanceof Error ? error : new Error(String(error));
        const sqlstate = (error as { code?: unknown }).code;
        // Never include the connection string: only the server message and SQLSTATE.
        throw new DbQueryError(
          product,
          typeof sqlstate === "string" ? sqlstate : undefined,
          broken.message,
        );
      } finally {
        try {
          await client.query("ROLLBACK");
        } catch {
          broken ??= new Error("rollback failed");
        }
        client.release(broken ?? false);
      }
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await pool.end();
    },
  };
}

const registry = new Map<ProductId, ReadOnlyDb>();

/** One pool per product per worker process, configured from env (src/env.ts). */
export function readOnlyDb(product: ProductId, env: NodeJS.ProcessEnv = process.env): ReadOnlyDb {
  let db = registry.get(product);
  if (!db) {
    db = createReadOnlyDb(product, {
      connectionString: dbUrl(product, env),
      statementTimeoutMs: dbStatementTimeoutMs(env),
    });
    registry.set(product, db);
  }
  return db;
}

/** Call from a worker-scoped fixture teardown (product tasks). */
export async function closeAllReadOnlyDbs(): Promise<void> {
  const dbs = [...registry.values()];
  registry.clear();
  await Promise.all(dbs.map((db) => db.close()));
}
