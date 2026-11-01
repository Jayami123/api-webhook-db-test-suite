import pg from "pg";
import { dbUrl, loadEnv, type ProductId } from "../env.ts";
import { FIXTURE_ALLOWLIST, type FixtureColumn } from "./fixture-allowlist.ts";
import {
  FIXTURE_ROLE,
  RO_ROLE,
  assertPassword,
  provisionStatements,
  teardownStatements,
} from "./roles.ts";

/**
 * Admin-side runner for scripts/db-roles.ts. The only module besides tests/db that may use the
 * harness owner URL (ESLint enforces it). It never prints a statement, because statements carry
 * the role passwords.
 */
export interface AdminClientLike {
  query(text: string): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

export function databaseNameOf(connectionString: string): string {
  const name = decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, ""));
  if (name === "") throw new Error("TEST BUG: admin URL has no database name");
  return name;
}

export async function provisionRoles(
  client: AdminClientLike,
  input: {
    database: string;
    roPassword: string;
    fixturePassword: string;
    columns: readonly FixtureColumn[];
  },
): Promise<void> {
  const statements = provisionStatements({
    database: input.database,
    roPassword: input.roPassword,
    fixturePassword: input.columns.length === 0 ? undefined : input.fixturePassword,
    fixtureColumns: input.columns,
  });
  for (const statement of statements) await client.query(statement);
}

export async function teardownRoles(client: AdminClientLike): Promise<void> {
  for (const statement of teardownStatements()) await client.query(statement);
}

/** Problems found in the live grants, empty when they match the allow-list exactly. */
export async function checkRoleGrants(
  client: AdminClientLike,
  columns: readonly FixtureColumn[],
): Promise<string[]> {
  const problems: string[] = [];
  const roles = await client.query(
    `SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, pg_has_role(rolname, 'pg_read_all_data', 'member') AS reads_all
       FROM pg_roles WHERE rolname IN ('${RO_ROLE}', '${FIXTURE_ROLE}') ORDER BY rolname`,
  );
  const byName = new Map(roles.rows.map((r) => [String(r["rolname"]), r]));
  const ro = byName.get(RO_ROLE);
  if (!ro) problems.push(`${RO_ROLE} does not exist`);
  else {
    if (ro["rolsuper"] === true || ro["rolcreaterole"] === true || ro["rolcreatedb"] === true)
      problems.push(`${RO_ROLE} has elevated attributes`);
    if (ro["reads_all"] !== true) problems.push(`${RO_ROLE} is not a member of pg_read_all_data`);
  }
  const fixture = byName.get(FIXTURE_ROLE);
  if (columns.length === 0 && fixture)
    problems.push(`${FIXTURE_ROLE} exists but this product has no time-travel column`);
  if (columns.length > 0 && !fixture) problems.push(`${FIXTURE_ROLE} does not exist`);
  if (fixture) {
    if (
      fixture["rolsuper"] === true ||
      fixture["rolcreaterole"] === true ||
      fixture["rolcreatedb"] === true
    )
      problems.push(`${FIXTURE_ROLE} has elevated attributes`);
    const granted = await client.query(
      `SELECT table_name, column_name, privilege_type FROM information_schema.column_privileges
        WHERE grantee = '${FIXTURE_ROLE}' ORDER BY table_name, column_name, privilege_type`,
    );
    const actual = granted.rows
      .map(
        (r) =>
          `${String(r["table_name"])}.${String(r["column_name"])}:${String(r["privilege_type"])}`,
      )
      .sort();
    const expected = columns
      .flatMap((c) => [
        `${c.table}.${c.pk}:SELECT`,
        `${c.table}.${c.column}:SELECT`,
        `${c.table}.${c.column}:UPDATE`,
      ])
      .filter((v, i, all) => all.indexOf(v) === i)
      .sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      problems.push(
        `${FIXTURE_ROLE} column grants differ: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`,
      );
    }
    const tableLevel = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.role_table_grants WHERE grantee = '${FIXTURE_ROLE}' AND privilege_type IN ('INSERT','DELETE','TRUNCATE')`,
    );
    if (Number(tableLevel.rows[0]?.["n"]) !== 0)
      problems.push(`${FIXTURE_ROLE} has table-level INSERT/DELETE/TRUNCATE`);
  }
  return problems;
}

export async function withAdmin<T>(
  product: ProductId,
  fn: (client: AdminClientLike, database: string) => Promise<T>,
): Promise<T> {
  const url = dbUrl(product);
  const client = new pg.Client({
    connectionString: url,
    application_name: `p2-qa-roles-${product}`,
  });
  await client.connect();
  try {
    return await fn(client, databaseNameOf(url));
  } finally {
    await client.end();
  }
}

export async function provisionProduct(
  product: ProductId,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const parsed = loadEnv(env);
  const roPassword = assertPassword("P2_QA_RO_PASSWORD", parsed.P2_QA_RO_PASSWORD);
  const columns = FIXTURE_ALLOWLIST[product];
  const fixturePassword =
    columns.length === 0
      ? "unused-unused-unused"
      : assertPassword("P2_QA_FIXTURE_PASSWORD", parsed.P2_QA_FIXTURE_PASSWORD);
  await withAdmin(product, async (client, database) => {
    await provisionRoles(client, { database, roPassword, fixturePassword, columns });
    const problems = await checkRoleGrants(client, columns);
    if (problems.length > 0)
      throw new Error(
        `TEST BUG: ${product} roles do not match the allow-list:\n  ${problems.join("\n  ")}`,
      );
  });
}
