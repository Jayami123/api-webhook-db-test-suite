# P2 lane: Twenty (plan, probed, not built)

Date 2026-11-02. Plan branch `plan/2026-11-02-p2-lane-twenty`, from `origin/main` = `aa10ec11bada21b3e3e5803a948e33023d648505`.
Probe record: `docs/probes/2026-11-02-p2-lane-twenty-probes.md` (every result below cites an entry there or a file:line at the
pinned fork). Nothing is built; no product, fork, harness or `.env` was changed.

> **STATUS (second pass).** The harness gate passed after `npm ci` (harness `0.3.0`, stripe `23.0.1`, unit baseline **285**,
> 0 failures). Probes P-TW-1 to P-TW-12 ran on the pinned harness, one stack at a time (two stacks; both ended with `down`).
> Results that changed the plan:
> 1. **B1 is not reproduced as a test-grade bug.** One drop in six attempts (P-TW-2n); five of six delivered; three timed attempts
>    after idle gaps all delivered. The B1 test is a **regression check** with no `test.fail()` (rule 12).
> 2. **The payload has no event id.** TW-WH-006 is rewritten to the identity fields the body really carries.
> 3. **Webhook response rows are in ClickHouse** (not started by the harness). The response-row oracle is unavailable; the receiver is the oracle.
> 4. **The OAS needs the bearer** (403 without); the contract cases save the authenticated document and load the file.
> 5. **The billing schema is absent** on `twentycrm/twenty:v2.44.0` (billing on: the handler returns 500, no billing tables). Stripe-backed rows are BLOCKED.
> 6. **Owner defaults applied:** OD-1 (two serial tests), OD-6 (WH-008 cut), OD-4 (identity wording), HR-4 and HR-5 DEFERRED
>    (CACHE-001, WH-009 and STR-002 deferred; no workaround planned).
> 7. **Stale claim corrected:** the earlier plan said creating a webhook does not invalidate the worker cache. The migration runner
>    does (`workspace-migration-runner.service.ts:101-123`).

Naming: the brief's short forms (`TW-WH-001`) are written as the index writes them (`P2-TW-WH-001`). Same IDs.

---

## 1. Header

| Item | Value |
|---|---|
| Base | `origin/main` = `aa10ec1` (ancestor check passed; PRs #5 to #9 merged) |
| Plan branch | `plan/2026-11-02-p2-lane-twenty` (from base; no PR, no merge, no tag) |
| Product | Twenty fork at `7cbdfec6f346b43715bc2056932f4fad5886f733` (`TWENTY_REF` in `scripts/bootstrap.sh`); image `twentycrm/twenty:v2.44.0` |
| Harness | `qa-portfolio-harness` `0.3.0` (`be86e0e`), installed by `npm ci` (P0-r2) |
| Build branches | `feat/<builder date>-p2-twenty-l<n>-<topic>`, `<builder date>` = `date -u +%F` at task start. L0 is cut from `origin/main`. Each later task is cut from the **previous task's branch head** while that PR is open, and its PR targets that branch. After the previous PR merges, re-cut from `origin/main`; the PR targets `main`. |
| Unit baseline | **285** on `aa10ec1` (P0-r2; per-file record P0-r2b). Measured again at each task start (`npm run unit 2>&1 \| grep -E '^# (tests\|pass\|fail)'`). The plan's counts are **deltas**: "base + N". (The 277 in the index is out of date: the foundation build added tests.) |
| Lane deltas | Unit **+21** (L0 +19; L5 +2). Specs: **18** new `tw` tests built, plus **1** BLOCKED row (RT-001) not built. `tw-api` listing = 5 existing readiness tests + 18 = **23**. Deferred and cut rows are not listed. |
| Ownership | P5 owns the security verdict (TW-WH-009, deferred); P6 owns user-action races; P2 keeps worker, cron and queue concurrency (TW-STR-001). |

---

## 2. Probe findings (summary; full entries in the probe record)

| ID | Question | Status | Result (one line) |
|---|---|---|---|
| P0 / P0-r2 | Harness at 0.3.0; unit baseline | CONFIRMED | `0.3.0`; stripe `23.0.1`; 285 tests, 0 fail (Node 22 and 24) |
| P0b / P0c | Base; fork at pinned ref; no stack up | CONFIRMED | `aa10ec1`; fork `7cbdfec`; 0 containers |
| P-TW-1 | Signature over `${ts}:${JSON.stringify(payload)}`; nonce unsigned | CONFIRMED | HMAC matches the header; nonce replaced still verifies; flipped body fails with `signature-mismatch` |
| P-TW-2 (+2r, 2n, 2a/b/c) | B1: event inside the memo window | NOT REPRODUCED as a test-grade bug; intermittent drop observed once | 5 of 6 first events delivered; 3 of 3 timed after idle gaps; 1 drop (2n) right after another event in the window |
| P-TW-3 | 4 s and 6 s receiver `slow` | CONFIRMED | 1 request each; `CallWebhookJob` 4018 ms (success) and 5006.6 ms (cut at the 5 s timeout); no retry in 12 s |
| P-TW-4 | Identity across created and updated | CONFIRMED | same `webhookId` and `record.id`; `eventDate` differs; nonce differs; **no event id** in the body |
| P-TW-5 (+5b) | Rate-limit flag | CONFIRMED (absent by default) | `core.featureFlag` row only; not an env var; not in the harness pass-through lists; `CLICKHOUSE_URL` UNSET |
| P-TW-6 | Second workspace; multi-workspace | PARTIAL | `IS_MULTIWORKSPACE_ENABLED=false`, not passed by the harness; `core.workspace` has 2 rows already; route UNPROBED |
| P-TW-7 (+7b) | Billing env; route; ordering | PARTIAL (signature CONFIRMED; ordering BLOCKED) | Billing vars reach the server with billing on; unsigned and wrong-secret refused (400); signed events return 500 because `core.billingProduct` does not exist |
| P-TW-8 | Cache: replicas | CONFIRMED | one `server` container under `up` (HR-4 needed for two; DEFERRED) |
| P-TW-9 (+9b) | Route trigger creation path | PARTIAL | route triggers are fields on logic functions (`httpRouteTriggerSettings`); `createOneLogicFunction` exists; workflow executor UNPROBED |
| P-TW-10 (+10b, 10c) | REST OAS | CONFIRMED | 403 without the bearer, 200 with it (OAS 3.1.1, 362 paths); cursor params `startingAfter` / `endingBefore`; loader accepts the saved authenticated file, rejects the URL |
| P-TW-11 | Where `webhook.response` rows live | CONFIRMED: not in Postgres | ClickHouse (`event-logs.service.ts:37, 52`); the harness does not start it |
| P-TW-12 | `test.fail()` masking; serial behaviour | CONFIRMED | a broken control inside `test.fail()` is reported as passed; unexpected pass fails; a serial failure skips the rest |

Every runtime claim below is either in this table as CONFIRMED / PARTIAL, or marked UNPROBED with the probe that would settle it.

---

## 3. Resolved decisions (with evidence)

| # | Decision | Evidence |
|---|---|---|
| R1 | Index IDs `P2-TW-…`; brief short forms map 1:1 | index section 9 item 5 |
| R2 | Signature = HMAC-SHA256 hex over `${ts}:${JSON.stringify(payload)}`; ts = `Date.now()` in ms; nonce random, **unsigned**; headers only when a secret exists | `call-webhook.job.ts:38-47, 85-101`; **P-TW-1 CONFIRMED** |
| R3 | One request per delivery; no retry on 500 or timeout | `call-webhook.job.ts:103-110` (no `retries`); `secure-http-client.service.ts:61-70`; `call-webhook.job.ts:137-155` (catch returns, no throw, so the queue `retryLimit: 3` at `call-webhook-jobs.job.ts:101-104` does not fire); **P-TW-3 CONFIRMED** (one request at 4 s and at 6 s) |
| R4 | Timeout 5 000 ms | `call-webhook.job.ts:117`; **P-TW-3**: job cut at 5006.6 ms |
| R5 | No event id in the payload; identity = `webhookId`, `eventName`, `record.id`; `eventDate` set once per batch, per event | `transform-event-batch-to-webhook-events.ts:36, 45-57`; **P-TW-4 CONFIRMED** |
| R6 | B1 has two candidate paths: (a) stale workspace map returns silently (`call-webhook-jobs.job.ts:46-59`); (b) the outbound guard refuses and the catch writes `success: false` (`call-webhook.job.ts:137-155`, `:57-59`, `:62-75`). The one observed drop (P-TW-2n) left **no fan-out job** in the worker log, which fits neither path cleanly | **P-TW-2 family**; probe record C-2 |
| R7 | **Corrected.** A webhook change does invalidate the worker cache: the migration runner calls `invalidateAndRecompute` after a metadata change. The earlier "no invalidation" finding was an incomplete search | `workspace-migration-runner.service.ts:101-123`; C-1 in the probe record |
| R8 | Rate-limit drops are a `warn` log and a metric; the flag is a per-workspace `core.featureFlag` row (absent by default) | `webhook-rate-limit.service.ts:38-46, 75-80`; `feature-flag.entity.ts:15`; **P-TW-5 CONFIRMED** |
| R9 | Billing: route `POST /webhooks/stripe`; the signature is checked (400 unsigned, 400 wrong secret); signed product events return 500 because the billing tables are absent on this image | `billing-webhook.controller.ts:54-72`; **P-TW-7 / 7b** |
| R10 | Billing and multi-workspace are off by default; the harness passes billing variables and `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS` (names listed in `twenty-passthrough.ts`), not `IS_MULTIWORKSPACE_ENABLED` or the rate-limit flag | `config-variables.ts:945, 2113`; `twenty-passthrough.ts:9-15`; **P-TW-5, P-TW-6, P-TW-7b** |
| R11 | Upstream already covers the failed-response write (in ClickHouse), the rate-limit drop count, and billing controller cases (no ordering case); no upstream test covers an outbound Twenty signature or a payload per event | section 4.2 |
| R12 | Stale local install was ENV (missing `stripe`); fixed by `npm ci` | P0-r2 |
| R13 | The `up` needs `PRODUCTS_ROOT` on the command line or in `.env` (the harness default is `node_modules/products`) | probe record, first `up` attempt (failed in 1 s) |
| R14 | The OAS is not public (403 without the bearer); the loader takes a file | **P-TW-10 / 10c** |
| R15 | Event-log rows are in ClickHouse; the harness does not start it | **P-TW-11** |

---

## 4. Case mapping

### 4.1 Cases to tasks

`P2-` prefix omitted in titles only where the title is quoted. Test titles are exact. `tw-api` = `tests/{contracts,webhooks,integration}/tw/**`.

| ID | Kind | Task | Spec file | Test title | Oracle | Status |
|---|---|---|---|---|---|---|
| P2-TW-CON-001 | K | L1 | `tests/contracts/tw/rest-oas.spec.ts` | `P2-TW-CON-001: GET list of people conforms to the OAS` (and `… of companies`, `… of opportunities`: 3 tests) | AJV via `loadSpec(file)` of the saved authenticated OAS | built |
| P2-TW-CON-002 | K | L1 | `tests/contracts/tw/graphql-errors.spec.ts` | `P2-TW-CON-002: an invalid GraphQL filter returns 200 with errors[]` | status and body | built |
| P2-TW-PAG-001 | K | L1 | `tests/integration/tw/pagination.spec.ts` | `P2-TW-PAG-001: cursor pages return every created id once while new records are inserted between fetches` | id sets | built |
| P2-TW-PAG-002 | NEW (wording derived, OD-5) | L1 | same | `P2-TW-PAG-002: a record deleted between two page fetches neither duplicates nor skips another record` | id sets | built |
| P2-TW-CUR-001 | U | L1 | `tests/integration/tw/currency.spec.ts` | `P2-TW-CUR-001: amountMicros 9007199254740991 round-trips exactly`; `… 9007199254740993 is rejected or round-trips exactly` (2 tests) | REST body + `qa_ro` column | built after one column-name probe (UNPROBED: column name) |
| P2-TW-WH-001 | U | L2 | `tests/webhooks/tw/signature.spec.ts` | `P2-TW-WH-001: a person.created delivery verifies over "${timestamp}:${body}" with the timestamp within 5 s of receipt` (includes the negative control: one flipped byte fails, as an assertion in the same test) | receiver + `verifyDelivery` | built |
| P2-TW-WH-007 | NEW ("unsigned nonce") | L2 | same | `P2-TW-WH-007: the nonce header is not signed, so the same delivery with a fresh nonce still verifies` | receiver + oracle | built |
| P2-TW-WH-003 | K | L2 | `tests/webhooks/tw/payload.spec.ts` | `P2-TW-WH-003: person.created, person.updated and person.deleted each arrive once and match the body schema` | receiver + Ajv | built |
| P2-TW-WH-004 | U ("1 request") | L2 | `tests/webhooks/tw/delivery.spec.ts` | `P2-TW-WH-004: a receiver 500 gets exactly one request for the event (no retry)` | count + quiet window | built |
| P2-TW-WH-005 | U ("4 s / 6 s against the 5000 ms timeout") | L2 | same | `P2-TW-WH-005: a 4 s receiver delay is delivered once` and `P2-TW-WH-005: a 6 s delay is one request; the 5000 ms timeout closes the call and nothing retries` (2 tests) | receiver count (the response row is in ClickHouse: unavailable) | built |
| P2-TW-WH-006 | U (**wording changed, OD-4**) | L2 | same | `P2-TW-WH-006: the delivered body carries the created webhook id, the event name and the created person id, and one request is sent per event` | body fields vs created ids; count | built |
| B1 regression check | working title; owner assigns the ID (OD-3) | L2 | `tests/webhooks/tw/b1-drop.spec.ts` | `B1 control: a fresh webhook delivers an event sent after one memo window` (test 1, must pass) and `B1 webhook drop (ID pending): an event sent inside the memo window is delivered` (test 2, regression check, **no test.fail()**) | receiver | built (2 tests) |
| P2-TW-STR-001 | U ("last-arrival-wins") | L3 | `tests/integration/tw/billing.spec.ts` | `P2-TW-STR-001: two subscription events sent out of order leave the newest one stored` | `qa_ro` billing row | **BLOCKED**: billing schema absent (P-TW-7b). Built as a gated skip with the reason (1 test) |
| P2-TW-DEL-002 | U | L3 | `tests/integration/tw/soft-delete.spec.ts` | `P2-TW-DEL-002: a soft-deleted person is absent from the REST list and from search` | `qa_ro` `deletedAt IS NOT NULL` | built |
| P2-TW-RT-001 | K | L3 | `tests/integration/tw/route-trigger.spec.ts` | `P2-TW-RT-001: POST to a route trigger runs its workflow and creates one record` | `qa_ro` count | **BLOCKED** (not built): the route path is probed (P-TW-9), the workflow executor is not (new probe required, section 14.2 OD-13) |

**Built new `tw` tests: L1 = 7, L2 = 9, L3 = 2 (STR-001 gated skip, DEL-002). Total 18.** The `tw-api` listing is 5 readiness + 18 = **23**.

**DEFERRED (not built, no workaround planned; section 13):**
- **P2-TW-CACHE-001**: HR-4 (two server replicas; P-TW-8).
- **P2-TW-WH-009**: HR-5 (multi-workspace; P-TW-6). Note for the owner only: `core.workspace` already has 2 rows after the seed; using them needs a second workspace's token, which needs the flag, so this is not a workaround.
- **P2-TW-STR-002**: HR-5 (deleted workspace).

**CUT by owner decision (OD-6):** **P2-TW-WH-008** (rate-limit drops). Duplicate of the upstream test at `test/integration/usage-limit/webhook-rate-limit.integration-spec.ts:172`; the observable is a log and a metric, not DB state.

### 4.2 Upstream-coverage gate (pinned fork, `../products/twenty-CRM/packages/twenty-server`)

| ID | Upstream file:line that covers the same behaviour | Verdict |
|---|---|---|
| P2-TW-WH-001 | none for the Twenty outbound HMAC (only other providers: `src/modules/messaging-webhooks/drivers/resend/utils/__tests__/verify-svix-signature.util.spec.ts:17`) | KEEP |
| P2-TW-WH-003 | `src/engine/metadata-modules/webhook/jobs/__tests__/call-webhook-jobs.job.spec.ts:13-14` (visibility only) | KEEP |
| P2-TW-WH-004 | none | KEEP (rewritten to 1 request) |
| P2-TW-WH-005 | none | KEEP (5 000 ms boundary) |
| P2-TW-WH-006 | none | KEEP (identity wording, OD-4) |
| P2-TW-WH-007 | none | KEEP |
| P2-TW-WH-008 | `test/integration/usage-limit/webhook-rate-limit.integration-spec.ts:172` ("delivers what the bucket admits and drops the rest of the burst") | **CUT** (OD-6, owner decision) |
| P2-TW-WH-009 | none found (targeted search) | KEEP, DEFERRED (HR-5) |
| P2-TW-STR-001 | `test/integration/billing/suites/billing-controller.integration-spec.ts:9,43,77,94` (no ordering case) | KEEP, BLOCKED |
| P2-TW-STR-002 | none found | KEEP, DEFERRED (HR-5) |
| P2-TW-RT-001 | `src/engine/metadata-modules/route-trigger/__tests__/route-trigger.controller.spec.ts` (unit; no workflow run) | KEEP, BLOCKED |
| P2-TW-DEL-002 | `test/integration/graphql/suites/soft-deleted-relation.integration-spec.ts:111` (GraphQL restore); no REST list or search exclusion test | KEEP, narrowed to REST list and search |
| P2-TW-PAG-001 | cursor specs are unit (`src/engine/api/utils/__tests__/build-cursor-page.util.spec.ts`); none with inserts between fetches | KEEP |
| P2-TW-PAG-002 | none | KEEP (OD-5 wording) |
| P2-TW-CUR-001 | 2^53 only in `src/database/commands/workspace-export/utils/__tests__/format-sql-value.util.spec.ts:28` (a formatter) | KEEP |
| P2-TW-CACHE-001 | none found | KEEP, DEFERRED (HR-4) |
| P2-TW-CON-001 | `test/integration/rest/suites/rest-api-core-find-many.integration-spec.ts` (behaviour, not OAS validation) | KEEP |
| P2-TW-CON-002 | not searched in this session | KEEP by default; the builder searches first |

**Ownership:** P5 owns the security verdict for TW-WH-009 (deferred). P6 owns user-action speed and races. P2 keeps TW-STR-001 (last arrival) as worker-side concurrency.

### 4.3 CUT (not built)

Upstream-proposed or owner-decided cuts: **P2-TW-WH-008** (owner, OD-6). Index CUT list (never built): P2-TW-WH-002, P2-TW-JOB-001, P2-TW-DEL-001, P2-TW-AUD-001, P2-TW-KEY-001. No task, spec, file or commit uses these IDs.

### 4.4 Framework checks (no IDs)

| Name | What | Where |
|---|---|---|
| FC-TW-1 | Receiver-side verifier round trip (unit) | `src/lanes/tw/oracle.ts` |
| FC-TW-2 | Quiet-window and visibility helpers (pure state, unit) | `src/lanes/tw/quiet.ts`, `src/lanes/tw/visible.ts` |
| FC-TW-3 | Live gates name their blocker when they skip | `src/lanes/tw/gates.ts` |

### 4.5 Owned elsewhere (by ID only)

TW-RACE-004, OBS-TW-001, P6-OBS-DOC-003. Not built here.

### 4.6 Cross-product rows this lane contributes

`P2-X-WH-001` (signed round trip), Twenty cells: WH-001, WH-007. `P2-X-ERR-001`, Twenty rows: WH-004, WH-005, STR-001 (blocked). The matrix generator is a later closeout task.

---

## 5. Architecture

| Case | Trigger | Product path | Receiver or DB | Oracle | Foundation modules |
|---|---|---|---|---|---|
| WH-001/007/003/004/005/006 | `tw.people.create` / `update` / `delete` | `call-webhook-jobs` → `call-webhook` → axios (5 000 ms) | receiver `deliveries(key)` | `verifyTwenty` / body fields / count | `fixtures/index.ts`, `webhooks/receiver.ts`, `webhooks/sign.ts`, `webhooks/verify.ts`, `readiness/canary.ts`, `readiness/checks.ts`, `slo.ts` |
| B1 control and regression | create webhook; prime (one call); one event; wait memo + margin; canary | workspace map memo (10 s) | receiver | delivery count | as above + `src/lanes/tw/*` |
| CON-001 / CON-002 | authenticated `GET` (saved OAS file) / `POST /graphql` | REST / GraphQL | HTTP | `ContractSpec.assertValid` (`contracts/oas.ts:257-264`) | `auth/twenty.ts`, `contracts/oas.ts` |
| PAG-001/002, CUR-001 | REST create and list (`startingAfter`) | REST | HTTP + `qa_ro` (`db/pg.ts`) | id sets; exact value | `db/pg.ts` |
| DEL-002 | REST soft delete | REST | `qa_ro` `deletedAt` | `IS NOT NULL` | `db/pg.ts`, `db/roles.ts` (`quoteIdent`) |
| STR-001 (blocked) | signed `POST /webhooks/stripe` (`signStripe`) | billing controller | `qa_ro` (table absent) | n/a until the schema exists | `webhooks/sign.ts` |

Every spec runs under the P2-X-DB-001 `afterEach` sweep (`src/invariants/after-test.ts`); its rules are `tw-leak-api-key-name`, `tw-leak-webhook-url`, `tw-leak-person-first-name` (`src/invariants/rules.ts:214-246`). Billing rows have no leak rule and no API delete was probed (section 14.3).

---

## 6. Module contracts (skeletons)

Conventions: Node 22, TypeScript strict with `noUncheckedIndexedAccess` (`tsconfig.json:8,14`). Imports are real paths. Waits are `expect.poll` with `intervals: POLL_INTERVALS` and an explicit `timeout` from a named budget. Lane helpers take their waits as parameters so node:test unit tests need no Playwright runner. `runScopedName` labels must match `[a-z0-9-]{1,40}` (`src/run/prefix.ts:51-55`).

### 6.1 `src/lanes/tw/slo.ts` (lane-owned; `src/slo.ts` is NOT edited)

```ts
import { CANARY_MARGIN_MS, POLL_INTERVALS, SLO, TWENTY_WEBHOOK_MEMO_MS } from "../../slo.ts";

/** call-webhook.job.ts:117: the outbound request timeout. */
export const TW_OUTBOUND_TIMEOUT_MS = 5_000;
/** A retry, if the product had one, would land inside this window (one timeout plus 1 s). P-TW-3: none seen in 12 s. */
export const TW_QUIET_WINDOW_MS = TW_OUTBOUND_TIMEOUT_MS + 1_000;
/** Poll budget for a quiet check: the window plus one second of margin. */
export const TW_QUIET_TIMEOUT_MS = TW_QUIET_WINDOW_MS + 1_000;
/** Canary wait: one memo window (workspace-cache.service.ts:56) plus CANARY_MARGIN_MS (src/slo.ts). */
export const TW_VISIBLE_TIMEOUT_MS = TWENTY_WEBHOOK_MEMO_MS + CANARY_MARGIN_MS;
/** P2 receiver policy for |timestamp - receipt| (TW-WH-001). The product documents no tolerance. */
export const TW_RECEIPT_TOLERANCE_MS = 5_000;

export { CANARY_MARGIN_MS, POLL_INTERVALS, SLO, TWENTY_WEBHOOK_MEMO_MS };
```

### 6.2 `src/lanes/tw/oracle.ts`

```ts
import {
  TWENTY_NONCE_HEADER,
  TWENTY_SIGNATURE_HEADER,
  TWENTY_TIMESTAMP_HEADER,
} from "../../webhooks/sign.ts";
import type { Delivery } from "../../webhooks/receiver.ts";
import { verifyTwenty, type VerifyResult } from "../../webhooks/verify.ts";
import { TW_RECEIPT_TOLERANCE_MS } from "./slo.ts";

type Headers = Delivery["headers"];

/**
 * Verifies a recorded delivery with the receipt time as the clock (TW-WH-001: |timestamp - receipt| <= 5 s).
 * The product signs `${timestamp}:${JSON.stringify(payload)}`; the receiver keeps the raw bytes, so this checks the
 * exact bytes sent (call-webhook.job.ts:38-47; P-TW-1 CONFIRMED).
 */
export function verifyDelivery(
  delivery: Pick<Delivery, "rawBody" | "headers" | "receivedAt">,
  secret: string,
): VerifyResult {
  return verifyTwenty({
    secret,
    rawBody: delivery.rawBody,
    headers: delivery.headers,
    nowMs: Date.parse(delivery.receivedAt),
    toleranceMs: TW_RECEIPT_TOLERANCE_MS,
  });
}

/** TW-WH-007: the same delivery with another nonce. The nonce is not signed (P-TW-1), so this must still verify. */
export function withNonce(headers: Headers, nonce: string): Headers {
  return { ...headers, [TWENTY_NONCE_HEADER.toLowerCase()]: nonce };
}

/** TW-WH-001 negative control: one byte flipped near the end of the body (same length). Must fail verification. */
export function flipOneBodyByte(rawBody: Buffer): Buffer {
  const out = Buffer.from(rawBody);
  out[out.length - 2] ^= 0x01;
  return out;
}

/** Lower-cased header names as the receiver stores them (receiver.ts Delivery.headers). */
export function lowerCaseHeaders(input: Record<string, string>): Headers {
  return Object.fromEntries(Object.entries(input).map(([k, v]) => [k.toLowerCase(), v]));
}

export { TWENTY_SIGNATURE_HEADER, TWENTY_TIMESTAMP_HEADER };
```

Unit tests (`tests/unit/lanes/tw/oracle.test.ts`, 5):
1. `verifies a body signed by signTwenty when received 1 s after signing` → `{ ok: true }`. Input that fails: a signer that omits the timestamp.
2. `fails with signature-mismatch when one body byte changes` → `{ ok: false, reason: "signature-mismatch" }`.
3. `still verifies when only the nonce header changes (nonce is unsigned)` → `{ ok: true }`. Input that fails: a product that signs the nonce.
4. `fails with stale-timestamp when received 6 s after signing`.
5. `fails when the body bytes differ only in whitespace` (the signature covers the `JSON.stringify` output).

### 6.3 `src/lanes/tw/quiet.ts` (FC-TW-2)

```ts
/**
 * Pure state for a bounded quiet check (no sleep). The spec polls it:
 *   await expect.poll(() => quietState({...}), { timeout: TW_QUIET_TIMEOUT_MS, intervals: POLL_INTERVALS }).toBe("quiet");
 * "quiet" only when the count is unchanged AND the window has passed; a second delivery is "changed:N" and never quiet.
 */
export interface QuietInput {
  readonly count: number;
  readonly expected: number;
  readonly startedMs: number;
  readonly nowMs: number;
  readonly windowMs: number;
}

export function quietState(input: QuietInput): string {
  if (input.count !== input.expected) return `changed:${input.count}`;
  return input.nowMs - input.startedMs >= input.windowMs ? "quiet" : "waiting";
}
```

Unit tests (`tests/unit/lanes/tw/quiet.test.ts`, 3): `waits while the window is open and the count is unchanged` (`"waiting"`); `is quiet once the window has passed with the count unchanged` (`"quiet"`); `reports changed when a second delivery arrives inside the window` (`"changed:2"`).

### 6.4 `src/lanes/tw/visible.ts` (wraps `canaryPrecondition`, `src/readiness/canary.ts:29-45`)

```ts
import type { TwentyClient } from "../../clients/twenty.ts";
import { canaryPrecondition, CANARY_MAX_TRIGGERS } from "../../readiness/canary.ts";
import { recordIdOf } from "../../readiness/checks.ts";
import { runScopedName } from "../../run/prefix.ts";
import type { Delivery, PathKey, Receiver } from "../../webhooks/receiver.ts";
import { TWENTY_WEBHOOK_MEMO_MS, CANARY_MARGIN_MS } from "../../slo.ts";

/** Deliveries of one record id on one path (the record id is in the body: recordIdOf). */
export function deliveriesOf(receiver: Receiver, key: PathKey, recordId: string): Delivery[] {
  return receiver.deliveries(key).filter((d) => recordIdOf(d) === recordId);
}

export interface VisibleResult {
  /** 1 or 2: canary events sent. */
  readonly triggers: number;
  /** Person ids created as canaries: the caller removes them. */
  readonly personIds: string[];
}

/**
 * Bounded positive control before the first real event: at most CANARY_MAX_TRIGGERS canaries.
 * `waitUntil` is injected: specs pass expect.poll(...).toBe(true) with intervals POLL_INTERVALS;
 * unit tests pass a loop over a fake clock.
 */
export async function awaitVisible(input: {
  readonly tw: TwentyClient;
  readonly receiver: Receiver;
  readonly key: PathKey;
  readonly createdAtMs: number;
  readonly nowMs: () => number;
  readonly waitUntil: (predicate: () => boolean, timeoutMs: number, message: string) => Promise<void>;
  readonly deliveryMs: number;
}): Promise<VisibleResult> {
  const personIds: string[] = [];
  let canaryId: string | undefined;
  const triggers = await canaryPrecondition({
    trigger: async () => {
      if (personIds.length >= CANARY_MAX_TRIGGERS) {
        throw new Error("TEST BUG: canary bound exceeded");
      }
      canaryId = await input.tw.people.create(runScopedName(`tw-canary-${personIds.length + 1}`));
      personIds.push(canaryId);
    },
    delivered: () =>
      canaryId !== undefined && deliveriesOf(input.receiver, input.key, canaryId).length > 0,
    elapsedMs: () => input.nowMs() - input.createdAtMs,
    waitUntil: input.waitUntil,
    memoTtlMs: TWENTY_WEBHOOK_MEMO_MS,
    deliveryMs: input.deliveryMs,
    marginMs: CANARY_MARGIN_MS,
  });
  return { triggers, personIds };
}
```

Unit tests (`tests/unit/lanes/tw/visible.test.ts`, 2) with a fake `tw` (`people.create` returns `c1`, `c2`, …), a fake receiver, and a fake `waitUntil` that advances a fake clock 1 s per loop:
1. `sends one canary when the first is delivered inside the window` → `triggers: 1`.
2. `sends a second canary after the window when the first was dropped` → `triggers: 2`. Input that fails: a canary that never reaches the receiver would make the bound throw on a third call.

### 6.5 `src/lanes/tw/webhook-factory.ts`

```ts
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
 * alone did not drop the first event; the regression test keeps it so the sequence matches the probe. Returns the id for cleanup.
 */
export async function primeWorkspaceCache(tw: TwentyClient): Promise<string> {
  return tw.people.create(runScopedName("tw-prime"));
}
```

Unit tests (`tests/unit/lanes/tw/webhook-factory.test.ts`, 3) with fakes: `creates with the receiver URL, a per-run secret and the run-scoped description`; `remove deletes the webhook by its id`; `primeWorkspaceCache creates one person with the run-scoped name`.

### 6.6 `src/lanes/tw/gates.ts` (FC-TW-3)

```ts
export interface Gate {
  readonly skip: boolean;
  /** Printed by test.skip; never a silent pass. */
  readonly reason: string;
}

/** A live row is skipped with its blocker named, not passed. */
export function liveGate(name: string, ready: boolean, blockedBy: string): Gate {
  return ready ? { skip: false, reason: "" } : { skip: true, reason: `${name} blocked: ${blockedBy}` };
}

/** Stripe rows run live only when the test-mode key is set (repo rule 11). */
export function stripeKeyPresent(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env["STRIPE_API_KEY"] ?? "").trim() !== "";
}
```

Unit tests (`tests/unit/lanes/tw/gates.test.ts`, 3): `liveGate skips with the blocker named when not ready`; `liveGate passes through when ready (empty reason)`; `stripeKeyPresent is false for an unset or blank key`.

### 6.7 `src/lanes/tw/payload-schema.ts` (WH-003)

```ts
import Ajv from "ajv";

/**
 * Body keys at the pinned ref: transform-event-batch-to-webhook-events.ts:45-57 builds targetUrl, eventName,
 * objectMetadata, workspaceId, webhookId, eventDate, record, plus userId / workspaceMemberId (optional) and
 * updatedFields (update events only). P-TW-1 and P-TW-4 CONFIRMED the observed keys (no event id).
 */
export const twentyBodySchema = {
  type: "object",
  required: ["targetUrl", "eventName", "objectMetadata", "workspaceId", "webhookId", "eventDate", "record"],
  additionalProperties: true,
  properties: {
    targetUrl: { type: "string" },
    eventName: { type: "string", pattern: "^person\\.(created|updated|deleted)$" },
    objectMetadata: {
      type: "object",
      required: ["id", "nameSingular"],
      properties: { id: { type: "string" }, nameSingular: { type: "string" } },
    },
    workspaceId: { type: "string" },
    webhookId: { type: "string" },
    eventDate: { type: "string" },
    record: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
  },
} as const;

const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(twentyBodySchema);

export function bodyErrors(body: unknown): string[] {
  return validate(body) ? [] : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
}
```
(The builder checks `ajv.compile` on the `as const` shape in the unit test; if strict mode rejects it, relax the `as const` typing, not the schema.)

Unit tests (`tests/unit/lanes/tw/payload-schema.test.ts`, 2): `accepts a body with every required key` (`[]`); `reports the missing record id`.

### 6.8 Specs

Common imports for every spec:
```ts
import { test, expect } from "../../../src/fixtures/index.ts";
import { awaitVisible, deliveriesOf } from "../../../src/lanes/tw/visible.ts";
import { createFreshWebhook, primeWorkspaceCache } from "../../../src/lanes/tw/webhook-factory.ts";
import { flipOneBodyByte, verifyDelivery, withNonce } from "../../../src/lanes/tw/oracle.ts";
import { quietState } from "../../../src/lanes/tw/quiet.ts";
import { POLL_INTERVALS, SLO, TW_QUIET_TIMEOUT_MS, TW_QUIET_WINDOW_MS } from "../../../src/lanes/tw/slo.ts";
import { runScopedName } from "../../../src/run/prefix.ts";
```

**`tests/webhooks/tw/signature.spec.ts`** (WH-001 with its inline negative control; WH-007; two test blocks):
```ts
test("P2-TW-WH-001: a person.created delivery verifies over \"${timestamp}:${body}\" with the timestamp within 5 s of receipt", async ({ tw, receiverHandle }) => {
  const testId = "tw-sign";
  const key = receiverHandle.key(testId);
  const hook = await createFreshWebhook({ tw, receiverHandle, testId, operations: ["person.created"] });
  const created: string[] = [];
  try {
    const visible = await awaitVisible({
      tw, receiver: receiverHandle.receiver, key, createdAtMs: Date.now(), nowMs: Date.now,
      deliveryMs: SLO.twWebhookDelivery.ms,
      waitUntil: (predicate, timeoutMs, message) =>
        expect.poll(predicate, { timeout: timeoutMs, intervals: POLL_INTERVALS, message }).toBe(true),
    });
    created.push(...visible.personIds);
    const realId = await tw.people.create(runScopedName("tw-sign-real"));
    created.push(realId);
    await expect.poll(() => deliveriesOf(receiverHandle.receiver, key, realId).length, {
      timeout: SLO.twWebhookDelivery.ms, intervals: POLL_INTERVALS, message: "P2-TW-WH-001 delivery",
    }).toBe(1);
    const delivery = deliveriesOf(receiverHandle.receiver, key, realId)[0];
    if (delivery === undefined) throw new Error("TEST BUG: delivery vanished after the poll");
    expect(verifyDelivery(delivery, hook.secret)).toEqual({ ok: true });
    // Negative control: the oracle must fail on a changed byte, or the line above proves nothing.
    expect(verifyDelivery({ ...delivery, rawBody: flipOneBodyByte(delivery.rawBody) }, hook.secret))
      .toEqual({ ok: false, reason: "signature-mismatch" });
  } finally {
    for (const id of created) await tw.people.remove(id);
    await hook.remove();
  }
});
```
`P2-TW-WH-007` uses the same setup and asserts `expect(verifyDelivery({ ...delivery, headers: withNonce(delivery.headers, "ff".repeat(16)) }, hook.secret)).toEqual({ ok: true })`.

**`tests/webhooks/tw/payload.spec.ts`** (WH-003): one webhook with `["person.created","person.updated","person.deleted"]`; create, update (`tw.people.update`, OD-12), delete (`tw.people.remove`). Each event: `deliveriesOf(...).length === 1`; `bodyErrors(JSON.parse(rawBody))` equals `[]`; `eventName` matches the operation.

**`tests/webhooks/tw/delivery.spec.ts`** (WH-004, WH-005 ×2, WH-006):
```ts
test("P2-TW-WH-004: a receiver 500 gets exactly one request for the event (no retry)", async ({ tw, receiverHandle }) => {
  const testId = "tw-500";
  const key = receiverHandle.key(testId);
  const hook = await createFreshWebhook({ tw, receiverHandle, testId, operations: ["person.created"] });
  const created: string[] = [];
  try {
    created.push(...(await awaitVisible({ /* as in signature.spec.ts */ })).personIds);
    receiverHandle.receiver.setMode(key, { kind: "500" });
    const realId = await tw.people.create(runScopedName("tw-500-real"));
    created.push(realId);
    const count = (): number => deliveriesOf(receiverHandle.receiver, key, realId).length;
    await expect.poll(count, { timeout: SLO.twWebhookDelivery.ms, intervals: POLL_INTERVALS, message: "one request arrived" }).toBe(1);
    const startedMs = Date.now();
    await expect.poll(
      () => quietState({ count: count(), expected: 1, startedMs, nowMs: Date.now(), windowMs: TW_QUIET_WINDOW_MS }),
      { timeout: TW_QUIET_TIMEOUT_MS, intervals: POLL_INTERVALS, message: "no retry inside the quiet window" },
    ).toBe("quiet");
  } finally {
    for (const id of created) await tw.people.remove(id);
    await hook.remove();
  }
});
```
WH-005 (two tests): the same shape with `setMode(key, {kind:"slow", delayMs: 4000})` (expect one delivery, quiet) and `{kind:"slow", delayMs: 6000})` (one request, quiet; the 5 s timeout closes the call on the product side; P-TW-3). The `webhook.response` row is not asserted (ClickHouse, unavailable).

WH-006 (identity wording, OD-4): `const body = JSON.parse(delivery.rawBody.toString("utf8")) as { webhookId: string; eventName: string; record: { id: string } }`; `expect(body).toMatchObject({ webhookId: hook.id, eventName: "person.created", record: { id: realId } })`; `expect(Object.keys(body)).toEqual(expect.arrayContaining(["targetUrl","eventName","objectMetadata","workspaceId","webhookId","eventDate","record"]))`; `count === 1`.

**`tests/webhooks/tw/b1-drop.spec.ts`** (B1 regression check, two serial tests):
```ts
/**
 * B1 (index section 5). Not reproduced as a test-grade bug: 5 of 6 first events delivered; the one drop (P-TW-2n) was
 * intermittent and not reliable enough for test.fail() (rule 12; P-TW-12 shows test.fail() masks a broken control).
 * Two serial tests: test 1 is the positive control (must pass; serial mode skips test 2 if it fails). Test 2 is a plain
 * regression check: the first event is delivered. If it ever fails, that is a finding to report, not a reason to retry.
 */
test.describe.serial("B1 webhook drop (ID pending)", () => {
  test("B1 control: a fresh webhook delivers an event sent after one memo window", async ({ tw, receiverHandle }) => {
    const testId = "tw-b1-control";
    const key = receiverHandle.key(testId);
    const hook = await createFreshWebhook({ tw, receiverHandle, testId, operations: ["person.created"] });
    const created: string[] = [];
    try {
      const visible = await awaitVisible({ tw, receiver: receiverHandle.receiver, key, createdAtMs: Date.now(), nowMs: Date.now, deliveryMs: SLO.twWebhookDelivery.ms,
        waitUntil: (predicate, timeoutMs, message) => expect.poll(predicate, { timeout: timeoutMs, intervals: POLL_INTERVALS, message }).toBe(true) });
      created.push(...visible.personIds);
      const afterWindow = await tw.people.create(runScopedName("tw-b1-after"));
      created.push(afterWindow);
      await expect.poll(() => deliveriesOf(receiverHandle.receiver, key, afterWindow).length, {
        timeout: SLO.twWebhookDelivery.ms, intervals: POLL_INTERVALS, message: "B1 control delivered",
      }).toBe(1);
    } finally {
      for (const id of created) await tw.people.remove(id);
      await hook.remove();
    }
  });

  test("B1 webhook drop (ID pending): an event sent inside the memo window is delivered", async ({ tw, receiverHandle }) => {
    const testId = "tw-b1-drop";
    const key = receiverHandle.key(testId);
    const created: string[] = [];
    let hook: Awaited<ReturnType<typeof createFreshWebhook>> | undefined;
    try {
      created.push(await primeWorkspaceCache(tw));
      hook = await createFreshWebhook({ tw, receiverHandle, testId, operations: ["person.created"] });
      const firstId = await tw.people.create(runScopedName("tw-b1-first"));   // inside the memo window
      created.push(firstId);
      await expect.poll(() => deliveriesOf(receiverHandle.receiver, key, firstId).length, {
        timeout: SLO.twWebhookDelivery.ms, intervals: POLL_INTERVALS, message: "B1: first event delivered",
      }).toBe(1);
    } finally {
      for (const id of created) await tw.people.remove(id);
      if (hook) await hook.remove();
    }
  });
});
```
If test 2 ever fails in a later run: label PRODUCT BUG (SUSPECTED, intermittent) with the timeline (P-TW-2n is the reference), and do not add `test.fail()` without a reproduction the owner accepts.

**`tests/integration/tw/pagination.spec.ts`** (PAG-001, PAG-002): create 60 people (`runScopedName("tw-page-<i>")`; labels valid); list with `limit=20` and `startingAfter` (P-TW-10). PAG-001: fetch page 1; create 10 more; walk the rest; `expect(sorted(ids)).toEqual(sorted(created60))`; no duplicates. PAG-002 (OD-5): page size 10; fetch page 1; delete one record from page 2 with `tw.people.remove` before fetching it; walk; expected = created minus the deleted one, each once. Expected values come from creation, not from the DB. All people removed in `finally`.

**`tests/integration/tw/currency.spec.ts`** (CUR-001): `POST /rest/opportunities` with `amount: {amountMicros: "9007199254740991", currencyCode: "USD"}` (body shape UNPROBED; check the OAS schema first); GET back; exact string; the `qa_ro` read of the column name comes from `information_schema` (UNPROBED). The 2^53+1 test: rejected with a validation error, or the parsed value equals the sent value (`Number.isSafeInteger` check fails on a rounded number).

**`tests/contracts/tw/rest-oas.spec.ts`** (CON-001 ×3). The OAS needs the bearer (P-TW-10): the spec fetches the document with the bearer, writes it to the run's `test-results/` folder, and loads the file:
```ts
import { writeFileSync } from "node:fs";
import { loadSpec } from "../../../src/contracts/oas.ts";
import { apiBaseUrl } from "../../../src/env.ts";

test("P2-TW-CON-001: GET list of people conforms to the OAS", async ({ tw, twAuth, request }) => {
  const doc = await request.get(`${apiBaseUrl("twenty")}/rest/open-api/core`, { headers: { authorization: twAuth.headerValue.reveal() } });
  expect(doc.status()).toBe(200);
  const file = `test-results/tw-rest-oas-${currentRunPrefix()}.json`;
  writeFileSync(file, await doc.text());
  const spec = await loadSpec("tw-rest", file);
  const res = await tw.raw("GET", "/rest/people?limit=1");
  expect(res.status).toBe(200);
  spec.assertValid({ method: "get", path: "/people" }, { status: 200 }, res.body);
});
```
`companies` and `opportunities` tests are the same shape. `tw.raw` returns `CallResult` (`src/clients/base.ts:49-54`); `assertValid` throws on invalid bodies (`contracts/oas.ts:264`). `currentRunPrefix` is imported from `src/run/prefix.ts`.

**`tests/contracts/tw/graphql-errors.spec.ts`** (CON-002):
```ts
test("P2-TW-CON-002: an invalid GraphQL filter returns 200 with errors[]", async ({ request, twAuth }) => {
  const res = await request.post(`${apiBaseUrl("twenty")}/graphql`, {
    headers: { [twAuth.headerName]: twAuth.headerValue.reveal() },
    data: { query: "{ people(filter: { bogusField: { eq: 1 } }) { edges { node { id } } } }" },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { errors?: unknown[] };
  expect(Array.isArray(body.errors) && body.errors.length > 0).toBe(true);
});
```
The `/graphql` path is UNPROBED for the API-key bearer (the mint used `/metadata`); the builder confirms it first.

**`tests/integration/tw/soft-delete.spec.ts`** (DEL-002): create person; `tw.people.remove(id)` (soft); the REST list (`limit`) and a search by the run-scoped name (filter syntax from the OAS, P-TW-10) do not include it; DB: schema from `information_schema.schemata WHERE schema_name LIKE 'workspace\_%'` (the same as `rules.ts:243`; P-TW-11 saw 2 workspace schemas, so the builder finds the schema that holds the run's person), then `SELECT "deletedAt" IS NOT NULL AS gone FROM ${quoteIdent(schema)}."person" WHERE "id" = $1` through `readOnlyDb("twenty").select(sql, [id])` → `gone: true`. `quoteIdent` from `src/db/roles.ts:25`.

**`tests/integration/tw/billing.spec.ts`** (STR-001, blocked): 
```ts
const gate = liveGate("P2-TW-STR-001", stripeKeyPresent() && billingSchemaPresent, "billing tables absent on twentycrm/twenty:v2.44.0 (P-TW-7b); STRIPE_API_KEY needed too");
test.skip(gate.skip, gate.reason);
```
`billingSchemaPresent` is a boolean the spec computes from `information_schema` at setup (false on this image). The body (not built until the schema exists): signed `customer.subscription.updated` (newer) before `customer.subscription.created` (older) with `signStripe`; the stored row through `qa_ro`; expect the newer state. The per-run secret comes from the job env (OD-9).

### 6.9 Unit test totals per module

| Module | Unit file | Tests |
|---|---|---|
| `src/lanes/tw/oracle.ts` | `tests/unit/lanes/tw/oracle.test.ts` | 5 |
| `src/lanes/tw/quiet.ts` | `tests/unit/lanes/tw/quiet.test.ts` | 3 |
| `src/lanes/tw/visible.ts` | `tests/unit/lanes/tw/visible.test.ts` | 2 |
| `src/lanes/tw/webhook-factory.ts` | `tests/unit/lanes/tw/webhook-factory.test.ts` | 3 |
| `src/lanes/tw/gates.ts` | `tests/unit/lanes/tw/gates.test.ts` | 3 |
| `src/lanes/tw/payload-schema.ts` | `tests/unit/lanes/tw/payload-schema.test.ts` | 2 |
| `src/clients/twenty.ts` `people.update` (OD-12) | `tests/unit/clients/clients.test.ts` (+1) | 1 |
| **L0 total** | | **19** |
| CI workflow (L5) | `tests/unit/ci/workflow.test.ts` (+2) | 2 |
| **Unit delta** | | **+21** (base 285 → 306) |

---

## 7. Data isolation, cleanup and leak check

| Item | Created by | Removed by | Leak rule that sees it |
|---|---|---|---|
| Webhooks (`targetUrl` = `/r/<run>/<test>`) | `createFreshWebhook` | `hook.remove()` → `DELETE /rest/webhooks/{id}` (soft) | `tw-leak-webhook-url` (`rules.ts:226-234`) |
| People (`firstName` run-scoped) | `tw.people.create`, canaries, prime | `tw.people.remove(id)` in `finally` | `tw-leak-person-first-name` (`rules.ts:236-245`) |
| API keys | `mintTwenty` (fixture) | `revokeAndVerify` (fixture) | `tw-leak-api-key-name` (`rules.ts:216-224`) |
| Billing rows (STR-001, later) | n/a on this image | none probed | none: a leak rule and an API delete would be needed before the row can run |
| Receiver logs | receiver | none (`receiver-logs/`) | none |

No test changes shared seed state. The feature-flag row is not written (WH-008 cut). The per-run billing secret is generated per job and passed only through the `up` environment (OD-9); it is never printed. The sweep (`src/invariants/after-test.ts`) runs after every test and asserts `workers === 1`.

---

## 8. Build steps per task (in order)

Each task: pre-flight (8.0), then its steps. Commands are exact.

### 8.0 Pre-flight (every task)

```bash
export PATH="/usr/local/bin:$PATH"
cd /home/user/api-webhook-db-test-suite   # or the builder's checkout
git fetch origin && git rev-parse origin/main
npm ci                                       # installs harness 0.3.0 and stripe 23.0.1 from the lock
node -p "require('./node_modules/qa-portfolio-harness/package.json').version"   # must print 0.3.0 (STOP otherwise)
node -p "require('./node_modules/stripe/package.json').version"                  # must print 23.0.1
docker ps --format '{{.Names}}' | grep -E '^qa-harness-' && { echo "STOP: another stack is up"; exit 1; } || true
for p in 3000 3001 3002 4317 5434 5555 6380 6381 5433 5450 5451; do (exec 3<>/dev/tcp/127.0.0.1/$p) 2>/dev/null && { echo "STOP: port $p taken"; exit 1; }; done
npm run unit 2>&1 | grep -E '^# (tests|pass|fail)'        # record the base; 285 expected on aa10ec1
```
`ss` is not on every PATH: the `/dev/tcp` loop is the portable check. Port list: web 3002, Postgres 5434, receiver 4317 (`src/env.ts`), plus the foundation ports.

Every `up` for Twenty needs `PRODUCTS_ROOT` (R13) and the allow-list:
```bash
export PATH="/usr/local/bin:$PATH"
START=$(date +%s); PRODUCTS_ROOT="$(cd ../ && pwd)/products" OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS="host.docker.internal,172.17.0.1" timeout 1500 node node_modules/qa-portfolio-harness/scripts/up.mjs twenty; echo "up rc=$? secs=$(( $(date +%s)-START ))"
PRODUCTS_ROOT="$(cd ../ && pwd)/products" node scripts/harness-seed.mjs twenty     # seed: needed for the logins (85 s measured)
node scripts/db-roles.ts provision twenty                                           # qa_ro / qa_fixture
# ... the lane ...
PRODUCTS_ROOT="$(cd ../ && pwd)/products" node node_modules/qa-portfolio-harness/scripts/down.mjs twenty; echo "down rc=$?"
```
Measured on the planning VM: cold `up` 191 s (image pull inside), warm-ish `up` 110 s, seed 85 s. The CI deadline is set from these (section 14.4).

### 8.1 L0: helpers and unit tests

1. Pre-flight.
2. Create `src/lanes/tw/{slo.ts,oracle.ts,quiet.ts,visible.ts,webhook-factory.ts,gates.ts,payload-schema.ts}` exactly as section 6, and add `update(id: string, firstName: string): Promise<void>` to `people` in `src/clients/twenty.ts` (PATCH `/rest/people/${id}`, `expect: [200]`, the same shape as `remove`), with its unit test (OD-12).
3. Create the unit tests of section 6.9 under `tests/unit/lanes/tw/` and `tests/unit/clients/clients.test.ts`.
4. `npm run check` exits 0; `npm run unit` = base + 19.
5. Commit (section 11), push, open a PR to `main`.

### 8.2 L1: contracts, pagination, currency

1. Pre-flight. One stack: `up`, seed, roles (8.0).
2. Confirm the authenticated `GET /rest/open-api/core` (done: P-TW-10); confirm the `/graphql` bearer path for CON-002 (the first step of the spec's setup).
3. Write `tests/contracts/tw/rest-oas.spec.ts`, `tests/contracts/tw/graphql-errors.spec.ts`, `tests/integration/tw/pagination.spec.ts`, `tests/integration/tw/currency.spec.ts` (section 6.8).
4. `npx playwright test --project=tw-api tests/contracts/tw tests/integration/tw/pagination.spec.ts tests/integration/tw/currency.spec.ts` → 7 passed.
5. `down`.

### 8.3 L2: webhooks

1. Pre-flight. One stack, `up`, seed, roles.
2. Write `tests/webhooks/tw/signature.spec.ts`, `payload.spec.ts`, `delivery.spec.ts`, `b1-drop.spec.ts` (section 6.8).
3. `npx playwright test --project=tw-api tests/webhooks/tw` → 9 passed (the B1 regression check passes; the B1 control passes).
4. `down`.

### 8.4 L3: integration (soft delete, billing gate)

1. Pre-flight. One stack.
2. Write `tests/integration/tw/soft-delete.spec.ts` and `tests/integration/tw/billing.spec.ts` (gated skip with the reason).
3. `npx playwright test --project=tw-api tests/integration/tw/soft-delete.spec.ts tests/integration/tw/billing.spec.ts` → 1 passed, 1 skipped with the reason printed.
4. `down`.

### 8.5 RT-001 (BLOCKED, not built)

Before RT-001 is built, one new probe must run on a stack: create a logic function with `httpRouteTriggerSettings` through `createOneLogicFunction` (input shape from the introspection in P-TW-9b), call its route, and check whether a workflow or logic run creates a record (`qa_ro` count). If the executor does not run in the harness, RT-001 stays blocked and the owner decides (OD-13).

### 8.6 L5: CI lane job

1. Edit `.github/workflows/api.yml`: add a `tw-api` job after `foundation`. The job needs the environment the probes proved necessary: `PRODUCTS_ROOT`, the allow-list variable, and the seed step.
   ```yaml
     tw-api:
       name: tw-api
       needs: foundation
       runs-on: ubuntu-24.04
       timeout-minutes: 30
       env:
         PRODUCTS_ROOT: ${{ github.workspace }}/../products
         OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS: host.docker.internal,172.17.0.1
       steps:
         - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
           with:
             persist-credentials: false
         - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
           with:
             node-version-file: .nvmrc
             cache: npm
         - name: Install
           run: npm ci
         - name: Generate DB role passwords (per job, masked)
           id: pw
           run: |
             set -euo pipefail
             ro="$(openssl rand -hex 16)"; fx="$(openssl rand -hex 16)"
             echo "::add-mask::$ro"; echo "::add-mask::$fx"
             echo "P2_QA_RO_PASSWORD=$ro" >> "$GITHUB_ENV"; echo "P2_QA_FIXTURE_PASSWORD=$fx" >> "$GITHUB_ENV"
         - name: Bootstrap Twenty at the pinned ref
           run: bash scripts/bootstrap.sh twenty
         - name: Harness up (one stack)
           run: timeout 900 node node_modules/qa-portfolio-harness/scripts/up.mjs twenty
         - name: Seed Twenty (harness seed)
           run: node scripts/harness-seed.mjs twenty
         - name: Provision roles
           run: npm run db:roles:provision -- twenty
         - name: Run the lane (tw-api and tw-serial)
           run: npx playwright test --project=tw-api --project=tw-serial
         - name: Upload report, junit, receiver logs
           if: always()
           uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
           with:
             name: tw-lane
             path: |
               results/junit.xml
               playwright-report/
               receiver-logs/
               fixture-logs/
             if-no-files-found: warn
             retention-days: 7
         - name: Harness down
           if: always()
           run: node node_modules/qa-portfolio-harness/scripts/down.mjs twenty
   ```
   Open points for the first CI run (UNPROBED on runners): the allow-list address (`172.17.0.1` is the usual docker0 address on GitHub-hosted runners); the `PRODUCTS_ROOT` path (the bootstrap's default is `../products`); `timeout 900` until the CI cold `up` is measured. The `always()` `down` is required.
2. `tests/unit/ci/workflow.test.ts`: +2 tests (`tw-api job needs foundation and has a 30 minute timeout`; `tw-api job ends with an always() harness down step`). Read the file first; keep its style.
3. `npm run check` exits 0; `npm run unit` = base + 21.
4. `npm run list:api` shows `tw-api` tests: 23 (5 readiness + 18 new, including the skipped STR-001).
5. Push, open a PR, subscribe to its CI (section 15).

---

## 9. Done criteria per task (machine-checkable)

Every task:
- `npm run check` exit 0 (`echo $?`).
- Unit count reported as `base + N` (N per section 6.9), with the base measured on the same VM.
- `npm run list:api` output contains each new exact title (grep each title from section 4.1 in the output).
- Live project pass on its own stack: `npx playwright test --project=tw-api` exit 0. A skip without a printed reason fails the review; a gated skip with a reason is correct.
- After `down`: `docker ps -a --format '{{.Names}}' | grep -c '^qa-harness-'` prints `0`.
- `git status --porcelain` empty after the commit.
- Secret scan: `git diff origin/main...HEAD | grep -nE '(sk_(test|live)_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.)'; test $? -eq 1`
- Trailer gate: `BASE=$(git rev-parse origin/main); git rev-parse --verify "$BASE" || exit 1; git log "$BASE"..HEAD | grep -iE 'co-authored-by|generated with'; test $? -eq 1`
- Personal-name check (rule 1): the owner reviews `git diff origin/main...HEAD`. The owner-handle in git URLs (`package.json`, the lock) is exempt (index section 9 item 2).

Per task extras:
- L0: the helper files exist; `tests/unit/lanes/tw` has 6 files (18 tests); the clients test has the +1 update test (19 total).
- L1: 7 passed (section 8.2 step 4).
- L2: 9 passed; the B1 regression check and control are in the list; the PR states the B1 result as in the probe record (NOT REPRODUCED; intermittent drop P-TW-2n).
- L3: DEL-002 passes; STR-001 skipped with its reason printed.
- L5: the workflow test passes; `npm run check` exit 0.

---

## 10. Self-verification (each assertion can fail)

| Assertion | Input that must fail it | Proof |
|---|---|---|
| WH-001 verifies | a body byte flipped (control in the same test) | `flipOneBodyByte` → `signature-mismatch` (oracle unit test 2); **P-TW-1 verifyBodyFlipped** |
| WH-001 timestamp window | receipt 6 s after signing | oracle unit test 4 |
| WH-007 nonce unsigned | a product that signed the nonce → fresh nonce fails | oracle unit test 3; **P-TW-1 verifyNonceReplaced** |
| WH-003 schema | body without `record.id` | payload-schema unit test 2 |
| WH-004 one request | a retry on 500 → count 2 → `quietState` = `changed:2` | quiet unit test 3 |
| WH-005 timeout | a retry after the 5 s timeout → count 2 | same; **P-TW-3** (1 request) |
| WH-006 identity | a changed `webhookId` in the body | `toMatchObject` on the created ids; **P-TW-4** |
| B1 control | a webhook that never delivers → the control's poll fails and serial mode skips test 2 | serial mode (**P-TW-12 S2/S3**) |
| CANARY bound | a third canary | visible unit test (bound throws) |
| `quietState` | a count that changes | quiet unit test 3 |
| gates | a blank key treated as set | gates unit test 3 |

Mutations are run in a scratch copy under `/tmp/p2-lane-probes/`, never on the branch.

---

## 11. Commit plan

Lowercase Conventional Commits, explicit paths only (`git add <path>`; never `git add -A` or `git add .`). No trailers.

| Task | Commits (subject) | Paths |
|---|---|---|
| L0 | `feat(tw): add lane helpers for fresh webhooks and receiver oracle` | `src/lanes/tw/slo.ts src/lanes/tw/oracle.ts src/lanes/tw/quiet.ts src/lanes/tw/visible.ts src/lanes/tw/webhook-factory.ts src/lanes/tw/gates.ts src/lanes/tw/payload-schema.ts` |
| L0 | `test(tw): unit tests for lane helpers` | `tests/unit/lanes/tw/*.test.ts` |
| L0 | `feat(tw): add twenty client update for people` | `src/clients/twenty.ts tests/unit/clients/clients.test.ts` |
| L0 | `docs(probes): record twenty build probes` | the build's dated probe file (if the builder adds one) |
| L1 | `test(tw): contract, pagination and currency cases` | `tests/contracts/tw/ tests/integration/tw/pagination.spec.ts tests/integration/tw/currency.spec.ts` |
| L2 | `test(tw): webhook signature, payload and delivery cases` | `tests/webhooks/tw/signature.spec.ts tests/webhooks/tw/payload.spec.ts tests/webhooks/tw/delivery.spec.ts` |
| L2 | `test(tw): b1 webhook regression check with a positive control` | `tests/webhooks/tw/b1-drop.spec.ts` |
| L3 | `test(tw): soft delete and billing gate` | `tests/integration/tw/soft-delete.spec.ts tests/integration/tw/billing.spec.ts` |
| L5 | `ci(tw): add the twenty lane job` | `.github/workflows/api.yml tests/unit/ci/workflow.test.ts` |

## 12. Environment changes

**Automatic from the repo:** `.cursor/environment.json` (`install` = `scripts/cloud-install.sh`, which runs `npm ci` when the lock exists; `start` = docker, receiver hostname, `qa:passwords`) and `.claude/hooks/session-start.sh` (Node 22 on PATH, `$NODE24`, passwords, receiver hostname, Docker start). Neither needs a change for this lane.

**Found by the probes (ENV):**
- `npm ci` must run after the lock changes (this VM's `node_modules` predated `stripe`). `scripts/cloud-install.sh` does this on a fresh environment.
- `PRODUCTS_ROOT` must be set for `up` (R13). The repo `.env` does not set it; the bootstrap writes it only in its fallback path. Set it in the environment (`PRODUCTS_ROOT=<parent>/products`), not by editing `.env` by hand.
- `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS` must be in the environment of `up` (P-TW-5 shows the value reached the server).
- Seeding is separate from `up` (`scripts/harness-seed.mjs twenty`, 85 s).

**Cursor cloud (exact steps):**
1. Turn off Cursor's commit attribution before a Cursor build (foundation section 9 item 4).
2. Install: already runs `scripts/cloud-install.sh` (`.cursor/environment.json` line 5). Nothing to paste.
3. Set `PRODUCTS_ROOT` in the cloud environment's variables (or the job's `up` command). Nothing secret.
4. Optional: `STRIPE_API_KEY` in the secrets panel. It does not unblock STR-001 (the billing schema is absent, P-TW-7b); keep it unset until the owner decides OD-10.

**Claude Code cloud (exact steps):**
1. Setup script: run `npm ci` (not `npm install`); confirm `node -p "require('stripe/package.json').version"` prints `23.0.1`.
2. Session-start hook: no change.
3. Environment variables: add `PRODUCTS_ROOT` in the cloud environment menu (the session's title bar, then Edit), as an environment variable. Nothing secret.
4. `STRIPE_API_KEY`: optional, as above.

**GitHub Actions (CI):** the job in section 8.6 sets `PRODUCTS_ROOT` and the allow-list in the job `env`; the DB role passwords are generated per job. No repository secret is needed for the built rows.

**Automatic vs pasted:** automatic = install and hook; set by the owner = `PRODUCTS_ROOT` (not secret). Stripe key: optional, no effect until the billing schema exists.

## 13. Harness requests

| ID | Status | Problem | Evidence | Blocks |
|---|---|---|---|---|
| **HR-4** | **DEFERRED** (owner decision; pending a later harness release) | Only one `server` replica under `up` | P-TW-8 (one server container) | P2-TW-CACHE-001 |
| **HR-5** | **DEFERRED** (owner decision; pending a later harness release) | Second workspace needs `IS_MULTIWORKSPACE_ENABLED`; not in the pass-through list | P-TW-5, P-TW-6 (flag false; not in `twenty-passthrough.ts:9-15`) | P2-TW-WH-009, P2-TW-STR-002 |
| HR-2 (existing) | verified at 0.3.0 for the pass-through | Billing variables and the allow-list reach the server | P-TW-5 (allow-list value set), P-TW-7b (all four billing variables set) | (the billing schema is a separate blocker, below) |
| — | not an HR | Billing schema absent on `twentycrm/twenty:v2.44.0` | P-TW-7b (`relation "core.billingProduct" does not exist`; no billing tables) | P2-TW-STR-001 (BLOCKED; owner decides OD-10) |
| — | not an HR | Rate-limit flag is a DB row | P-TW-5 | none (WH-008 cut) |
| — | not an HR | Event-log rows in ClickHouse | P-TW-11 | the secondary oracle of WH-005 (not built) |

No new HR item is requested now. HR-4 and HR-5 are deferred as the owner asked; the builder does not plan workarounds for them.

## 14. Will not do; Open decisions; Risks; budgets

### 14.1 Will not do
- Edit any fork, `.env`, the harness, or commit anything other than the plan files in a planning session.
- Plan a workaround for DEFERRED rows (CACHE-001, WH-009, STR-002): no second server by hand, no second workspace through the database, no flag write for WH-008 (cut).
- Cut any case or invent an ID. CUT IDs: section 4.3 only.
- Add a retry, a sleep, a re-trigger loop or a raised timeout to get a case green.
- Use `test.fail()` without a reproduction the owner accepts (rule 12; P-TW-12).

### 14.2 Open decisions

No decision is BLOCKING. Each row has a default.

| # | Decision | Evidence | Status |
|---|---|---|---|
| OD-1 | B1: one test or two serial tests | P-TW-12 (masking) | **APPLIED: two serial tests**, and **no `test.fail()`** because B1 is not reliably reproduced (rule 12) |
| OD-2 | B1 oracle: receiver or also the response row | C-4: the response row is in ClickHouse | **APPLIED: receiver only** |
| OD-3 | B1 ID | index section 9 item 7 | open (owner assigns); working title used |
| OD-4 | TW-WH-006 wording | P-TW-4 (no event id) | **APPLIED: identity fields the body carries** (section 4.1 row) |
| OD-5 | TW-PAG-002 wording (derived) | TW-PAG-001 text | default kept: "a record deleted between two page fetches neither duplicates nor skips another record" |
| OD-6 | TW-WH-008 rate-limit drops | upstream `webhook-rate-limit.integration-spec.ts:172`; R8 | **APPLIED: CUT** |
| OD-7 | TW-WH-009 and TW-STR-002 (multi-workspace) | P-TW-6 | **APPLIED: DEFERRED (HR-5)** |
| OD-8 | TW-CACHE-001 (two replicas) | P-TW-8 | **APPLIED: DEFERRED (HR-4)** |
| OD-9 | Billing webhook secret source | P-TW-7b (the per-run value reached the server through `up`) | default kept: per run, through the `up` environment |
| OD-10 | Stripe-backed rows (STR-001) | P-TW-7b: billing tables absent on the image | **open, BLOCKED.** Options: (a) keep STR-001 as a skip with its reason until a billing-capable image is pinned (default); (b) cut P2-TW-STR-001 from the lane. The owner decides. Not BLOCKING: the skip is honest |
| OD-11 | Rate-limit flag write | P-TW-5 | **closed by OD-6** (no write) |
| OD-12 | People update call | `src/clients/twenty.ts` has no update | default kept: add `update` (+1 unit test) |
| OD-13 | TW-RT-001 execution path | P-TW-9 (route is a logic-function field); executor UNPROBED | **open**: RT-001 is BLOCKED until one more probe runs a route-triggered logic function that creates a record. Default: not built |
| OD-14 | Base unit count | P0-r2: 285 | **closed**: baseline 285; the plan's counts are deltas |
| OD-15 | `test.fail()` for the intermittent drop | P-TW-2n: one of six | **open, for the owner:** keep as a regression check (default) or accept a `test.fail()` after a longer reproduction study. The plan does not add it now |

### 14.3 Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Intermittent B1 drop (1 of 6) | A flaky regression check | the test is a plain check with a positive control; a failure is reported with the P-TW-2n timeline, never retried |
| Billing schema absent on the pinned image | STR rows cannot run | BLOCKED with a reason; OD-10 |
| OAS needs the bearer and the loader takes a file | a CON test that fetches anonymously fails | the spec fetches with the bearer and loads the saved file (P-TW-10) |
| Event-log rows only in ClickHouse | no DB oracle for response rows | receiver is the oracle; no row assertion |
| Billing rows have no leak rule and no API delete | a leaked row after a billing test | none while STR-001 is skipped; add the rule and cleanup before STR-001 is built |
| CI runner addresses differ (the allow-list IP, `PRODUCTS_ROOT`) | `up` or delivery fails on the runner | UNPROBED on runners; the first CI run is the probe; the job's `up` step fails fast with the harness error |
| Cold `up` 191 s on this VM | the job deadline | `timeout 900` until measured in CI |

### 14.4 Time budget (per task)

| Task | Build time | Notes |
|---|---|---|
| L0 helpers and unit tests | 90 min | no stack |
| L1 | 60 min | one stack (`up` 110–191 s, seed 85 s) |
| L2 | 90 min | B1 needs about 35 s per run plus the control |
| L3 | 45 min | one stack; the STR-001 skip is immediate |
| L5 | 60 min | CI wall clock measured on the first run |
| RT-001 probe (new, before RT-001) | 45 min | one stack |

CI deadline: `timeout 900` for `up` until the CI cold start is measured; the job limit is 30 minutes (section 8.6).

### 14.5 STOP conditions (builder)

Stop and report (do not work around) if:
- The harness version is not `0.3.0`, or `npm ci` fails, or `stripe` is not 23.0.1 after install.
- Another stack or a product port is up before `up`.
- `up` fails twice for the same reason, or passes its deadline.
- A host is blocked (proxy 403, ENOTFOUND), or the permission check refuses an action the task needs.
- A secret would be printed (any `sk_`, `whsec_`, JWT-like value).
- The branch already exists on `origin` (for a new plan branch).
- A sibling lane's plan file appears in the diff.
- RT-001 is started before its executor probe (OD-13).
- STR-001 is started before OD-10 is decided and the billing schema exists.
- `scripts/db-roles.ts` does not accept `provision twenty` (L5).

---

## 15. Autonomous build design (for the later build sessions)

- One task per session, owner away. Start from `origin/main` (or the open previous task branch, per section 1).
- Follow section 8 in order; run section 9 done criteria; push with `git push -u origin <branch>` (no force); open a PR (the PR is the deliverable for this lane). The PR body has no session link and no co-author line.
- Subscribe the PR to its CI. Fix failures by root cause (file:line), labelling each PRODUCT BUG, TEST BUG or ENV with evidence. Never skip a test, weaken an assertion, or add a retry.
- Never merge, tag, dispatch a workflow, or request an AI review. The owner triggers review and merges.
- No PR template exists on `main` (checked: the standard locations are absent). Use the headings: Summary, Test plan, Done criteria, Open items.

## 16. Repo rules (apply verbatim)

1. No personal names in repo text; roles only (the owner, the maintainer, the builder).
2. No Co-authored-by lines, no "Generated with" lines, no session links. (`AGENTS.md` takes precedence over the attribution reminder of the planning session, which asked for a session line; no such line is in this plan's commits.)
3. Never edit the product forks, their `.env` files, `node_modules` (beyond `npm ci`) or the harness. A needed harness change is an HR item.
4. Never print secrets. Test-only secrets are generated per run and passed only through spawn env. Redact in probes.
5. Never weaken an assertion, raise a timeout, add retries or sleeps, or skip a test to get green.
6. Root-cause every failure with file:line, and label it PRODUCT BUG, TEST BUG or ENV with evidence.
7. Name TW-RACE-004, OBS-TW-001 and P6-OBS-DOC-003 by ID only, with no description.
8. Lowercase Conventional Commits with explicit paths; never `git add -A` or `git add .`.
9. Do not use or describe the GitHub command-line client anywhere in plans, prompts or scripts. Never merge, tag or dispatch workflows.
10. For any environment change, give exact steps for both Cursor cloud and Claude Code cloud (section 12).
11. Stripe-backed rows fall back to a gated skip with the reason when no key is set or the billing schema is absent.
12. `test.fail()` only for a proven, reliably reproduced product bug, placed right before the product assertion, with setup and positive control asserted first. (P-TW-12 shows it masks a broken control, which is why OD-1 uses separate serial tests.)
13. Waits are `expect.poll` with an explicit per-call `timeout` from a named `SLO` budget and `intervals: POLL_INTERVALS`; no fixed sleeps. Lane budgets are in `src/lanes/tw/slo.ts` with the basis stated; foundation budgets are in `src/slo.ts`. Probe scripts (throwaway) use bounded polls.
14. One product stack at a time; always finish with its `down`.

## 17. Shared-file touch list (exact hunks)

Only these shared files may change, each in the task named. No other shared file is touched.

| File | Task | Hunk |
|---|---|---|
| `src/clients/twenty.ts` | L0 (OD-12) | add `update(id: string, firstName: string): Promise<void>` to `people` in `TwentyClient` and `twentyClient` (PATCH `/rest/people/${id}`, `expect: [200]`) |
| `tests/unit/clients/clients.test.ts` | L0 (OD-12) | +1 test: `twenty people.update sends PATCH with the first name` |
| `.github/workflows/api.yml` | L5 | the `tw-api` job of section 8.6, after `foundation` |
| `tests/unit/ci/workflow.test.ts` | L5 | +2 tests |
| `src/db/fixture-allowlist.ts`, `tests/unit/db/fixture.test.ts` | **none** (WH-008 cut; no flag write) | not touched |
| `src/invariants/rules.ts`, `src/slo.ts`, `playwright.config.ts`, `scripts/db-roles.ts` | **none** | not touched |

## 18. Sibling lanes

Other lanes plan in parallel from the same base. This plan names no file or ID of theirs. A sibling file in the diff is a STOP (section 14.5).

---

## Appendix: established versus open (quick reference)

- **Established by a probe on the pinned harness (this pass):** the signature (P-TW-1); one request and the 5 s timeout (P-TW-3); no event id and the identity fields (P-TW-4); the flag as a DB row (P-TW-5); the OAS auth and cursor names (P-TW-10); the event-log store (P-TW-11); `test.fail()` masking (P-TW-12); billing signature checks and the missing billing schema (P-TW-7 / 7b); one server replica (P-TW-8).
- **B1:** not reproduced under the designed sequence (P-TW-2, 2r, a/b/c: 5 of 6 delivered overall); one intermittent drop (P-TW-2n), no fan-out job logged for the first event. The regression check stays; no `test.fail()`.
- **Established by code only (file:line):** the cache invalidation on webhook change (R7, corrected), the billing ordering path (upsert, no ordering check), the rate-limit warn and metric.
- **Open (UNPROBED):** the billing ordering result (schema absent); the route-trigger executor (RT-001); the CI runner's allow-list address and `PRODUCTS_ROOT`; the `/graphql` bearer path (CON-002); the currency column name (CUR-001); the soft-delete REST filter syntax (DEL-002).
