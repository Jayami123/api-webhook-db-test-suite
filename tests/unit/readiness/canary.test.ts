import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CANARY_MAX_TRIGGERS, canaryPrecondition } from "../../../src/readiness/canary.ts";

const MEMO = 10_000;
const MARGIN = 500;
const DELIVERY = 35_000;

/** A fake clock and a fake Twenty: an event sent before `visibleAt` is dropped (the memo). No timers. */
function fake(visibleAt: number, failTrigger = false) {
  let clock = 0;
  let delivered = false;
  const sent: number[] = [];
  const input = {
    trigger: (): Promise<void> => {
      if (failTrigger) return Promise.reject(new Error("create failed"));
      sent.push(clock);
      if (clock >= visibleAt) delivered = true;
      return Promise.resolve();
    },
    delivered: () => delivered,
    elapsedMs: () => clock,
    waitUntil: (predicate: () => boolean, timeoutMs: number, message: string): Promise<void> => {
      const end = clock + timeoutMs;
      while (!predicate()) {
        if (clock >= end) return Promise.reject(new Error(`timed out: ${message}`));
        clock += 500;
      }
      return Promise.resolve();
    },
    memoTtlMs: MEMO,
    deliveryMs: DELIVERY,
    marginMs: MARGIN,
  };
  return { input, sent };
}

describe("canaryPrecondition", () => {
  test("a canary delivered inside the first window needs one trigger", async () => {
    const f = fake(0);
    assert.equal(await canaryPrecondition(f.input), 1);
    assert.deepEqual(f.sent, [0]);
  });

  test("a canary dropped by the memo is sent once more, after one memo window, and that one is delivered", async () => {
    const f = fake(MEMO);
    const triggers = await canaryPrecondition(f.input);
    assert.equal(triggers, 2);
    assert.deepEqual(f.sent, [0, MEMO]);
    assert.ok(f.sent.length <= CANARY_MAX_TRIGGERS);
  });

  test("a canary never delivered fails after the second trigger, with no third", async () => {
    const f = fake(Number.POSITIVE_INFINITY);
    await assert.rejects(canaryPrecondition(f.input), /timed out: canary delivered/);
    assert.equal(f.sent.length, CANARY_MAX_TRIGGERS);
  });

  test("the bound is two triggers, one at creation and one after one memo window", () => {
    assert.equal(CANARY_MAX_TRIGGERS, 2);
  });

  test("a failing trigger surfaces its error instead of being retried", async () => {
    const f = fake(0, true);
    await assert.rejects(canaryPrecondition(f.input), /create failed/);
    assert.equal(f.sent.length, 0);
  });
});
