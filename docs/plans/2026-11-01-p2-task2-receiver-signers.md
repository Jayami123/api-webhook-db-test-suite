# P2 foundation Task 2: webhook receiver, signers and verifiers (plan only)

This is the plan a smaller model builds from, task after task, with no questions. It follows the
depth of `docs/reference/p1-plan-example-medusa.md` and `docs/plans/2026-10-21-p2-phase1-task1-framework.md`.
It replaces roadmap Task 2 (`docs/plans/2026-10-20-p2-phase1-roadmap.md`), and the receiver design
there changes where the senior review of 2026-11 binds (section 3, D5 to D8). Index of the whole
foundation: `docs/plans/2026-11-01-p2-foundation-index.md`.

## 1. Header

- Repo: `api-webhook-db-test-suite` (P2). Plan branch: `plan/2026-11-01-p2-foundation` (never merged, no PR).
- Base commit (plan time): `main` = `fd554c901e82a7a936fb0074af42de6b26f56ab1` (merge of PR #4). Task 1 is in it
  (`f166cda`). Unit count on main: **102** (`npm run check` exit 0; probe P7).
- Build branch: `feat/<build-date>-p2-task2-receiver-signers`, `<build-date>` = the UTC day the build starts
  (`date -u +%F`). Cut from fetched `origin/main`. PR base: `main`.
- Depends on: Task 1 only. Next task: Task 3 (stacked on this branch).
- Harness: stays `qa-portfolio-harness#v0.2.11`; this task never runs a product. Latest tag read for the whole
  foundation: `v0.2.18` = `de561c56f9307321358e7c682ed48949229f57a0` (Task 5 bumps the pin).
- Probe date 2026-11-01, Claude Code cloud VM: Node v22.23.3 (`/usr/local/bin`), v24.22.0 (`$NODE24`), npm 10.9.9,
  Docker 29.9.2, Playwright 1.64.0, 4 cores, 15 GB RAM. Product forks at the pinned refs of `scripts/bootstrap.sh`
  (Cal `c2b7ac4`, Documenso `f4105e4`, Medusa starter `f677db4`, Twenty `7cbdfec`, image `v2.44.0`).
- Verification of this plan: every code block in section 6 was built in a scratch copy of `main`
  (outside the repo) with the pins below. `npm run check` exit 0, **172 tests, 172 pass**; the receiver file
  passed 40 runs in a row and the whole unit suite 15 runs in a row.

## 2. Probe findings (raw, trimmed; secrets redacted)

### 2.1 Signing constructions at the pinned refs

| Scheme | Fact | Source (pinned ref) |
|---|---|---|
| Cal outgoing | `POST`, header `X-Cal-Signature-256` = hex HMAC-SHA256 of the body string (UTF-8) keyed by the secret; no timestamp. No secret sends the literal `no-secret-provided`. Also `Content-Type`, `X-Cal-Webhook-Version`, `redirect: "manual"`, no timeout. | `packages/features/webhooks/lib/sendPayload.ts:296-299, 312-322` |
| Cal scheduled triggers | Fire-and-delete: the job row is deleted right after the fetch is started, and rows older than 1 day are purged first. Same signature header. At most once. | `packages/features/webhooks/lib/handleWebhookScheduledTriggers.ts:9-12, 60-83` |
| Cal immediate triggers | With `TASKER_ENABLE_WEBHOOKS=1` the payload goes through the tasker (`sendWebhook`, 3 attempts), but `sendPayload` returns `{ok:false,status}` on a 500 and does not throw, so the task **succeeds on attempt 1**. A receiver 500 is not retried. Only a thrown error (connection failure) is. | `sendOrSchedulePayload.ts:7-9`, `tasker/tasks/sendWebook.ts:21-27`, `sendPayload.ts:324-327`, `tasker/repository.ts:129-146` |
| Cal Daily inbound | HMAC-SHA256 keyed with the **base64-decoded** `DAILY_WEBHOOK_SECRET`, text `${x-webhook-timestamp}.${JSON.stringify(parsedBody)}`, **base64** digest, header `x-webhook-signature`. A missing timestamp header becomes the text `null`. No tolerance check. Mismatch: 403 `Signature does not match`. No secret: 405 `No Daily Webhook Secret`. The check is skipped when `NEXT_PUBLIC_IS_E2E` or `INTEGRATION_TEST_MODE` is truthy (`.env` ships `NEXT_PUBLIC_IS_E2E=` empty = off). | `apps/web/app/api/recorded-daily-video/route.ts:40-45, 62-75` |
| Documenso outgoing | `POST` JSON, header `X-Documenso-Secret: <secret ?? "">`, `redirect: "manual"`, `WEBHOOK_TIMEOUT_MS = 10_000`. Send-time SSRF check `assertNotPrivateUrl` skips hosts in `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS` (read once at module load). **Create-time** zod check `ZWebhookUrlSchema` refuses a literal private or loopback host with no bypass. Retries: local job provider, `maxRetries` 3. | `packages/lib/server-only/webhooks/execute-webhook-call.ts`, `assert-webhook-url.ts:35-60`, `packages/trpc/server/webhook-router/schema.ts:6-14`, `packages/lib/jobs/client/local.ts:318`, `schema.prisma:1129` |
| Twenty outgoing | Headers `X-Twenty-Webhook-Timestamp` (`Date.now()` ms as decimal text), `X-Twenty-Webhook-Signature` = hex HMAC-SHA256 of `${timestamp}:${JSON.stringify(payloadWithoutSecret)}`, `X-Twenty-Webhook-Nonce` (16 random bytes hex, **not signed**). Sent only when the webhook has a secret. axios timeout 5000 ms. The job catches every error and returns, so the queue never retries. Private hosts need `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS` (not env-only). | `packages/twenty-server/src/engine/metadata-modules/webhook/jobs/call-webhook.job.ts` (`generateSignature`, header block, `timeout: 5_000`), `secure-http-client.service.ts:62-70`, `twenty-config/config-variables.ts:100-106` |
| Stripe | `Stripe-Signature: t=<seconds>,v1=<hex>`. Verification and header generation come from the official SDK only. `Stripe.webhooks.DEFAULT_TOLERANCE` = 300. Medusa, Documenso and Twenty all call `stripe.webhooks.constructEvent`. | stripe 23.0.1 `esm/Webhooks.js`; Medusa `payment-stripe/dist/core/stripe-base.js:514`; Documenso `packages/ee/server-only/stripe/webhook/handler.ts:72`; Twenty `billing/stripe/services/stripe-webhook.service.ts:31` |

### 2.2 Live shapes (probe P4, 2026-11-01, one stack at a time, each ended with `down`)

Cal (web process, `testTrigger` through `sendPayload`), receiver on `127.0.0.1:4317`:

```text
headers: host, connection=keep-alive, content-type=application/json, x-cal-signature-256=<64 hex>,
         x-cal-webhook-version=2021-10-20, accept=*/*, user-agent=node, content-length=455
body keys: triggerEvent, createdAt, payload     HMAC-SHA256(secret, raw bytes) == header: true
Daily route (DAILY_WEBHOOK_SECRET in the environment of `up`):
  reserialised signature over a spaced body -> 400 {"message":"Invalid Payload"}   (signature accepted, then business 400)
  raw signature over the same spaced body   -> 403 {"message":"Signature does not match"}
  tampered body with the original signature -> 403;  no signature headers -> 403
```

Documenso (host process, hostname `p2-receiver.test` mapped to 127.0.0.1, listed in the bypass variable):

```text
create webhook with http://127.0.0.1:4317/...  -> 400 "Webhook URL cannot point to a private or loopback address"
headers: host=p2-receiver.test:4317, content-type=application/json, x-documenso-secret=<equals configured: true>,
         user-agent=node, content-length=2086          body keys: event, payload, createdAt, webhookEndpoint
receiver mode 500: 4 deliveries for one event within ~80 ms (initial + 3 retries, no back-off);
  BackgroundJob FAILED retried=3 maxRetries=3; WebhookCall rows recorded
```

Twenty (container; receiver on the compose network gateway 172.18.0.1):

```text
headers: content-type, x-twenty-webhook-timestamp=1793519354730 (13 digits, ms), x-twenty-webhook-signature=<64 hex>,
         x-twenty-webhook-nonce=<32 hex>, user-agent=axios/1.19.0, content-length=1232
body keys: targetUrl, eventName, objectMetadata, workspaceId, webhookId, eventDate, record
HMAC-SHA256(secret, "<timestamp>:<raw body>") == header: true
receiver mode 500, watched 45 s: 1 request in total
```

### 2.3 Stripe through the SDK (probe, stripe 23.0.1)

```text
Stripe.webhooks.generateTestHeaderString({payload, secret}) -> t=<s>,v1=<64 hex>
constructEvent: accepted; wrong secret -> "No signatures found matching the expected signature..."
timestamp now-600 s -> "Timestamp outside the tolerance zone"; now-290 s accepted; payload+" " -> "No signatures found..."
This 23.0.1 header was accepted live by Documenso (stripe 12.18.0) and by Medusa (stripe 19.1.0): same v1 scheme.
```

### 2.4 Receiver reach (probe P3: default bridge, `--add-host host.docker.internal:host-gateway`, Docker 29.9.2)

```text
docker network inspect bridge  -> gateway 172.17.0.1;  host.docker.internal resolves to 172.17.0.1
listener bound 127.0.0.1:4317     -> container: wget connect refused
listener bound 172.17.0.1:4317    -> container: ok
listener bound 0.0.0.0:4317       -> container: ok
```

Decision (evidence above): the receiver binds an **explicit list**: loopback plus the gateway of the Docker
network the product's containers use. `0.0.0.0` is refused by the config. Reasons: loopback alone is unreachable
from containers; a gateway bind is reachable only from that bridge and the host; `0.0.0.0` would also expose a
sink that can answer 500, slow or redirect on demand to every interface of a developer machine or a shared
cloud VM. A hosted CI runner is a single-tenant VM, so `0.0.0.0` would be safe there, but one rule for all
environments is easier to review. Compose project networks have their own gateway (Twenty: `172.18.0.1`, not
`172.17.0.1`), so the bind list is built per product after its stack is up (Task 5).

### 2.5 Dependency (D11 cooldown, probe date 2026-11-01)

`stripe` newest versions: 23.0.0 (2026-10-01), 23.0.1 (2026-10-22), 23.1.0 (2026-10-29). Cutoff for a 2026-11-01
build is 2026-10-25, so **23.0.1** is the newest at least 7 days old; it has no runtime dependencies (peer
`@types/node >=16`). `npm install --save-dev --save-exact --before=2026-10-25T00:00:00Z stripe` changes only
`package.json` (+1 line) and `package-lock.json` (+19 lines). `npm audit --audit-level=high` reports only the
moderate `fast-uri` and `minimatch` advisories that already exist on `main` (dev tooling), none from `stripe`.

## 3. Resolved decisions (industry standard first)

- **D1. Receiver on `node:http` with a `Buffer` captured from the stream.** Raw bytes are the only input to an
  HMAC. Rejected: Express or Fastify with body parsers (parse or re-serialise before the handler; a signature
  test would then pass or fail for the wrong reason); a mock-server product such as WireMock (heavy, a container,
  and it cannot hold the per-path mode API we need).
- **D2. Path `/r/{runId}/{testId}`.** Webhooks are global per user or workspace, so concurrent tests would see
  each other's deliveries; one path per test and a filter by run id isolates them. `runId` must match
  `RUN_PREFIX_PATTERN`, `testId` must match `[a-z0-9][a-z0-9-]{0,63}`. Anything else is a 404 that is counted, not
  recorded.
- **D3. Modes `ok|500|slow|timeout|redirect`, switchable per path at runtime.** `slow` and `timeout` use an
  **injected timer** (`Timers`), so unit tests drive them without waiting. `timeout` never answers until the
  client gives up or `stop()` runs. `redirect` answers 302 (or the given status) to the path plus `/redirected`,
  which is itself a recorded path: a client that followed would show up as a second delivery (positive control for
  the products that send `redirect: "manual"`).
- **D4. JSONL log, one line per delivery.** Fields: `v,ts,seq,method,path,runId,testId,attempt,mode,remoteAddress,headers,bodySha256,bodyBytes`.
  Secret headers are replaced by `<redacted:N>` (length only). The body text is **not** logged (hash and length
  only), because bodies can carry tokens. The raw body stays in memory for assertions.
- **D5. Explicit bind list, wildcard refused** (section 2.4). `P2_RECEIVER_HOSTS` (comma separated IP literals,
  default `127.0.0.1`) and `P2_RECEIVER_PORT` (1024-65535, default 4317).
- **D6. Signers return `{headers, body}` where `body` is the `Buffer` that was signed.** The test cannot sign one
  byte sequence and send another. All inputs, including timestamps and nonces, are parameters (pure functions).
- **D7. Daily has two modes.** `raw` signs the bytes as sent; `reserialised` signs `JSON.stringify(JSON.parse(bytes))`,
  which is what Cal recomputes. Live proof in 2.2. Groundwork for P2-CAL-DLY-001 and P2-CAL-DLY-002.
- **D8. Stripe only through the SDK** (`Stripe.webhooks.generateTestHeaderString` and `constructEvent`), static
  methods, no API key and no network. The 300 s tolerance is read from `Stripe.webhooks.DEFAULT_TOLERANCE`, never
  hard-coded. Rejected: a hand-rolled `t=,v1=` signer (drifts from the verifier); the Stripe CLI (account and
  network).
- **D9. Verifiers take the tolerance as a parameter for Twenty and Daily.** The products document none (Cal's
  route checks no timestamp), so P2 must not invent a constant: callers pass a number or `null`. Stripe's comes
  from the SDK.
- **D10. `awaitDeliveryCount` is event driven and for node:test units only.** Playwright specs wait with
  `expect.poll(() => receiver.deliveries(key).length, { timeout: <named SLO> })` (AGENTS.md).
- **D11. Gateway discovery is a tiny helper** (`docker network inspect <name> --format '{{(index .IPAM.Config 0).Gateway}}'`)
  with an injectable runner, so units never need Docker.
- **D12. Known gap, stated:** a unit test cannot bind a second loopback address portably (macOS and Windows do not
  have `127.0.0.2`), so the multi-host bind is proven by the P3 probe above and by the Task 5 readiness spec
  (Twenty binds loopback plus gateway). The unit suite proves the failure path (second bind fails, first server is
  closed).

## 4. Case mapping

Existing master-plan IDs only. Nothing here executes a product case; the pieces prepare:

| Piece | Prepares |
|---|---|
| receiver (paths, modes, log, query) | P2-CAL-WH-001/002/003, P2-CAL-SCH-002 (exactly one delivery), P2-CAL-TASK-001/002, P2-DOC-WH-001..005, P2-TW-WH-001..006 |
| `signCal` / `verifyCal` | P2-CAL-WH-001 |
| `signDaily` (raw, reserialised) / `verifyDaily` | P2-CAL-DLY-001, P2-CAL-DLY-002 |
| `signDocumenso` / `verifyDocumenso` | P2-DOC-WH-001 |
| `signTwenty` / `verifyTwenty` | P2-TW-WH-001, P2-TW-WH-002 |
| `signStripe` / `verifyStripe` | P2-DOC-STR-001/002/003, P2-MED-WH-001..007, P2-TW-STR-001 |

**P2-X-WH-001** is the label the brief uses for the webhook framework checks below. It is **not an ID in
`docs/master-plan.html`** (its cross-cutting sections are named `X-P2-CON` only). It is used here as a label,
exactly as given, and recorded as open decision OD-1.

Framework checks (inside the framework, not new case IDs): replay (the same signed request verifies twice and
the receiver does not de-duplicate), tamper (one flipped byte, per scheme), wrong secret, missing header,
malformed header, stale timestamp (Stripe, Twenty, Daily with a tolerance), boundary (Stripe exactly 300 s passes,
301 s fails), concurrency (three paths in parallel do not mix), leak (no server or socket left after `stop()`).

## 5. Architecture (one responsibility per file)

| File | Change | Responsibility |
|---|---|---|
| `src/webhooks/redact.ts` | new | which headers are secret, and the redacted form |
| `src/webhooks/sign.ts` | new | five signers, pure |
| `src/webhooks/verify.ts` | new | five verifiers over raw bytes, pure |
| `src/webhooks/receiver.ts` | new | `node:http` sink, modes, JSONL log, query API |
| `src/webhooks/docker-net.ts` | new | gateway of a Docker network, injectable runner |
| `src/env.ts` | edit | `P2_RECEIVER_HOSTS`, `P2_RECEIVER_PORT`, `receiverConfig()` |
| `.env.example` | edit | replace `P2_RECEIVER_HOST` by `P2_RECEIVER_HOSTS` |
| `package.json`, `package-lock.json` | edit | `stripe` 23.0.1 (devDependency, exact) |
| `tests/unit/webhooks/{vectors.ts,redact,sign,verify,receiver,docker-net}.test.ts` | new | 67 tests |
| `tests/unit/env.test.ts` | edit | +3 tests |

Not touched: `.gitignore` (already ignores `receiver-logs/`), `eslint.config.mjs` (the sleep ban applies to
`tests/webhooks/**`, not to `src/` or `tests/unit/**`), CI workflows, the harness, the forks.

## 6. Module contracts (exact code, built and tested in the scratch copy)

### 6.1 Dependency

```bash
export PATH="/usr/local/bin:$PATH"
CUTOFF="$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)"
npm install --save-dev --save-exact --before="$CUTOFF" stripe
```

Expected on 2026-11-01..11-04: `package.json` gains `"stripe": "23.0.1"` between `prettier` and `typescript`. If the
build day is 2026-11-05 or later and npm resolves 23.1.0 or newer, keep what npm resolves (that is the rule), run
the tests, and if a test about the SDK's messages or tolerance fails, **STOP** (a fact contradicts the plan).

`package.json` (diff)

```diff
--- a/package.json
+++ b/package.json
@@ -36,4 +36,5 @@
     "pg": "8.23.1",
     "prettier": "3.9.10",
+    "stripe": "23.0.1",
     "typescript": "6.0.3",
     "typescript-eslint": "8.71.2",
```

### 6.2 `src/webhooks/redact.ts`

`src/webhooks/redact.ts`

```ts
/**
 * Header redaction shared by the receiver log and (later) trace/report redaction.
 * Values of these headers are credentials or signatures. They are replaced by a fixed marker that
 * keeps only the length, so a log still shows "a 64-char value was present".
 */
export const SECRET_HEADER_NAMES: ReadonlySet<string> = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-cal-signature-256", // sendPayload.ts:316
  "x-documenso-secret", // execute-webhook-call.ts: headers block
  "x-twenty-webhook-signature", // call-webhook.job.ts: headers[...Signature]
  "x-webhook-signature", // recorded-daily-video/route.ts:73
  "stripe-signature",
]);

export function redactHeaderValue(value: string): string {
  return `<redacted:${String(value.length)}>`;
}

/** Lower-cases names, joins repeated values with ", ", redacts secret headers. Pure. */
export function redactHeaders(
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(headers)) {
    if (rawValue === undefined) continue;
    const name = rawName.toLowerCase();
    const value = typeof rawValue === "string" ? rawValue : rawValue.join(", ");
    out[name] = SECRET_HEADER_NAMES.has(name) ? redactHeaderValue(value) : value;
  }
  return out;
}
```

### 6.3 `src/webhooks/sign.ts`

`src/webhooks/sign.ts`

```ts
import { createHmac } from "node:crypto";
import Stripe from "stripe";

/**
 * Signers for the five schemes P2 simulates or checks (plan section 2, facts 1-5). Pure: every
 * input, including timestamps and nonces, is a parameter. Each signer returns the exact bytes to
 * send together with the headers, so a test cannot sign one byte sequence and send another.
 * Source lines are at the pinned product refs (scripts/bootstrap.sh).
 */
export type BodyInput = string | Uint8Array;

export interface SignedRequest {
  /** Header names exactly as the product sends them. */
  readonly headers: Readonly<Record<string, string>>;
  /** The bytes that were signed and must be sent unchanged. */
  readonly body: Buffer;
}

export function toBuffer(body: BodyInput): Buffer {
  return typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
}

// ---- Cal outgoing: packages/features/webhooks/lib/sendPayload.ts:296-299 and :316 ----
export const CAL_SIGNATURE_HEADER = "X-Cal-Signature-256";
/** sendPayload.ts:299: the literal Cal sends when the webhook has no secret. */
export const CAL_NO_SECRET_SIGNATURE = "no-secret-provided";

/** HMAC-SHA256 hex over the body's UTF-8 bytes. No timestamp. `null` secret = Cal's literal. */
export function signCal(input: { secret: string | null; body: BodyInput }): SignedRequest {
  const body = toBuffer(input.body);
  const signature = input.secret
    ? createHmac("sha256", input.secret).update(body).digest("hex")
    : CAL_NO_SECRET_SIGNATURE;
  return { headers: { [CAL_SIGNATURE_HEADER]: signature }, body };
}

// ---- Documenso outgoing: packages/lib/server-only/webhooks/execute-webhook-call.ts ----
export const DOCUMENSO_SECRET_HEADER = "X-Documenso-Secret";

/** No HMAC and no timestamp: the configured secret is sent as-is (`secret ?? ''`). */
export function signDocumenso(input: { secret: string | null; body: BodyInput }): SignedRequest {
  return {
    headers: { [DOCUMENSO_SECRET_HEADER]: input.secret ?? "" },
    body: toBuffer(input.body),
  };
}

// ---- Twenty outgoing: .../webhook/jobs/call-webhook.job.ts (generateSignature + headers) ----
export const TWENTY_TIMESTAMP_HEADER = "X-Twenty-Webhook-Timestamp";
export const TWENTY_SIGNATURE_HEADER = "X-Twenty-Webhook-Signature";
export const TWENTY_NONCE_HEADER = "X-Twenty-Webhook-Nonce";

/**
 * HMAC-SHA256 hex over `${timestamp}:${body}`. The timestamp is Date.now() in milliseconds as a
 * decimal string. The nonce is random per delivery and is NOT part of the signed text.
 */
export function signTwenty(input: {
  secret: string;
  body: BodyInput;
  timestampMs: number;
  nonce: string;
}): SignedRequest {
  const body = toBuffer(input.body);
  const timestamp = String(input.timestampMs);
  const signature = createHmac("sha256", input.secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}:`, "utf8"), body]))
    .digest("hex");
  return {
    headers: {
      [TWENTY_TIMESTAMP_HEADER]: timestamp,
      [TWENTY_SIGNATURE_HEADER]: signature,
      [TWENTY_NONCE_HEADER]: input.nonce,
    },
    body,
  };
}

// ---- Cal inbound (Daily): apps/web/app/api/recorded-daily-video/route.ts:40-45, :70-73 ----
export const DAILY_TIMESTAMP_HEADER = "x-webhook-timestamp";
export const DAILY_SIGNATURE_HEADER = "x-webhook-signature";

/**
 * Mirror of Cal's `computeSignature(hmacSecret, reqBody, webhookTimestampHeader)`: HMAC-SHA256
 * keyed with the base64-DECODED secret over `${timestamp}.${JSON.stringify(parsedBody)}`, base64
 * digest. A missing timestamp header becomes the text "null" (template literal, route.ts:41).
 */
export function computeDailySignature(
  secretBase64: string,
  parsedBody: unknown,
  timestamp: string | null,
): string {
  return createHmac("sha256", Buffer.from(secretBase64, "base64"))
    .update(`${String(timestamp)}.${JSON.stringify(parsedBody)}`)
    .digest("base64");
}

/**
 * `raw`: sign the bytes as sent. Valid at Cal only when those bytes already equal
 * JSON.stringify(JSON.parse(bytes)) (compact, key order kept).
 * `reserialised`: sign what Cal recomputes after parsing (route.ts:40-45), so the signature stays
 * valid for any whitespace or escaping in the sent bytes.
 */
export type DailySigningMode = "raw" | "reserialised";

export function signDaily(input: {
  secretBase64: string;
  body: BodyInput;
  timestamp: string | null;
  mode: DailySigningMode;
}): SignedRequest {
  const body = toBuffer(input.body);
  const text = body.toString("utf8");
  const signedText = input.mode === "raw" ? text : JSON.stringify(JSON.parse(text));
  const signature = createHmac("sha256", Buffer.from(input.secretBase64, "base64"))
    .update(`${String(input.timestamp)}.${signedText}`)
    .digest("base64");
  const headers: Record<string, string> = { [DAILY_SIGNATURE_HEADER]: signature };
  if (input.timestamp !== null) headers[DAILY_TIMESTAMP_HEADER] = input.timestamp;
  return { headers, body };
}

// ---- Stripe (Medusa /hooks/payment/..., Documenso and Twenty billing): official SDK only ----
export const STRIPE_SIGNATURE_HEADER = "Stripe-Signature";
/** The SDK's own tolerance in seconds (300 at stripe 23.0.1). Never hard-coded here. */
export const STRIPE_DEFAULT_TOLERANCE_SECONDS: number = Stripe.webhooks.DEFAULT_TOLERANCE;

/** `Stripe-Signature: t=<seconds>,v1=<hex>` from stripe-node's generateTestHeaderString. */
export function signStripe(input: {
  payload: BodyInput;
  secret: string;
  timestampSeconds: number;
}): SignedRequest {
  const body = toBuffer(input.payload);
  const header = Stripe.webhooks.generateTestHeaderString({
    payload: body.toString("utf8"),
    secret: input.secret,
    timestamp: input.timestampSeconds,
  });
  return { headers: { [STRIPE_SIGNATURE_HEADER]: header }, body };
}
```

### 6.4 `src/webhooks/verify.ts`

`src/webhooks/verify.ts`

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import {
  CAL_NO_SECRET_SIGNATURE,
  CAL_SIGNATURE_HEADER,
  computeDailySignature,
  DAILY_SIGNATURE_HEADER,
  DAILY_TIMESTAMP_HEADER,
  DOCUMENSO_SECRET_HEADER,
  STRIPE_SIGNATURE_HEADER,
  toBuffer,
  TWENTY_SIGNATURE_HEADER,
  TWENTY_TIMESTAMP_HEADER,
  type BodyInput,
} from "./sign.ts";

/**
 * Verifiers: what a correct receiver (or the product, for inbound schemes) computes. All of them
 * work on the RAW body bytes. Failure reasons are fixed strings so tests can assert them.
 */
export type VerifyFailure =
  | "missing-header"
  | "malformed-header"
  | "malformed-body"
  | "signature-mismatch"
  | "stale-timestamp";

export type VerifyResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: VerifyFailure };

export type HeaderBag = Readonly<Record<string, string | readonly string[] | undefined>>;

const OK: VerifyResult = { ok: true };
const fail = (reason: VerifyFailure): VerifyResult => ({ ok: false, reason });

/** Case-insensitive single-value lookup. Repeated headers count as missing (ambiguous). */
export function headerValue(headers: HeaderBag, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== wanted || value === undefined) continue;
    return typeof value === "string" ? value : value.length === 1 ? value[0] : undefined;
  }
  return undefined;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Cal outgoing: sendPayload.ts:296-299. No timestamp, so there is no stale case. */
export function verifyCal(input: {
  secret: string | null;
  rawBody: BodyInput;
  headers: HeaderBag;
}): VerifyResult {
  const received = headerValue(input.headers, CAL_SIGNATURE_HEADER);
  if (received === undefined) return fail("missing-header");
  const expected = input.secret
    ? createHmac("sha256", input.secret).update(toBuffer(input.rawBody)).digest("hex")
    : CAL_NO_SECRET_SIGNATURE;
  return constantTimeEqual(received, expected) ? OK : fail("signature-mismatch");
}

/** Documenso outgoing: the header must equal the configured secret (no HMAC, no timestamp). */
export function verifyDocumenso(input: { secret: string; headers: HeaderBag }): VerifyResult {
  const received = headerValue(input.headers, DOCUMENSO_SECRET_HEADER);
  if (received === undefined) return fail("missing-header");
  return constantTimeEqual(received, input.secret) ? OK : fail("signature-mismatch");
}

/**
 * Twenty outgoing. `toleranceMs` is a P2 receiver policy, not a product rule (the product sends a
 * timestamp but documents no tolerance), so the caller must choose: a number, or `null` for none.
 */
export function verifyTwenty(input: {
  secret: string;
  rawBody: BodyInput;
  headers: HeaderBag;
  nowMs: number;
  toleranceMs: number | null;
}): VerifyResult {
  const timestamp = headerValue(input.headers, TWENTY_TIMESTAMP_HEADER);
  const received = headerValue(input.headers, TWENTY_SIGNATURE_HEADER);
  if (timestamp === undefined || received === undefined) return fail("missing-header");
  if (!/^\d{1,16}$/.test(timestamp)) return fail("malformed-header");
  const expected = createHmac("sha256", input.secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}:`, "utf8"), toBuffer(input.rawBody)]))
    .digest("hex");
  if (!constantTimeEqual(received, expected)) return fail("signature-mismatch");
  if (input.toleranceMs !== null && Math.abs(input.nowMs - Number(timestamp)) > input.toleranceMs) {
    return fail("stale-timestamp");
  }
  return OK;
}

/**
 * Cal inbound (Daily), as Cal itself verifies it: parse the body, re-serialise, sign. Cal checks
 * no tolerance (route.ts:62-75), so staleness is opt-in through `toleranceSeconds` (P2 policy).
 */
export function verifyDaily(input: {
  secretBase64: string;
  rawBody: BodyInput;
  headers: HeaderBag;
  nowSeconds: number;
  toleranceSeconds: number | null;
}): VerifyResult {
  const received = headerValue(input.headers, DAILY_SIGNATURE_HEADER);
  if (received === undefined) return fail("missing-header");
  const timestamp = headerValue(input.headers, DAILY_TIMESTAMP_HEADER) ?? null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(toBuffer(input.rawBody).toString("utf8"));
  } catch {
    return fail("malformed-body");
  }
  const expected = computeDailySignature(input.secretBase64, parsed, timestamp);
  if (!constantTimeEqual(received, expected)) return fail("signature-mismatch");
  if (input.toleranceSeconds !== null && timestamp !== null) {
    if (!/^\d{1,16}$/.test(timestamp)) return fail("malformed-header");
    if (Math.abs(input.nowSeconds - Number(timestamp)) > input.toleranceSeconds) {
      return fail("stale-timestamp");
    }
  }
  return OK;
}

/**
 * Stripe: the SDK verifier, so the construction can never drift from the signer. The SDK throws
 * StripeSignatureVerificationError; its message selects the failure. `nowMs` feeds the SDK's
 * `receivedAt` parameter, which keeps the stale check deterministic.
 */
export function verifyStripe(input: {
  secret: string;
  rawBody: BodyInput;
  headers: HeaderBag;
  nowMs: number;
  toleranceSeconds?: number;
}): VerifyResult {
  const header = headerValue(input.headers, STRIPE_SIGNATURE_HEADER);
  if (header === undefined) return fail("missing-header");
  try {
    Stripe.webhooks.constructEvent(
      toBuffer(input.rawBody).toString("utf8"),
      header,
      input.secret,
      input.toleranceSeconds ?? Stripe.webhooks.DEFAULT_TOLERANCE,
      undefined,
      input.nowMs,
    );
    return OK;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("tolerance zone")) return fail("stale-timestamp");
    if (message.includes("Unable to extract timestamp and signatures")) {
      return fail("malformed-header");
    }
    if (message.includes("No signatures found")) return fail("signature-mismatch");
    if (error instanceof SyntaxError) return fail("malformed-body"); // verified, then not JSON
    throw error;
  }
}
```

### 6.5 `src/webhooks/receiver.ts`

`src/webhooks/receiver.ts`

```ts
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
```

### 6.6 `src/webhooks/docker-net.ts`

`src/webhooks/docker-net.ts`

```ts
import { execFile } from "node:child_process";
import { isIP } from "node:net";

/**
 * Host-side address that containers on a Docker network use to reach this machine: the network's
 * gateway. Containers reach a host listener bound to it (plan Task 2, probe P3). The default
 * bridge is called "bridge"; a compose project network is "<project>_default".
 */
export type DockerRunner = (args: readonly string[]) => Promise<string>;

export const dockerRunner: DockerRunner = (args) =>
  new Promise((resolve, reject) => {
    execFile("docker", [...args], { timeout: 10_000, windowsHide: true }, (error, stdout) => {
      if (error) reject(new Error(`docker ${args[0] ?? ""} failed (exit ${String(error.code)})`));
      else resolve(stdout);
    });
  });

export function parseGateway(output: string): string {
  const value = output.trim();
  if (isIP(value) !== 4 || value === "0.0.0.0") {
    throw new Error(
      `TEST BUG: docker network gateway is not an IPv4 address: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

export async function networkGateway(
  network: string,
  run: DockerRunner = dockerRunner,
): Promise<string> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(network)) {
    throw new Error(`TEST BUG: invalid docker network name ${JSON.stringify(network)}`);
  }
  const output = await run([
    "network",
    "inspect",
    network,
    "--format",
    "{{(index .IPAM.Config 0).Gateway}}",
  ]);
  return parseGateway(output);
}
```

### 6.7 `src/env.ts` and `.env.example`

`src/env.ts` (diff)

```diff
--- a/src/env.ts
+++ b/src/env.ts
@@ -1,2 +1,3 @@
+import { isIP } from "node:net";
 import * as z from "zod";
 
@@ -26,4 +27,26 @@ const loopbackPgUrl = z.string().trim().refine(isLoopbackPgUrl, {
 });
 
+/** An explicit IP literal. Wildcards would expose the receiver beyond this machine, so they are refused. */
+const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "[::]"]);
+const bindHostList = z
+  .string()
+  .trim()
+  .transform((raw) =>
+    raw
+      .split(",")
+      .map((part) => part.trim())
+      .filter((part) => part !== ""),
+  )
+  .pipe(
+    z
+      .array(
+        z.string().refine((host) => isIP(host) !== 0 && !WILDCARD_HOSTS.has(host), {
+          message:
+            "must be explicit IP literals (no 0.0.0.0 or ::); wildcards expose the receiver beyond this machine",
+        }),
+      )
+      .min(1),
+  );
+
 // Defaults are the harness's public local defaults (qa-portfolio-harness v0.2.11 src/config.ts),
 // with localhost rewritten to 127.0.0.1. They are not secrets. Never log a URL taken from env.
@@ -50,4 +73,9 @@ const schema = z.object({
     loopbackPgUrl.default("postgres://postgres:postgres@127.0.0.1:5434/default"),
   ),
+  P2_RECEIVER_HOSTS: z.preprocess(blankToUndefined, bindHostList.default(["127.0.0.1"])),
+  P2_RECEIVER_PORT: z.preprocess(
+    blankToUndefined,
+    z.coerce.number().int().min(1024).max(65535).default(4317),
+  ),
   P2_DB_STATEMENT_TIMEOUT_MS: z.preprocess(
     blankToUndefined,
@@ -93,2 +121,11 @@ export function dbStatementTimeoutMs(env: NodeJS.ProcessEnv = process.env): numb
   return loadEnv(env).P2_DB_STATEMENT_TIMEOUT_MS;
 }
+
+/** Where the webhook receiver binds (src/webhooks/receiver.ts). Loopback unless the caller adds more. */
+export function receiverConfig(env: NodeJS.ProcessEnv = process.env): {
+  readonly hosts: readonly string[];
+  readonly port: number;
+} {
+  const parsed = loadEnv(env);
+  return { hosts: parsed.P2_RECEIVER_HOSTS, port: parsed.P2_RECEIVER_PORT };
+}
```

In `.env.example` replace these two lines

```text
# Webhook receiver (src/webhooks/receiver.ts). Default 127.0.0.1:4317.
P2_RECEIVER_HOST=
P2_RECEIVER_PORT=
```

by

```text
# Webhook receiver (src/webhooks/receiver.ts): comma-separated explicit IP literals (no 0.0.0.0) and a
# port. Default 127.0.0.1:4317. Containers need the docker gateway too (plan Task 5).
P2_RECEIVER_HOSTS=
P2_RECEIVER_PORT=
```

### 6.8 Tests (exact names are the contract)

Vectors were recomputed with Python 3 `hmac`, independently of Node's `crypto`; the two spellings of "é" are built
from char codes so no tool can normalise one into the other.

`tests/unit/webhooks/vectors.ts`

```ts
/**
 * Known vectors, recomputed independently of Node's crypto with Python 3 `hmac` (plan Task 2,
 * probe P4). Secrets here are throwaway test strings. Each vector names the product line whose
 * construction it encodes.
 */
export const SECRET = "p2-vector-secret";

// sendPayload.ts:296-299 (HMAC-SHA256 hex over the body string, no timestamp).
// The two spellings of "é" are built from char codes so no editor or tool can normalise one into
// the other: E_ACUTE is the single character U+00E9, ESCAPE_E_ACUTE is the six characters \ u 0 0 e 9.
const E_ACUTE = String.fromCharCode(0xe9);
const ESCAPE_E_ACUTE = String.fromCharCode(0x5c) + "u00e9";
const calBody = (title: string): string =>
  `{"triggerEvent":"BOOKING_CREATED","payload":{"title":"p${title}"}}`;
export const CAL_BODY_UTF8 = calBody(E_ACUTE);
export const CAL_SIG_UTF8 = "b3403fa7484a56062b61553c4fa28fd869bffe58df47720e2086b4874cbb28d5";
export const CAL_BODY_ESCAPED = calBody(ESCAPE_E_ACUTE);
export const CAL_SIG_ESCAPED = "ccfc180210c06d0cd626e92498924f4fe6b5227364d676c76fbb989215900fa9";

// call-webhook.job.ts generateSignature: HMAC-SHA256 hex over `${timestamp}:${body}`
export const TW_TS_MS = 1793519354730;
export const TW_BODY = '{"eventName":"person.created","webhookId":"w1"}';
export const TW_SIG = "d07fa726a2a40b1ba8ce839566da9216739b25533f9d131e227f8a6adc980832";
export const TW_NONCE = "07b9da07b9da07b9da07b9da07b9da07";

// recorded-daily-video/route.ts:40-45: base64-decoded key, `${ts}.${compact JSON}`, base64 digest
export const DAILY_SECRET_B64 = "ZGFpbHktdmVjdG9yLWtleS1ieXRlcw==";
export const DAILY_TS = "1793519354";
export const DAILY_BODY_COMPACT =
  '{"type":"recording.ready-to-download","payload":{"room_name":"r1"}}';
export const DAILY_BODY_SPACED =
  '{ "type": "recording.ready-to-download",  "payload": {"room_name": "r1"} }';
export const DAILY_SIG_COMPACT = "7qUiQ0ToaUCs0YYrmFqxbcT0rCb0Sq3tPjBWb6rkDBE=";
export const DAILY_SIG_OVER_SPACED_RAW = "HxN1uK3/96nAxsGzbC/+UwMMBxLGAbhpoc+vvP0DJQA=";
export const DAILY_SIG_NULL_TS = "+qZNNGtNV1/mzeRMaVr1or37qQfrRK9rURGvkad8WDU=";
```

`tests/unit/webhooks/redact.test.ts`

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { redactHeaders, SECRET_HEADER_NAMES } from "../../../src/webhooks/redact.ts";

describe("redactHeaders", () => {
  test("keeps only the length of every secret header, case-insensitively", () => {
    const out = redactHeaders({
      "X-Cal-Signature-256": "a".repeat(64),
      "X-Documenso-Secret": "s3cret",
      "Stripe-Signature": "t=1,v1=abc",
      Authorization: "Bearer xyz",
    });
    assert.equal(out["x-cal-signature-256"], "<redacted:64>");
    assert.equal(out["x-documenso-secret"], "<redacted:6>");
    assert.equal(out["stripe-signature"], "<redacted:10>");
    assert.equal(out["authorization"], "<redacted:10>");
  });

  test("leaves ordinary headers readable, lower-cases names and joins repeated values", () => {
    const out = redactHeaders({ "Content-Type": "application/json", "X-Multi": ["a", "b"] });
    assert.deepEqual(out, { "content-type": "application/json", "x-multi": "a, b" });
  });

  test("skips undefined values and never echoes a secret value", () => {
    const out = redactHeaders({ "x-webhook-signature": "topsecretvalue", missing: undefined });
    assert.ok(!("missing" in out));
    assert.ok(!JSON.stringify(out).includes("topsecretvalue"));
  });

  test("the secret list covers every signature or secret header named in the plan", () => {
    for (const name of [
      "x-cal-signature-256",
      "x-documenso-secret",
      "x-twenty-webhook-signature",
      "x-webhook-signature",
      "stripe-signature",
    ]) {
      assert.ok(SECRET_HEADER_NAMES.has(name), name);
    }
  });
});
```

`tests/unit/webhooks/sign.test.ts`

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Stripe from "stripe";
import {
  CAL_NO_SECRET_SIGNATURE,
  CAL_SIGNATURE_HEADER,
  DAILY_SIGNATURE_HEADER,
  DAILY_TIMESTAMP_HEADER,
  DOCUMENSO_SECRET_HEADER,
  signCal,
  signDaily,
  signDocumenso,
  signStripe,
  signTwenty,
  STRIPE_DEFAULT_TOLERANCE_SECONDS,
  STRIPE_SIGNATURE_HEADER,
  TWENTY_NONCE_HEADER,
  TWENTY_SIGNATURE_HEADER,
  TWENTY_TIMESTAMP_HEADER,
} from "../../../src/webhooks/sign.ts";
import * as v from "./vectors.ts";

describe("signCal (sendPayload.ts:296-299)", () => {
  test("matches the independent vector for a body with a real é", () => {
    const out = signCal({ secret: v.SECRET, body: v.CAL_BODY_UTF8 });
    assert.equal(out.headers[CAL_SIGNATURE_HEADER], v.CAL_SIG_UTF8);
  });

  test("the escaped and the literal spelling of é are different bytes with different signatures", () => {
    const escaped = signCal({ secret: v.SECRET, body: v.CAL_BODY_ESCAPED });
    assert.equal(escaped.headers[CAL_SIGNATURE_HEADER], v.CAL_SIG_ESCAPED);
    assert.notEqual(v.CAL_SIG_ESCAPED, v.CAL_SIG_UTF8);
  });

  test("returns the exact bytes that were signed, for string and Uint8Array input", () => {
    const fromString = signCal({ secret: v.SECRET, body: v.CAL_BODY_UTF8 });
    const fromBytes = signCal({ secret: v.SECRET, body: Buffer.from(v.CAL_BODY_UTF8, "utf8") });
    assert.deepEqual(fromString.body, fromBytes.body);
    assert.deepEqual(fromString.headers, fromBytes.headers);
  });

  test("a null secret yields Cal's literal 'no-secret-provided'", () => {
    assert.equal(
      signCal({ secret: null, body: "{}" }).headers[CAL_SIGNATURE_HEADER],
      CAL_NO_SECRET_SIGNATURE,
    );
  });

  test("a different secret changes the signature", () => {
    const other = signCal({ secret: "another-secret", body: v.CAL_BODY_UTF8 });
    assert.notEqual(other.headers[CAL_SIGNATURE_HEADER], v.CAL_SIG_UTF8);
  });
});

describe("signDocumenso (execute-webhook-call.ts: X-Documenso-Secret)", () => {
  test("sends the secret as-is, with no HMAC and no timestamp header", () => {
    const out = signDocumenso({ secret: "doc-secret", body: "{}" });
    assert.deepEqual(out.headers, { [DOCUMENSO_SECRET_HEADER]: "doc-secret" });
  });

  test("a null secret sends an empty string (secret ?? '')", () => {
    assert.equal(signDocumenso({ secret: null, body: "{}" }).headers[DOCUMENSO_SECRET_HEADER], "");
  });
});

describe("signTwenty (call-webhook.job.ts)", () => {
  test("matches the independent vector and emits all three headers", () => {
    const out = signTwenty({
      secret: v.SECRET,
      body: v.TW_BODY,
      timestampMs: v.TW_TS_MS,
      nonce: v.TW_NONCE,
    });
    assert.deepEqual(out.headers, {
      [TWENTY_TIMESTAMP_HEADER]: String(v.TW_TS_MS),
      [TWENTY_SIGNATURE_HEADER]: v.TW_SIG,
      [TWENTY_NONCE_HEADER]: v.TW_NONCE,
    });
  });

  test("the nonce is not signed: changing it keeps the signature", () => {
    const base = { secret: v.SECRET, body: v.TW_BODY, timestampMs: v.TW_TS_MS };
    const a = signTwenty({ ...base, nonce: "a".repeat(32) });
    const b = signTwenty({ ...base, nonce: "b".repeat(32) });
    assert.equal(a.headers[TWENTY_SIGNATURE_HEADER], b.headers[TWENTY_SIGNATURE_HEADER]);
  });

  test("the timestamp is signed: changing it changes the signature", () => {
    const a = signTwenty({ secret: v.SECRET, body: v.TW_BODY, timestampMs: 1, nonce: v.TW_NONCE });
    assert.notEqual(a.headers[TWENTY_SIGNATURE_HEADER], v.TW_SIG);
  });
});

describe("signDaily (recorded-daily-video/route.ts:40-45)", () => {
  const base = { secretBase64: v.DAILY_SECRET_B64, timestamp: v.DAILY_TS };

  test("compact body: raw and reserialised modes agree with the vector", () => {
    for (const mode of ["raw", "reserialised"] as const) {
      const out = signDaily({ ...base, body: v.DAILY_BODY_COMPACT, mode });
      assert.equal(out.headers[DAILY_SIGNATURE_HEADER], v.DAILY_SIG_COMPACT, mode);
      assert.equal(out.headers[DAILY_TIMESTAMP_HEADER], v.DAILY_TS);
    }
  });

  test("spaced body: raw mode signs the sent bytes, reserialised mode signs what Cal recomputes", () => {
    const raw = signDaily({ ...base, body: v.DAILY_BODY_SPACED, mode: "raw" });
    const re = signDaily({ ...base, body: v.DAILY_BODY_SPACED, mode: "reserialised" });
    assert.equal(raw.headers[DAILY_SIGNATURE_HEADER], v.DAILY_SIG_OVER_SPACED_RAW);
    assert.equal(re.headers[DAILY_SIGNATURE_HEADER], v.DAILY_SIG_COMPACT);
    assert.equal(re.body.toString("utf8"), v.DAILY_BODY_SPACED, "bytes sent stay as given");
  });

  test("a null timestamp omits the header and signs the text 'null' (route.ts:41)", () => {
    const out = signDaily({ ...base, timestamp: null, body: v.DAILY_BODY_COMPACT, mode: "raw" });
    assert.equal(out.headers[DAILY_SIGNATURE_HEADER], v.DAILY_SIG_NULL_TS);
    assert.ok(!(DAILY_TIMESTAMP_HEADER in out.headers));
  });

  test("the key is the base64-DECODED secret, not the base64 text", () => {
    const wrongKeyText = signDaily({
      secretBase64: Buffer.from(v.DAILY_SECRET_B64, "utf8").toString("base64"),
      timestamp: v.DAILY_TS,
      body: v.DAILY_BODY_COMPACT,
      mode: "raw",
    });
    assert.notEqual(wrongKeyText.headers[DAILY_SIGNATURE_HEADER], v.DAILY_SIG_COMPACT);
  });

  test("reserialised mode rejects a body that is not JSON", () => {
    assert.throws(
      () => signDaily({ ...base, body: "not json", mode: "reserialised" }),
      SyntaxError,
    );
  });
});

describe("signStripe (official SDK)", () => {
  test("header has the t=<seconds>,v1=<64 hex> shape and the SDK verifier accepts it", () => {
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "x.y" });
    const now = Math.floor(Date.now() / 1000);
    const out = signStripe({ payload, secret: "whsec_unit", timestampSeconds: now });
    const header = out.headers[STRIPE_SIGNATURE_HEADER] ?? "";
    assert.match(header, new RegExp(`^t=${String(now)},v1=[0-9a-f]{64}$`));
    assert.equal(Stripe.webhooks.constructEvent(payload, header, "whsec_unit").type, "x.y");
  });

  test("the tolerance comes from the SDK and is 300 seconds at the pinned version", () => {
    assert.equal(STRIPE_DEFAULT_TOLERANCE_SECONDS, 300);
  });
});
```

`tests/unit/webhooks/verify.test.ts`

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  signCal,
  signDaily,
  signDocumenso,
  signStripe,
  signTwenty,
  STRIPE_DEFAULT_TOLERANCE_SECONDS,
} from "../../../src/webhooks/sign.ts";
import {
  constantTimeEqual,
  headerValue,
  verifyCal,
  verifyDaily,
  verifyDocumenso,
  verifyStripe,
  verifyTwenty,
} from "../../../src/webhooks/verify.ts";
import * as v from "./vectors.ts";

describe("headerValue / constantTimeEqual", () => {
  test("header lookup is case-insensitive and rejects repeated values", () => {
    assert.equal(headerValue({ "X-Cal-Signature-256": "a" }, "x-cal-signature-256"), "a");
    assert.equal(headerValue({ "x-a": ["1", "2"] }, "x-a"), undefined);
    assert.equal(headerValue({ "x-a": ["1"] }, "x-a"), "1");
    assert.equal(headerValue({}, "x-a"), undefined);
  });

  test("constantTimeEqual compares by content and length", () => {
    assert.ok(constantTimeEqual("abc", "abc"));
    assert.ok(!constantTimeEqual("abc", "abd"));
    assert.ok(!constantTimeEqual("abc", "abcd"));
  });
});

describe("verifyCal", () => {
  const signed = signCal({ secret: v.SECRET, body: v.CAL_BODY_UTF8 });

  test("accepts the vector over the raw bytes", () => {
    assert.deepEqual(
      verifyCal({ secret: v.SECRET, rawBody: signed.body, headers: signed.headers }),
      { ok: true },
    );
  });

  test("tamper: one changed byte fails", () => {
    const tampered = Buffer.from(signed.body);
    tampered[10] = (tampered[10] ?? 0) ^ 1;
    assert.deepEqual(verifyCal({ secret: v.SECRET, rawBody: tampered, headers: signed.headers }), {
      ok: false,
      reason: "signature-mismatch",
    });
  });

  test("re-serialised JSON is a different message: whitespace change fails", () => {
    const spaced = signed.body.toString("utf8").replace(",", ", ");
    assert.equal(
      verifyCal({ secret: v.SECRET, rawBody: spaced, headers: signed.headers }).ok,
      false,
    );
  });

  test("wrong secret fails; missing header is reported as such", () => {
    assert.deepEqual(
      verifyCal({ secret: "other", rawBody: signed.body, headers: signed.headers }),
      { ok: false, reason: "signature-mismatch" },
    );
    assert.deepEqual(verifyCal({ secret: v.SECRET, rawBody: signed.body, headers: {} }), {
      ok: false,
      reason: "missing-header",
    });
  });

  test("a webhook without a secret verifies against Cal's literal", () => {
    const noSecret = signCal({ secret: null, body: "{}" });
    assert.equal(verifyCal({ secret: null, rawBody: "{}", headers: noSecret.headers }).ok, true);
  });
});

describe("verifyDocumenso", () => {
  test("accepts the configured secret, rejects another, reports a missing header", () => {
    const { headers } = signDocumenso({ secret: "s1", body: "{}" });
    assert.equal(verifyDocumenso({ secret: "s1", headers }).ok, true);
    assert.deepEqual(verifyDocumenso({ secret: "s2", headers }), {
      ok: false,
      reason: "signature-mismatch",
    });
    assert.deepEqual(verifyDocumenso({ secret: "s1", headers: {} }), {
      ok: false,
      reason: "missing-header",
    });
  });
});

describe("verifyTwenty", () => {
  const signed = signTwenty({
    secret: v.SECRET,
    body: v.TW_BODY,
    timestampMs: v.TW_TS_MS,
    nonce: v.TW_NONCE,
  });
  const base = { secret: v.SECRET, rawBody: signed.body, headers: signed.headers };

  test("accepts the vector, with and without a tolerance", () => {
    assert.equal(verifyTwenty({ ...base, nowMs: v.TW_TS_MS, toleranceMs: null }).ok, true);
    assert.equal(verifyTwenty({ ...base, nowMs: v.TW_TS_MS + 1000, toleranceMs: 5000 }).ok, true);
  });

  test("stale timestamp: valid HMAC but outside the caller's tolerance", () => {
    assert.deepEqual(verifyTwenty({ ...base, nowMs: v.TW_TS_MS + 5001, toleranceMs: 5000 }), {
      ok: false,
      reason: "stale-timestamp",
    });
  });

  test("tamper, wrong secret and a re-stamped timestamp all fail the HMAC", () => {
    const flipped = Buffer.from(signed.body);
    flipped[3] = (flipped[3] ?? 0) ^ 1;
    const common = { nowMs: v.TW_TS_MS, toleranceMs: null };
    assert.equal(verifyTwenty({ ...base, ...common, rawBody: flipped }).ok, false);
    assert.equal(verifyTwenty({ ...base, ...common, secret: "other" }).ok, false);
    const restamped = { ...signed.headers, "X-Twenty-Webhook-Timestamp": String(v.TW_TS_MS + 1) };
    assert.deepEqual(verifyTwenty({ ...base, ...common, headers: restamped }), {
      ok: false,
      reason: "signature-mismatch",
    });
  });

  test("the nonce is not part of the signature: a different nonce still verifies", () => {
    const otherNonce = { ...signed.headers, "X-Twenty-Webhook-Nonce": "f".repeat(32) };
    assert.equal(
      verifyTwenty({ ...base, headers: otherNonce, nowMs: v.TW_TS_MS, toleranceMs: null }).ok,
      true,
    );
  });

  test("missing and malformed headers are reported separately", () => {
    const common = { nowMs: v.TW_TS_MS, toleranceMs: null };
    assert.deepEqual(verifyTwenty({ ...base, ...common, headers: {} }), {
      ok: false,
      reason: "missing-header",
    });
    const bad = { ...signed.headers, "X-Twenty-Webhook-Timestamp": "12ab" };
    assert.deepEqual(verifyTwenty({ ...base, ...common, headers: bad }), {
      ok: false,
      reason: "malformed-header",
    });
  });
});

describe("verifyDaily (server-equivalent)", () => {
  const common = {
    secretBase64: v.DAILY_SECRET_B64,
    nowSeconds: 1793519354,
    toleranceSeconds: null,
  };

  test("reserialised signature verifies for compact and for spaced bodies", () => {
    for (const body of [v.DAILY_BODY_COMPACT, v.DAILY_BODY_SPACED]) {
      const signed = signDaily({
        secretBase64: v.DAILY_SECRET_B64,
        body,
        timestamp: v.DAILY_TS,
        mode: "reserialised",
      });
      assert.equal(
        verifyDaily({ ...common, rawBody: signed.body, headers: signed.headers }).ok,
        true,
      );
    }
  });

  test("raw-mode signature over spaced bytes is rejected, because Cal re-serialises (route.ts:41)", () => {
    const signed = signDaily({
      secretBase64: v.DAILY_SECRET_B64,
      body: v.DAILY_BODY_SPACED,
      timestamp: v.DAILY_TS,
      mode: "raw",
    });
    assert.deepEqual(verifyDaily({ ...common, rawBody: signed.body, headers: signed.headers }), {
      ok: false,
      reason: "signature-mismatch",
    });
  });

  test("tamper (changed field value) and wrong secret fail", () => {
    const signed = signDaily({
      secretBase64: v.DAILY_SECRET_B64,
      body: v.DAILY_BODY_COMPACT,
      timestamp: v.DAILY_TS,
      mode: "reserialised",
    });
    const changed = signed.body.toString("utf8").replace("r1", "r2");
    assert.equal(verifyDaily({ ...common, rawBody: changed, headers: signed.headers }).ok, false);
    const otherKey = Buffer.from("another-key-bytes").toString("base64");
    assert.equal(
      verifyDaily({
        ...common,
        secretBase64: otherKey,
        rawBody: signed.body,
        headers: signed.headers,
      }).ok,
      false,
    );
  });

  test("missing timestamp header verifies against the text 'null'; stale needs a tolerance", () => {
    const noTs = signDaily({
      secretBase64: v.DAILY_SECRET_B64,
      body: v.DAILY_BODY_COMPACT,
      timestamp: null,
      mode: "raw",
    });
    assert.equal(verifyDaily({ ...common, rawBody: noTs.body, headers: noTs.headers }).ok, true);

    const old = signDaily({
      secretBase64: v.DAILY_SECRET_B64,
      body: v.DAILY_BODY_COMPACT,
      timestamp: v.DAILY_TS,
      mode: "raw",
    });
    const withTolerance = {
      ...common,
      nowSeconds: Number(v.DAILY_TS) + 601,
      toleranceSeconds: 600,
    };
    assert.deepEqual(verifyDaily({ ...withTolerance, rawBody: old.body, headers: old.headers }), {
      ok: false,
      reason: "stale-timestamp",
    });
    assert.equal(
      verifyDaily({
        ...common,
        nowSeconds: Number(v.DAILY_TS) + 601,
        rawBody: old.body,
        headers: old.headers,
      }).ok,
      true,
      "Cal itself accepts it: no tolerance check in the route",
    );
  });

  test("a body that is not JSON and a missing signature header are reported", () => {
    assert.deepEqual(
      verifyDaily({ ...common, rawBody: "nope", headers: { "x-webhook-signature": "x" } }),
      {
        ok: false,
        reason: "malformed-body",
      },
    );
    assert.deepEqual(verifyDaily({ ...common, rawBody: "{}", headers: {} }), {
      ok: false,
      reason: "missing-header",
    });
  });
});

describe("verifyStripe (SDK verifier, tolerance 300 s)", () => {
  const payload = JSON.stringify({ id: "evt_1", object: "event", type: "x.y" });
  const nowMs = 1793519354000;
  const nowS = nowMs / 1000;
  const sign = (timestampSeconds: number, secret = "whsec_unit") =>
    signStripe({ payload, secret, timestampSeconds });

  test("accepts a header signed at the receive time", () => {
    const s = sign(nowS);
    assert.equal(
      verifyStripe({ secret: "whsec_unit", rawBody: s.body, headers: s.headers, nowMs }).ok,
      true,
    );
  });

  test("boundary: exactly at the tolerance passes, one second beyond is stale", () => {
    const at = sign(nowS - STRIPE_DEFAULT_TOLERANCE_SECONDS);
    const beyond = sign(nowS - STRIPE_DEFAULT_TOLERANCE_SECONDS - 1);
    assert.equal(
      verifyStripe({ secret: "whsec_unit", rawBody: at.body, headers: at.headers, nowMs }).ok,
      true,
    );
    assert.deepEqual(
      verifyStripe({ secret: "whsec_unit", rawBody: beyond.body, headers: beyond.headers, nowMs }),
      { ok: false, reason: "stale-timestamp" },
    );
  });

  test("tamper, wrong secret, malformed and missing header", () => {
    const s = sign(nowS);
    assert.deepEqual(
      verifyStripe({ secret: "whsec_unit", rawBody: payload + " ", headers: s.headers, nowMs }),
      { ok: false, reason: "signature-mismatch" },
    );
    assert.deepEqual(
      verifyStripe({ secret: "whsec_other", rawBody: s.body, headers: s.headers, nowMs }),
      { ok: false, reason: "signature-mismatch" },
    );
    assert.deepEqual(
      verifyStripe({
        secret: "whsec_unit",
        rawBody: s.body,
        headers: { "stripe-signature": "garbage" },
        nowMs,
      }),
      { ok: false, reason: "malformed-header" },
    );
    assert.deepEqual(verifyStripe({ secret: "whsec_unit", rawBody: s.body, headers: {}, nowMs }), {
      ok: false,
      reason: "missing-header",
    });
  });
});
```

`tests/unit/webhooks/docker-net.test.ts`

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { networkGateway, parseGateway } from "../../../src/webhooks/docker-net.ts";

describe("docker network gateway", () => {
  test("parseGateway accepts an IPv4 address with surrounding whitespace", () => {
    assert.equal(parseGateway("172.17.0.1\n"), "172.17.0.1");
  });

  test("parseGateway rejects empty, IPv6, wildcard and text output", () => {
    for (const bad of ["", "\n", "::1", "0.0.0.0", "<no value>", "172.17.0"]) {
      assert.throws(() => parseGateway(bad), /not an IPv4 address/, bad);
    }
  });

  test("networkGateway asks docker for the first IPAM gateway of the named network", async () => {
    const calls: string[][] = [];
    const gateway = await networkGateway("qa-harness-twenty_default", (args) => {
      calls.push([...args]);
      return Promise.resolve("172.18.0.1\n");
    });
    assert.equal(gateway, "172.18.0.1");
    assert.deepEqual(calls, [
      [
        "network",
        "inspect",
        "qa-harness-twenty_default",
        "--format",
        "{{(index .IPAM.Config 0).Gateway}}",
      ],
    ]);
  });

  test("networkGateway rejects a network name that could be an option or contain spaces", async () => {
    for (const bad of ["", "--help", "a b", "x;y", "a".repeat(65)]) {
      await assert.rejects(
        () => networkGateway(bad, () => Promise.resolve("172.17.0.1")),
        /invalid docker network name/,
        bad,
      );
    }
  });

  test("networkGateway surfaces a docker failure without leaking arguments", async () => {
    await assert.rejects(
      () =>
        networkGateway("bridge", () => Promise.reject(new Error("docker network failed (exit 1)"))),
      /docker network failed/,
    );
  });
});
```

`tests/unit/webhooks/receiver.test.ts`

```ts
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
```

`tests/unit/env.test.ts`: add the import `receiverConfig` and three tests at the end of the `describe("env")` block:

`tests/unit/env.test.ts` (diff)

```diff
--- a/tests/unit/env.test.ts
+++ b/tests/unit/env.test.ts
@@ -1,5 +1,5 @@
 import assert from "node:assert/strict";
 import { describe, test } from "node:test";
-import { apiBaseUrl, dbStatementTimeoutMs, dbUrl, loadEnv } from "../../src/env.ts";
+import { apiBaseUrl, dbStatementTimeoutMs, dbUrl, loadEnv, receiverConfig } from "../../src/env.ts";
 
 describe("env", () => {
@@ -72,3 +72,27 @@ describe("env", () => {
     }
   });
+
+  test("receiver defaults to 127.0.0.1:4317 and blank values fall back", () => {
+    assert.deepEqual(receiverConfig({}), { hosts: ["127.0.0.1"], port: 4317 });
+    assert.deepEqual(receiverConfig({ P2_RECEIVER_HOSTS: "  ", P2_RECEIVER_PORT: "" }), {
+      hosts: ["127.0.0.1"],
+      port: 4317,
+    });
+  });
+
+  test("receiver accepts a list of explicit IP literals and a port", () => {
+    assert.deepEqual(
+      receiverConfig({ P2_RECEIVER_HOSTS: "127.0.0.1, 172.17.0.1,::1", P2_RECEIVER_PORT: "4400" }),
+      { hosts: ["127.0.0.1", "172.17.0.1", "::1"], port: 4400 },
+    );
+  });
+
+  test("receiver refuses wildcards, names and out-of-range ports", () => {
+    for (const bad of ["0.0.0.0", "::", "localhost", "127.0.0.1,0.0.0.0", "example.com"]) {
+      assert.throws(() => receiverConfig({ P2_RECEIVER_HOSTS: bad }), /P2_RECEIVER_HOSTS/, bad);
+    }
+    for (const bad of ["80", "1023", "65536", "abc", "4317.5"]) {
+      assert.throws(() => receiverConfig({ P2_RECEIVER_PORT: bad }), /P2_RECEIVER_PORT/, bad);
+    }
+  });
 });
```

Test count by file: redact 4, sign 17, verify 21, docker-net 5, receiver 20, env +3. Total added **70**.

## 7. Data isolation, cleanup and leak check

- The task creates no product data. The receiver keeps deliveries in memory and appends to
  `receiver-logs/<run id>.jsonl` (gitignored, already in `.gitignore` and the ESLint ignores).
- Every receiver path carries the run id. The log file name carries it too.
- Leak check: the lifecycle unit test compares `process.getActiveResourcesInfo()` before and after
  `start`/`stop` (servers and sockets), and the "failed second bind" test proves a partial start closes what it
  opened.
- Secrets: the log contains header lengths and body hashes only (unit test "one line per delivery with hash and
  length, secrets redacted, no body text").

## 8. Build steps (repo root; `export PATH="/usr/local/bin:$PATH"` first; on any differing output STOP and paste it)

0. Branch and baseline.
   ```bash
   git fetch origin main && git checkout -b feat/$(date -u +%F)-p2-task2-receiver-signers origin/main
   git rev-parse HEAD            # record: must be fd554c901e82a7a936fb0074af42de6b26f56ab1 or a later main
   npm ci && npm run check       # exit 0, "# tests 102", "# pass 102", "# fail 0"
   ```
1. Dependency: section 6.1. Then `git diff --stat -- package.json package-lock.json` shows 2 files, `package.json`
   +1 line. Commit 1.
2. `src/env.ts` and `.env.example` (6.7), the three env tests. `node --test tests/unit/env.test.ts` -> `# tests 10`,
   `# pass 10`. Commit 2.
3. Create `src/webhooks/redact.ts`, `sign.ts`, `verify.ts` and their tests plus `vectors.ts`.
   `node --test tests/unit/webhooks/redact.test.ts tests/unit/webhooks/sign.test.ts tests/unit/webhooks/verify.test.ts`
   -> `# tests 42`, `# pass 42`. Commit 3.
4. `src/webhooks/docker-net.ts` + test -> `# tests 5`. Then check the helper against the real Docker once:
   `node --input-type=module -e 'import("./src/webhooks/docker-net.ts").then(async m=>console.log(await m.networkGateway("bridge")))'`
   prints an IPv4 (`172.17.0.1` on the probe VM). Commit 4.
5. `src/webhooks/receiver.ts` + test -> `# tests 20`, `# pass 20`. Run the file 20 times:
   `for i in $(seq 1 20); do node --test tests/unit/webhooks/receiver.test.ts >/dev/null 2>&1 || echo FAIL $i; done`
   prints nothing. Commit 5.
6. `npm run format:check` (Prettier ignores `.env.example`), then the done criteria.

## 9. Done criteria (machine-checkable)

```bash
npm run check                         # exit 0; "# tests 172" "# pass 172" "# fail 0" "# cancelled 0"
node --test "tests/unit/webhooks/*.test.ts" 2>&1 | grep -E '^# (tests|pass|fail)'   # 67 / 67 / 0
node --test tests/unit/env.test.ts 2>&1 | grep -E '^# (tests|pass)'                 # 10 / 10
npm ls stripe --depth=0               # stripe@23.0.1 (or the newest at least 7 days old on the build day)
git status --porcelain                # empty after the commits
git diff --name-only origin/main..HEAD | sort    # exactly the 16 files of section 5
git diff origin/main..HEAD -- . ':(exclude)tests/unit' | grep -E '^\+' | grep -nE 'sk_live_|sk_test_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|Bearer [A-Za-z0-9._-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|postgres(ql)?://[A-Za-z0-9_]+:[A-Za-z0-9]{8,}@' ; test $? -eq 1     # no match
git diff origin/main..HEAD | grep -niE 'j[a]yami|h[e]ttigoda' ; test $? -eq 1            # no personal name
npm run list:api                      # still "Total: 0 tests in 0 files" (no spec yet)
```

The unit fixtures under `tests/unit` use throwaway strings (`whsec_unit`, `p2-vector-secret`) on purpose; the
secret scan therefore excludes that folder and is reviewed by the redaction tests instead.

## 10. Self-verification

From a clean checkout of the branch: `rm -rf node_modules && npm ci && npm run check`, then the receiver loop of
step 5 and the commands of section 9. Paste the real output (command and trimmed result) into the PR body. No
result may be claimed without pasted output.

## 11. Commit plan (lowercase Conventional Commits, explicit paths, never `git add -A`)

1. `build(deps): add stripe sdk for webhook signing` - `package.json package-lock.json`
2. `feat(env): add receiver bind config` - `src/env.ts tests/unit/env.test.ts .env.example`
3. `feat(webhooks): add signers and verifiers for cal, daily, documenso, twenty and stripe` -
   `src/webhooks/redact.ts src/webhooks/sign.ts src/webhooks/verify.ts tests/unit/webhooks/vectors.ts tests/unit/webhooks/redact.test.ts tests/unit/webhooks/sign.test.ts tests/unit/webhooks/verify.test.ts`
4. `feat(webhooks): add docker network gateway helper` - `src/webhooks/docker-net.ts tests/unit/webhooks/docker-net.test.ts`
5. `feat(webhooks): add receiver with per-path modes and a jsonl log` - `src/webhooks/receiver.ts tests/unit/webhooks/receiver.test.ts`

PR title: `feat(webhooks): add receiver, signers and verifiers`. No trailers of any kind.

## 12. Environment changes

None. No new tool, package manager, image or setting. Cursor cloud (`.cursor/environment.json`,
`.cursor/Dockerfile`, `scripts/cloud-install.sh`) and Claude Code cloud (setup script, `.claude/hooks/session-start.sh`,
`$CLAUDE_ENV_FILE`) already provide Node 22.23 and run `npm ci`, which installs `stripe` from the lockfile.
Automatic from the repo: `npm ci`. Pasted by hand: nothing. Manual repository setting: none.

## 13. Will NOT do / Open decisions / Risks

Will NOT do: start or probe a product here; add a CI job; add the Playwright wiring of the receiver (Task 5); add
any case spec; touch the harness or a fork; add a retry, a sleep or a skip; use `0.0.0.0`; log a body.

Open decisions (default is taken by the builder; none is BLOCKING):

| ID | Question | Options | Evidence | Recommended default |
|---|---|---|---|---|
| OD-1 | `P2-X-WH-001` and `P2-X-DB-001` are not IDs in `docs/master-plan.html` | (a) keep them as framework-check labels; (b) the owner adds two rows to the master plan; (c) rename | master plan section 5 lists `X-P2-CON` sections only | (a) now, (b) when the owner next edits the master plan |
| OD-2 | Multi-host bind has no portable unit test (D12) | (a) accept, rely on readiness; (b) add a Linux-only test | macOS and Windows lack `127.0.0.2` | (a) |
| OD-3 | Cal receiver-500 behaviour (2.1) contradicts P2-CAL-WH-003 and P2-CAL-TASK-001 as written | (a) the Cal lane records "no retry" as the baseline and drives TASK-001 by a connection failure; (b) change the case text | `sendWebook.ts:21-27` | (a); decided in the Cal lane, nothing here depends on it |

Risks: a future stripe release changes an error message (the tests pin three substrings and the 300 s default, so
the build fails loudly rather than silently); Node's `getActiveResourcesInfo` names could change (the test
compares counts of two names only).

## 14. Builder STOP conditions

Builder STOP conditions (stop, report, never improvise):

- A done criterion still fails after one root-caused fix attempt: report cause, evidence, output.
- Any need to edit a product fork, `node_modules` or the harness, or a harness release that is not
  yet tagged.
- A secret is needed that the environment does not provide, or a secret would be printed.
- A fact at build time contradicts this plan (header name, signature construction, route, grant,
  env var, version): report expected vs observed with `file:line`.
- Any need to weaken an assertion, add a sleep or retry, skip a check, cut scope or raise a timeout.
- A blocked host (proxy 403, ENOTFOUND) or Docker unavailable: this is an ENV finding. Stop.
- A BLOCKING open decision is reached. Any scope cut without approval makes the task PARTIAL;
  report it as PARTIAL.

## Appendix A. Repo rules that apply

Repo rules that apply to this task (restated from the planning brief; `AGENTS.md` still governs):

1. Industry best practice only. Root-cause every failure before changing anything.
2. Never weaken an assertion, widen a tolerance, add a retry or a skip to get green, or raise any
   `timeout-minutes`. No sleeps, no fixed waits: async waits use `expect.poll` with an explicit,
   named deadline (node:test units use events, never timers).
3. Label every surprise PRODUCT BUG (SUSPECTED) or TEST BUG with evidence (HTTP status, body,
   `file:line`). No expected-failure marker in the foundation; any `test.fail` belongs to a lane,
   scoped to the exact wrong value, with the setup asserted first.
4. Data isolation by run prefix (`p2-qa-<utc>-<8 hex>`), cleanup sweep and leak check for anything
   the task creates.
5. Lowercase Conventional Commits. Dated branches. Stage explicit paths only, never `git add -A`.
   No force-push, no rebase of pushed work, no tags, no merges.
6. No `Co-authored-by`, "Generated with" or session-link lines in commits, PR text or files. Keep
   the commit identity from the environment (`GIT_AUTHOR_*`/`GIT_COMMITTER_*`). If the builder is
   Cursor cloud (it adds a `Co-authored-by` trailer), do not push such commits: stop and report.
7. Never print, log, commit or upload secrets or tokens. Redact them in artefacts and traces.
8. Never edit product forks, `node_modules` or the harness. The harness owns starting and stopping
   products. A harness change is a separate harness-release prerequisite (its own repo, PR and tag).
9. Never use the GitHub account Bridge-bss.
10. No personal name in any repo text (code, comments, docs, commits, PR text): write "the owner"
    or "the maintainer". Fix `AGENTS.md:16` only if this task already edits `AGENTS.md`.
11. Do not run CodeRabbit; the owner runs it after.
12. One product stack at a time; every stack run ends with that product's `down`.

## Appendix B. Autonomous build protocol

Autonomous build protocol (the build session runs Tasks 2 to 6 in order, no owner input between tasks):

1. Before starting a task the builder merges nothing. It cuts the task branch from the previous
   task's branch head (Task 2 from fetched `origin/main`) and records that SHA in its report.
2. It follows this plan with the recommended default of every open decision, unless the decision is
   marked BLOCKING (then it stops, see STOP conditions).
3. After the done criteria pass it pushes the branch and opens the PR with the base set to the
   previous task's branch (GitHub retargets to `main` when that branch merges and is deleted).
   PR title = the lowercase Conventional Commit of the main change. Body = summary, pasted
   verification output, "stacked on" link, unit count chain, open decisions taken with defaults.
4. If the session cannot open PRs it saves the body to `docs/handoff/pr-bodies/<branch>.md` on
   that branch, commits it (`docs: add pr body for <branch>`), pushes, and reports the path.
5. It never merges, never comments on a PR, never tags.
6. If a task stops, later tasks that depend on it do not start. The index says which are
   independent.
7. The session ends with a report per task: branch, head SHA, PR (or saved body), done criteria
   pass/fail with output, decisions taken by default, anything unprobed that is now probed.
