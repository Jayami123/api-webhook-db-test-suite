import type { ReadOnlyDb } from "../../db/pg.ts";

export const EVENT_TYPE_BY_SLUG_SQL = String.raw`SELECT e."id" FROM "EventType" e JOIN "users" u ON u."id" = e."userId" WHERE u."email" = $1 AND e."slug" = $2`;

export async function eventTypeIdBySlug(
  db: ReadOnlyDb,
  email: string,
  slug: string,
): Promise<number> {
  const rows = await db.select<{ id: number }>(EVENT_TYPE_BY_SLUG_SQL, [email, slug]);
  const id = rows[0]?.id;
  if (id === undefined) {
    throw new Error(`TEST BUG: event type ${slug} of ${email} not found (seed changed?)`);
  }
  return id;
}
