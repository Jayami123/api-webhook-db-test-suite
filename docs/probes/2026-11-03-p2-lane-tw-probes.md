# P2 lane: Twenty, build probe record (2026-11-03)

Lane owned record (`docs/lane-ownership.md`). Build branch `feat/2026-11-03-p2-lane-tw`, base `origin/main` at
`fcc4654` (PR #10). Harness `qa-portfolio-harness` v0.3.1 (`7d4a3ae`), stripe `23.0.1`, Node 22.23, product image
`twentycrm/twenty:v2.44.0` (fork ref `7cbdfec`). Every value below was measured on a live stack, one stack at a time, each
stopped with the harness `down`. No secret, token, or live object id is recorded here. Plan:
`docs/plans/2026-11-02-p2-lane-twenty.md`.

## 1. Stacks used

| Stack | Settings | Result |
|---|---|---|
| S-A (default) | `up` with `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS=host.docker.internal,172.17.0.1`, `PRODUCTS_ROOT` set on the command line | `up` rc 0 (health 200 on `127.0.0.1:3002`); seed and roles rc 0; probes, the tw-api suite and the 50-case study; `down` rc 0, zero containers |
| S-B (multi-workspace) | as S-A, plus `IS_MULTIWORKSPACE_ENABLED=true`, `TWENTY_BASE_URL=http://localhost:3002`, after `TWENTY_DOWN_VOLUMES=1 down` (fresh database) | `up`, seed and roles rc 0; STR-002 probes and test; `down` rc 0, zero containers |

Pitfall found on S-B: the first run's `down` without volumes kept the earlier database, and probe workspaces from earlier runs
then counted against the 5-workspace limit. The CI job removes volumes before `up` for this reason.

## 2. Probe log (measured)

| ID | Question | Result (measured) |
|---|---|---|
| B-P1 | OAS served to the bearer only | `GET /rest/open-api/core` with the bearer: 200, 1 040 553 bytes, OpenAPI 3.1.1, 362 paths. Without the bearer: 403 `Missing authentication token`. |
| B-P2 | The OAS path keys | Keys are relative to the server URL `http://127.0.0.1:3002/rest/`: `/people` is `GET /rest/people`. |
| B-P3 | REST create, read, update, delete | `POST /rest/people` 201; `GET` 200; `PATCH` 200; `DELETE` 200 with `{"data":{"deletePerson":{"id":…}}}`; `GET` after delete 404 `Record not found`. |
| B-P4 | Hard path: `DELETE /rest/people/{id}` (no `soft_delete` parameter) | **Hard delete, measured.** Before delete: 1 row, `deletedAt` NULL. After delete: 0 rows in every workspace schema. `PATCH /rest/people/{id}/restore` after delete: 404. This probe did not send `soft_delete=true`, so it says nothing about the soft path (see B-P19, PC-1). |
| B-P5 | Webhook delete | `DELETE /rest/webhooks/{id}` 200 `true`; the `core.webhook` row is gone afterwards (no `deletedAt` row). |
| B-P6 | Webhook events for create, update, delete | create: `person.created`; update: `person.updated` (body has `updatedFields`); **hard** REST delete: `person.destroyed` (soft delete: `person.deleted`, see B-P19). Body keys on every event: `targetUrl, eventName, objectMetadata, workspaceId, webhookId, eventDate, record`. No event id. |
| B-P7 | Cursor pagination | Wire name is `starting_after` (the OAS component key `startingAfter` is not on the wire; `startingAfter=` is ignored and returns the first page again). `ending_before` is the other name. `pageInfo` keys: `startCursor, endCursor, hasNextPage, hasPreviousPage`; `totalCount` present. Filter syntax: `filter=name.firstName[like]:<prefix>%`. Walk of 5 rows at limit 2: 3 pages, ids unique, `hasNextPage` false on the last. |
| B-P8 | Amount precision | JSON number `9007199254740991` stored and returned exactly (DB `amountAmountMicros` = `9007199254740991`). Literal JSON `9007199254740993` is accepted (201) and stored and returned as `9007199254740992`. **Silent rounding** (see P2-TW-BUG-001). A JavaScript number cannot carry 2^53+1: the test sends the digits as text. |
| B-P9 | Column names (UNPROBED in the plan) | Per-workspace schema `workspace_<id>`, table `opportunity`: `amountAmountMicros` (bigint), `amountCurrencyCode`. Person name column: `nameFirstName`. |
| B-P10 | GraphQL invalid filter | `POST /graphql` with the bearer: 200, `data: {people: null}`, one error: message `Object person doesn't have any "nope" field.`, `extensions.code` `BAD_USER_INPUT`, `subCode` `INVALID_ARGS_FILTER`. |
| B-P11 | Search | GraphQL `search(searchInput: String, limit: Int!)` (limit is required). Returns `edges[].node.recordId`, `objectNameSingular`. |
| B-P12 | OAS against live lists | The list responses fail the OAS 3.1.1 schema at `deletedAt` (`must be string (got null)`), `avatarFile` (`must be array`), `performanceRating` (enum, null). The validator truncates at 10 lines, so the lane fetches one record per response (`limit=1`). See P2-TW-BUG-002. |
| B-P13 | Multi-workspace origin (STR-002) | With `IS_MULTIWORKSPACE_ENABLED=true` and the default base URL `http://127.0.0.1:3002`: token exchange with the IP origin returns `WORKSPACE_NOT_FOUND` (`UNAUTHENTICATED`). With the sign-in's `workspaceUrls.subdomainUrl` (`http://<subdomain>.localhost:3002` when the base URL is `localhost`): exchange 200. |
| B-P14 | Workspace create | `signUpInNewWorkspace(input: {displayName, subdomain})` on `/metadata` (user session token; the field is `loginToken { token }` plus `workspace { id workspaceUrls }`): 200. The row is `PENDING_CREATION`, `defaultRoleId` NULL. The 5-workspace limit: `FORBIDDEN_EXCEPTION` beyond 5 without an enterprise key. |
| B-P15 | Workspace activate and soft delete | `activateWorkspace(data: {})` on `/metadata`: 200, `activationStatus` `ACTIVE`, default role set. `deleteCurrentWorkspace` on `/metadata`: 200 `{"id"}`; the row keeps `deletedAt` set and `activationStatus` `SUSPENDED`. Soft delete confirmed for workspaces (it is `deleteWorkspace(id, true)`). |
| B-P16 | Delete of a pending workspace | `deleteCurrentWorkspace` on a `PENDING_CREATION` workspace: 200 with an `INTERNAL_SERVER_ERROR` error: `new row for relation "workspace" violates check constraint "onboarded_workspace_requires_default_role"`. The constraint: `activationStatus IN ('PENDING_CREATION','ONGOING_CREATION') OR defaultRoleId IS NOT NULL`. See P2-TW-BUG-004. |
| B-P17 | Cookie jar | A Playwright request context keeps the sign-in cookie; later bearer calls then fail with `CSRF_ORIGIN_MISMATCH` (403). The lane's metadata helper uses plain `fetch`, like the auth module. |
| B-P19 | Soft path: `DELETE /rest/people/{id}?soft_delete=true` (fresh run; probe `2026-11-03`, same stack) | Status **200**, body `{"data":{"deletePerson":{"id":…}}}`, the same shape as the hard path. DB (`qa_ro`): the row **remains** with `deletedAt` set. `GET /rest/people` filtered to the run prefix: the id is **absent**. Event: **`person.deleted`** (one event, arrived in the receiver). A later plain `DELETE` (no parameter) on the soft-deleted row returns 200 and removes it (0 rows). |
| B-P20 | GraphQL search for the deleted record | Query field `search(searchInput, limit)` exists on `Query` (introspection; `searchRecords` and `globalSearch` do not). Result shape `search.edges[].node.recordId`. After the soft delete: the record id is **absent** from the result. Positive control before the delete (in the case): the id is returned. |
| B-P21 | RT-001 as the master plan states it: workflow with a WEBHOOK trigger and a CREATE_RECORD step, activated, then `POST /webhooks/workflows/{ws}/{wf}` | Not built. (1) `createWorkflow` (generic object) 200, a workflow row exists. (2) `createWorkflowVersion` (generic object) 200 with `data.createWorkflowVersion: null` and `FORBIDDEN` ("You do not have permission to perform this workflow action"). (3) The core mutations `createCoreWorkflow`, `updateCoreWorkflowVersionTrigger`, `createCoreWorkflowVersionStep`, `activateCoreWorkflowVersion` are absent from the workspace schema of this API key: appended only when the request has an `applicationId` (`workspace-graphql-schema-sdl.service.ts:90`, `:165`). (4) The public route is registered: on the workspace of the workflow it answers **400 `INVALID_WORKFLOW_STATUS`** ("has not been activated"); on the other workspace **404 `NOT_FOUND`**. Run: none. Blocker is the API-key schema scope, not the logic-function driver named in P-TW-13. RT-001 DEFERRED. The probe's workflow was destroyed by `destroyWorkflow` (result not checked here; see the leak check). |
| B-P22 | Billing schema on a fresh volume (`TWENTY_DOWN_VOLUMES=1 down`, then `up` with `IS_BILLING_ENABLED=true` and `BILLING_STRIPE_API_KEY` from the test key) | Tables present: `core.billingSubscription`, `billingProduct`, `billingPrice` (plus customer, entitlement, meter, subscription item, credit grant). Both workspaces `ACTIVE`. `core.billingPrice` has **0 rows** before a plan sync. |
| B-P23 | Plan sync: `billing:sync-plans-data` in the server container (`command:prod`) | Stripe test account reachable from the host (HTTP 200 with the key; Stripe holds 8 products, 9 prices). **From inside the server container the sync fails:** `certificate verify failed` (TLS to api.stripe.com, `Request was retried 2 times`). The container does not trust the sandbox proxy CA. Environment finding (ENV). Not worked around: no CA injected, no verification disabled. |
| B-P24 | Subscription handler reads Stripe live | `billing-webhook-subscription.service.ts:136` lists the customer's live subscriptions from Stripe, and the stored row comes from that live state, not from the event body. STR-001 therefore needs test-mode objects and reachable Stripe from the server. |
| B-P18 | RT-001 (plan, carried) | Not re-probed in this build. Plan P-TW-13 stands: route 404 `TRIGGER_NOT_FOUND`; `LOGIC_FUNCTION_TYPE` unset in production (not a harness pass-through name). |

## 3. The B1 study (P2-TW-WH-010), measured

Fifty cases, run in the study job and locally with the same settings. Each case creates its own webhook, sends one
`person.created`, observes up to `TW_STUDY_DELIVERY_MS` (15 s), and cleans up. Run validity: 50 executed, 50 sends accepted,
50 cleanups done, zero leaked rows. Result JSON: `results/p2-tw-wh-010-study.json` (not committed; uploaded by the job).

| Mode | Cases | Sent | Delivered | Dropped cases |
|---|---|---|---|---|
| idle12 (fixed 12 s gap before the webhook) | 20 | 20 | 20 | none |
| warm0 (no gap) | 20 | 20 | 10 | 21, 23, 25, 27, 29, 31, 33, 35, 37, 39 |
| prime (one priming person first) | 10 | 10 | 4 | 41, 43, 45, 46, 48, 49 |
| **All** | **50** | **50** | **34** | **16** |

Delivered arrivals: 101 to 104 ms after the send. Undelivered cases: each observed the full 15 s window.

**Stale-target routing (P2-TW-BUG-003).** For 14 of the 16 undelivered cases, the worker log shows the outbound request
for case N posted to the URL of case N-1 (`…/p2-study-(N-1)`), a webhook the study had already deleted. The receiver's own
log shows those paths receiving two deliveries each (their own, and the next case's event). Two undelivered cases (46 and
49) have no outbound line in the worker log.

## 3a. CACHE-001 field visibility, two replicas (measured)

Ten trials on the two-replica stack (`TWENTY_SERVER_REPLICAS=2`, server-2 on `127.0.0.1:3003`): create a text custom field on
replica A (`createOneField`, `:3002`), poll replica B (`field(id)`, `:3003`) every 100 ms until it returns the field. Windows
(ms): 61, 31, 21, 20, 18, 18, 17, 36, 21, 23. **Max 61 ms.** Budget in the case: max + `CANARY_MARGIN_MS` (`src/slo.ts:32`,
500 ms) = 561 ms (`src/lanes/tw/replicas.ts`). Fields deleted after each trial (`deleteOneField`: ok).

## 4. Product bugs

### P2-TW-BUG-001: amounts above 2^53-1 are rounded silently (PRODUCT BUG, PROVEN: REST and GraphQL)

- Deterministic: REST (`B-P8`, and the currency spec run twice, `--repeat-each=2`, 8 of 8 passed) and GraphQL (probe
  `createOpportunity`, review fix step 8): `9007199254740993` sent as a literal and as a string is stored, read back and
  stored as `9007199254740992`. DB row (`qa_ro`, `amountAmountMicros`): `9007199254740992` for all three forms (REST,
  GraphQL literal, GraphQL string). `9007199254740991` round-trips exactly through both.
- So BUG-001 is **REST and GraphQL**, not "REST only".
- Cases: `tests/integration/tw/currency.spec.ts` (REST and GraphQL exact cases pass; the over-range cases carry
  `test.fail()` after their setup asserts).

- Evidence: B-P8. The request body carries `"amountMicros":9007199254740993`; the response is 201 with
  `9007199254740992`; the database column holds `9007199254740992`. Reproduced twice (two runs, same result).
- Expected: the amount is rejected (4xx) or stored and returned exactly.
- Lane handling: `tests/integration/tw/currency.spec.ts`, second test, `test.fail` after the setup assertions.
- Upstream draft: title "Opportunity amountMicros above Number.MAX_SAFE_INTEGER is accepted and rounded silently". Steps:
  `POST /rest/opportunities` with `{"amount":{"amountMicros":9007199254740993,"currencyCode":"USD"}}` (raw JSON digits). Result:
  201; stored and returned as `9007199254740992`. Expected: a 400 validation error, or exact storage. Environment: v2.44.0 image.

### P2-TW-BUG-002: the published OAS disagrees with live list responses (PRODUCT BUG, PROVEN: 3 of 3 objects)

- Deterministic on people, companies and opportunities (`tests/contracts/tw/rest-oas.spec.ts`, list and one-id): every
  violation is a `null` value on a field the OAS declares non-nullable (the `(got null)` violations). The known-null
  filter passes; the non-null check fails, so the test.fail() marker holds.
- Generator at the pin (UNVERIFIED location for the type declaration): `components.utils.ts:179` (`getRequiredFields`:
  a field is required when `!isNullable && defaultValue === null`) and `:55` (the example generator uses the same rule).
  The emission of the non-null record types was not located in this module; the live evidence stands.

- Evidence: B-P12. `GET /rest/people?limit=1` returns `null` for `deletedAt`, `avatarFile` and `performanceRating`;
  `companies` returns `null` for the same fields; `opportunities` returns `null` for `deletedAt`. The OAS 3.1.1 document declares these fields
  non-nullable. Every violation is a null value (the lane pins this shape).
- Lane handling: `tests/contracts/tw/rest-oas.spec.ts`, `test.fail` after the setup and the known-shape assertion.
- Upstream draft: title "OpenAPI 3.1.1 document does not allow null for fields the list endpoints return as null". Steps:
  load `GET /rest/open-api/core` (authenticated) and validate one `GET /rest/people?limit=1` response. Result: the listed
  violations. Expected: `nullable` (or `type: [..., "null"]`) on those fields, or no null values.

### P2-TW-BUG-003: a deleted webhook keeps receiving events for up to one memo window (PRODUCT BUG, PROVEN: 5 of 5)

- Deterministic repro, one stack, 5 repetitions (all 5 agree): canary to A (A receives it), delete A (200), create B (201),
  create one person within about 100 ms of the delete. Each repetition: **B received 0; A's URL received 2 (canary and the
  real event)**. Repro timing: the canary is the warm-up; repetitions 2 to 5 needed two canary triggers because the
  worker still held the previous repetition's map (`awaitCanary`).
- Root cause at the pin: `MEMOIZER_TTL_MS = 10_000` (`workspace-cache.service.ts:56`), the memoizer is built with it
  (`:105-106`). `invalidateAndRecompute` (`:301`) clears the memo with `clearKeys` on the calling process's instance only
  (`:313`, `:322`, `:364`). The worker job reads `flatWebhookMaps` through `getOrRecompute`
  (`call-webhook-jobs.job.ts:46-53`), so it can use a map up to 10 s old.
- Regression case: P2-TW-WH-010 in `tests/webhooks/tw/b1-drop.spec.ts` (`test.fail()` after the setup asserts).
- Evidence (earlier): section 3. Case N's event is posted to case N-1's deleted webhook URL in 14 of 16 undelivered cases, and the
  receiver logs confirm deliveries to that deleted path. Case N's own webhook then receives nothing.
- Scope: this is the mechanism behind the B1 drop (P2-TW-WH-010). The study measures it and asserts only run validity.
- Upstream draft: title "Workspace webhook cache dispatches events to a deleted webhook and misses a webhook created within
  the memo window". Repro: create webhook A (`person.created`), delete A, create webhook B within 10 s, create a person.
  Result: the outbound request targets A's URL; B receives nothing. Expected: events go to the live webhooks only.

### P2-TW-BUG-004: deleting a pending workspace returns an internal error (PRODUCT BUG, PROVEN 2 of 2; not a planned case)

- Fresh multi-workspace stack, two repetitions: `deleteCurrentWorkspace` on a PENDING_CREATION workspace returns HTTP 200 with
  `INTERNAL_SERVER_ERROR`: `new row for relation "workspace" violates check constraint "onboarded_workspace_requires_default_role"`.
- Off-plan: no test, no marker. Note for P5: the raw constraint name in the error text is information exposure (CWE-209).
- Cleanup of the two repetition workspaces: through the product (sign in, `activateWorkspace`, `deleteCurrentWorkspace`), not
  SQL. Both `p2-qa-` rows now have `deletedAt` set and are SUSPENDED. See the incident note in section 7.

- Evidence: B-P16. `deleteCurrentWorkspace` on a `PENDING_CREATION` workspace returns `INTERNAL_SERVER_ERROR`, and the
  error message carries the raw database constraint name. Activation first makes the delete succeed (B-P15).
- Lane handling: the STR-002 test activates before the delete (the onboarding step). No planned case covers this path.
- Upstream draft: title "deleteCurrentWorkspace on a pending workspace fails with INTERNAL_SERVER_ERROR (check constraint)".

## 5. Plan corrections (plan statements proven false or superseded)

| # | Plan statement | Measured | Effect on the lane |
|---|---|---|---|
| PC-1 | REST delete is soft (`deletedAt IS NOT NULL`, sections 4.1 and 7) | **Soft delete exists.** `DELETE …?soft_delete=true` sets `deletedAt` and keeps the row (B-P19, B-P20). The earlier probe (B-P4) sent no parameter, so it measured the hard path. **That was a test bug in the probe, not a missing product feature.** Source: `rest-api-core.service.ts:80-98` routes on `parseSoftDeleteRestRequest` (`parse-soft-delete-rest-request.util.ts:8-12`). | DEL-002 **built** as the soft-delete case (`tests/integration/tw/soft-delete.spec.ts`): list and search absent, row kept with `deletedAt`, hard delete in cleanup. |
| PC-2 | Delete event is `person.deleted` (WH-003) | The **hard** delete emits `person.destroyed` (B-P6). The **soft** delete emits `person.deleted` (B-P19). | The earlier rename to `person.destroyed` was made because the probe used the hard path (PC-1). WH-003 now uses the soft delete and subscribes to `person.deleted`, and its title is restored to the plan's wording. Schema pattern in `src/lanes/tw/payload-schema.ts`. |
| PC-3 | Cursor parameter `startingAfter` | `starting_after` on the wire (B-P7) | Tests use `starting_after`. |
| PC-4 | OAS paths `/rest/people` | Keys are `/people` under the `/rest/` server (B-P2) | Tests validate with `/people`. |
| PC-5 | HR-4 (replicas) and HR-5 (multi-workspace) block CACHE-001, WH-009 and STR-002 | Harness v0.3.1 forwards `IS_MULTIWORKSPACE_ENABLED` and `TWENTY_SERVER_REPLICAS=2` | STR-002 built (section 6). CACHE-001 and WH-009 have no test definition in the plan: see the PR (open decision). |
| PC-6 | Lane CI job in `api.yml`; unit `+2` in `tests/unit/ci/workflow.test.ts` | Ownership map: `api.yml` and that test are shared; the lane's workflow file is `p2-tw.yml` | The lane job is in `p2-tw.yml`; its two workflow tests are in `tests/unit/lanes/tw/workflow.test.ts`. |
| PC-7 | `people.update` is added in L0 (OD-12) | Already on `main` with its unit test (PR #10) | No L0 client change; B0 already includes it. |
| PC-8 | L1 = 7 tests; L3 = 2 tests (STR-001, DEL-002); total 17 | The plan's own table lists 8 L1 tests (CON-001 ×3, CON-002, PAG-001, PAG-002, CUR-001 ×2) and 2 L3 tests. The table's total with DEL-002 removed is 17 (8 + 8 + 1) | The `tw-api` listing is 22 (5 readiness + 17), the plan's number. The L1 figure of 7 is one short of the plan's own table. |

## 6. STR-002 (workspace create and delete): root cause and evidence

**Review addendum (fix paste-in step 6): STR-002 is a HARD STOP.** Billing changes workspace activation for an active workspace: `billing-webhook-subscription.service.ts:220` (`shouldSuspendWorkspace`) then `:239` `deleteWorkspace(…, true)` for PENDING_CREATION, `:242` `suspendWorkspace` for ACTIVE, and `:255` `reactivateWorkspace` on the reactivate branch. The brief's stop condition applies, so STR-002 is not built. STR-001 needs the Stripe sync (B-P23, ENV). Its job is not created here.

- Root cause of `WORKSPACE_NOT_FOUND`: with `IS_MULTIWORKSPACE_ENABLED=true`, the workspace is resolved from the front
  domain of the server (`SERVER_URL`, from the harness `TWENTY_BASE_URL`). An IP base URL has no subdomain, so sign-in
  returns the base URL as the workspace origin, and the token exchange finds no workspace (B-P13). Fork references:
  `workspace-domains.service.ts` (`resolveWorkspaceAndPublicDomain`, the subdomain and custom-domain lookup) and
  `domain-server-config.service.ts` (`getSubdomainAndDomainFromUrl`).
- Fix (harness setting, no harness change): `TWENTY_BASE_URL=http://localhost:3002` for the multi-workspace stack. The
  harness forwards it (`config.ts`, `twenty.adapter.ts` `TWENTY_BASE_URL`). The sign-in then returns `subdomainUrl`
  (`http://<subdomain>.localhost:3002`), and the lane passes that URL as the origin.
- Test: `tests/integration/tw/workspace.spec.ts` (`@multiws`): setup (fewer than 5 active workspaces), sign-in, token
  exchange with the subdomain origin, `signUpInNewWorkspace`, row stored as `PENDING_CREATION`, `activateWorkspace` to
  `ACTIVE` with a default role, `deleteCurrentWorkspace`, row with `deletedAt` set and `SUSPENDED`. Cleanup on failure.
- Result on S-B: passed (one run after the probe runs; the run that failed at the cookie jar is recorded in section 2 B-P17).

## 7. Leak check (zero tagged rows left)

Queried on S-B after the STR-002 run, before `down`, for any `p2-qa-` prefix:

| Object | Live rows | Soft-deleted rows | Note |
|---|---|---|---|
| API keys (`core.apiKey`, name prefix) | 0 | n/a | The lane revokes each key; revoked rows keep `revokedAt`. |
| Webhooks (`core.webhook`, receiver URL) | 0 | 0 (hard delete) | |
| People (any workspace schema, `nameFirstName` prefix) | 0 | 0 (hard delete) | |
| Workspaces (`core.workspace`, `displayName` prefix) | 1 | 3 | The live row is a probe leftover (B-P16, a pending workspace whose delete failed). The lane's own runs leave 0 live. The fresh database per CI run prevents accumulation. |

On S-A the sweep (`src/invariants/after-test.ts`, rules `tw-leak-*`) ran after every test and the study's `afterAll` sweep
returned no violations (`npx playwright test` exit 0).

## 7a. Incident: a seeded workspace was soft-deleted by a cleanup probe (review fix step 8)

- The cleanup probe signed in, then looped over every workspace in the sign-in list and called `activateWorkspace` and
  `deleteCurrentWorkspace` on each, not only on `p2-qa-` rows. The seeded workspace **Apple** (`20202020`) was soft-deleted
  (now SUSPENDED, `deletedAt` set). YCombinator (`3b8e6458`) returned a permission error and is still ACTIVE.
- The two `p2-qa-` leftovers were deleted correctly (`deletedAt` set).
- Recovery: the seeded state comes back with the volume wipe the step requires (`TWENTY_DOWN_VOLUMES=1 down`, then `up`). No
  rows were removed by SQL. Lesson recorded: a cleanup must filter by the run's name before it calls any mutation.

## 8. Items this record does not settle

- Runner values (the allow-list address `172.17.0.1`, `PRODUCTS_ROOT`, cold `up` on the hosted runner): UNPROBED until the
  first CI run; the job's `up` step fails fast with the harness error if they differ.
- The scheduled study's real wall clock on the hosted runner: UNPROBED until the first scheduled run.
- CACHE-001 (two replicas) and WH-009 (multi-workspace verdict): see the PR body, open decision.
