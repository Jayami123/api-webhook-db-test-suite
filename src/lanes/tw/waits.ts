import { expect } from "@playwright/test";
import { awaitVisible, type VisibleResult } from "./visible.ts";
import { POLL_INTERVALS, SLO } from "./slo.ts";
import type { PathKey, Receiver } from "../../webhooks/receiver.ts";
import type { TwentyClient } from "../../clients/twenty.ts";

/** One named, bounded wait: a predicate polled at POLL_INTERVALS until it holds or the explicit deadline passes. */
export function pollUntil(
  predicate: () => boolean,
  timeoutMs: number,
  message: string,
): Promise<void> {
  return expect
    .poll(predicate, { timeout: timeoutMs, intervals: POLL_INTERVALS, message })
    .toBe(true);
}

/** Canary precondition with the real clock and the lane's named delivery budget (see visible.ts). */
export function awaitCanary(input: {
  readonly tw: TwentyClient;
  readonly receiver: Receiver;
  readonly key: PathKey;
  readonly createdAtMs: number;
}): Promise<VisibleResult> {
  return awaitVisible({
    ...input,
    nowMs: Date.now,
    waitUntil: pollUntil,
    deliveryMs: SLO.twWebhookDelivery.ms,
  });
}
