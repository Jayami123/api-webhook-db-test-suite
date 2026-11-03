import type { ReadOnlyDb } from "../../db/pg.ts";

/**
 * Which schedule the product uses for an event type, and its zone, read from the database (review A4).
 * Mirrors packages/features/availability/lib/detectEventTypeScheduleForUser.ts at the pin c2b7ac4, lines 52-88:
 *   schedule  = eventType.schedule ?? (host schedule, none in this lane) ?? the user's first schedule
 *   timeZone  = schedule.timeZone || eventType.timeZone || user.timeZone
 * Each link is read from its own row, so the oracle never assumes a zone or a schedule.
 */
export interface ResolvedSchedule {
  readonly scheduleId: number;
  readonly timeZone: string;
  readonly source: "event-type" | "user-first-schedule";
}

export async function resolveEventTypeSchedule(
  db: ReadOnlyDb,
  email: string,
  slug: string,
): Promise<ResolvedSchedule> {
  const et = await db.select<{
    scheduleId: number | null;
    etTz: string | null;
    userTz: string;
    userId: number;
  }>(
    `SELECT e."scheduleId" AS "scheduleId", e."timeZone" AS "etTz", u."timeZone" AS "userTz", u."id" AS "userId" FROM "EventType" e JOIN "users" u ON u."id" = e."userId" WHERE u."email" = $1 AND e."slug" = $2`,
    [email, slug],
  );
  const row = et[0];
  if (row === undefined) throw new Error(`TEST BUG: event type ${slug} of ${email} not found`);
  const scheduleId = row.scheduleId ?? null;
  const source: ResolvedSchedule["source"] =
    scheduleId !== null ? "event-type" : "user-first-schedule";
  const chosen =
    scheduleId !== null
      ? await db.select<{ id: number; tz: string | null }>(
          `SELECT "id" AS id, "timeZone" AS tz FROM "Schedule" WHERE "id" = $1`,
          [scheduleId],
        )
      : await db.select<{ id: number; tz: string | null }>(
          `SELECT s."id" AS id, s."timeZone" AS tz FROM "Schedule" s WHERE s."userId" = $1 ORDER BY s."id" LIMIT 1`,
          [row.userId],
        );
  const sched = chosen[0];
  if (sched === undefined)
    throw new Error(`TEST BUG: no schedule resolves for ${slug} (${source})`);
  const timeZone = sched.tz ?? row.etTz ?? row.userTz;
  return { scheduleId: sched.id, timeZone, source };
}

/** Date overrides (Availability.date set) of one schedule inside [fromIso, toIso]; the oracle must see none. */
export async function dateOverridesInWindow(
  db: ReadOnlyDb,
  scheduleId: number,
  fromIso: string,
  toIso: string,
): Promise<number> {
  const rows = await db.select<{ n: number }>(
    `SELECT count(*)::int AS n FROM "Availability" WHERE "scheduleId" = $1 AND "date" IS NOT NULL AND "date" BETWEEN $2 AND $3`,
    [scheduleId, fromIso, toIso],
  );
  return rows[0]?.n ?? 0;
}
