import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import {
  startReceiver,
  type PathKey,
  type Receiver,
  type ReceiverMode,
  type Timers,
} from "../../../src/webhooks/receiver.ts";

const RUN = "p2-qa-20261101t090000z-0a1b2c3d";
const OTHER_RUN = "p2-qa-20261101t090000z-ffffffff";
const A: PathKey = { runId: RUN, testId: "cal-wh-001" };
const B: PathKey = { runId: RUN, testId: "cal-wh-002" };

interface Reply {
  readonly status: number;
  readonly body: string;
  readonly location: string | undefined;
}

/** One request without following redirects. Resolves on response, rejects if the socket dies. */
function post(
  receiver: Receiver,
  key: PathKey,
  body: Buffer | string,
  headers: Record<string, string> = {},
  suffix = "",
): { readonly done: Promise<Reply>; readonly req: http.ClientRequest } {
  const url = new URL(receiver.urlFor(key) + suffix);
  let req!: http.ClientRequest;
  const done = new Promise<Reply>((resolve, reject) => {
    req = http.request(
      url,
      { method: "POST", headers: { "content-type": "application/json", ...headers }, agent: false },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            location: res.headers.location,
          });
        });
      },
    );
    req.on("error", reject);
    req.end(body);
  });
  return { done, req };
}

function manualTimers(): Timers & { fireAll(): void; readonly scheduled: () => number } {
  let nextId = 0;
  const pending = new Map<number, () => void>();
  return {
    setTimeout(fn) {
      nextId += 1;
      pending.set(nextId, fn);
      return nextId;
    },
    clearTimeout(handle) {
      pending.delete(handle as number);
    },
    fireAll() {
      for (const [id, fn] of [...pending]) {
        pending.delete(id);
        fn();
      }
    },
    scheduled: () => pending.size,
  };
}

const open: Receiver[] = [];
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((r) => r.stop()));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
async function start(
  options: Partial<Parameters<typeof startReceiver>[0]> = {},
): Promise<Receiver> {
  const receiver = await startReceiver({ port: 0, ...options });
  open.push(receiver);
  return receiver;
}
const signal = (ms = 5000): AbortSignal => AbortSignal.timeout(ms);

describe("receiver: raw bytes", () => {
  test("keeps the exact bytes: odd whitespace, key order, CRLF and both spellings of é", async () => {
    const receiver = await start();
    const E_ACUTE = String.fromCharCode(0xe9);
    const ESCAPED = String.fromCharCode(0x5c) + "u00e9";
    const bodies = [
      '{ "b": 1,\t"a" :  2 }\r\n',
      `{"title":"p${E_ACUTE}"}`,
      `{"title":"p${ESCAPED}"}`,
      Buffer.from([0x7b, 0xff, 0xfe, 0x00, 0x7d]),
    ];
    for (const body of bodies) await post(receiver, A, body).done;
    const got = receiver.deliveries(A);
    assert.equal(got.length, bodies.length);
    bodies.forEach((body, i) => {
      const sent = typeof body === "string" ? Buffer.from(body, "utf8") : body;
      const delivery = got[i];
      assert.ok(delivery);
      assert.ok(delivery.rawBody.equals(sent), `body ${String(i)} is byte-identical`);
      assert.equal(delivery.bodySha256, createHash("sha256").update(sent).digest("hex"));
      assert.equal(delivery.bodyBytes, sent.length);
    });
    assert.notEqual(got[1]?.bodySha256, got[2]?.bodySha256, "é and the escape are different bytes");
  });

  test("the returned rawBody is a copy: changing it does not change the stored delivery", async () => {
    const receiver = await start();
    await post(receiver, A, "abc").done;
    const first = receiver.deliveries(A)[0];
    assert.ok(first);
    first.rawBody[0] = 0x7a;
    assert.equal(receiver.deliveries(A)[0]?.rawBody.toString("utf8"), "abc");
  });

  test("headers are kept raw (lower-case names) for signature checks", async () => {
    const receiver = await start();
    await post(receiver, A, "{}", { "X-Cal-Signature-256": "abc123" }).done;
    assert.equal(receiver.deliveries(A)[0]?.headers["x-cal-signature-256"], "abc123");
  });
});

describe("receiver: modes", () => {
  test("ok answers 200 and 500 answers 500, switchable at runtime per path", async () => {
    const receiver = await start();
    assert.deepEqual(receiver.getMode(A), { kind: "ok" });
    assert.equal((await post(receiver, A, "1").done).status, 200);
    receiver.setMode(A, { kind: "500" });
    assert.equal((await post(receiver, A, "2").done).status, 500);
    receiver.setMode(A, { kind: "ok" });
    assert.equal((await post(receiver, A, "3").done).status, 200);
    assert.deepEqual(
      receiver.deliveries(A).map((d) => [d.attempt, d.mode]),
      [
        [1, "ok"],
        [2, "500"],
        [3, "ok"],
      ],
    );
  });

  test("reset destroys the socket after the delivery is recorded: the client sees a reset, not a status", async () => {
    const receiver = await start();
    receiver.setMode(A, { kind: "reset" });
    const { done } = post(receiver, A, "r1");
    await assert.rejects(done, /socket hang up|ECONNRESET/);
    assert.equal(receiver.deliveries(A).length, 1);
    assert.equal(receiver.deliveries(A)[0]?.mode, "reset");
    await receiver.stop();
  });

  test("reset is per path: a neighbouring path in ok mode still answers 200", async () => {
    const receiver = await start();
    receiver.setMode(A, { kind: "reset" });
    await assert.rejects(post(receiver, A, "r2").done, /socket hang up|ECONNRESET/);
    assert.equal((await post(receiver, B, "ok").done).status, 200);
    await receiver.stop();
  });

  test("a reset path switched back to ok answers 200 on the next attempt, and attempts are counted", async () => {
    const receiver = await start();
    receiver.setMode(A, { kind: "reset" });
    await assert.rejects(post(receiver, A, "r3").done, /socket hang up|ECONNRESET/);
    receiver.setMode(A, { kind: "ok" });
    assert.equal((await post(receiver, A, "r3-again").done).status, 200);
    assert.deepEqual(
      receiver.deliveries(A).map((d) => [d.attempt, d.mode]),
      [
        [1, "reset"],
        [2, "ok"],
      ],
    );
    await receiver.stop();
  });

  test("redirect answers with Location and does not touch the target; the target path is recorded when requested", async () => {
    const receiver = await start();
    receiver.setMode(A, { kind: "redirect" });
    const reply = await post(receiver, A, "x").done;
    assert.equal(reply.status, 302);
    assert.equal(reply.location, `/r/${RUN}/${A.testId}/redirected`);
    assert.equal(receiver.deliveries(A).length, 1, "only the first request arrived");

    // positive control: a client that DID follow would produce a second recorded request
    const follow = await post(receiver, A, "x", {}, "/redirected").done;
    assert.equal(follow.status, 302);
    assert.equal(receiver.deliveries(A).length, 2);
    assert.equal(receiver.deliveries(A)[1]?.path, `/r/${RUN}/${A.testId}/redirected`);
  });

  test("redirect honours a status and an explicit location", async () => {
    const receiver = await start();
    receiver.setMode(A, { kind: "redirect", status: 307, location: "/elsewhere" });
    const reply = await post(receiver, A, "x").done;
    assert.deepEqual([reply.status, reply.location], [307, "/elsewhere"]);
  });

  test("slow holds the answer until the injected timer fires (no real waiting)", async () => {
    const timers = manualTimers();
    const receiver = await start({ timers });
    receiver.setMode(A, { kind: "slow", delayMs: 35_000 });
    const { done } = post(receiver, A, "x");
    await receiver.awaitDeliveryCount(A, 1, signal());
    assert.equal(receiver.pendingResponses(), 1);
    assert.equal(timers.scheduled(), 1);
    timers.fireAll();
    assert.equal((await done).status, 200);
    assert.equal(receiver.pendingResponses(), 0);
  });

  test("timeout never answers; the delivery is recorded and stop() ends the connection", async () => {
    const receiver = await start();
    receiver.setMode(A, { kind: "timeout" });
    const { done } = post(receiver, A, "x");
    const ended = assert.rejects(done, /socket hang up|ECONNRESET/);
    await receiver.awaitDeliveryCount(A, 1, signal());
    assert.equal(receiver.pendingResponses(), 1);
    assert.equal(receiver.deliveries(A).length, 1);
    await receiver.stop();
    await ended;
    assert.equal(receiver.pendingResponses(), 0);
  });

  test("a client that gives up on a slow answer releases its timer and pending slot", async () => {
    const timers = manualTimers();
    const receiver = await start({ timers });
    receiver.setMode(A, { kind: "slow", delayMs: 1000 });
    const { done, req } = post(receiver, A, "x");
    const aborted = assert.rejects(done);
    await receiver.awaitDeliveryCount(A, 1, signal());
    req.destroy();
    await aborted;
    await new Promise<void>((resolve) => {
      const check = (): void => {
        if (receiver.pendingResponses() === 0) resolve();
        else setImmediate(check);
      };
      check();
    });
    assert.equal(timers.scheduled(), 0);
  });
});

describe("receiver: isolation and bookkeeping", () => {
  test("paths are isolated: deliveries, attempts and modes never mix", async () => {
    const receiver = await start();
    receiver.setMode(A, { kind: "500" });
    const otherRun: PathKey = { runId: OTHER_RUN, testId: A.testId };
    const statuses = await Promise.all([
      post(receiver, A, "a1").done,
      post(receiver, B, "b1").done,
      post(receiver, otherRun, "o1").done,
    ]);
    assert.deepEqual(
      statuses.map((s) => s.status),
      [500, 200, 200],
    );
    assert.equal(receiver.deliveries(A).length, 1);
    assert.equal(receiver.deliveries(B).length, 1);
    assert.equal(receiver.deliveries(otherRun).length, 1);
    assert.equal(receiver.deliveries(B)[0]?.rawBody.toString(), "b1");
    assert.equal(receiver.deliveries({ runId: RUN, testId: "never-used" }).length, 0);
  });

  test("attempt counts per path from 1 and seq counts globally", async () => {
    const receiver = await start();
    await post(receiver, A, "1").done;
    await post(receiver, B, "2").done;
    await post(receiver, A, "3").done;
    assert.deepEqual(
      receiver.deliveries(A).map((d) => [d.attempt, d.seq]),
      [
        [1, 1],
        [2, 3],
      ],
    );
    assert.deepEqual(
      receiver.deliveries(B).map((d) => [d.attempt, d.seq]),
      [[1, 2]],
    );
  });

  test("unknown paths, malformed run ids and wrong shapes answer 404 and are counted, not recorded", async () => {
    const receiver = await start();
    const base = `http://127.0.0.1:${String(receiver.port)}`;
    for (const p of [
      "/",
      "/r/",
      `/r/${RUN}`,
      "/r/not-a-run-id/x",
      `/r/${RUN}/UPPER`,
      `/r/${RUN}/a/b`,
    ]) {
      const res = await fetch(base + p, { method: "POST", body: "x" });
      assert.equal(res.status, 404, p);
    }
    assert.equal(receiver.stats().unmatched, 6);
    assert.equal(receiver.deliveries(A).length, 0);
  });

  test("the health path answers 200 and records nothing", async () => {
    const receiver = await start();
    const res = await fetch(`http://127.0.0.1:${String(receiver.port)}/__health`);
    assert.equal(res.status, 200);
    assert.equal(receiver.stats().unmatched, 0);
  });

  test("a body over the limit gets 413 and is not recorded", async () => {
    const receiver = await start({ maxBodyBytes: 16 });
    assert.equal((await post(receiver, A, "x".repeat(17)).done).status, 413);
    assert.equal(receiver.deliveries(A).length, 0);
    assert.equal(receiver.stats().oversize, 1);
    assert.equal((await post(receiver, A, "x".repeat(16)).done).status, 200);
  });

  test("invalid keys and modes are TEST BUG errors", async () => {
    const receiver = await start();
    assert.throws(() => receiver.urlFor({ runId: "nope", testId: "a" }), /TEST BUG: runId/);
    assert.throws(() => receiver.urlFor({ runId: RUN, testId: "Bad_Id" }), /TEST BUG: testId/);
    const bad: ReceiverMode[] = [
      { kind: "slow", delayMs: 0 },
      { kind: "slow", delayMs: 1.5 },
      { kind: "slow", delayMs: 600_001 },
    ];
    for (const mode of bad) {
      assert.throws(() => {
        receiver.setMode(A, mode);
      }, /TEST BUG: slow delayMs/);
    }
  });
});

describe("receiver: JSONL log", () => {
  test("one line per delivery with hash and length, secrets redacted, no body text", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "p2-receiver-"));
    dirs.push(dir);
    const logFile = path.join(dir, "nested", "run.jsonl");
    const now = (): Date => new Date("2026-11-01T09:00:00.000Z");
    const receiver = await start({ logFile, now });
    const secretValue = "sig-value-that-must-not-be-logged";
    const firstBody = '{"hello":"body-text-that-must-not-be-logged"}';
    await post(receiver, A, firstBody, {
      "X-Cal-Signature-256": secretValue,
      "X-Cal-Webhook-Version": "2021-10-20",
    }).done;
    await post(receiver, A, "{}").done;
    await receiver.stop();

    const text = readFileSync(logFile, "utf8");
    assert.ok(!text.includes(secretValue));
    assert.ok(!text.includes("body-text-that-must-not-be-logged"));
    const lines = text
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    assert.equal(lines.length, 2);
    const first = lines[0];
    assert.ok(first);
    assert.equal(first["ts"], "2026-11-01T09:00:00.000Z");
    assert.equal(first["method"], "POST");
    assert.equal(first["path"], `/r/${RUN}/${A.testId}`);
    assert.equal(first["attempt"], 1);
    assert.equal(lines[1]?.["attempt"], 2);
    assert.equal(first["bodyBytes"], Buffer.byteLength(firstBody));
    assert.match(String(first["bodySha256"]), /^[0-9a-f]{64}$/);
    const headers = first["headers"] as Record<string, string>;
    assert.equal(headers["x-cal-signature-256"], `<redacted:${String(secretValue.length)}>`);
    assert.equal(headers["x-cal-webhook-version"], "2021-10-20");
  });
});

describe("receiver: lifecycle", () => {
  test("stop() is idempotent and leaves no listening servers or sockets", async () => {
    const count = (type: string): number =>
      process.getActiveResourcesInfo().filter((name) => name === type).length;
    const before = { servers: count("TCPServerWrap"), sockets: count("TCPSocketWrap") };
    const receiver = await start();
    receiver.setMode(A, { kind: "timeout" });
    const { done, req } = post(receiver, A, "x");
    const clientClosed = new Promise<void>((resolve) => {
      req.once("close", resolve);
    });
    const ended = assert.rejects(done);
    await receiver.awaitDeliveryCount(A, 1, signal());
    await receiver.stop();
    await receiver.stop();
    await ended;
    await clientClosed;
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    assert.ok(count("TCPServerWrap") <= before.servers, "no listening server left behind");
    assert.ok(count("TCPSocketWrap") <= before.sockets, "no open socket left behind");
    await assert.rejects(fetch(`http://127.0.0.1:${String(receiver.port)}/__health`));
  });

  test("a failed second bind closes the first server and reports the error", async () => {
    await assert.rejects(
      startReceiver({ port: 0, hosts: ["127.0.0.1", "127.0.0.1"] }),
      /EADDRINUSE/,
    );
  });

  test("awaitDeliveryCount rejects when the signal aborts or the receiver stops", async () => {
    const receiver = await start();
    await assert.rejects(
      receiver.awaitDeliveryCount(A, 1, AbortSignal.abort()),
      /timed out waiting for 1 deliveries/,
    );
    const waiting = receiver.awaitDeliveryCount(A, 1, signal());
    const rejected = assert.rejects(waiting, /receiver stopped while waiting/);
    await receiver.stop();
    await rejected;
  });

  test("awaitDeliveryCount resolves at once when the deliveries already arrived", async () => {
    const receiver = await start();
    await post(receiver, A, "x").done;
    await receiver.awaitDeliveryCount(A, 1, signal());
  });
});
