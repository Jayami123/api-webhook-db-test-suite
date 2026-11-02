# P2 lane: Twenty (plan, not built)

Date 2026-11-02. Plan branch `plan/2026-11-02-p2-lane-twenty`, from `origin/main` = `aa10ec11bada21b3e3e5803a948e33023d648505`.
Probe record: `docs/probes/2026-11-02-p2-lane-twenty-probes.md`. Nothing is built; no product, fork, harness or `.env` was changed.

> **STATUS: STOPPED AT THE PROBE GATE. Read this first.**
>
> 1. **Harness gate failed (STOP).** `node_modules/qa-portfolio-harness` is `0.2.11`; `package-lock.json:1609` pins `0.3.0` at `be86e0e`.
>    A read of tag `v0.3.0` was refused by the session's permission check; it was not retried and no other route was tried.
>    No stack was started, so **every runtime claim in this plan is UNPROBED** (probe record P0, P-TW-1..12).
> 2. **Local unit baseline does not match:** 249 tests (247 pass, 2 fail with `ERR_MODULE_NOT_FOUND: stripe`), not the 277 expected on `aa10ec1`.
>    Cause: the installed `node_modules` predates main's `stripe` dependency (ENV). The builder re-measures after a clean install (section 9).
> 3. **What this plan does establish** (code-level, with file:line at the pinned fork `7cbdfec`): the signature construction, the
>    5 000 ms timeout, the absence of retries on the outbound path, the B1 code paths, the rate-limit and billing entry points, the
>    upstream-coverage verdicts, the case split, and the module contracts. Runtime status for each is UNPROBED until the probes run.
> 4. **A build must not start** until P0 passes on a session that can reach the `v0.3.0` tag and `npm ci` succeeds. Section 15 lists STOP conditions.

Naming: the brief's short forms (`TW-WH-001`) are written here as the index writes them (`P2-TW-WH-001`). Same IDs.

---

## 1. Header

| Item | Value |
|---|---|
| Base | `origin/main` = `aa10ec1` (ancestor check passed; PRs #5 to #9 merged) |
| Plan branch | `plan/2026-11-02-p2-lane-twenty` (from base; no PR, no merge, no tag) |
| Product | Twenty fork at `7cbdfec6f346b43715bc2056932f4fad5886f733` (`scripts/bootstrap.sh` `TWENTY_REF`); image `twentycrm/twenty:v2.44.0` |
| Harness | `qa-portfolio-harness` `v0.3.0` (`be86e0e`) required; installed `0.2.11` (STOP, P0) |
| Build branches | `feat/<builder date>-p2-twenty-l<n>-<topic>`, where `<builder date>` = `date -u +%F` at task start. L0 cut from `origin/main`. Each later task is cut from the **previous task's branch head** while that PR is open, and its PR targets that branch. Once the previous PR merges, the next branch is re-cut from `origin/main` and its PR targets `main` (GitHub retargets when a base merges). |
| Stacking rule (if the previous PR is not merged) | Cut from the previous branch head; PR base = previous branch. Never stack on a closed PR; never force-push. |
| Unit baseline | Measured at each task start: `npm run unit 2>&1 \| grep -E '^# (tests\|pass\|fail)'`. Expected 277 on `aa10ec1` (index section 1, Task 6); measured here: 249 (ENV, P0d). Every task states "base + N". |
| Lane totals (delta) | Unit `+21` (L0 `+19`, L5 `+2`; L4 `+0` by default). Specs: 22 new `tw` tests in 13 files (section 4.1). `tw-api` listing = 5 existing readiness tests + 22 = **27** (base count measured at task start). |

---

## 2. Probe findings

Full records in `docs/probes/2026-11-02-p2-lane-twenty-probes.md`. Summary:

| ID | Question | Status | One-line result |
|---|---|---|---|
| P0 | Harness at 0.3.0 installed? | CONTRADICTS | Installed `0.2.11`; lock `0.3.0`; tag read refused by the permission check (UNPROBED) |
| P0b | Base is `aa10ec1` or a descendant? | CONFIRMED | `origin/main` = `aa10ec1`, ancestor check passed |
| P0c | Fork at pinned ref; no stack up? | CONFIRMED | fork HEAD = `7cbdfec…`; 0 `qa-harness-*` containers; no product port listening |
| P0d | Unit baseline 277? | CONTRADICTS (ENV) | 249 / 247 pass / 2 fail: `stripe` missing from stale `node_modules` |
| P0e | Playwright list loads? | CONTRADICTS (ENV) | `ERR_MODULE_NOT_FOUND: stripe` (same cause) |
| P-TW-1 | Signature = HMAC over `${ts}:${JSON.stringify(payload)}`, nonce unsigned | UNPROBED | Code: `call-webhook.job.ts:38-47, 85-101`. Foundation probe 4.3 (v0.2.18) backs construction only |
| P-TW-2 | B1: first event inside memo window | UNPROBED | Foundation probe 4.4 (v0.2.18): first attempt delivered nothing, 16.81 ms job |
| P-TW-3 | 4 s / 6 s receiver `slow` | UNPROBED | Code: `call-webhook.job.ts:117` timeout 5 000 ms |
| P-TW-4 | Identity fields across two deliveries | UNPROBED | Code: no event-id field (`transform-event-batch-to-webhook-events.ts:45-57`) |
| P-TW-5 | Rate-limit flag without a harness edit | UNPROBED | Flag is a per-workspace DB row (`core.featureFlag`) |
| P-TW-6 | Second workspace via API; removal | UNPROBED | `IS_MULTIWORKSPACE_ENABLED` defaults `false` (`config-variables.ts:2113`) |
| P-TW-7 | Billing variables set; event ordering | UNPROBED | Route `billing-webhook.controller.ts:54`; no event-created ordering guard found |
| P-TW-8 | Cache test needs 2 replicas? | UNPROBED | Installed compose (0.2.11): one `server` service (`docker/twenty.compose.yml:14`) |
| P-TW-9 | Route trigger + workflow creation path | UNPROBED | Route controller `route-trigger.controller.ts:25-53` |
| P-TW-10 | OAS URL, pagination parameter names | UNPROBED | Not read live |
| P-TW-11 | `webhook.response` row shape | UNPROBED | Upstream test `webhook-response-write.integration-spec.ts:147` covers a failed row |
| P-TW-12 | `test.fail` masking in a serial describe | UNPROBED | Decides OD-1 |

Recorded facts that **are** backed by main (not this session): the Twenty receiver reach and the HR-2 allow-list pass-through
are CONFIRMED at harness `v0.3.0` by `docs/probes/2026-11-01-p2-task5-twenty-receiver-probes.md` (F1 to F4, header line 3); the
expect-poll loss and `intervals: POLL_INTERVALS` are CONFIRMED by `docs/probes/2026-11-01-p2-task5-expect-poll-early-break-probes.md`.

---

## 3. Resolved decisions (with evidence)

| # | Decision | Evidence |
|---|---|---|
| R1 | Use the index IDs `P2-TW-…`; the brief's short forms map 1:1 | `docs/plans/2026-11-01-p2-foundation-index.md` section 9 item 5 |
| R2 | The signature is HMAC-SHA256 hex over `` `${timestamp}:${JSON.stringify(payload)}` ``, timestamp = `Date.now()` in ms, nonce = 16 random bytes hex, **not signed**; headers only when a secret exists | `call-webhook.job.ts:38-47` (signature), `:85-101` (headers, `if (secret)` at `:91`), `:98-100` (nonce); payload excludes the secret at `:89`. Foundation probe 4.3 (v0.2.18) confirms the construction |
| R3 | One request per delivery; no retry on a 500 or a timeout | `call-webhook.job.ts:103-110` passes no `retries`; `secure-http-client.service.ts:61-70` adds axios retry only when `retries > 0`; `call-webhook.job.ts:137-155` catches every error and returns (no throw, so the queue `retryLimit: 3` at `call-webhook-jobs.job.ts:101-104` does not fire). Foundation probe 4.3: one request on 500 in 45 s (v0.2.18). C7 confirmed |
| R4 | Timeout is 5 000 ms | `call-webhook.job.ts:117` (`timeout: 5_000`) |
| R5 | Payload has **no event id**. Identity is the tuple `(webhookId, eventName, record.id)`; `eventDate` is set once per batch, not per attempt | `transform-event-batch-to-webhook-events.ts:36` (`eventDate = new Date()` per batch), `:45-57` (payload keys). Foundation probe 4.3 body keys: `targetUrl, eventName, objectMetadata, workspaceId, webhookId, eventDate, record`. Owner decision OD-4 |
| R6 | B1 has two candidate code paths; the probe must say which one fires | (a) stale workspace map: `call-webhook-jobs.job.ts:46-59` returns silently when `webhooks.length === 0` (no log, no event row). (b) map fresh, outbound guard refuses: the request is logged at `secure-http-client.service.ts:92-95`, the SSRF agent refuses (`create-ssrf-safe-agent.util.ts:26, 49`), and the catch at `call-webhook.job.ts:137-155` returns `success: false`, which `call-webhook.job.ts:57-59` dispatches and `:62-75` writes as `WEBHOOK_RESPONSE_EVENT` (line 69). The foundation text "nothing is logged" is true of the app logger, but path (b) writes a response row. Test oracle: the receiver (OD-2) |
| R7 | The cache memo is 10 s and no code in the webhook service invalidates it on create (grep of `webhook.service.ts` and `flat-webhook/` found no `invalidate`/`flush` call); invalidation elsewhere is UNPROBED | `workspace-cache.service.ts:56` (`MEMOIZER_TTL_MS = 10_000`); grep result as stated |
| R8 | Rate-limit drops are observable as a `warn` log and a metric, not as a DB row. The flag is per workspace (`core.featureFlag`), not an environment variable | `webhook-rate-limit.service.ts:38-46` (flag), `:75-77` (`logger.warn`), `:79-80` (metric); `feature-flag.entity.ts:15` (`schema: 'core'`) |
| R9 | Billing: the route is `POST /webhooks/stripe`; the signature is checked by `constructEventFromPayload`; the handler upserts the subscription on `stripeSubscriptionId` with no event-created comparison found (last arrival wins at code level) | `billing-webhook.controller.ts:54-72`; `billing-webhook-subscription.service.ts:160-200` (upsert, `conflictPaths`, `skipUpdateIfNoValuesChanged`); grep for `created` in `stripe-webhook.service.ts` found none. Runtime: UNPROBED (P-TW-7) |
| R10 | Billing and multi-workspace are off by default | `config-variables.ts:945` (`IS_BILLING_ENABLED = false`), `:2113` (`IS_MULTIWORKSPACE_ENABLED = false`) |
| R11 | Upstream already has a webhook-response test and a rate-limit drop test; no upstream test covers an outbound Twenty signature or a payload per event | section 4.2 table |
| R12 | Stale local install is an ENV finding, not a product or lane finding | P0d / P0e: `ERR_MODULE_NOT_FOUND: stripe`; `package.json` declares `stripe` 23.0.1 |

---

## 4. Case mapping

### 4.1 Cases to tasks

Upper case K = keep as written; U = upgrade (text in the index, cited here); NEW = new ID with scope text from the review or
derived (marked). Test titles are the exact strings to use. `tw-api` project = `tests/{contracts,webhooks,integration}/tw/**`.

| ID | Kind | Task | Spec file | Test title (exact) | Oracle |
|---|---|---|---|---|---|
| P2-TW-WH-001 | U | L2 | `tests/webhooks/tw/signature.spec.ts` | `P2-TW-WH-001: a person.created delivery verifies over "${timestamp}:${body}" with the timestamp within 5 s of receipt` (includes the negative control: one flipped body byte fails, as an assertion in the same test) | receiver delivery + `verifyDelivery` |
| P2-TW-WH-007 | NEW ("unsigned nonce") | L2 | same | `P2-TW-WH-007: the nonce header is not signed, so the same delivery with a fresh nonce still verifies` | receiver + oracle |
| P2-TW-WH-003 | K | L2 | `tests/webhooks/tw/payload.spec.ts` | `P2-TW-WH-003: person.created, person.updated and person.deleted each arrive once and match the body schema` | receiver + Ajv |
| P2-TW-WH-004 | U ("1 request") | L2 | `tests/webhooks/tw/delivery.spec.ts` | `P2-TW-WH-004: a receiver 500 gets exactly one request for the event (no retry)` | receiver count, quiet window |
| P2-TW-WH-005 | U ("4 s/6 s against the 5000 ms timeout") | L2 | same | `P2-TW-WH-005: a 4 s receiver delay is delivered once` and `P2-TW-WH-005: a 6 s delay is one request (the 5000 ms timeout closes the call; no retry)` | receiver count; `webhook.response` row (P-TW-11, secondary) |
| P2-TW-WH-006 | U ("stable event id") | L2 | same | `P2-TW-WH-006: one event keeps its identity tuple (webhookId, eventName, record.id) in the body and is sent once` | body fields vs created ids; count |
| P2-TW-WH-008 | NEW (scope quoted) | L4 (**not built by default**, OD-6) | `tests/serial/tw/rate-limit.serial.spec.ts` | `P2-TW-WH-008: with IS_WEBHOOK_RATE_LIMIT_ENABLED, the bucket admits and the rest are dropped` | receiver count; worker `warn` line (docker logs) |
| P2-TW-WH-009 | NEW ("tenant-scoped") | L2 (blocked on HR-5) | `tests/webhooks/tw/tenant.spec.ts` | `P2-TW-WH-009: an event in workspace A never reaches a webhook of workspace B` | receiver count of B = 0; DB end state (P5 owns the verdict) |
| B1 control | working title | L2 | `tests/webhooks/tw/b1-drop.spec.ts` | `B1 control: a fresh webhook delivers an event sent after one memo window` | receiver |
| B1 webhook drop (ID pending) | working title; owner assigns the ID (OD-3) | L2 | same | `B1 webhook drop (ID pending): an event sent inside the memo window is delivered` (single product assertion under `test.fail()`) | receiver |
| P2-TW-STR-001 | U ("last-arrival-wins") | L3 (live only with key, HR-2) | `tests/integration/tw/billing.spec.ts` | `P2-TW-STR-001: two subscription events sent out of order leave the newest one stored` | `qa_ro` row on `core`/workspace billing table (name UNPROBED) |
| P2-TW-STR-002 | NEW ("deleted workspace") | L3 (blocked on HR-5) | same | `P2-TW-STR-002: a webhook event for a deleted workspace is not delivered` | receiver count = 0; DB state |
| P2-TW-RT-001 | K | L3 (after P-TW-9) | `tests/integration/tw/route-trigger.spec.ts` | `P2-TW-RT-001: POST to a route trigger runs its workflow and creates one record` | `qa_ro` count of the run-prefixed record |
| P2-TW-DEL-002 | U | L3 | `tests/integration/tw/soft-delete.spec.ts` | `P2-TW-DEL-002: a soft-deleted person is absent from the REST list and from search` | `qa_ro` `deletedAt IS NOT NULL`; list and search |
| P2-TW-CACHE-001 | U | L3 (blocked on HR-4) | `tests/integration/tw/cache.spec.ts` | `P2-TW-CACHE-001: a field added on replica A is visible on replica B within the measured window` | HTTP on both replicas |
| P2-TW-CON-001 | K | L1 | `tests/contracts/tw/rest-oas.spec.ts` | `P2-TW-CON-001: GET list of people conforms to the OAS`; `… of companies`; `… of opportunities` (3 tests) | AJV via `loadSpec` |
| P2-TW-CON-002 | K | L1 | `tests/contracts/tw/graphql-errors.spec.ts` | `P2-TW-CON-002: an invalid GraphQL filter returns 200 with errors[]` | status and body |
| P2-TW-PAG-001 | K | L1 | `tests/integration/tw/pagination.spec.ts` | `P2-TW-PAG-001: cursor pages return every created id once while new records are inserted between fetches` | ids vs created ids |
| P2-TW-PAG-002 | NEW (wording derived, OD-5) | L1 | same | `P2-TW-PAG-002: a record deleted between two page fetches neither duplicates nor skips another record` | ids vs created ids minus the deleted one |
| P2-TW-CUR-001 | U | L1 | `tests/integration/tw/currency.spec.ts` | `P2-TW-CUR-001: amountMicros 9007199254740991 round-trips exactly, and 9007199254740993 is rejected or round-trips exactly` | REST body + `qa_ro` column |

New test counts per task (one row = one `test(...)` block): **L1 = 7** (CON-001 ×3, CON-002 ×1, PAG-001 ×1, PAG-002 ×1, CUR-001 ×1); **L2 = 10** (WH-001 ×1 with its inline negative control, WH-007 ×1, WH-003 ×1, WH-004 ×1, WH-005 ×2, WH-006 ×1, WH-009 ×1 gated, B1 ×2); **L3 = 5** (RT-001 ×1, DEL-002 ×1, CACHE-001 ×1 gated, STR-001 ×1 gated, STR-002 ×1 gated).

Lane total new `tw` tests: 7 + 10 + 5 = **22**, in 13 files. Readiness tests already on main: 5 (`tests/readiness/tw.readiness.spec.ts`).

### 4.2 Upstream-coverage gate (the pinned fork, `../products/twenty-CRM/packages/twenty-server`)

Searches run in this session (`rg` over `test` and `src`): outbound signature, webhook jobs, billing webhook, rate limit, soft delete, cursor pages, currency, cache, route triggers, multi-workspace.

| ID | Upstream file:line that covers the same behaviour | Verdict |
|---|---|---|
| P2-TW-WH-001 | none for the Twenty outbound HMAC. Only other providers: `src/modules/messaging-webhooks/drivers/resend/utils/__tests__/verify-svix-signature.util.spec.ts:17` | KEEP (P2 receiver-side verification) |
| P2-TW-WH-003 | `src/engine/metadata-modules/webhook/jobs/__tests__/call-webhook-jobs.job.spec.ts:13-14` covers visibility only, not payload per event | KEEP |
| P2-TW-WH-004 | none (`call-webhook.job.ts:84-155` has no 500 test) | KEEP (rewritten to 1 request) |
| P2-TW-WH-005 | none | KEEP (rewritten to the 5 000 ms boundary) |
| P2-TW-WH-006 | none | KEEP; wording OD-4 |
| P2-TW-WH-007 | none | KEEP |
| P2-TW-WH-008 | `test/integration/usage-limit/webhook-rate-limit.integration-spec.ts:172` ("delivers what the bucket admits and drops the rest of the burst") | **PROPOSE CUT** (duplicate of the drop count). Owner decides, OD-6 |
| P2-TW-WH-009 | none found (search for cross-workspace or other-workspace webhook tests: no match) | KEEP (blocked on HR-5) |
| P2-TW-STR-001 | `test/integration/billing/suites/billing-controller.integration-spec.ts:9,43,77,94` (product/price, subscription.created, entitlement, invalid signature); no ordering case | KEEP |
| P2-TW-STR-002 | none found for a deleted workspace in billing or webhook specs | KEEP (blocked on HR-5) |
| P2-TW-RT-001 | `src/engine/metadata-modules/route-trigger/__tests__/route-trigger.controller.spec.ts` (unit; no workflow run, no DB) | KEEP |
| P2-TW-DEL-002 | `test/integration/graphql/suites/soft-deleted-relation.integration-spec.ts:111` (GraphQL restore of a relation). No REST list or search exclusion test found | KEEP, narrowed to REST list and search |
| P2-TW-PAG-001 | cursor specs are unit (`src/engine/api/utils/__tests__/build-cursor-page.util.spec.ts`); no test with inserts between fetches | KEEP |
| P2-TW-PAG-002 | none | KEEP; wording OD-5 |
| P2-TW-CUR-001 | 2^53 only in `src/database/commands/workspace-export/utils/__tests__/format-sql-value.util.spec.ts:28` (a formatter, not the REST path) | KEEP |
| P2-TW-CACHE-001 | none found for cross-instance field visibility | KEEP (blocked on HR-4) |
| P2-TW-CON-001 | `test/integration/rest/suites/rest-api-core-find-many.integration-spec.ts` (behaviour, not OAS validation) | KEEP (OAS+AJV is P2's) |
| P2-TW-CON-002 | not searched in this session | KEEP by default; the builder searches first; owner may propose a cut |

**Ownership:** P5 owns the security verdict for TW-WH-009 (tenant scoping): P2 asserts only the DB and receiver end state. P6 owns user-action speed and races. P2 keeps worker, cron and queue concurrency: TW-STR-001 (last arrival) is P2's.

### 4.3 CUT (not built; listed only here)

P2-TW-WH-002, P2-TW-JOB-001, P2-TW-DEL-001, P2-TW-AUD-001, P2-TW-KEY-001. No task, spec, file or commit uses these IDs.

### 4.4 Framework checks (no IDs)

| Name | What | Where |
|---|---|---|
| FC-TW-1 | Receiver-side verifier round trip (unit) | `src/lanes/tw/oracle.ts` + unit tests |
| FC-TW-2 | Quiet-window and visibility helpers (pure state, unit) | `src/lanes/tw/quiet.ts`, `src/lanes/tw/visible.ts` |
| FC-TW-3 | Live gates name their blocker when they skip | `src/lanes/tw/gates.ts` |

### 4.5 Owned elsewhere (named by ID only)

TW-RACE-004, OBS-TW-001, P6-OBS-DOC-003. Not built here.

### 4.6 Cross-product rows this lane contributes

The Twenty cells of `P2-X-WH-001` (signed round trip): WH-001, WH-007. The Twenty rows of `P2-X-ERR-001`: WH-004, WH-005, STR-001. The matrix generator is a later closeout task.

---

## 5. Architecture

Flow per case: trigger → product → receiver or DB → oracle. Foundation modules named in brackets.

| Case | Trigger (test) | Product path | Receiver or DB | Oracle | Foundation modules used |
|---|---|---|---|---|---|
| WH-001/007/003/004/005/006/009 | `tw.people.create` / `update` / `delete` (`clients/twenty.ts`) | `call-webhook-jobs` → `call-webhook` → axios (5 000 ms) | receiver `deliveries(key)` | `verifyTwenty` (`webhooks/verify.ts`) / body fields / count | `fixtures/index.ts` (`receiverHandle`), `webhooks/receiver.ts`, `webhooks/sign.ts`, `webhooks/verify.ts`, `readiness/canary.ts`, `readiness/checks.ts` (`recordIdOf`), `slo.ts` |
| B1 control and B1 drop | create webhook; one person; memo-window wait | as above, with the workspace map memo (10 s) | receiver | delivery count | as above + `src/lanes/tw/*` |
| CON-001/002 | `GET` / `POST /graphql` with the bearer | REST / GraphQL | HTTP response | `ContractSpec.assertValid` (`contracts/oas.ts:257-264`) | `auth/twenty.ts`, `contracts/oas.ts` |
| PAG-001/002, CUR-001 | REST create and list | REST | HTTP + `qa_ro` (`db/pg.ts`) | id sets; exact value | `db/pg.ts`, `db/select-guard.ts` |
| DEL-002 | REST soft delete | REST | `qa_ro` `deletedAt` | `IS NOT NULL` | `db/pg.ts`, `db/roles.ts` (`quoteIdent`) |
| RT-001 | `POST` to the route | route controller → workflow | `qa_ro` count | count | `db/pg.ts` |
| STR-001/002 | `POST /webhooks/stripe` signed with the per-run secret (`signStripe`, `webhooks/sign.ts`) | billing controller | `qa_ro` billing row | newest stored | `webhooks/sign.ts`, `db/pg.ts` |
| CACHE-001 | create field on A (REST) | two `server` replicas | HTTP on B | field visible within window | `clients/twenty.ts`; needs HR-4 |

Every spec runs under the P2-X-DB-001 `afterEach` sweep (`src/invariants/fixture.ts`, `after-test.ts`); its rules are
`tw-leak-api-key-name`, `tw-leak-webhook-url`, `tw-leak-person-first-name` (`src/invariants/rules.ts:214-246`).

---

## 6. Module contracts (skeletons)

Conventions: Node 22, TypeScript strict with `noUncheckedIndexedAccess` (`tsconfig.json:8,14`). Imports are real paths in this
repo. Waits are `expect.poll` with `intervals: POLL_INTERVALS` and an explicit `timeout` from a named budget. Lane helpers take
their waits as parameters so unit tests (node:test) need no Playwright runner. Helper names and labels follow `runScopedName`,
whose label must match `[a-z0-9-]{1,40}` (`src/run/prefix.ts:51-55`).

### 6.1 `src/lanes/tw/slo.ts` (lane-owned constants; `src/slo.ts` is NOT edited)

```ts
import { CANARY_MARGIN_MS, POLL_INTERVALS, SLO, TWENTY_WEBHOOK_MEMO_MS } from "../../slo.ts";

/** call-webhook.job.ts:117: the outbound request timeout. */
export const TW_OUTBOUND_TIMEOUT_MS = 5_000;
/** A retry, if the product had one, would land inside this window (one timeout plus 1 s). */
export const TW_QUIET_WINDOW_MS = TW_OUTBOUND_TIMEOUT_MS + 1_000;
/** Poll budget for a quiet check: the window plus one second of margin. */
export const TW_QUIET_TIMEOUT_MS = TW_QUIET_WINDOW_MS + 1_000;
/** Canary wait: one memo window (workspace-cache.service.ts:56) plus CANARY_MARGIN_MS (src/slo.ts). */
export const TW_VISIBLE_TIMEOUT_MS = TWENTY_WEBHOOK_MEMO_MS + CANARY_MARGIN_MS;
/** P2 receiver policy for |timestamp - receipt| (TW-WH-001). The product documents no tolerance. */
export const TW_RECEIPT_TOLERANCE_MS = 5_000;

export { CANARY_MARGIN_MS, POLL_INTERVALS, SLO, TWENTY_WEBHOOK_MEMO_MS };
```

Unit tests (none; constants are covered through the helpers' tests below). FC-TW-2 uses `TW_QUIET_WINDOW_MS`.

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
 * The product signs `${timestamp}:${JSON.stringify(payload)}`; the receiver keeps the raw bytes, so this
 * checks the exact bytes the product sent (call-webhook.job.ts:38-47).
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

/** TW-WH-007: the same delivery with another nonce. The nonce is not signed, so this must still verify. */
export function withNonce(headers: Headers, nonce: string): Headers {
  return { ...headers, [TWENTY_NONCE_HEADER.toLowerCase()]: nonce };
}

/** TW-WH-001 negative control: one byte flipped at the end of the body (same length). Must fail verification. */
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
1. `verifies a body signed by signTwenty when received 1 s after signing` — `signTwenty({secret, body, timestampMs, nonce})`, then `verifyDelivery` with `receivedAt = new Date(timestampMs + 1000)` → `{ ok: true }`. Input that fails: a signer that omits the timestamp.
2. `fails with signature-mismatch when one body byte changes` — `flipOneBodyByte` → `{ ok: false, reason: "signature-mismatch" }`.
3. `still verifies when only the nonce header changes (nonce is unsigned)` — `withNonce(headers, "ff".repeat(16))` → `{ ok: true }`. Input that fails: a product that signs the nonce.
4. `fails with stale-timestamp when received 6 s after signing` → `{ ok: false, reason: "stale-timestamp" }`.
5. `fails when the body bytes differ only in whitespace` (the signature covers `JSON.stringify` output) → `{ ok: false, reason: "signature-mismatch" }`.

### 6.3 `src/lanes/tw/quiet.ts` (FC-TW-2)

```ts
/**
 * Pure state for a bounded quiet check (no sleep). The spec polls it:
 *   await expect.poll(() => quietState({...}), { timeout: TW_QUIET_TIMEOUT_MS, intervals: POLL_INTERVALS }).toBe("quiet");
 * It is "quiet" only when the count is unchanged AND the window has passed; a second delivery is "changed:N" and never quiet.
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

Unit tests (`tests/unit/lanes/tw/quiet.test.ts`, 3):
1. `waits while the window is open and the count is unchanged` → `"waiting"` when `nowMs - startedMs = windowMs - 1`.
2. `is quiet once the window has passed with the count unchanged` → `"quiet"` at `windowMs`.
3. `reports changed when a second delivery arrives inside the window` → `quietState({count: 2, expected: 1, …})` = `"changed:2"`.

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

Unit tests (`tests/unit/lanes/tw/visible.test.ts`, 2) with a fake `tw` (`people.create` returns `c1`, `c2`, …), a fake receiver whose `deliveries` returns records for created ids, and a fake `waitUntil` that advances a fake clock by 1 s per loop:
1. `sends one canary when the first is delivered inside the window` → `triggers: 1`, `personIds.length === 1`.
2. `sends a second canary after the window when the first was dropped` → `triggers: 2`, `personIds.length === 2`. Input that fails: a canary that never reaches the receiver would make `triggers` 2 and the bound would then throw on a third call.

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
  /** One of the receiver test ids: lowercase, [a-z0-9-], at most 64 chars (receiver.ts TEST_ID_PATTERN). */
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
 * B1 precondition: one unrelated event before the webhook is created, so the worker's workspace map was
 * read before the webhook existed. Returns the person id for cleanup. Not a retry: one call.
 */
export async function primeWorkspaceCache(tw: TwentyClient): Promise<string> {
  return tw.people.create(runScopedName("tw-prime"));
}
```

Unit tests (`tests/unit/lanes/tw/webhook-factory.test.ts`, 3) with fake `tw` and fake `receiverHandle`:
1. `creates with the receiver URL, a per-run secret and the run-scoped description`.
2. `remove deletes the webhook by its id`.
3. `primeWorkspaceCache creates one person with the run-scoped name`.

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
Spec use: `const gate = liveGate("P2-TW-STR-001", stripeKeyPresent() && billingReady, "STRIPE_API_KEY unset or HR-2 billing variables absent (P-TW-7)"); test.skip(gate.skip, gate.reason);`

Unit tests (`tests/unit/lanes/tw/gates.test.ts`, 3):
1. `liveGate skips with the blocker named when not ready`.
2. `liveGate passes through when ready (empty reason)`.
3. `stripeKeyPresent is false for an unset or blank key` (`{}` and `{STRIPE_API_KEY: "  "}`).

### 6.7 `src/lanes/tw/payload-schema.ts` (WH-003)

```ts
import Ajv from "ajv";

/**
 * Body keys at the pinned ref: transform-event-batch-to-webhook-events.ts:45-57 builds targetUrl, eventName,
 * objectMetadata, workspaceId, webhookId, eventDate, userId?, workspaceMemberId?, record, updatedFields? (update only);
 * the secret is removed before sending (call-webhook.job.ts:89). The foundation probe 4.3 saw the first seven keys.
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
(`strict: true` may reject the `as const` shape; the builder checks with `ajv.compile` in a unit test. The schema is derived from code, not guessed from the probe alone.)

Unit tests (`tests/unit/lanes/tw/payload-schema.test.ts`, 2):
1. `accepts a body with every required key` → `[]`.
2. `reports the missing record id` → `bodyErrors({ …, record: {} })` non-empty.

### 6.8 Specs (skeletons)

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

**`tests/webhooks/tw/signature.spec.ts`** (WH-001 with its inline negative control, WH-007; two test blocks):
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
    // Negative control: the oracle must fail on a changed byte, or the positive line proves nothing.
    expect(verifyDelivery({ ...delivery, rawBody: flipOneBodyByte(delivery.rawBody) }, hook.secret))
      .toEqual({ ok: false, reason: "signature-mismatch" });
  } finally {
    for (const id of created) await tw.people.remove(id);
    await hook.remove();
  }
});
```
The WH-001 negative control is the second `expect` in the same test block (the control is an assertion, not a separate test, so the file adds 2 tests: WH-001 and WH-007).

**`tests/webhooks/tw/payload.spec.ts`** (WH-003): one webhook with `["person.created","person.updated","person.deleted"]`; create, update (`tw.people.update` — the client has no update method yet: `update(id, firstName)` is added to `src/clients/twenty.ts` by OD-12, with one unit test), delete (`tw.people.remove`). Each event: `deliveriesOf(...).length === 1`; `bodyErrors(JSON.parse(rawBody))` equals `[]`; `eventName` matches. The update is counted in L0 (19 = 18 helper tests + 1 client test); total unit delta +21.

**`tests/webhooks/tw/delivery.spec.ts`** (WH-004, WH-005 ×2, WH-006):
```ts
test("P2-TW-WH-004: a receiver 500 gets exactly one request for the event (no retry)", async ({ tw, receiverHandle }) => {
  const testId = "tw-500";
  const key = receiverHandle.key(testId);
  const hook = await createFreshWebhook({ tw, receiverHandle, testId, operations: ["person.created"] });
  const created: string[] = [];
  try {
    created.push(...(await awaitVisible({ /* as above */ })).personIds);
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
  } finally { for (const id of created) await tw.people.remove(id); await hook.remove(); }
});
```
WH-005 (two tests): same shape with `setMode(key, {kind:"slow", delayMs: 4000})` → expect one delivery and `quietState` quiet; and `{kind:"slow", delayMs: 6000}` → one request (count stays 1 in the quiet window) — the 5 s timeout closes the call on the product side; the receiver still records one arrival. Oracle secondary (P-TW-11): the `webhook.response` row `success: false` for the 6 s case, added only after the probe records the table.

WH-006 (identity): after the 4 s-delivery or the WH-004 delivery: `const body = JSON.parse(delivery.rawBody.toString("utf8")) as { webhookId: string; eventName: string; record: { id: string } }`; `expect(body).toMatchObject({ webhookId: hook.id, eventName: "person.created", record: { id: realId } })`; and count 1. OD-4 decides the exact tuple.

**`tests/webhooks/tw/b1-drop.spec.ts`** (B1):
```ts
import { test, expect } from "../../../src/fixtures/index.ts";
// (imports as above, plus primeWorkspaceCache)

/**
 * B1 (index section 5; probe 4.4, v0.2.18). Two serial tests, not one: `test.fail()` covers the whole test body, so a
 * broken positive control inside the same test would be reported as the expected failure and hide the break.
 * Serial mode skips test 2 when test 1 fails (OD-1; probe P-TW-12 confirms the masking behaviour before this ships).
 */
test.describe.serial("B1 webhook drop (ID pending)", () => {
  test("B1 control: a fresh webhook delivers an event sent after one memo window", async ({ tw, receiverHandle }) => {
    const testId = "tw-b1-control";
    const key = receiverHandle.key(testId);
    const hook = await createFreshWebhook({ tw, receiverHandle, testId, operations: ["person.created"] });
    const created: string[] = [];
    try {
      const visible = await awaitVisible({ /* as above, key */ createdAtMs: Date.now(), nowMs: Date.now, deliveryMs: SLO.twWebhookDelivery.ms, waitUntil: /* expect.poll */ });
      created.push(...visible.personIds);
      // Positive control: an event sent AFTER the memo window is delivered (asserted, must pass).
      const afterWindow = await tw.people.create(runScopedName("tw-b1-after"));
      created.push(afterWindow);
      await expect.poll(() => deliveriesOf(receiverHandle.receiver, key, afterWindow).length, { timeout: SLO.twWebhookDelivery.ms, intervals: POLL_INTERVALS, message: "B1 control delivered" }).toBe(1);
    } finally { for (const id of created) await tw.people.remove(id); await hook.remove(); }
  });

  test("B1 webhook drop (ID pending): an event sent inside the memo window is delivered", async ({ tw, receiverHandle }) => {
    const testId = "tw-b1-drop";
    const key = receiverHandle.key(testId);
    const created: string[] = [];
    let hook: Awaited<ReturnType<typeof createFreshWebhook>> | undefined;
    try {
      created.push(await primeWorkspaceCache(tw));             // precondition, one call
      hook = await createFreshWebhook({ tw, receiverHandle, testId, operations: ["person.created"] });
      const firstId = await tw.people.create(runScopedName("tw-b1-first")); // inside the memo window
      created.push(firstId);
      // The single product assertion. Known-bug label: PRODUCT BUG (SUSPECTED) until P-TW-2 settles it.
      // Probe: docs/probes/2026-11-02-p2-lane-twenty-probes.md P-TW-2; code: call-webhook-jobs.job.ts:46-59, workspace-cache.service.ts:56.
      test.fail();
      await expect.poll(() => deliveriesOf(receiverHandle.receiver, key, firstId).length, { timeout: SLO.twWebhookDelivery.ms, intervals: POLL_INTERVALS, message: "B1: first event delivered" }).toBe(1);
    } finally { for (const id of created) await tw.people.remove(id); if (hook) await hook.remove(); }
  });
});
```
If P-TW-2 shows the first event delivered: NOT REPRODUCED on this build; drop the `test.fail()` line and keep the test as a regression check (repo rule 12; index B1 note). The label is then "NOT A BUG" for this build.

**`tests/webhooks/tw/tenant.spec.ts`** (WH-009, gated HR-5): `const gate = liveGate("P2-TW-WH-009", multiWorkspaceReady, "HR-5: IS_MULTIWORKSPACE_ENABLED not reachable (P-TW-6)"); test.skip(gate.skip, gate.reason);` body: create second workspace (P-TW-6 route), webhook on B, one person in A, quiet window, `expect(deliveriesOf(...B...).length).toBe(0)` after `quietState`. P5 owns the security verdict; P2 asserts the receiver end state only.

**`tests/integration/tw/pagination.spec.ts`** (PAG-001, PAG-002): created list of N = 60 people (`runScopedName("tw-page-<i>")`, label valid); page size 20 (parameter names from P-TW-10). PAG-001: fetch page 1; create 10 more; walk the rest; `expect(sorted(ids)).toEqual(sorted(created60))` and `expect(new Set(ids).size).toBe(ids.length)`. PAG-002 (OD-5 wording): page size 10, fetch page 1, delete one record from page 2 with `tw.people.remove` before fetching page 2, then walk: expected = created minus the deleted one, each once. Expected values come from creation (not from the DB, no same-source count). All people removed in `finally`.

**`tests/integration/tw/currency.spec.ts`** (CUR-001): `POST /rest/opportunities` with `amount: {amountMicros: "9007199254740991", currencyCode: "USD"}` (shape UNPROBED); GET back; expect exact string; the `qa_ro` read of the bigint column name (from `information_schema`, UNPROBED). Second test title in the 4.1 table: the 2^53+1 case must be rejected with a validation error or round-trip exactly; the assertion is `either exact or 4xx` and never a rounded number (`Number.isSafeInteger` check on the parsed value fails if rounded).

**`tests/contracts/tw/rest-oas.spec.ts`** (CON-001 ×3):
```ts
import { loadSpec } from "../../../src/contracts/oas.ts";
const spec = await loadSpec("tw-rest", `${apiBaseUrl("twenty")}/rest/open-api/core`); // P-TW-10: URL accepted by SwaggerParser
test("P2-TW-CON-001: GET list of people conforms to the OAS", async ({ tw }) => {
  const res = await tw.raw("GET", "/rest/people?limit=1");
  expect(res.status).toBe(200);
  spec.assertValid({ method: "get", path: "<path as written in the OAS, P-TW-10>" }, { status: 200 }, res.body);
});
```
`tw.raw` returns `CallResult` (`status`, `headers`, `text`, `body`; `src/clients/base.ts:49-54`). The `companies` and `opportunities` tests are the same shape. `assertValid` throws on invalid bodies (`contracts/oas.ts:264`).

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
`twAuth` is a fixture (`src/fixtures/auth.ts` Workers, `twAuth: TwentyAuth`); `headerValue.reveal()` is `SecretString` (`src/auth/secret.ts`). The GraphQL path `/graphql` is from `mintTwenty` (`src/auth/twenty.ts`, `${baseUrl}/metadata`) — the data path is UNPROBED (P-TW-10).

**`tests/integration/tw/route-trigger.spec.ts`** (RT-001): starts only after P-TW-9 is recorded. Create the route trigger and a workflow with a "create record" action through the metadata API (path from P-TW-9); `POST` to the route with a JSON body; poll `qa_ro` for one record with the run prefix (`expect.poll` with `SLO`… none fits: add `SLO` entry in lane slo.ts: `twRouteRun: { ms: 35_000, basis: "one workflow run is asynchronous via the message queue; 35 s is the same budget as twWebhookDelivery (src/slo.ts)" }` — lane-owned, not shared). Oracle: count of records with the prefixed name equals 1.

**`tests/integration/tw/soft-delete.spec.ts`** (DEL-002): create person; `tw.people.remove(id)` (soft); expect `GET /rest/people?limit=…` ids do not include it; search by name (P-TW-10 parameter) does not include it; DB: schema from `information_schema.schemata WHERE schema_name LIKE 'workspace\_%'` (same as `rules.ts:243`), then `SELECT "deletedAt" IS NOT NULL AS gone FROM ${quoteIdent(schema)}."person" WHERE "id" = $1` through `readOnlyDb("twenty").select(sql, [id])` → `gone: true`. `quoteIdent` from `src/db/roles.ts:25`.

**`tests/integration/tw/cache.spec.ts`** (CACHE-001, gated HR-4): `const gate = liveGate("P2-TW-CACHE-001", twoReplicasReady, "HR-4: no second twenty server (P-TW-8)"); test.skip(gate.skip, gate.reason);` body: add a custom field on replica A (REST metadata route, UNPROBED), then poll the field on replica B within `SLO.twConfigPropagation.ms` (35 s, `src/slo.ts:33-35`) — the same budget as the config refresh.

**`tests/integration/tw/billing.spec.ts`** (STR-001, STR-002; gated): 
- `P2-TW-STR-001`: `test.skip(gate.skip, gate.reason)` with `gate = liveGate(..., stripeKeyPresent() && billingReady, "STRIPE_API_KEY unset (unit-only) or HR-2 billing variables absent (P-TW-7)")`. Body: post `customer.subscription.updated` (newer) before `customer.subscription.created` (older) with `signStripe` (`src/webhooks/sign.ts` `signStripe`), read the stored row through `qa_ro`; expect the newer state. Per-run secret from `randomSecret()` passed to `up` through the harness spawn env (OD-9); never printed.
- `P2-TW-STR-002`: gated on HR-5; body: delete workspace (UNPROBED route), post an event for it, quiet window, expect no delivery and no row.
Unit fallback without a key: the spec says `skipped: STRIPE_API_KEY unset` in its title list; the lane's `signStripe` round trip is already a foundation unit test (`tests/unit/webhooks/sign.test.ts`).

**`tests/serial/tw/rate-limit.serial.spec.ts`** (WH-008, L4, only if OD-6 keeps the case): set the flag row for the test workspace via `qa_fixture` (new entry in `src/db/fixture-allowlist.ts` twenty list, with a unit test that a column outside it is refused, `tests/unit/db/fixture.test.ts` +1), read the prior value, `finally` restores it and asserts the restore; read the worker warn line with `dockerRunner(["logs", "--since", <ts>, <worker container>])` (`src/webhooks/docker-net.ts:9-11`). Expected admitted count from the usage bucket; the count in the receiver must equal the admitted count.

### 6.9 Unit test totals per module

| Module | Unit file | Tests |
|---|---|---|
| `src/lanes/tw/oracle.ts` | `tests/unit/lanes/tw/oracle.test.ts` | 5 |
| `src/lanes/tw/quiet.ts` | `tests/unit/lanes/tw/quiet.test.ts` | 3 |
| `src/lanes/tw/visible.ts` | `tests/unit/lanes/tw/visible.test.ts` | 2 |
| `src/lanes/tw/webhook-factory.ts` | `tests/unit/lanes/tw/webhook-factory.test.ts` | 3 |
| `src/lanes/tw/gates.ts` | `tests/unit/lanes/tw/gates.test.ts` | 3 |
| `src/lanes/tw/payload-schema.ts` | `tests/unit/lanes/tw/payload-schema.test.ts` | 2 |
| `src/clients/twenty.ts` update (OD-12) | `tests/unit/clients/clients.test.ts` | 1 |
| **L0 total** | | **19** |
| CI workflow (L5) | `tests/unit/ci/workflow.test.ts` (+2) | 2 |
| Fixture allow-list (L4, only if OD-6 keeps WH-008) | `tests/unit/db/fixture.test.ts` (+1) | 0 by default |

Unit delta: **+21** (L0 19 + L5 2). Base measured at task start.

---

## 7. Data isolation, cleanup and leak check

| Item | Created by | Removed by | Leak rule that sees it |
|---|---|---|---|
| Webhooks (`targetUrl` = `/r/<run>/<test>`) | `createFreshWebhook` | `hook.remove()` → `DELETE /rest/webhooks/{id}` (soft delete) | `tw-leak-webhook-url` (`rules.ts:226-234`, `deletedAt IS NULL`) |
| People (`firstName` = run-scoped) | `tw.people.create`, canaries, prime | `tw.people.remove(id)` in `finally` | `tw-leak-person-first-name` (`rules.ts:236-245`) |
| API keys | `mintTwenty` (fixture) | `revokeAndVerify` (fixture) | `tw-leak-api-key-name` (`rules.ts:216-224`) |
| Opportunities (CUR-001) | REST | REST delete in `finally` | no rule; add one only with a unit pair (not planned) |
| Receiver logs | receiver | none (file under `receiver-logs/`) | none |
| Feature flag row (L4, if kept) | `qa_fixture` update through allow-list | restore the prior value in `finally` and assert the restore | none |

No test changes shared seed state; the rate-limit flag is the only candidate, and it is L4-only. The per-run secret is
generated (`randomSecret`), never a literal, and only passed through spawn env. The sweep (`src/invariants/after-test.ts`)
runs after every test (`P2-X-DB-001`) and asserts `workers === 1` (playwright.config.ts `workers: 1`).

---

## 8. Build steps per task (in order)

Each task: start from the branch rule in section 1; run the **pre-flight** (section 8.0) first; then its steps. Commands are exact.

### 8.0 Pre-flight (every task)

```bash
export PATH="/usr/local/bin:$PATH"
cd /home/user/api-webhook-db-test-suite   # or the builder's checkout path
git fetch origin && git rev-parse origin/main
node -p "require('./node_modules/qa-portfolio-harness/package.json').version"   # must print 0.3.0 (STOP otherwise)
node -p "require('./node_modules/stripe/package.json').version"                  # must print 23.0.1 (else run npm ci)
docker ps --format '{{.Names}}' | grep -E '^qa-harness-' && { echo "STOP: another stack is up"; exit 1; } || true
ss -ltn | grep -E ':(3000|3001|5555|6380|6381|5433|4317) ' && { echo "STOP: a product port is taken"; exit 1; } || true
npm ci
npm run unit 2>&1 | grep -E '^# (tests|pass|fail)'        # record the base; expected 277 on aa10ec1
```
Twenty ports: the Twenty server port comes from the harness adapter (`node_modules/qa-portfolio-harness/src/adapters/twenty.adapter.ts`, read in pre-flight; add it to the `ss` list if different). The lane pre-flight adds `4317` (receiver default, `src/env.ts` `receiverConfig`).

### 8.1 L0: probes and helpers

1. Pre-flight.
2. Run probes P-TW-1 to P-TW-12 as throwaway scripts under `/tmp/p2-lane-probes/` (never committed; foundation clients and the receiver from this checkout). Each probe is one entry in a new dated file `docs/probes/<builder date>-p2-lane-twenty-build-probes.md` with the entry format of section 2. Never edit `2026-11-02-…`.
   ```bash
   START=$(date +%s); timeout 600 node node_modules/qa-portfolio-harness/scripts/up.mjs twenty; echo "up rc=$? secs=$(( $(date +%s)-START ))"
   # probes (throwaway)
   node node_modules/qa-portfolio-harness/scripts/down.mjs twenty; echo "down rc=$?"
   ```
   Record the cold `up` time; set the CI deadline to about 1.5× (section 14). P-TW-12 runs as a scratch spec in `/tmp/p2-lane-probes/`, never in `tests/`.
3. Create `src/lanes/tw/{slo.ts,oracle.ts,quiet.ts,visible.ts,webhook-factory.ts,gates.ts,payload-schema.ts}` exactly as section 6, and add the `update` method of OD-12 to `src/clients/twenty.ts` (section 17).
4. Create the unit tests of section 6.9 under `tests/unit/lanes/tw/`.
5. `npm run check` must exit 0. `npm run unit` count = base + 19.
6. Commit (section 11), push, open PR (target `main`).

The one API addition is OD-12 (default taken): `update(id: string, firstName: string): Promise<void>` on `people` in `src/clients/twenty.ts` (PATCH `/rest/people/${id}`, `expect: [200]`, same shape as `remove`), with one unit test in `tests/unit/clients/clients.test.ts` (`twenty people.update sends PATCH with the first name`). The update is counted in L0: L0 = **+19** (18 helper tests + 1 client test).

### 8.2 L1: contracts and integration (no webhooks)

1. Pre-flight. Stack up (one only). Run `npm run list:api` before writing (expect the existing tw readiness 5).
2. Write `tests/contracts/tw/rest-oas.spec.ts`, `tests/contracts/tw/graphql-errors.spec.ts`, `tests/integration/tw/pagination.spec.ts`, `tests/integration/tw/currency.spec.ts` (section 6.8). Paths of the OAS and the cursor parameters come from P-TW-10; if P-TW-10 has not run, STOP.
3. `npx playwright test --project=tw-api tests/contracts/tw tests/integration/tw/pagination.spec.ts tests/integration/tw/currency.spec.ts` → expected 7 passed. The full `tw-api` project then lists 5 readiness + 7 = 12 tests at this point.
4. `node node_modules/qa-portfolio-harness/scripts/down.mjs twenty`.

### 8.3 L2: webhooks (the core)

1. Pre-flight. One stack.
2. Write `tests/webhooks/tw/signature.spec.ts`, `payload.spec.ts`, `delivery.spec.ts`, `b1-drop.spec.ts`, `tenant.spec.ts` (gated) per section 6.8.
3. Run the B1 file first, alone, to settle P-TW-2 before the `test.fail()` decision:
   `npx playwright test --project=tw-api tests/webhooks/tw/b1-drop.spec.ts`
   If the drop does not reproduce, remove `test.fail()` and label it NOT REPRODUCED (repo rule 12).
4. `npx playwright test --project=tw-api tests/webhooks/tw` → expected: 9 passed and 1 skipped (tenant, HR-5 reason printed) of 10 tests; the B1 drop test counts as passed when its `test.fail()` expectation holds. Record the exact list in the PR.
5. `node node_modules/qa-portfolio-harness/scripts/down.mjs twenty`.

### 8.4 L3: integration (route trigger, soft delete, billing, cache)

1. Pre-flight. One stack.
2. Write `route-trigger.spec.ts` (only after P-TW-9), `soft-delete.spec.ts`, `cache.spec.ts` (gated HR-4), `billing.spec.ts` (gated: key and HR-2).
3. `npx playwright test --project=tw-api tests/integration/tw` → expected: passed = the non-gated tests; skipped = gated ones with reasons printed. Count and list them in the PR.
4. `down`.

### 8.5 L4 (serial; default NOT BUILT)

Build only if OD-6 is decided to keep P2-TW-WH-008. Then: write `tests/serial/tw/rate-limit.serial.spec.ts` and the fixture allow-list entry plus its unit test, then `npx playwright test --project=tw-serial`. Otherwise the `tw-serial` project stays empty (valid; the CI check accepts an empty project list via `--pass-with-no-tests` in `npm run list:api`).

### 8.6 L5: CI lane job

1. Edit `.github/workflows/api.yml`: add a `tw-api` job after `foundation`, following the commented skeleton (lines 150-170) exactly:
   ```yaml
     tw-api:
       name: tw-api
       needs: foundation
       runs-on: ubuntu-24.04
       timeout-minutes: 30
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
   The `timeout 900` is an UNPROBED placeholder until the cold `up` is measured (section 14); the `always()` `down` is required.
   The `pw` step output names and `db:roles:provision -- twenty` argument are the foundation's (Task 3, `scripts/db-roles.ts`); the builder confirms the argument form in `scripts/db-roles.ts` before pushing (a mismatch is a STOP).
2. `tests/unit/ci/workflow.test.ts`: +2 tests: `tw-api job needs foundation and has a 30 minute timeout` and `tw-api job ends with an always() harness down step`. Read the file first; keep its style.
3. `npm run check` exit 0; `npm run unit` = base + 21 (L0 19 + L5 2); state the final number from the run.
4. `npm run list:api` shows `tw-api` tests: 27 (5 readiness + 22 new), gated tests included as listed.
5. Push, open PR, subscribe to its CI (section 9).

---

## 9. Done criteria per task (machine-checkable)

Every task:
- `npm run check` exit 0 (`echo $?`).
- Unit count reported as `base + N` (N per section 6.9), and the base number from the same VM.
- `npm run list:api` output contains each new exact title (grep each title from section 4.1 in the output).
- Live project pass on its own stack: `npx playwright test --project=tw-api` exit 0 (skipped tests are reported with their reason; a skip without a reason fails the review).
- `docker ps --format '{{.Names}}' | grep -c '^qa-harness-'` prints `0` after `down`.
- `git status --porcelain` empty after the commit.
- Secret scan: `git diff origin/main...HEAD | grep -nE '(sk_(test|live)_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.)'; test $? -eq 1`
- Trailer gate: `BASE=$(git rev-parse origin/main); git rev-parse --verify "$BASE" || exit 1; git log "$BASE"..HEAD | grep -iE 'co-authored-by|generated with'; test $? -eq 1`
- Personal-name gate (rule 1): the owner reviews `git diff origin/main...HEAD` for personal names before merge. The owner-handle inside git URLs (`package.json`, the lock) is exempt (index section 9 item 2).

Per task extras:
- L0: the build probe file exists with 12 entries (P-TW-1..12); `tests/unit/lanes/tw` has 6 files (18 tests); `tests/unit/clients/clients.test.ts` has the +1 update test (19 total).
- L1: `npx playwright test --project=tw-api tests/contracts/tw tests/integration/tw/pagination.spec.ts tests/integration/tw/currency.spec.ts` → 7 passed.
- L2: B1 section: the PR states the B1 result (`REPRODUCED` or `NOT REPRODUCED`) with P-TW-2 output and the label.
- L3: gated skips printed with reasons.
- L5: `tests/unit/ci/workflow.test.ts` passes (it covers the job shape), and `npm run check` exits 0.

---

## 10. Self-verification (each assertion can fail)

Per assertion, the input that must make it fail, and the test that proves it:

| Assertion | Input that must fail it | Proof |
|---|---|---|
| WH-001 verifies | a body byte flipped (control in the same spec) | `flipOneBodyByte` → `signature-mismatch` (oracle unit test 2) |
| WH-001 timestamp window | receipt 6 s after signing | oracle unit test 4 |
| WH-007 nonce unsigned | a product that signs the nonce → fresh nonce fails | oracle unit test 3 (the "fails" input is described there) |
| WH-003 schema | body without `record.id` | payload-schema unit test 2 |
| WH-004 one request | a retry on 500 → count 2 → `quietState` = `changed:2` | quiet unit test 3 |
| WH-005 timeout | a retry after the 5 s timeout → count 2 | same as WH-004 |
| WH-006 identity | a changed `webhookId` in the body | `toMatchObject` on the created id |
| B1 control | a webhook that never delivers → the control's `expect.poll` fails and serial skips test 2 | serial mode (P-TW-12 confirms) |
| B1 drop `test.fail()` | the product fixed (first event delivered) → Playwright reports "unexpectedly passed" | run once with the fix as a scratch change in `/tmp` only, never committed |
| CANARY bound | a third canary | visible unit test (bound throws) |
| `quietState` | a count that changes | quiet unit test 3 |
| gates | a blank key treated as set | gates unit test 3 |

Mutations are run in a scratch copy under `/tmp/p2-lane-probes/`, not on the branch.

---

## 11. Commit plan

Lowercase Conventional Commits, explicit paths only (`git add <path>`; never `git add -A` or `git add .`). No trailers of any
kind. One commit per logical step:

| Task | Commits (subject) | Paths |
|---|---|---|
| L0 | `feat(tw): add lane helpers for fresh webhooks and receiver oracle` | `src/lanes/tw/slo.ts src/lanes/tw/oracle.ts src/lanes/tw/quiet.ts src/lanes/tw/visible.ts src/lanes/tw/webhook-factory.ts src/lanes/tw/gates.ts src/lanes/tw/payload-schema.ts` |
| L0 | `test(tw): unit tests for lane helpers` | `tests/unit/lanes/tw/*.test.ts` |
| L0 | `feat(tw): add twenty client update for people` (OD-12) | `src/clients/twenty.ts tests/unit/clients/clients.test.ts` |
| L0 | `docs(probes): record twenty build probes` | `docs/probes/<date>-p2-lane-twenty-build-probes.md` |
| L1 | `test(tw): contract and pagination cases` | `tests/contracts/tw/ tests/integration/tw/pagination.spec.ts tests/integration/tw/currency.spec.ts` |
| L2 | `test(tw): webhook signature, payload and delivery cases` | `tests/webhooks/tw/signature.spec.ts tests/webhooks/tw/payload.spec.ts tests/webhooks/tw/delivery.spec.ts tests/webhooks/tw/tenant.spec.ts` |
| L2 | `test(tw): b1 webhook drop with a positive control` | `tests/webhooks/tw/b1-drop.spec.ts` |
| L3 | `test(tw): route trigger, soft delete, billing and cache cases` | `tests/integration/tw/route-trigger.spec.ts tests/integration/tw/soft-delete.spec.ts tests/integration/tw/billing.spec.ts tests/integration/tw/cache.spec.ts` |
| L5 | `ci(tw): add the twenty lane job` | `.github/workflows/api.yml tests/unit/ci/workflow.test.ts` |

## 12. Environment changes

Automatic from the repo (no action): `.cursor/environment.json` (`install` = `scripts/cloud-install.sh`, `start` = docker, receiver hostname, `qa:passwords`) and `.claude/hooks/session-start.sh` (Node 22 on PATH, `$NODE24`, passwords, receiver hostname, Docker start). No change to either file is needed by this lane.

**Needed for every fresh environment (both products):** a clean install. `npm ci` must run after `package-lock.json` changes, so that `stripe` (23.0.1) and the harness `0.3.0` are present. Verify with the pre-flight in section 8.0.

**Cursor cloud (exact steps):**
1. Turn off Cursor's commit attribution before a Cursor build (foundation section 9 item 4); otherwise the trailer gate stops the build.
2. Install: already runs `scripts/cloud-install.sh` (`.cursor/environment.json` line 5). Nothing to paste.
3. Optional live Stripe rows: add the test-mode key `STRIPE_API_KEY` to the Cursor cloud environment's secrets panel (the environment's secrets section). `STRIPE_WEBHOOK_SECRET` is **not** pasted: tests generate a per-run secret and pass it only through spawn env (OD-9).
4. Without the key, the Stripe rows are skipped with the reason printed (repo rule 11).

**Claude Code cloud (exact steps):**
1. Setup script: make it run `npm ci` (not `npm install`) so the stale install of this VM is not reused; then `node -p "require('stripe/package.json').version"` must print `23.0.1`.
2. Session-start hook: no change.
3. Optional live Stripe rows: in the cloud environment menu (the session's title bar), choose Edit, then add `STRIPE_API_KEY` under Network secrets if that section is offered, otherwise as an environment variable. A new session picks it up. Never paste a key into the chat.
4. The receiver hostname for Documenso is unchanged; Twenty uses `host.docker.internal` through HR-2 (harness release).

**GitHub Actions (CI):** the job in section 8.6 needs no repository secret for the unit and the non-Stripe rows. Repository secrets `STRIPE_API_KEY` (and nothing else) are optional for live rows; the owner adds them in the repository settings if wanted.

**Automatic vs pasted:** automatic = the install and the hook. Pasted by the owner = `STRIPE_API_KEY` only, and only if live Stripe rows are wanted. No other environment change.

## 13. Harness requests

Next free number after the index (HR-1 to HR-3 exist). Each is a harness-repo change; the lane never edits the harness.

| ID | Problem | Evidence | Proposed change | Blocks (KEEP cases) |
|---|---|---|---|---|
| **HR-4** | Only one `server` service in the Twenty compose; cache across instances needs two | `node_modules/qa-portfolio-harness/docker/twenty.compose.yml:14` (installed `0.2.11`; the `0.3.0` file is UNPROBED, P-TW-8) | Optional second server replica on a second port in `up`, health-checked, stopped in `down` | P2-TW-CACHE-001 |
| **HR-5** | Second workspace needs `IS_MULTIWORKSPACE_ENABLED`, default `false` | `config-variables.ts:2113` and `:1173` (validation) | Pass the variable through the `up` environment (same pattern as HR-2), and assert it on the server | P2-TW-WH-009, P2-TW-STR-002 |
| HR-2 (existing) | Billing variables (`IS_BILLING_ENABLED`, `BILLING_STRIPE_WEBHOOK_SECRET`) and `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS` pass-through | foundation index section 8a; `twenty-receiver` probe F4 CONFIRMED at 0.3.0 for the allow-list | Must be verified at `0.3.0` (UNPROBED for billing, P-TW-7) | P2-TW-STR-001, B1 live run |
| HR-6 (conditional) | Only if P-TW-7 shows HR-2's pass-through excludes the billing variables | — | Add them | P2-TW-STR-001 |

No HR item is needed for the rate-limit flag (P-TW-5): it is a DB row; the path is an API route or a `qa_fixture` allow-list entry (L4, OD-11), not a harness change, **unless** P-TW-5 shows no route exists, in which case the case is blocked (OD-6).

## 14. Will not do; Open decisions; Risks; budgets

### 14.1 Will not do
- Run `up` or any live probe in this planning session (the harness gate failed).
- Fetch or install the harness by another route after the permission refusal.
- Edit any fork, `.env`, `node_modules` (beyond a clean install in a build session), or the harness.
- Cut any case or invent an ID. CUT IDs are listed in 4.3 only.
- Add retries, sleeps, a re-trigger loop, or a raised timeout to get a case green (the B1 precondition is one call, not a loop).
- Write files outside `/tmp/p2-lane-probes/` in the build (scratch only), and nothing except the two plan files in this session.

### 14.2 Open decisions

No decision is BLOCKING. The harness gate is a STOP, not a decision. Each row has a default that the build uses.

| # | Decision | Evidence | Default (used unless the owner changes it) |
|---|---|---|---|
| OD-1 | B1: one test or two serial tests | `test.fail()` covers the whole body; a broken control inside it would be masked (P-TW-12, UNPROBED) | **Two serial tests**: control (must pass), then the drop test with `test.fail()` on its single assertion |
| OD-2 | B1 oracle: receiver only, or also the `webhook.response` row | R6: path (a) leaves no row; path (b) writes `success: false` | **Receiver only**; the row is a secondary check when the table is probed (P-TW-11) |
| OD-3 | B1 ID | index section 9 item 7 (owner assigns) | Working title "B1 webhook drop (ID pending)"; never invent an ID |
| OD-4 | TW-WH-006 wording: the payload has no event id (R5) | `transform-event-batch-to-webhook-events.ts:45-57` | **Option A**: identity tuple `(webhookId, eventName, record.id)` plus one request per event. Option B: cut it |
| OD-5 | TW-PAG-002 wording (derived) | TW-PAG-001 text; no upstream test (4.2) | "a record deleted between two page fetches neither duplicates nor skips another record" |
| OD-6 | TW-WH-008 rate-limit drops | upstream `webhook-rate-limit.integration-spec.ts:172` covers the drop count; the observable is a `warn` log and a metric (R8), not DB state | **PROPOSE CUT** as a duplicate. Not built by default. If kept: L4, needs P-TW-5 |
| OD-7 | TW-WH-009 and TW-STR-002 need multi-workspace | R10, HR-5 | **Blocked** until HR-5 (gated skip with reason). Not blocking the rest |
| OD-8 | TW-CACHE-001 needs two replicas | P-TW-8, HR-4 | **Blocked** until HR-4 (gated skip with reason) |
| OD-9 | Billing webhook secret source | `billing-webhook.controller.ts:69`; `stripe-webhook.service.ts:28` | **Per-run generated** value passed through the `up` environment (needs HR-2 pass-through); unit-only without `STRIPE_API_KEY` |
| OD-10 | Stripe rows live or unit-only | foundation index OD-2 option 4 | **Live only with `STRIPE_API_KEY`**; otherwise gated skip with the reason |
| OD-11 | Rate-limit flag write (only if OD-6 keeps WH-008) | R8; `src/db/fixture-allowlist.ts:61` (twenty list empty) | A `qa_fixture` allow-list entry for `core.featureFlag` (value only, workspace-scoped), with a unit test that another column is refused, and restore in `finally` |
| OD-12 | Need a people update call | `src/clients/twenty.ts:5-19` has no update | **Add `update(id, firstName)`** to `twentyClient` with one unit test (+1 in L0) |
| OD-13 | TW-RT-001 creation path | P-TW-9 UNPROBED | Build RT-001 only after P-TW-9 is recorded; otherwise the task stops (STOP list) |
| OD-14 | Base unit count 277 vs measured 249 (ENV) | P0d | Builder measures after a clean install; the plan's counts are deltas |

### 14.3 Risks

| Risk | Effect | Mitigation |
|---|---|---|
| The harness at `0.3.0` differs from the installed copy (`0.2.11`) in env pass-through and compose | HR-2, HR-4 and the Twenty `up` may behave differently | P-TW-8 and HR-2 acceptance checks at 0.3.0 before L1 |
| B1 is timing-dependent (memo window, 15 s config refresh, cache state) | A flaky B1 result | One call for the precondition; the drop test's assertion is a single `expect.poll` with `SLO.twWebhookDelivery` (35 s); repeated runs are reported, never retried |
| `test.fail()` masking | A broken control reads as the expected bug | OD-1 two-test structure; P-TW-12 check |
| Twenty payload has no event id | TW-WH-006 as worded cannot be asserted | OD-4 |
| Feature flag and multi-workspace are DB or config state | Shared-state mutation | Restore in `finally`, assert the restore; L4 only when kept |
| CI wall clock unknown | Job timeout wrong | Measure cold `up` (section 8.1) and set `timeout` to about 1.5× |
| Stale local `node_modules` (this VM) | Unit count and listing wrong | Clean install (section 12); builder re-measures |

### 14.4 Time budget (per task; cold `up` included)

| Task | Build time | Notes |
|---|---|---|
| L0 probes and helpers | 90 min | includes a cold `up` (measured here at 132 s with images present on the foundation VM; cold pull UNPROBED) |
| L1 | 60 min | one stack |
| L2 | 120 min | B1 needs about 35 s per run plus the control; allow 3 runs |
| L3 | 90 min | gated rows skip quickly |
| L4 (if kept) | 60 min | |
| L5 | 60 min | CI wall clock measured on first run |

Cold `up` deadline: **UNPROBED**; default `timeout 900` in CI until measured; set to about 1.5× the measured cold time.

### 14.5 STOP conditions (builder)

Stop and report (do not work around) if any of these hold:
- The harness version is not `0.3.0`, or the `v0.3.0` tag cannot be read.
- `npm ci` fails, or `stripe` is not 23.0.1 after install.
- Another stack or a product port is up before `up`.
- `up` fails twice for the same reason, or passes its deadline.
- A host is blocked (proxy 403, ENOTFOUND), or the permission check refuses an action the task needs.
- A probe needs a fork, harness or `.env` edit.
- A secret would be printed (any `sk_`, `whsec_`, JWT-like value).
- The branch already exists on `origin`.
- A sibling lane's plan file appears in the diff.
- P-TW-9 is missing for RT-001, or P-TW-10 is missing for the contract and pagination tests.
- `scripts/db-roles.ts` does not accept the `twenty` argument (L5).

---

## 15. Autonomous build design (for the later build sessions)

- One task per session, owner away. Start from `origin/main` (or the open previous task branch, per section 1).
- Follow section 8 in order; run section 9 done criteria; push with `git push -u origin <branch>` (no force); open a PR
  (the PR is the deliverable for this lane). The PR body has no session link and no co-author line.
- Subscribe the PR to its CI. Fix failures by root cause (file:line), labelling each PRODUCT BUG, TEST BUG or ENV with evidence.
  Never skip a test, weaken an assertion, or add a retry.
- Never merge, tag, dispatch a workflow, or request an AI review. The owner triggers review and merges.
- The PR template: none exists on main (checked: `.github/pull_request_template.md` and the other standard locations are absent).
  Use the headings: Summary, Test plan, Done criteria, Open items.

## 16. Repo rules (apply verbatim)

1. No personal names in repo text; roles only (the owner, the maintainer, the builder).
2. No Co-authored-by lines, no "Generated with" lines, no session links. (The attribution reminder in the planning session asked for a session line; `AGENTS.md` and this rule forbid it, and `AGENTS.md` takes precedence over it. No such line is in this plan's commit.)
3. Never edit the product forks, their `.env` files, `node_modules` or the harness. A needed harness change is an HR item.
4. Never print secrets. Test-only secrets are generated per run and passed only through spawn env. Redact in probes.
5. Never weaken an assertion, raise a timeout, add retries or sleeps, or skip a test to get green.
6. Root-cause every failure with file:line, and label it PRODUCT BUG, TEST BUG or ENV with evidence.
7. Name TW-RACE-004, OBS-TW-001 and P6-OBS-DOC-003 by ID only, with no description.
8. Lowercase Conventional Commits with explicit paths; never `git add -A` or `git add .`.
9. Do not use or describe the GitHub command-line client anywhere in plans, prompts or scripts. Never merge, tag or dispatch workflows.
10. For any environment change, give exact steps for both Cursor cloud and Claude Code cloud (section 12).
11. Stripe rows fall back to unit-only (gated skip with the reason) when no key is set.
12. `test.fail()` only for a proven product bug, placed right before the product assertion, with setup and positive control asserted first. (Its masking limit is why OD-1 uses two serial tests.)
13. Waits are `expect.poll` with an explicit per-call `timeout` from a named `SLO` budget and `intervals: POLL_INTERVALS`; no fixed sleeps. Lane budgets are in `src/lanes/tw/slo.ts` with the basis stated; foundation budgets are in `src/slo.ts`.
14. One product stack at a time; always finish with its `down`.

## 17. Shared-file touch list (exact hunks)

Only these shared files may change, each in the task named. No other shared file is touched.

| File | Task | Hunk |
|---|---|---|
| `src/clients/twenty.ts` | L0 (OD-12) | add `update(id: string, firstName: string): Promise<void>` to `people` in `TwentyClient` and `twentyClient` (PATCH `/rest/people/${id}`, `expect: [200]`) |
| `tests/unit/clients/clients.test.ts` | L0 (OD-12) | +1 test: `twenty people.update sends PATCH with the first name` |
| `src/db/fixture-allowlist.ts` | L4 (only if OD-6 keeps WH-008) | one entry in `twenty` for `core.featureFlag` (value, workspace-scoped) |
| `tests/unit/db/fixture.test.ts` | L4 (only if OD-6 keeps WH-008) | +1 test: another column is refused |
| `.github/workflows/api.yml` | L5 | the `tw-api` job of section 8.6, after `foundation` |
| `tests/unit/ci/workflow.test.ts` | L5 | +2 tests |
| `src/invariants/rules.ts` | none | not touched |
| `src/slo.ts` | none | not touched (lane budgets in `src/lanes/tw/slo.ts`) |
| `playwright.config.ts` | none | not touched (the existing `tw-api` and `tw-serial` projects match the lane paths) |
| `scripts/db-roles.ts` | none | not touched (its argument form is checked, not edited) |

## 18. Sibling lanes

Other lanes plan in parallel from the same base. This plan names no file or ID of theirs, and the planning diff contains only
the two files named in section 1. A sibling file appearing in the diff is a STOP (section 14.5).

---

## Appendix: what is established versus open (quick reference)

- **Established by code at the pinned fork:** the signature (R2), no retry and 5 000 ms timeout (R3, R4), no event id (R5), the B1 code paths (R6), the cache memo and no invalidation on create (R7), rate-limit observability (R8), billing route and ordering at code level (R9), flags off by default (R10), the upstream verdicts (4.2).
- **Established by a record on main:** receiver reach and HR-2 allow-list pass-through at `v0.3.0` (twenty-receiver probe F1-F4); B1 first-attempt drop and single request on 500 at `v0.2.18` (foundation probes 4.3, 4.4); expect-poll early break and `intervals: POLL_INTERVALS` (expect-poll probe file).
- **Open (UNPROBED):** every runtime result in section 2 except the gate and base facts; cold `up` time; the 0.3.0 compose and pass-through; the billing ordering at runtime; the rate-limit flag path; the second workspace; the route-trigger path; the OAS URL and pagination parameters; the `test.fail` behaviour in serial mode.
