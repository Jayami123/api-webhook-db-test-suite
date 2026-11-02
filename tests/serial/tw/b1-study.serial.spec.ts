import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { runSweep } from "../../../src/invariants/engine.ts";
import { retained } from "../../../src/invariants/fixture.ts";
import { rulesFor } from "../../../src/invariants/rules.ts";
import { deliveriesOf } from "../../../src/lanes/tw/visible.ts";
import { createFreshWebhook, primeWorkspaceCache } from "../../../src/lanes/tw/webhook-factory.ts";
import {
  POLL_INTERVALS,
  TW_STUDY_DELIVERY_MS,
  TW_STUDY_IDLE_MS,
} from "../../../src/lanes/tw/slo.ts";
import { composeServiceContainer } from "../../../src/webhooks/docker-net.ts";
import { TWENTY_COMPOSE_PROJECT } from "../../../src/webhooks/reach.ts";
import { currentRunPrefix, runScopedName } from "../../../src/run/prefix.ts";

/**
 * P2-TW-WH-010: a MEASUREMENT of the B1 drop (SUSPECTED intermittent product bug), not a gate. It runs only in the
 * study workflow (tw-study.yml) and never in the lane job. The only assertions check that the run is valid. The
 * delivery observation is recorded, not asserted, so a case with no delivery is `delivered: false` and the run stays valid.
 */
const exec = promisify(execFile);

/** idle12: controlled idle gap before the webhook; warm0: no gap after the previous case; prime: one priming event first. */
export type StudyMode = "idle12" | "warm0" | "prime";

/** The fixed batch: 20 idle12, 20 warm0, 10 prime, in this order on every run. */
export const STUDY_CASES: readonly { readonly n: number; readonly mode: StudyMode }[] = [
  ...Array.from({ length: 20 }, (_, i) => ({ n: i + 1, mode: "idle12" as const })),
  ...Array.from({ length: 20 }, (_, i) => ({ n: 21 + i, mode: "warm0" as const })),
  ...Array.from({ length: 10 }, (_, i) => ({ n: 41 + i, mode: "prime" as const })),
];

interface CaseRecord {
  readonly n: number;
  readonly mode: StudyMode;
  readonly sent: boolean;
  readonly sentAt: string;
  readonly deliveries: number;
  readonly delivered: boolean;
  readonly observedMs: number;
  readonly cleaned: boolean;
  readonly workerLog: string | null;
}
const records: CaseRecord[] = [];

test.afterAll(async () => {
  const sent = records.filter((r) => r.sent).length;
  const delivered = records.filter((r) => r.delivered).length;
  mkdirSync("results", { recursive: true });
  writeFileSync(
    "results/p2-tw-wh-010-study.json",
    JSON.stringify({ cases: records.length, sent, delivered, records }, null, 2),
  );
  // Run validity: the only assertions in this file.
  expect(records.length, "all study cases executed").toBe(STUDY_CASES.length);
  expect(
    records.filter((r) => !r.sent).map((r) => r.n),
    "every send accepted",
  ).toEqual([]);
  expect(
    records.filter((r) => !r.cleaned).map((r) => r.n),
    "every cleanup succeeded",
  ).toEqual([]);
  const leaks = await runSweep(readOnlyDb("twenty"), rulesFor("twenty"), {
    runPrefix: currentRunPrefix(),
    retained,
    includeLeaks: true,
  });
  expect(leaks, "no leaked rows of this run").toEqual([]);
});

/** Worker lines since a time (the worker container is resolved from its compose labels, never by name). */
async function workerLogSince(sinceIso: string): Promise<string> {
  const id = await composeServiceContainer(TWENTY_COMPOSE_PROJECT, "worker");
  if (id === "") throw new Error("ENV: no compose worker container for the Twenty project");
  const { stdout, stderr } = await exec(
    "docker",
    ["logs", "--since", sinceIso, "--timestamps", id],
    {
      maxBuffer: 50_000_000,
    },
  );
  return (stdout + stderr)
    .split("\n")
    .filter((l) => /webhook-queue|Outbound HTTP/.test(l))
    .join("\n");
}

for (const c of STUDY_CASES) {
  test(`P2-TW-WH-010 case ${c.n} (${c.mode}): send accepted, delivery recorded`, async ({
    tw,
    receiverHandle,
  }) => {
    const testId = `p2-study-${c.n}`;
    const key = receiverHandle.key(testId);
    const created: string[] = [];
    let hook: Awaited<ReturnType<typeof createFreshWebhook>> | undefined;
    const startedMs = Date.now();
    const sinceIso = new Date(startedMs).toISOString();
    let sentId: string | undefined;
    let sentAt = "";
    let observedMs = 0;
    try {
      if (c.mode === "idle12") {
        // CONTROLLED VARIABLE: the fixed idle gap (TW_STUDY_IDLE_MS). A time condition with an explicit deadline.
        await expect
          .poll(() => Date.now() >= startedMs + TW_STUDY_IDLE_MS, {
            timeout: TW_STUDY_IDLE_MS + 2_000,
            intervals: POLL_INTERVALS,
            message: "controlled idle gap",
          })
          .toBe(true);
      }
      if (c.mode === "prime") created.push(await primeWorkspaceCache(tw));
      hook = await createFreshWebhook({
        tw,
        receiverHandle,
        testId,
        operations: ["person.created"],
      });
      sentId = await tw.people.create(runScopedName(`tw-study-${c.n}`));
      created.push(sentId);
      sentAt = new Date().toISOString();
      const observeFrom = Date.now();
      // Measurement: the poll ends at its deadline with `true` whatever the count. A drop is recorded, not failed.
      await expect
        .poll(
          () =>
            Date.now() >= observeFrom + TW_STUDY_DELIVERY_MS ||
            deliveriesOf(receiverHandle.receiver, key, sentId as string).length > 0,
          {
            timeout: TW_STUDY_DELIVERY_MS + 2_000,
            intervals: POLL_INTERVALS,
            message: "observation window",
          },
        )
        .toBe(true);
      observedMs = Date.now() - observeFrom;
    } finally {
      const sent = sentAt !== "";
      const deliveries =
        sentId === undefined ? 0 : deliveriesOf(receiverHandle.receiver, key, sentId).length;
      const workerLog = sent && deliveries === 0 ? await workerLogSince(sinceIso) : null;
      let cleaned = false;
      try {
        // No catch: a failed removal fails the case, and the record says it was not cleaned.
        for (const id of created) await tw.people.remove(id);
        if (hook) await hook.remove();
        cleaned = true;
      } finally {
        records.push({
          n: c.n,
          mode: c.mode,
          sent,
          sentAt,
          deliveries,
          delivered: deliveries > 0,
          observedMs,
          cleaned,
          workerLog,
        });
      }
    }
  });
}
