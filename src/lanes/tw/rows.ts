import type { ReadOnlyDb } from "../../db/pg.ts";

/** Workspace schemas of this Twenty database (one per workspace; the seed creates two). */
export async function workspaceSchemas(db: ReadOnlyDb): Promise<string[]> {
  const rows = await db.select<{ schema_name: string }>(
    "SELECT schema_name FROM information_schema.schemata WHERE schema_name ~ '^workspace_' ORDER BY schema_name",
  );
  return rows.map((r) => r.schema_name);
}

/**
 * Rows of one record id, looked up in every workspace schema (the record's workspace is not known to the test).
 * `table` and `columns` are code constants, never user input; the id is a bound parameter.
 */
export async function rowsById(
  db: ReadOnlyDb,
  table: "person" | "opportunity",
  id: string,
  columns: string,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const schema of await workspaceSchemas(db)) {
    const rows = await db.select<Record<string, unknown>>(
      `SELECT ${columns} FROM "${schema}"."${table}" WHERE "id" = $1`,
      [id],
    );
    out.push(...rows.map((r) => ({ schema, ...r })));
  }
  return out;
}
