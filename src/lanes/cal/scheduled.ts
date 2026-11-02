import type { FixtureWriter } from "../../db/fixture.ts";
import type { ReadOnlyDb } from "../../db/pg.ts";
import { escapeLike } from "../../run/prefix.ts";

export type ScheduledRow = {
  readonly id: number;
  readonly bookingUid: string | null;
  readonly startAfter: string;
};

export const SCHEDULED_FOR_BOOKING_SQL = String.raw`SELECT s."id", b."uid" AS "bookingUid", s."startAfter"::text AS "startAfter" FROM "WebhookScheduledTriggers" s JOIN "Booking" b ON b."id" = s."bookingId" WHERE b."uid" = $1 ORDER BY s."id"`;
export const SCHEDULED_FOR_RUN_SQL = String.raw`SELECT s."id", b."uid" AS "bookingUid", s."startAfter"::text AS "startAfter" FROM "WebhookScheduledTriggers" s LEFT JOIN "Booking" b ON b."id" = s."bookingId" WHERE s."subscriberUrl" LIKE $1 ESCAPE '\' ORDER BY s."id"`;

export function scheduledRowsForBooking(
  db: ReadOnlyDb,
  bookingUid: string,
): Promise<ScheduledRow[]> {
  return db.select<ScheduledRow>(SCHEDULED_FOR_BOOKING_SQL, [bookingUid]);
}

export function scheduledRowsForRun(db: ReadOnlyDb, runPrefix: string): Promise<ScheduledRow[]> {
  return db.select<ScheduledRow>(SCHEDULED_FOR_RUN_SQL, [`%${escapeLike(runPrefix)}%`]);
}

/** Moves a row through the allow-listed column. `msAgo` > 0 means the past. */
export async function moveStartAfter(
  writer: FixtureWriter,
  rowId: number,
  msAgo: number,
  caseId: string,
  now: number = Date.now(),
): Promise<void> {
  await writer.update({
    table: "WebhookScheduledTriggers",
    column: "startAfter",
    pk: rowId,
    value: new Date(now - msAgo),
    caseId,
  });
}

/** Rows of one booking that belong to one subscriber URL (other live webhooks also schedule the same booking). */
export const SCHEDULED_FOR_HOOK_SQL = String.raw`SELECT s."id", b."uid" AS "bookingUid", s."startAfter"::text AS "startAfter" FROM "WebhookScheduledTriggers" s JOIN "Booking" b ON b."id" = s."bookingId" WHERE b."uid" = $1 AND s."subscriberUrl" = $2 ORDER BY s."id"`;

export function scheduledRowsForHook(
  db: ReadOnlyDb,
  bookingUid: string,
  subscriberUrl: string,
): Promise<ScheduledRow[]> {
  return db.select<ScheduledRow>(SCHEDULED_FOR_HOOK_SQL, [bookingUid, subscriberUrl]);
}
