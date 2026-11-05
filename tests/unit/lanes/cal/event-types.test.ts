import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReadOnlyDb, SqlParam } from "../../../../src/db/pg.ts";
import {
  eventTypeIdBySlug,
  EVENT_TYPE_BY_SLUG_SQL,
} from "../../../../src/lanes/cal/event-types.ts";

function fakeDb(rows: { id: number }[]): { db: ReadOnlyDb; params: SqlParam[][] } {
  const params: SqlParam[][] = [];
  const db = {
    product: "cal",
    select: (_sql: string, p: readonly SqlParam[] = []) => {
      params.push([...p]);
      return Promise.resolve(rows as unknown as never[]);
    },
  } as unknown as ReadOnlyDb;
  return { db, params };
}

test("eventTypeIdBySlug passes email and slug as parameters, and an absent row is a TEST BUG", async () => {
  const found = fakeDb([{ id: 7 }]);
  assert.equal(await eventTypeIdBySlug(found.db, "pro@example.com", "30min"), 7);
  assert.deepEqual(found.params[0], ["pro@example.com", "30min"]);
  assert.match(EVENT_TYPE_BY_SLUG_SQL, /WHERE u\."email" = \$1 AND e\."slug" = \$2/);
  const absent = fakeDb([]);
  await assert.rejects(
    eventTypeIdBySlug(absent.db, "pro@example.com", "missing"),
    /TEST BUG: event type missing/,
  );
});
