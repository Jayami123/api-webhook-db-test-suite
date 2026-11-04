/** Controlled variable of one B1 study case (P2-TW-WH-010): idle12, warm0 or prime. */
export type StudyMode = "idle12" | "warm0" | "prime";

/** One line of results/p2-tw-wh-010-study.json. */
export interface CaseRecord {
  readonly n: number;
  readonly mode: StudyMode;
  readonly sent: boolean;
  readonly sentAt: string;
  readonly deliveries: number;
  readonly delivered: boolean;
  readonly observedMs: number;
  readonly cleaned: boolean;
  /** Worker log lines when a sent case has no delivery; `CAPTURE FAILED: ...` when the capture itself threw. */
  readonly workerLog: string | null;
}

/** Prefix of the workerLog note written when a capture (log read or delivery count) throws. */
export const CAPTURE_FAILED = "CAPTURE FAILED";

export interface StudyCaseEnd {
  readonly n: number;
  readonly mode: StudyMode;
  /** ISO time of the send, or "" when the case never sent. */
  readonly sentAt: string;
  readonly observedMs: number;
  /** Deliveries of the sent record id on the case's path. */
  readonly countDeliveries: () => number;
  /** Worker log lines since the case started. Called only for a sent case with no delivery. */
  readonly captureWorkerLog: () => Promise<string>;
  /** Removes everything the case created. Throws on any failed removal. */
  readonly cleanup: () => Promise<void>;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Finishes one study case. Every step runs even when an earlier one throws: the capture, then the cleanup, then the
 * record push. A capture failure is noted in the record (`CAPTURE FAILED: ...`) and rethrown after cleanup, so it
 * fails the run instead of being swallowed. A cleanup failure fails the case. The body's own failure, if any, is
 * kept. When more than one of these failed, they are thrown together as an AggregateError.
 */
export async function finishStudyCase(
  end: StudyCaseEnd,
  records: CaseRecord[],
  bodyFailure?: { readonly error: unknown },
): Promise<void> {
  const sent = end.sentAt !== "";
  const failures: unknown[] = [];
  if (bodyFailure !== undefined) failures.push(bodyFailure.error);

  let deliveries = 0;
  let workerLog: string | null = null;
  try {
    deliveries = end.countDeliveries();
    if (sent && deliveries === 0) workerLog = await end.captureWorkerLog();
  } catch (err) {
    failures.push(err);
    workerLog = `${CAPTURE_FAILED}: ${messageOf(err)}`;
  }

  let cleaned = false;
  try {
    await end.cleanup();
    cleaned = true;
  } catch (err) {
    failures.push(err);
  }

  records.push({
    n: end.n,
    mode: end.mode,
    sent,
    sentAt: end.sentAt,
    deliveries,
    delivered: deliveries > 0,
    observedMs: end.observedMs,
    cleaned,
    workerLog,
  });

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      `study case ${String(end.n)}: ${String(failures.length)} failures`,
    );
  }
}
