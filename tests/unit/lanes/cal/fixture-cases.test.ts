import assert from "node:assert/strict";
import { test } from "node:test";
import { FIXTURE_ALLOWLIST } from "../../../../src/db/fixture-allowlist.ts";
import { findAllowed, FixtureRefusedError } from "../../../../src/db/fixture.ts";

const calList = FIXTURE_ALLOWLIST.cal;

test("the scheduled-trigger startAfter column accepts case P2-CAL-SCH-003", () => {
  const entry = findAllowed(calList, {
    table: "WebhookScheduledTriggers",
    column: "startAfter",
    pk: 1,
    value: new Date(0),
    caseId: "P2-CAL-SCH-003",
  });
  assert.equal(entry.table, "WebhookScheduledTriggers");
});

test("an unknown case id is refused", () => {
  assert.throws(
    () =>
      findAllowed(calList, {
        table: "WebhookScheduledTriggers",
        column: "startAfter",
        pk: 1,
        value: new Date(0),
        caseId: "P2-CAL-NOPE-001",
      }),
    FixtureRefusedError,
  );
});

test("the attempts column on Task is refused (only timestamps are movable)", () => {
  assert.throws(
    () =>
      findAllowed(calList, {
        table: "Task",
        column: "attempts",
        pk: "x",
        value: new Date(0),
        caseId: "P2-CAL-TASK-001",
      }),
    FixtureRefusedError,
  );
});
