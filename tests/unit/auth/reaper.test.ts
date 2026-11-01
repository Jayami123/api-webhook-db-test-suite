import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { JOB_TIMEOUT_MS, runStartedAt, selectStaleLeftovers } from "../../../src/auth/reaper.ts";

const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
const OLD = "p2-qa-20261101t113000z-1a2b3c4d"; // started 30 min before NOW
const FRESH = "p2-qa-20261101t115500z-5e6f7a8b"; // started 5 min before NOW
const CURRENT = "p2-qa-20261101t100000z-9c0d1e2f"; // the run doing the sweep

describe("reaper", () => {
  test("removes only run-pattern leftovers older than the job timeout", () => {
    const picked = selectStaleLeftovers({
      leftovers: [
        { id: "1", name: `${OLD}-doc-token` },
        { id: "2", name: `${FRESH}-doc-token` },
        { id: "3", name: "manual-key" },
        { id: "4", name: `${CURRENT}-cal-key` },
      ],
      currentPrefix: CURRENT,
      nowMs: NOW,
      jobTimeoutMs: JOB_TIMEOUT_MS,
    });
    assert.deepEqual(
      picked.map((l) => l.id),
      ["1"],
    );
  });

  test("a name that only partly matches the pattern, or an impossible date, is never selected", () => {
    assert.equal(runStartedAt("xp2-qa-20261101t113000z-1a2b3c4d-tw"), undefined);
    const picked = selectStaleLeftovers({
      leftovers: [
        { id: "a", name: "xp2-qa-20261101t113000z-1a2b3c4d-tw" },
        { id: "b", name: "p2-qa-20261399t999999z-1a2b3c4d-tw" },
      ],
      currentPrefix: CURRENT,
      nowMs: NOW,
      jobTimeoutMs: JOB_TIMEOUT_MS,
    });
    assert.deepEqual(picked, []);
  });
});
