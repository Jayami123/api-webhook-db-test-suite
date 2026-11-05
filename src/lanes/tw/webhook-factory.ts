import type { TwentyClient } from "../../clients/twenty.ts";
import type { ReceiverHandle } from "../../fixtures/index.ts";
import { randomSecret } from "../../readiness/checks.ts";
import { runScopedName } from "../../run/prefix.ts";

export interface FreshWebhook {
  readonly id: string;
  /** Per run (readiness/checks.ts randomSecret); never a literal. */
  readonly secret: string;
  readonly url: string;
  /** Soft-deletes the webhook (DELETE /rest/webhooks/{id}). */
  remove(): Promise<void>;
}

export async function createFreshWebhook(input: {
  readonly tw: TwentyClient;
  readonly receiverHandle: ReceiverHandle;
  /** Receiver test id: lowercase, [a-z0-9-], at most 64 chars (receiver.ts TEST_ID_PATTERN). */
  readonly testId: string;
  readonly operations: readonly string[];
}): Promise<FreshWebhook> {
  const secret = randomSecret();
  const url = input.receiverHandle.urlFor(input.testId);
  const id = await input.tw.webhooks.create({
    targetUrl: url,
    operations: [...input.operations],
    secret,
    description: runScopedName(input.testId),
  });
  return { id, secret, url, remove: () => input.tw.webhooks.remove(id) };
}

/**
 * B1 precondition (one call, no retry): one unrelated event before the webhook is created. P-TW-2r CONFIRMED that this
 * alone did not drop the first event in P-TW-2r; the study keeps it so the sequence matches the probe. Returns the id for cleanup.
 */
export async function primeWorkspaceCache(tw: TwentyClient): Promise<string> {
  return tw.people.create(runScopedName("tw-prime"));
}
