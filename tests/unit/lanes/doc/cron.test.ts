import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CRON_PERIOD_MS,
  CRON_TICK_MARGIN_MS,
  nextQuarterHourMs,
  tickDeadlineMs,
} from "../../../../src/lanes/doc/cron.ts";

describe("quarter-hour cron ticks (*/15, seal-document-sweep.ts:18)", () => {
  test("at 10:00:00.000 UTC the next tick is 10:15:00.000, not now", () => {
    const now = Date.parse("2026-11-02T10:00:00.000Z");
    assert.equal(nextQuarterHourMs(now), Date.parse("2026-11-02T10:15:00.000Z"));
  });

  test("at 10:14:59.999 UTC the next tick is 10:15:00.000", () => {
    const now = Date.parse("2026-11-02T10:14:59.999Z");
    assert.equal(nextQuarterHourMs(now), Date.parse("2026-11-02T10:15:00.000Z"));
  });

  test("the deadline is the period plus the margin at most, measured from now", () => {
    const now = Date.parse("2026-11-02T10:00:00.000Z");
    const deadline = tickDeadlineMs(now);
    assert.equal(deadline, 15 * 60_000 + CRON_TICK_MARGIN_MS);
    assert.ok(deadline <= CRON_PERIOD_MS + CRON_TICK_MARGIN_MS);
  });
});
