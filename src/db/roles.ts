import type { FixtureColumn } from "./fixture-allowlist.ts";

/**
 * SQL for the two least-privilege roles (plan Task 3, decision D1). Pure: it only builds text.
 * Run it with the harness admin URL through scripts/db-roles.ts, never from a test.
 *  - qa_ro: member of the predefined role pg_read_all_data (PostgreSQL 14+), so it can SELECT every
 *    table in every schema, including schemas created later (Twenty creates one per workspace);
 *    default_transaction_read_only=on on the role as one more layer.
 *  - qa_fixture: column-level SELECT(pk, column) and UPDATE(column) on the allow-listed columns
 *    only. No INSERT, no DELETE, no other column, no DDL.
 */
export const RO_ROLE = "qa_ro";
export const FIXTURE_ROLE = "qa_fixture";

const SIMPLE_IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const PASSWORD = /^[A-Za-z0-9_-]{16,128}$/;

export class RoleConfigError extends Error {
  override readonly name = "RoleConfigError";
  constructor(message: string) {
    super(`TEST BUG: ${message}`);
  }
}

export function quoteIdent(name: string): string {
  if (!SIMPLE_IDENT.test(name)) {
    throw new RoleConfigError(
      `identifier ${JSON.stringify(name)} must match ${String(SIMPLE_IDENT)}`,
    );
  }
  return `"${name}"`;
}

/** Error text names the variable, never the value. */
export function assertPassword(variable: string, value: string | undefined): string {
  if (value === undefined || !PASSWORD.test(value)) {
    throw new RoleConfigError(`${variable} must match ${String(PASSWORD)} (value not shown)`);
  }
  return value;
}

export interface ProvisionInput {
  /** Database name of the product (from its admin URL). */
  readonly database: string;
  readonly roPassword: string;
  /** Undefined: no fixture role for this product, and an existing one is dropped. */
  readonly fixturePassword?: string | undefined;
  readonly fixtureColumns: readonly FixtureColumn[];
}

const createRole = (role: string): string =>
  `DO $p2$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${quoteIdent(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $p2$`;

const dropRole = (role: string): string =>
  `DO $p2$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN DROP OWNED BY ${quoteIdent(role)}; DROP ROLE ${quoteIdent(role)}; END IF; END $p2$`;

/** Idempotent: every run converges to the same grants and rotates the passwords. */
export function provisionStatements(input: ProvisionInput): string[] {
  const database = quoteIdent(input.database);
  const statements = [
    createRole(RO_ROLE),
    `ALTER ROLE ${quoteIdent(RO_ROLE)} WITH PASSWORD '${assertPassword("P2_QA_RO_PASSWORD", input.roPassword)}'`,
    `ALTER ROLE ${quoteIdent(RO_ROLE)} SET default_transaction_read_only = on`,
    `GRANT pg_read_all_data TO ${quoteIdent(RO_ROLE)}`,
    `GRANT CONNECT ON DATABASE ${database} TO ${quoteIdent(RO_ROLE)}`,
  ];
  if (input.fixturePassword === undefined || input.fixtureColumns.length === 0) {
    statements.push(dropRole(FIXTURE_ROLE));
    return statements;
  }
  const fixture = quoteIdent(FIXTURE_ROLE);
  statements.push(
    createRole(FIXTURE_ROLE),
    `ALTER ROLE ${fixture} WITH PASSWORD '${assertPassword("P2_QA_FIXTURE_PASSWORD", input.fixturePassword)}'`,
    `GRANT CONNECT ON DATABASE ${database} TO ${fixture}`,
    `GRANT USAGE ON SCHEMA public TO ${fixture}`,
    // Converge: drop whatever an earlier run granted (column privileges go with the table's).
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${fixture}`,
  );
  for (const column of input.fixtureColumns) {
    const table = quoteIdent(column.table);
    statements.push(
      `GRANT SELECT (${quoteIdent(column.pk)}, ${quoteIdent(column.column)}) ON ${table} TO ${fixture}`,
      `GRANT UPDATE (${quoteIdent(column.column)}) ON ${table} TO ${fixture}`,
    );
  }
  return statements;
}

/** Drops everything provisionStatements created (grants go with the roles). */
export function teardownStatements(): string[] {
  return [dropRole(FIXTURE_ROLE), dropRole(RO_ROLE)];
}
