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
export const TASK_ROWS_SQL = String.raw`SELECT "id", "attempts", "maxAttempts", ("succeededAt" IS NOT NULL) AS succeeded, "lastError", ("scheduledAt" <= now()) AS due FROM "Task" WHERE "payload" LIKE $1 ESCAPE '\' ORDER BY "id"`;

export async function taskRowsFor(db: ReadOnlyDb, runPrefix: string): Promise<TaskRow[]> {
  return db.select<TaskRow>(TASK_ROWS_SQL, [taskPayloadPattern(runPrefix)]);
}
