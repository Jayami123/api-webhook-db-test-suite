/**
 * Canary precondition for a Twenty webhook (plan Task 5, D7). Twenty applies a new webhook to the worker only after its
 * workspace-cache memo expires (TWENTY_WEBHOOK_MEMO_MS = 10 s), and an event sent earlier is dropped (B1, index section 5).
 * This is a PRECONDITION, not a retry loop: at most CANARY_MAX_TRIGGERS canary events are sent. A canary that is still
 * not delivered after the second one fails. The real event is sent by the caller, once, after this returns.
 * No sleep: `waitUntil` is expect.poll with a named deadline in the spec, and a predicate loop in the unit tests.
 */
export const CANARY_MAX_TRIGGERS = 2; // one at creation, one after one memo window

export interface CanaryInput {
  /** Sends one canary event (a person.created on the test's own webhook). */
  readonly trigger: () => Promise<void>;
  /** True once the canary delivery is recorded (matched by the canary's record id in the spec). */
  readonly delivered: () => boolean;
  /** Milliseconds since the webhook was created. */
  readonly elapsedMs: () => number;
  /** Resolves when the predicate holds; rejects at the deadline. */
  readonly waitUntil: (
    predicate: () => boolean,
    timeoutMs: number,
    message: string,
  ) => Promise<void>;
  readonly memoTtlMs: number;
  readonly deliveryMs: number;
  readonly marginMs: number;
}

/** Returns how many canary triggers were sent (1 or 2). */
export async function canaryPrecondition(input: CanaryInput): Promise<number> {
  await input.trigger(); // canary 1: may fall inside the memo window and be dropped
  await input.waitUntil(
    () => input.delivered() || input.elapsedMs() >= input.memoTtlMs,
    input.memoTtlMs + input.marginMs,
    "canary: memo window elapsed or canary delivered",
  );
  let triggers = 1;
  if (!input.delivered()) {
    await input.trigger(); // canary 2: after the memo window; the last one
    triggers = 2;
  }
  await input.waitUntil(input.delivered, input.deliveryMs, "canary delivered");
  return triggers;
}
