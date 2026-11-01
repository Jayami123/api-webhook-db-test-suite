import { lookup } from "node:dns/promises";
import path from "node:path";
import { receiverConfig, type ProductId } from "../env.ts";
import { productOfProject } from "../invariants/rules.ts";
import { currentRunPrefix } from "../run/prefix.ts";
import { startReceiver, type PathKey, type Receiver } from "../webhooks/receiver.ts";
import { resolveReceiverTarget, type ReceiverTarget } from "../webhooks/reach.ts";
import { test as authTest } from "./auth.ts";

/**
 * The receiver for the product of the current project, started once per worker on the addresses
 * that product can reach (src/webhooks/reach.ts), stopped at the end. Every delivery is logged to
 * receiver-logs/<run id>.jsonl (secrets redacted).
 */
export interface ReceiverHandle {
  readonly product: ProductId;
  readonly receiver: Receiver;
  readonly target: ReceiverTarget;
  /** URL the PRODUCT must call for this test: `/r/{runId}/{testId}` on the reachable host. */
  urlFor(testId: string): string;
  key(testId: string): PathKey;
}

export const test = authTest.extend<object, { receiverHandle: ReceiverHandle }>({
  receiverHandle: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring pattern
    async ({}, use, workerInfo) => {
      const product = productOfProject(workerInfo.project.name);
      if (product === undefined)
        throw new Error(`TEST BUG: project ${workerInfo.project.name} has no product`);
      const target = await resolveReceiverTarget(product, {
        lookup: async (hostname) => (await lookup(hostname, { family: 4 })).address,
      });
      const runId = currentRunPrefix();
      const config = receiverConfig();
      const receiver = await startReceiver({
        hosts: [...new Set([...config.hosts, ...target.bindHosts])],
        port: config.port,
        logFile: path.join("receiver-logs", `${runId}.jsonl`),
      });
      await use({
        product,
        receiver,
        target,
        key: (testId) => ({ runId, testId }),
        urlFor: (testId) => receiver.urlFor({ runId, testId }, target.urlHost),
      });
      await receiver.stop();
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
