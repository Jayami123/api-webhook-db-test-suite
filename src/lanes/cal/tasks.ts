import type { ReadOnlyDb } from "../../db/pg.ts";
import { escapeLike } from "../../run/prefix.ts";

export type TaskRow = {
  readonly id: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly succeeded: boolean;
  readonly lastError: string | null;
  readonly due: boolean;
};

/** LIKE pattern: Task.payload carries the webhook subscriber URL, which carries the run prefix. */
export function taskPayloadPattern(runPrefix: string): string {
  return `%${escapeLike(runPrefix)}%`;
}

/** `String.raw` keeps the backslash in `ESCAPE '\'` (same convention as src/invariants/lane-kit.ts). */
export const TASK_ROWS_SQL = String.raw`SELECT "id", "attempts", "maxAttempts", ("succeededAt" IS NOT NULL) AS succeeded, "lastError", ("scheduledAt" <= now()) AS due, "payload" AS payload FROM "Task" WHERE "payload" LIKE $1 ESCAPE '\' ORDER BY "id"`;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * True when the payload's subscriber URL is exactly this test's: `/r/<run prefix>/<test id>` followed by the end of the
 * segment (review A9). A test id that is a prefix of another (`cal-task-001` and `cal-task-001f`) does not match.
 */
export function payloadNamesTest(payload: string, runPrefix: string, testId: string): boolean {
  return new RegExp(`/r/${escapeRegExp(runPrefix)}/${escapeRegExp(testId)}(?![A-Za-z0-9_-])`).test(
    payload,
  );
}

type RawTaskRow = TaskRow & { readonly payload: string };

/** Task rows created for this test's receiver URL (anchored; see payloadNamesTest). */
export async function taskRowsFor(
  db: ReadOnlyDb,
  runPrefix: string,
  testId: string,
): Promise<TaskRow[]> {
  const rows = await db.select<RawTaskRow>(TASK_ROWS_SQL, [taskPayloadPattern(runPrefix)]);
  return rows
    .filter((row) => payloadNamesTest(row.payload, runPrefix, testId))
    .map((row) => ({
      id: row.id,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      succeeded: row.succeeded,
      lastError: row.lastError,
      due: row.due,
    }));
}
