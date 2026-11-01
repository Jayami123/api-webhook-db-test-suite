import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import http from "node:http";
import type { AddressInfo, Socket } from "node:net";
import path from "node:path";
import { RUN_PREFIX_PATTERN } from "../run/prefix.ts";
import { redactHeaders } from "./redact.ts";

/**
 * Local webhook sink for P2 (plan Task 2). One path per test: `/r/{runId}/{testId}`. The raw body
 * is captured as a Buffer before anything parses it, every delivery is logged (JSONL, secrets
 * redacted) and kept in memory for assertions. Behaviour per path is switchable at runtime.
 */
export type ReceiverMode =
  | { readonly kind: "ok" }
  | { readonly kind: "500" }
  | { readonly kind: "slow"; readonly delayMs: number }
  | { readonly kind: "timeout" }
  /** Records the delivery, then destroys the socket with no status line (the client sees a connection reset). */
  | { readonly kind: "reset" }
  | {
      readonly kind: "redirect";
      readonly status?: 301 | 302 | 303 | 307 | 308;
      /** Default: the same path with "/redirected" appended, which is itself a recorded path. */
      readonly location?: string;
    };

export const MAX_SLOW_DELAY_MS = 600_000;
export const DEFAULT_MAX_BODY_BYTES = 1_048_576;
export const TEST_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PATH_PATTERN = /^\/r\/([^/]+)\/([^/]+?)(\/redirected)?\/?$/;
export const HEALTH_PATH = "/__health";

export interface PathKey {
  readonly runId: string;
  readonly testId: string;
}

export interface Delivery extends PathKey {
  /** 1-based, per runId+testId, in arrival order. */
  readonly attempt: number;
  /** Global arrival order across all paths. */
  readonly seq: number;
  readonly receivedAt: string;
  readonly method: string;
  readonly path: string;
  /** Raw, lower-cased header names (needed to verify signatures). Never written to the log. */
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  /** The exact bytes received. Do not mutate. */
  readonly rawBody: Buffer;
  readonly bodySha256: string;
  readonly bodyBytes: number;
  readonly remoteAddress: string | undefined;
  /** The mode that decided the response. */
  readonly mode: ReceiverMode["kind"];
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
const realTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => {
    clearTimeout(handle as NodeJS.Timeout);
  },
};

export interface ReceiverOptions {
  /** Bind addresses. Default ["127.0.0.1"]. Never "0.0.0.0" unless the caller asks for it. */
  readonly hosts?: readonly string[];
  /** 0 picks a free port (units). Default 4317 is applied by the caller from env. */
  readonly port: number;
  /** JSONL file. Parent folders are created. Omit for no file log. */
  readonly logFile?: string;
  readonly maxBodyBytes?: number;
  readonly timers?: Timers;
  readonly now?: () => Date;
}

export class ReceiverError extends Error {
  override readonly name = "ReceiverError";
  constructor(message: string) {
    super(`TEST BUG: ${message}`);
  }
}

export function assertPathKey(key: PathKey): void {
  if (!RUN_PREFIX_PATTERN.test(key.runId)) {
    throw new ReceiverError(
      `runId must match ${String(RUN_PREFIX_PATTERN)}, got ${JSON.stringify(key.runId)}`,
    );
  }
  if (!TEST_ID_PATTERN.test(key.testId)) {
    throw new ReceiverError(
      `testId must match ${String(TEST_ID_PATTERN)}, got ${JSON.stringify(key.testId)}`,
    );
  }
}

export function assertMode(mode: ReceiverMode): void {
  if (mode.kind === "slow") {
    if (!Number.isInteger(mode.delayMs) || mode.delayMs < 1 || mode.delayMs > MAX_SLOW_DELAY_MS) {
      throw new ReceiverError(`slow delayMs must be an integer in 1..${String(MAX_SLOW_DELAY_MS)}`);
    }
  }
}

const keyOf = (key: PathKey): string => `${key.runId}/${key.testId}`;

export interface Receiver {
  /** Port actually bound (same on every host). */
  readonly port: number;
  readonly hosts: readonly string[];
  urlFor(key: PathKey, host?: string): string;
  setMode(key: PathKey, mode: ReceiverMode): void;
  getMode(key: PathKey): ReceiverMode;
  /** Copies, in arrival order. `rawBody` is a fresh Buffer. */
  deliveries(key: PathKey): readonly Delivery[];
  /**
   * Event-driven wait for node:test units (no polling, no sleep). Playwright specs use
   * `expect.poll(() => receiver.deliveries(key).length, { timeout: <named SLO> })` instead.
   */
  awaitDeliveryCount(key: PathKey, count: number, signal: AbortSignal): Promise<void>;
  /** Requests accepted but not yet answered (slow and timeout modes). */
  pendingResponses(): number;
  stats(): { readonly unmatched: number; readonly oversize: number };
  /** Idempotent. Destroys open sockets, closes servers, flushes the log. */
  stop(): Promise<void>;
}

interface Pending {
  readonly res: http.ServerResponse;
  timer: unknown;
}

export async function startReceiver(options: ReceiverOptions): Promise<Receiver> {
  const hosts = options.hosts ?? ["127.0.0.1"];
  if (hosts.length === 0) throw new ReceiverError("hosts must not be empty");
  const timers = options.timers ?? realTimers;
  const now = options.now ?? ((): Date => new Date());
  const maxBody = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  const modes = new Map<string, ReceiverMode>();
  const delivered = new Map<string, Delivery[]>();
  const waiters = new Set<{
    key: string;
    count: number;
    resolve: () => void;
    reject: (e: Error) => void;
  }>();
  const sockets = new Set<Socket>();
  const pending = new Set<Pending>();
  const counters = { unmatched: 0, oversize: 0, seq: 0 };
  let stopped = false;

  let log: WriteStream | undefined;
  if (options.logFile !== undefined) {
    mkdirSync(path.dirname(options.logFile), { recursive: true });
    log = createWriteStream(options.logFile, { flags: "a" });
  }

  function record(delivery: Delivery): void {
    const k = keyOf(delivery);
    const list = delivered.get(k) ?? [];
    list.push(delivery);
    delivered.set(k, list);
    log?.write(
      `${JSON.stringify({
        v: 1,
        ts: delivery.receivedAt,
        seq: delivery.seq,
        method: delivery.method,
        path: delivery.path,
        runId: delivery.runId,
        testId: delivery.testId,
        attempt: delivery.attempt,
        mode: delivery.mode,
        remoteAddress: delivery.remoteAddress,
        headers: redactHeaders(delivery.headers),
        bodySha256: delivery.bodySha256,
        bodyBytes: delivery.bodyBytes,
      })}\n`,
    );
    for (const waiter of waiters) {
      if (waiter.key === k && list.length >= waiter.count) {
        waiters.delete(waiter);
        waiter.resolve();
      }
    }
  }

  function respond(res: http.ServerResponse, mode: ReceiverMode, key: PathKey): void {
    switch (mode.kind) {
      case "ok":
        res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
        return;
      case "500":
        res.writeHead(500, { "content-type": "application/json" }).end('{"ok":false}');
        return;
      case "redirect": {
        const location = mode.location ?? `/r/${key.runId}/${key.testId}/redirected`;
        res.writeHead(mode.status ?? 302, { location }).end();
        return;
      }
      case "slow": {
        const entry: Pending = { res, timer: undefined };
        entry.timer = timers.setTimeout(() => {
          pending.delete(entry);
          if (!res.destroyed)
            res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
        }, mode.delayMs);
        pending.add(entry);
        res.on("close", () => {
          timers.clearTimeout(entry.timer);
          pending.delete(entry);
        });
        return;
      }
      case "reset":
        // The delivery is already recorded (the body was read first); no status line, the socket goes.
        res.socket?.destroy();
        return;
      case "timeout": {
        // Never answered: the socket stays open until the client gives up or stop() runs.
        const entry: Pending = { res, timer: undefined };
        pending.add(entry);
        res.on("close", () => pending.delete(entry));
        return;
      }
    }
  }

  function handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? "/", "http://receiver.invalid");
    if (req.method === "GET" && url.pathname === HEALTH_PATH) {
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
      return;
    }
    const match = PATH_PATTERN.exec(url.pathname);
    const runId = match?.[1];
    const testId = match?.[2];
    if (
      runId === undefined ||
      testId === undefined ||
      !RUN_PREFIX_PATTERN.test(runId) ||
      !TEST_ID_PATTERN.test(testId)
    ) {
      counters.unmatched += 1;
      req.resume();
      res.writeHead(404).end();
      return;
    }
    const key: PathKey = { runId, testId };
    const chunks: Buffer[] = [];
    let size = 0;
    let tooBig = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBody) {
        tooBig = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooBig) {
        counters.oversize += 1;
        res.writeHead(413).end();
        return;
      }
      const mode = modes.get(keyOf(key)) ?? { kind: "ok" as const };
      const rawBody = Buffer.concat(chunks);
      counters.seq += 1;
      const attempt = (delivered.get(keyOf(key))?.length ?? 0) + 1;
      record({
        ...key,
        attempt,
        seq: counters.seq,
        receivedAt: now().toISOString(),
        method: req.method ?? "",
        path: url.pathname,
        headers: req.headers,
        rawBody,
        bodySha256: createHash("sha256").update(rawBody).digest("hex"),
        bodyBytes: rawBody.length,
        remoteAddress: req.socket.remoteAddress,
        mode: mode.kind,
      });
      respond(res, mode, key);
    });
  }

  const servers: http.Server[] = [];
  let port = options.port;
  try {
    for (const host of hosts) {
      const server = http.createServer(handle);
      server.on("connection", (socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      });
      servers.push(server);
      port = (server.address() as AddressInfo).port;
    }
  } catch (error) {
    await Promise.all(
      servers.map(
        (s) =>
          new Promise<void>((r) =>
            s.close(() => {
              r();
            }),
          ),
      ),
    );
    log?.end();
    throw error;
  }

  const receiver: Receiver = {
    port,
    hosts,
    urlFor(key, host) {
      assertPathKey(key);
      return `http://${host ?? hosts[0] ?? "127.0.0.1"}:${String(port)}/r/${key.runId}/${key.testId}`;
    },
    setMode(key, mode) {
      assertPathKey(key);
      assertMode(mode);
      modes.set(keyOf(key), mode);
    },
    getMode(key) {
      assertPathKey(key);
      return modes.get(keyOf(key)) ?? { kind: "ok" };
    },
    deliveries(key) {
      assertPathKey(key);
      return (delivered.get(keyOf(key)) ?? []).map((d) => ({
        ...d,
        rawBody: Buffer.from(d.rawBody),
      }));
    },
    awaitDeliveryCount(key, count, signal) {
      assertPathKey(key);
      if ((delivered.get(keyOf(key))?.length ?? 0) >= count) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const waiter = { key: keyOf(key), count, resolve, reject };
        const onAbort = (): void => {
          waiters.delete(waiter);
          reject(
            new ReceiverError(`timed out waiting for ${String(count)} deliveries on ${waiter.key}`),
          );
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        waiters.add(waiter);
        signal.addEventListener("abort", onAbort, { once: true });
      });
    },
    pendingResponses: () => pending.size,
    stats: () => ({ unmatched: counters.unmatched, oversize: counters.oversize }),
    async stop() {
      if (stopped) return;
      stopped = true;
      for (const entry of pending) timers.clearTimeout(entry.timer);
      pending.clear();
      for (const socket of sockets) socket.destroy();
      await Promise.all(
        servers.map(
          (s) =>
            new Promise<void>((r) =>
              s.close(() => {
                r();
              }),
            ),
        ),
      );
      for (const waiter of waiters)
        waiter.reject(new ReceiverError("receiver stopped while waiting"));
      waiters.clear();
      if (log) {
        const stream = log;
        await new Promise<void>((r) =>
          stream.end(() => {
            r();
          }),
        );
      }
    },
  };
  return receiver;
}
