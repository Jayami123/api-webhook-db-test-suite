import type { TwentyClient } from "../../clients/twenty.ts";
import { canaryPrecondition, CANARY_MAX_TRIGGERS } from "../../readiness/canary.ts";
import { recordIdOf } from "../../readiness/checks.ts";
import { runScopedName } from "../../run/prefix.ts";
import type { Delivery, PathKey, Receiver } from "../../webhooks/receiver.ts";
import { TWENTY_WEBHOOK_MEMO_MS, CANARY_MARGIN_MS } from "../../slo.ts";

/** Deliveries of one record id on one path (the record id is in the body: recordIdOf). */
export function deliveriesOf(receiver: Receiver, key: PathKey, recordId: string): Delivery[] {
  return receiver.deliveries(key).filter((d) => recordIdOf(d) === recordId);
}

export interface VisibleResult {
  /** 1 or 2: canary events sent. */
  readonly triggers: number;
  /** Person ids created as canaries: the caller removes them. */
  readonly personIds: string[];
}

/**
 * Bounded positive control before the first real event: at most CANARY_MAX_TRIGGERS canaries.
 * `waitUntil` is injected: specs pass expect.poll(...).toBe(true) with intervals POLL_INTERVALS;
 * unit tests pass a loop over a fake clock.
 */
export async function awaitVisible(input: {
  readonly tw: TwentyClient;
  readonly receiver: Receiver;
  readonly key: PathKey;
  readonly createdAtMs: number;
  readonly nowMs: () => number;
  readonly waitUntil: (
    predicate: () => boolean,
    timeoutMs: number,
    message: string,
  ) => Promise<void>;
  readonly deliveryMs: number;
}): Promise<VisibleResult> {
  const personIds: string[] = [];
  let canaryId: string | undefined;
  const triggers = await canaryPrecondition({
    trigger: async () => {
      if (personIds.length >= CANARY_MAX_TRIGGERS) {
        throw new Error("TEST BUG: canary bound exceeded");
      }
      canaryId = await input.tw.people.create(runScopedName(`tw-canary-${personIds.length + 1}`));
      personIds.push(canaryId);
    },
    delivered: () =>
      canaryId !== undefined && deliveriesOf(input.receiver, input.key, canaryId).length > 0,
    elapsedMs: () => input.nowMs() - input.createdAtMs,
    waitUntil: input.waitUntil,
    memoTtlMs: TWENTY_WEBHOOK_MEMO_MS,
    deliveryMs: input.deliveryMs,
    marginMs: CANARY_MARGIN_MS,
  });
  return { triggers, personIds };
}
