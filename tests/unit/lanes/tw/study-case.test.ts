import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CAPTURE_FAILED,
  finishStudyCase,
  type CaseRecord,
} from "../../../../src/lanes/tw/study-case.ts";

/** The single record a case pushed. */
function onlyRecord(records: readonly CaseRecord[]): CaseRecord {
  const record = records.at(0);
  assert.ok(record !== undefined, "one record pushed");
  return record;
}

interface Fakes {
  readonly removed: string[];
  readonly captured: number[];
}

/** Fake case end. `created` ids are removed in order; `cleanupFails` makes the removal of the second id throw. */
function caseEnd(opts: {
  readonly sentAt: string;
  readonly deliveries: number;
  readonly capture?: () => Promise<string>;
  readonly countFails?: Error;
  readonly cleanupFails?: Error;
  readonly created?: readonly string[];
}): { end: Parameters<typeof finishStudyCase>[0]; fakes: Fakes } {
  const fakes: Fakes = { removed: [], captured: [] };
  const created = opts.created ?? ["person-1", "person-2"];
  const end: Parameters<typeof finishStudyCase>[0] = {
    n: 7,
    mode: "idle12",
    sentAt: opts.sentAt,
    observedMs: 1234,
    countDeliveries: () => {
      if (opts.countFails) throw opts.countFails;
      return opts.deliveries;
    },
    captureWorkerLog: () => {
      fakes.captured.push(1);
      return opts.capture ? opts.capture() : Promise.resolve("worker line");
    },
    cleanup: () => {
      for (const id of created) {
        if (opts.cleanupFails && id === created[1]) return Promise.reject(opts.cleanupFails);
        fakes.removed.push(id);
      }
      return Promise.resolve();
    },
  };
  return { end, fakes };
}

const SENT = "2026-11-04T10:00:00.000Z";

describe("finishStudyCase", () => {
  test("a delivered case records the count, skips the log capture, cleans up and pushes one record", async () => {
    const records: CaseRecord[] = [];
    const { end, fakes } = caseEnd({ sentAt: SENT, deliveries: 1 });
    await finishStudyCase(end, records);
    assert.deepEqual(fakes.captured, [], "no worker log for a delivered case");
    assert.deepEqual(fakes.removed, ["person-1", "person-2"]);
    assert.deepEqual(records, [
      {
        n: 7,
        mode: "idle12",
        sent: true,
        sentAt: SENT,
        deliveries: 1,
        delivered: true,
        observedMs: 1234,
        cleaned: true,
        workerLog: null,
      },
    ]);
  });

  test("a sent case with no delivery stores the worker log", async () => {
    const records: CaseRecord[] = [];
    const { end } = caseEnd({ sentAt: SENT, deliveries: 0 });
    await finishStudyCase(end, records);
    assert.equal(onlyRecord(records).delivered, false);
    assert.equal(onlyRecord(records).workerLog, "worker line");
    assert.equal(onlyRecord(records).cleaned, true);
  });

  test("a never-sent case captures no log and records sent: false", async () => {
    const records: CaseRecord[] = [];
    const { end, fakes } = caseEnd({ sentAt: "", deliveries: 0, created: [] });
    await finishStudyCase(end, records);
    assert.deepEqual(fakes.captured, []);
    assert.equal(onlyRecord(records).sent, false);
    assert.equal(onlyRecord(records).workerLog, null);
  });

  test("a forced log-capture failure: cleanup still removes every id, the record is pushed with the note, and the capture error is rethrown", async () => {
    const records: CaseRecord[] = [];
    const captureError = new Error("docker logs: container not found");
    const { end, fakes } = caseEnd({
      sentAt: SENT,
      deliveries: 0,
      capture: () => Promise.reject(captureError),
    });
    await assert.rejects(finishStudyCase(end, records), (err: unknown) => err === captureError);
    assert.deepEqual(
      fakes.removed,
      ["person-1", "person-2"],
      "no leaked rows: every created id removed",
    );
    assert.equal(records.length, 1, "the record is present");
    assert.equal(onlyRecord(records).cleaned, true);
    assert.equal(
      onlyRecord(records).workerLog,
      `${CAPTURE_FAILED}: docker logs: container not found`,
    );
  });

  test("a failed delivery count is captured the same way: cleanup runs and the count error is rethrown", async () => {
    const records: CaseRecord[] = [];
    const countError = new Error("receiver closed");
    const { end, fakes } = caseEnd({ sentAt: SENT, deliveries: 0, countFails: countError });
    await assert.rejects(finishStudyCase(end, records), (err: unknown) => err === countError);
    assert.deepEqual(fakes.removed, ["person-1", "person-2"]);
    assert.equal(onlyRecord(records).workerLog, `${CAPTURE_FAILED}: receiver closed`);
  });

  test("a failed cleanup fails the case, and the record says it was not cleaned", async () => {
    const records: CaseRecord[] = [];
    const cleanupError = new Error("people.remove 500");
    const { end } = caseEnd({ sentAt: SENT, deliveries: 1, cleanupFails: cleanupError });
    await assert.rejects(finishStudyCase(end, records), (err: unknown) => err === cleanupError);
    assert.equal(onlyRecord(records).cleaned, false);
  });

  test("a capture failure and a cleanup failure are both thrown, as an AggregateError", async () => {
    const records: CaseRecord[] = [];
    const captureError = new Error("capture");
    const cleanupError = new Error("cleanup");
    const { end } = caseEnd({
      sentAt: SENT,
      deliveries: 0,
      capture: () => Promise.reject(captureError),
      cleanupFails: cleanupError,
    });
    await assert.rejects(finishStudyCase(end, records), (err: unknown) => {
      assert.ok(err instanceof AggregateError);
      assert.deepEqual(err.errors, [captureError, cleanupError]);
      return true;
    });
    assert.equal(records.length, 1, "the record is pushed even when two steps failed");
  });

  test("the body's own failure is kept and thrown after capture and cleanup", async () => {
    const records: CaseRecord[] = [];
    const bodyError = new Error("send rejected");
    const { end, fakes } = caseEnd({ sentAt: "", deliveries: 0, created: ["person-1"] });
    await assert.rejects(
      finishStudyCase(end, records, { error: bodyError }),
      (err: unknown) => err === bodyError,
    );
    assert.deepEqual(fakes.removed, ["person-1"]);
    assert.equal(onlyRecord(records).sent, false);
  });
});
