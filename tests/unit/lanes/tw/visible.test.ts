import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { TwentyClient } from "../../../../src/clients/twenty.ts";
import { awaitVisible } from "../../../../src/lanes/tw/visible.ts";
import type { Delivery, PathKey, Receiver } from "../../../../src/webhooks/receiver.ts";

const RUN = "p2-qa-20261102t000000z-deadbeef";
// runScopedName reads the run id from the environment (the runner sets it in playwright.config.ts).
process.env["P2_RUN_ID"] = RUN;
const KEY: PathKey = { runId: RUN, testId: "tw-visible" };

/** A fake Twenty client that numbers created people c1, c2, ... and reports each id to onCreate. */
function fakeTw(onCreate: (id: string) => void): TwentyClient {
  let n = 0;
  const people = {
    create: (): Promise<string> => {
      n += 1;
      const id = `c${n}`;
      onCreate(id);
      return Promise.resolve(id);
    },
    update: (): Promise<void> => Promise.resolve(),
    remove: (): Promise<void> => Promise.resolve(),
  };
  const unused = (): Promise<never> => Promise.reject(new Error("unused"));
  return {
    people,
    webhooks: { create: () => Promise.resolve("wh"), remove: () => Promise.resolve() },
    raw: unused,
  };
}

/** A fake receiver that returns one delivery per record id in `delivered`. */
function fakeReceiver(delivered: Set<string>): Receiver {
  const deliveries = (): Delivery[] =>
    [...delivered].map(
      (id) => ({ rawBody: Buffer.from(JSON.stringify({ record: { id } })) }) as unknown as Delivery,
    );
  return { deliveries } as unknown as Receiver;
}

/** Fake clock: each failed predicate check advances 1 s; the deadline rejects. */
function fakeWaitUntil(clock: { now: number }) {
  return (predicate: () => boolean, timeoutMs: number, message: string): Promise<void> => {
    for (let waited = 0; waited <= timeoutMs; waited += 1_000) {
      if (predicate()) return Promise.resolve();
      clock.now += 1_000;
    }
    return Promise.reject(new Error(`fake deadline: ${message}`));
  };
}

describe("awaitVisible", () => {
  test("sends one canary when the first is delivered inside the window", async () => {
    const delivered = new Set<string>();
    const clock = { now: 0 };
    const tw = fakeTw((id) => delivered.add(id));
    const result = await awaitVisible({
      tw,
      receiver: fakeReceiver(delivered),
      key: KEY,
      createdAtMs: 0,
      nowMs: () => clock.now,
      waitUntil: fakeWaitUntil(clock),
      deliveryMs: 35_000,
    });
    assert.deepEqual(result, { triggers: 1, personIds: ["c1"] });
  });

  test("sends a second canary after the window when the first was dropped", async () => {
    const delivered = new Set<string>();
    const clock = { now: 0 };
    // c1 is dropped (never recorded); only c2, sent after the memo window, is delivered.
    const tw = fakeTw((id) => {
      if (id === "c2") delivered.add(id);
    });
    const result = await awaitVisible({
      tw,
      receiver: fakeReceiver(delivered),
      key: KEY,
      createdAtMs: 0,
      nowMs: () => clock.now,
      waitUntil: fakeWaitUntil(clock),
      deliveryMs: 35_000,
    });
    assert.deepEqual(result, { triggers: 2, personIds: ["c1", "c2"] });
  });
});
