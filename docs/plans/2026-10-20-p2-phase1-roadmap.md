# P2 Phase 1 roadmap

Date: 2026-10-20. Base: `main` at `5fc804f`. Plan branch: `plan/2026-10-20-p2-phase1` (long-lived, never deleted).
Source of truth: `docs/master-plan.html` §9 Phase 1, "Clients, dynamic tokens, receiver, DB helper;
contracts for all 4 products." Case IDs below are copied from the master plan; none are renumbered.

## 1. Scope

Phase 1 builds the framework and the contract layer: typed clients, per-run tokens, the webhook
receiver and signers, the read-only DB helper, the OAS/AJV loader, and contract cases for Medusa,
Documenso, Twenty and Cal. Webhook deliveries from live products, async chains and fault injection
start in Phase 2 and later.

Ground rules from `AGENTS.md` that every task inherits:

- Tests below the UI only. No browsers, no page objects.
- No sleeps. Async waits use `expect.poll` with explicit deadlines.
- DB access is read-only and is the oracle for state-changing calls.
- Never edit the product forks or `qa-portfolio-harness`. The harness starts and stops products.
- One product stack at a time; every local or CI run ends with that product's `down`.

## 2. Workflow for this phase

1. Every task's plan doc is written and committed on this plan branch, at
   `docs/plans/<YYYY-MM-DD>-p2-<topic>.md`. Plans are docs only.
2. Each task is built on its own dated branch `feat/<YYYY-MM-DD>-p2-<topic>`, cut from `main`,
   opened as a PR to `main` and merged there. The plan branch is never the PR base.
3. Before the next task's plan is written, merge `main` into this plan branch
   (`git merge origin/main`, a merge commit, not a rebase) so the planner sees what was built.
   The plan branch is never rebased, force-pushed or deleted.
4. A task's plan may revise this roadmap; the revision is committed on this branch with that plan.

Commit identity comes from the environment (`GIT_AUTHOR_*`/`GIT_COMMITTER_*`); commit subjects are
Conventional and lowercase.

## 3. Fact checks (2026-10-20, read-only)

Nothing was started and no fork or harness file was edited. The harness was read from a shallow
clone in a scratch directory.

| # | Check | Result |
|---|---|---|
| F1 | Medusa version in the pinned starter | `scripts/bootstrap.sh` pins `MEDUSA_REF=f677db438f27294fc50e4c7c6612e71ff38eeff5` (medusa-dtc-starter). `apps/backend/package.json` pins `@medusajs/medusa`, `@medusajs/framework`, `@medusajs/cli` and others at `2.21.2`; `pnpm-lock.yaml` resolves `@medusajs/medusa@2.21.2`, `@medusajs/framework@2.21.2`, `@medusajs/payment-stripe@2.21.2`. The installed `@medusajs/medusa/package.json` reports `"version": "2.21.2"`. |
| F2 | Matching core tag and spec | `medusajs/medusa` tag `v2.21.2` points at commit `020565398e436a2bc65777a3b1ad347b4735d6df`. At that commit `www/apps/api-reference/specs/store/openapi.full.yaml` exists (blob `67a19141…`, 1,699,076 bytes). The dtc-starter does not carry the spec. Task 3 commits this file from that tag. |
| F3 | Twenty OAS | `open-api.controller.ts` serves `GET /rest/open-api/core` and `open-api.service.ts` builds it from the workspace on the request: with no workspace it returns only `baseSchema('core', …)`, otherwise it adds that workspace's object metadata. Task 5 must fetch it with the per-run bearer from the seeded workspace and commit that snapshot; an anonymous fetch has no object paths. |
| F4 | Documenso OAS | `apps/remix/server/router.ts:127` serves `GET /api/v2/openapi.json` (also `/api/v2-beta/openapi.json`). |
| F5 | Cal OAS | `docs/api-reference/v2/openapi.json` exists at `CAL_REF` (`"openapi": "3.0.0"`). |
| F6 | Harness version | `qa-portfolio-harness` `package.json` version `0.2.11`; tag `v0.2.11` = `main` = `f96038f`. Not on the npm registry (`npm view` returns 404); it is consumed from GitHub. |
| F7 | What the harness starts today | **Cal:** Postgres only via compose (`5450`, db `calendso`), seed via the fork's `yarn db-seed`, then the web app (`next start`, or `next dev` with `CAL_WEB_MODE=dev`). It does **not** start API v2 (`apps/api/v2`, port 5555): `health()` and `proveAuth()` only probe `CAL_API_BASE_URL` and fall back to the web root or to the `ApiKey` row. It does **not** start Redis, which `apps/api/v2/.env.example` expects (`REDIS_URL`). **Documenso:** harness-owned compose with Postgres (`127.0.0.1:5451`) and Inbucket (SMTP 2525, UI 9003); no Redis, MinIO or Gotenberg. Passes `DANGEROUS_BYPASS_RATE_LIMITS=true` through to the app only when it is set in the environment. `authenticate()` needs `DOCUMENSO_API_TOKEN`; minting is a `TODO(verify)`. **Medusa:** harness-owned Postgres (`127.0.0.1:5433`); Redis (`127.0.0.1:6380`) only with `MEDUSA_REDIS=1`; Stripe provider only with `MEDUSA_STRIPE=1` (provider id `pp_stripe_stripe`). **Twenty:** overlay on the fork's `packages/twenty-docker/docker-compose.yml`, image `twentycrm/twenty:v2.44.0`, app `3002`, Postgres `5434`, Mailpit `8025/1025`. No `extra_hosts`/`host-gateway` and no `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS` anywhere in the harness. `authenticate()` uses `TWENTY_API_KEY` or GraphQL `signIn` → `getAuthTokensFromLoginToken`; it does not mint an API key. |

Consequence: Tasks 3–5 can start on harness `v0.2.11`. Task 6 needs harness `v0.3.0` (§7 Q5), which
starts Cal API v2 with Redis; Phase 2 Twenty webhooks need its `host-gateway`. Both are harness work,
done in the harness repo, not here.

## 4. Cross-cutting decisions

Each decision states the industry-standard approach first, then the rejected alternatives.

**D1. Test runner.** `@playwright/test` with `APIRequestContext`, one project per product
(`cal-api`, `doc-api`, `med-api`, `tw-api`), no `use.browserName`, retries 0. Rejected: Jest or
Vitest with `fetch` for the API layer (no fixtures/projects/reporters parity with P1); supertest
(in-process apps only, our products are black boxes).

**D2. Unit runner.** Vitest for framework units (receiver, signers, guards, loaders), run without
products. Rejected: Playwright for units (needs a project per unit file and is slower to start);
`node:test` (weaker TS ergonomics and watch mode; the harness uses it, but it is not ours to match).

**D3. Contract validation.** Commit the OAS, dereference with `@apidevtools/swagger-parser`, compile
response schemas with AJV + `ajv-formats`, `strict: false` for vendor extensions. Rejected: Pact
(consumer-driven, needs provider verification we cannot add to forks); Schemathesis/Dredd
(generation and fuzzing belong to P5); validating against a live-fetched spec per run (drift would
pass silently; drift is detected by the nightly job instead).

**D4. Spec source per product.** Commit a pinned copy: Medusa from core tag `v2.21.2` (F2), Cal
from `docs/api-reference/v2/openapi.json` at `CAL_REF` (F5), Documenso and Twenty snapshotted from
the running product (F3, F4) with the product SHA recorded next to the file. Rejected: pulling the
spec from `main` of each upstream (does not match the pinned app).

**D5. DB oracle.** `pg` pool per product with a read-only session (`default_transaction_read_only
= on`) plus a client-side guard that rejects anything but a single `SELECT`/`WITH … SELECT`
statement. Rejected: a dedicated read-only role (needs DDL on harness-owned databases, which we do
not own); ORM clients from the forks (couples tests to product internals).

**D6. Dynamic tokens.** Minted per run through the product's own HTTP API in a Playwright setup
project (`globalSetup`-style project dependency), held in memory only, revoked in teardown; names
carry the run-id prefix. Each product task starts with a probe of that HTTP path. Only if the probe
proves per-run minting impossible does the task fall back to a harness-provided token from env
(`DOCUMENSO_API_TOKEN`, `CAL_API_KEY`), and the plan records the probe result. Tokens are never
inserted via SQL and never printed, logged or committed. Rejected: long-lived tokens in `.env` as
the default (not "dynamic", leak risk); minting per test (rate limits, slower); SQL inserts into
token tables (bypasses the product's hashing and audit, and breaks the read-only DB rule, D5).

**D7. Data isolation.** Run-id prefix `p2-<yyyymmddHHMMss>-<rand4>` on every created entity, atomic
`test.extend` fixtures (create → yield → delete) and an orphan-check query after teardown.
Rejected: DB truncation between runs (destroys seed data owned by the harness); transaction
rollback (black-box HTTP cannot share our transaction).

**D8. Webhook signing.** Signers implemented with `node:crypto` and verified against published or
recomputed known vectors; Stripe headers via the official SDK
`stripe.webhooks.generateTestHeaderString`. Rejected: Stripe CLI (`stripe listen`/`trigger`, needs
network and a Stripe account); hand-rolled Stripe format (drifts from the SDK's verifier).

**D9. Lint/format/check.** ESLint (flat config, `typescript-eslint`) + Prettier, `tsc --noEmit`,
one `npm run check` that runs format check, lint, typecheck and units. Rejected: Biome (two forks
use it, but P1 uses ESLint/Prettier and parity matters more).

**D10. CI.** GitHub Actions, one workflow, `check` + `unit` jobs on every PR; one job per product,
added by that product's task, each running harness `up` → tests → harness `down` (`if: always()`).
Rejected: a single matrix job from day one (products land in different tasks and have very
different runtimes); docker compose files of our own (harness owns stacks).

## 5. Tasks

### Task 1. Framework skeleton (no product)

- **Goal:** a repo that builds, lints, unit-tests and runs an empty Playwright suite with no product
  running.
- **Case IDs:** none (framework). Enables every case below.
- **Files expected:** `package.json`, `package-lock.json`, `tsconfig.json`, `playwright.config.ts`
  (projects `cal-api`, `doc-api`, `med-api`, `tw-api`; no browsers), `eslint.config.mjs`,
  `.prettierrc`, `vitest.config.ts`, `src/run-id.ts`, `src/db/pg.ts` (read-only pool + SELECT-only
  guard), `src/contracts/ajv.ts` (swagger-parser dereference + AJV + ajv-formats, `strict: false`),
  `tests/unit/**` (run-id, guard accepts/rejects, loader on a small fixture spec),
  `.github/workflows/api.yml`. `qa-portfolio-harness` added as a pinned git dependency
  (`github:Jayami123/qa-portfolio-harness#v0.2.11`).
- **Dependencies:** none.
- **CI impact:** new `api.yml` with `check` and `unit` jobs, no Docker. `env-check.yml` unchanged.
  After merge, `check` and `unit` become required checks (§7 Q4).
  `scripts/cloud-install.sh` starts running `npm ci` once the lockfile exists.
- **Done when:** `npm run check` and `npm run unit` pass locally and in CI; `npx playwright test
  --list` shows the four projects with zero tests and no browser download; the guard rejects
  `INSERT`, `UPDATE`, `DELETE`, multi-statement and `SELECT … FOR UPDATE` input in units.
- **Open risks:** the harness is ESM-only (`"type": "module"`), so the config must be ESM-compatible;
  Node 22.23 for everything except Documenso commands (`$NODE24`); a SQL guard is a seatbelt, not
  a parser, so the read-only session setting is the real control.

### Task 2. Webhook receiver and signers

- **Goal:** a local receiver and signers ready for Phase 2, proven by units only.
- **Case IDs:** none executed. Prepares P2-CAL-WH-*, P2-CAL-DLY-*, P2-DOC-WH-*, P2-DOC-STR-*,
  P2-MED-WH-*, P2-TW-WH-*.
- **Files expected:** `src/webhooks/receiver.ts` (`node:http`, `127.0.0.1:4317` from
  `P2_RECEIVER_HOST`/`P2_RECEIVER_PORT`, raw `Buffer` body, modes `ok|500|slow` switchable at
  runtime, JSONL log with headers and the raw-body SHA-256 under `receiver-logs/`),
  `src/webhooks/sign.ts` (Cal `X-Cal-Signature-256` HMAC-SHA256 hex over the raw body; Daily
  signature per `computeSignature(secret, body, timestamp)` in Cal's
  `apps/web/app/api/recorded-daily-video/route.ts`; Stripe `t=…,v1=…` via the Stripe SDK; Twenty
  HMAC with timestamp and nonce per `call-webhook.job.ts`), `tests/unit/webhooks/**`.
- **Dependencies:** Task 1.
- **CI impact:** more units in the `unit` job; no product job.
- **Done when:** units cover each signer with a known vector (Stripe: the SDK's own verifier
  accepts the generated header and rejects a tampered body and a timestamp outside 300 s); the
  receiver records raw bytes exactly (a body with non-normalised JSON whitespace hashes the same
  as sent), and each mode is asserted (`500` status, `slow` exceeds a given delay without sleeps
  in the test via `expect.poll`).
- **Open risks:** the Daily and Twenty constructions must be read from the pinned fork sources,
  not from docs, and the vector's source line recorded; the receiver bound to `127.0.0.1` is not
  reachable from Twenty containers until the harness adds `host-gateway` (Phase 2).

### Task 3. Medusa

- **Goal:** per-run auth and store-API contracts for Medusa, asserted in the DB.
- **Case IDs:** P2-MED-CON-001, P2-MED-CON-002, P2-MED-CON-003.
- **Files expected:** `src/clients/med.ts`, `src/auth/med.ts` (admin `POST /auth/user/emailpass` →
  JWT; customer `POST /auth/customer/emailpass/register` → `POST /store/customers` →
  `POST /auth/customer/emailpass`; publishable key created per run via the admin API and sent as
  `x-publishable-api-key`), `src/fixtures/atomic.ts` (create → yield → delete, then orphan check),
  `contracts/medusa/store.openapi.full.yaml` with `contracts/medusa/SOURCE.md` (tag `v2.21.2`,
  commit `0205653…`), `tests/contracts/med/*.spec.ts`, `api.yml` job `med-api`.
- **Dependencies:** Task 1. Harness `v0.2.11` (Medusa default: Postgres, fake Redis).
- **CI impact:** `med-api` job (required after two green `main` runs, §7 Q4): bootstrap medusa, harness `up medusa`, `playwright test
  --project=med-api`, harness `down medusa` always, upload report.
- **Payment:** cart completion uses the system payment provider (§7 Q3); Stripe
  (`MEDUSA_STRIPE=1`) starts in Phase 2.
- **Done when:** the three cases pass twice in a row on a fresh stack; teardown leaves zero rows
  with the run-id prefix and no orphan line items/carts; the spec file matches the tag blob hash.
- **Open risks:** the full store spec is ~1.7 MB, so dereference cost and repo size need checking;
  the system provider must be linked to the test region in the harness seed (probe first); CON-003 iterates every GET path, which needs valid seed params per path (paths without seedable
  params are listed as skipped with a reason, not silently dropped).

### Task 4. Documenso

- **Goal:** per-run API token and envelope contracts for Documenso.
- **Case IDs:** P2-DOC-CON-001, P2-DOC-CON-002.
- **Token rule (§7 Q1):** the plan opens with a probe: sign in over HTTP as the seeded user, then
  create a token through the api-token tRPC route. Fallback to the harness `DOCUMENSO_API_TOKEN`
  (seeded by harness `v0.3.0`) only if the probe proves that impossible. Never via SQL.
- **Files expected:** `src/clients/doc.ts`, `src/auth/doc.ts` (sign in as the seeded user, create an
  API token via the tRPC api-token router, delete it in teardown; env fallback per the token rule), `contracts/documenso/openapi.json`
  snapshot from `GET /api/v2/openapi.json` with `SOURCE.md` (`DOCUMENSO_REF`),
  `tests/contracts/doc/*.spec.ts`, `api.yml` job `doc-api`.
- **Dependencies:** Task 1 (Task 3's atomic fixture is reused). Harness `v0.2.11` with
  `DANGEROUS_BYPASS_RATE_LIMITS=true` set explicitly; harness `v0.3.0` turns rate limits off by default
  in its test env, after which the explicit flag is dropped. Run under `$NODE24`.
- **CI impact:** `doc-api` job on Node 24 for harness commands, rate limits off in the test env (the
  fork's `.env.example` documents the bypass as E2E-only), harness `down documenso` always.
- **Done when:** both cases pass twice in a row; teardown leaves no envelope, recipient or field rows
  with the run-id prefix; the token created for the run no longer exists in `ApiToken` after teardown.
- **Open risks:** the harness marks first-token minting as `TODO(verify)` because it needs an
  authenticated session (cookie + CSRF handling over HTTP); if the probe forces the env fallback,
  P2-DOC-CON-* still pass but the "dynamic token" claim is weaker and the README must say so; the
  bypass must never reach a non-test environment.

### Task 5. Twenty

- **Goal:** per-run API key and REST/GraphQL contracts for Twenty.
- **Case IDs:** P2-TW-KEY-001, P2-TW-CON-001, P2-TW-CON-002.
- **Files expected:** `src/clients/tw.ts` (REST + GraphQL; GraphQL `200` with `errors[]` surfaces as a
  failure), `src/auth/tw.ts` (sign in → create API key `qa-<run>` via GraphQL → revoke in teardown),
  `contracts/twenty/open-api-core.json` snapshot with `SOURCE.md` (image `v2.44.0`, `TWENTY_REF`,
  seeded workspace), `tests/contracts/tw/*.spec.ts`, `api.yml` job `tw-api`.
- **Dependencies:** Task 1. Harness `v0.2.11`.
- **CI impact:** `tw-api` job pulls `twentycrm/twenty:v2.44.0`, harness `up twenty`, tests, `down`.
- **Done when:** the three cases pass twice in a row; the snapshot is fetched **with the per-run
  bearer from the seeded workspace** (F3) and contains `/people`, `/companies`, `/opportunities`;
  the key is revoked after the run.
- **Open risks:** the OAS is per workspace, so a different seed or custom fields change it; the
  snapshot must be re-taken when the image tag changes; the image pull is large for CI.

### Task 6. Cal

- **Goal:** API v2 contracts for Cal.
- **Case IDs:** P2-CAL-CON-001, P2-CAL-CON-002, P2-CAL-CON-003, P2-CAL-CON-004.
- **Files expected:** `src/clients/cal.ts` (`cal-api-version: 2024-09-04` for `/v2/slots`,
  `2024-08-13` for bookings), `src/auth/cal.ts` (token rule below), `contracts/cal/openapi.json` from
  `docs/api-reference/v2/openapi.json` at `CAL_REF` with `SOURCE.md`, `tests/contracts/cal/*.spec.ts`,
  `api.yml` job `cal-api`.
- **Token rule (§7 Q2):** probe for a per-run API key path through the product's HTTP API (web
  session or API v2); if none exists, use the harness-seeded `CAL_API_KEY` from env. Never via SQL,
  never printed or committed.
- **Dependencies:** Task 1 and `qa-portfolio-harness` `v0.3.0` (§7 Q5: Cal API v2 on 5555 with Redis,
  plus the P6 process-group handling), built in the harness repo in parallel with Tasks 3–5. P2 gets
  no bridge script that starts API v2 itself.
- **CI impact:** `cal-api` job, the slowest (the harness allows up to 45 min for `next build`);
  build caching is the harness's concern.
- **Done when:** the four cases pass twice in a row on the new harness release; CON-002 finds the
  `Booking` row by uid; CON-003 finds no `Booking` row; CON-004 records the no-header behaviour.
- **Open risks:** blocked until harness `v0.3.0` lands; per-run key creation is "to verify" in the
  master plan, so the seeded-key fallback is likely; the committed OAS may lag
  the running API v2 code at the same SHA.

### Task 7. Closeout

- **Goal:** close Phase 1 with drift detection, docs and branch protection.
- **Case IDs:** none (framework).
- **Files expected:** `.github/workflows/contracts-drift.yml` (nightly: re-fetch each spec from its
  source, diff against the committed copy, fail with the diff), README sections from master plan §8
  (signature constructions, data isolation, product SHAs and env flags; async-chain diagrams and
  expected-failure lists as stubs until their phases), required-checks list.
- **Dependencies:** Tasks 1–6.
- **CI impact:** new scheduled workflow. Required checks follow §7 Q4; Task 7 confirms every product
  job has reached its two green `main` runs and lists the exact check names.
- **Done when:** a manual run of the drift job is green, and a deliberately edited local spec copy
  makes it fail; README sections exist; the required-check list is documented for Jayami's Main
  ruleset.
- **Open risks:** Documenso and Twenty drift needs a running product, which makes the nightly job
  long; Cal drift for API v2 waits on Task 6.

## 6. Deferred master-plan Phase 1 items

| Item | Master plan | Deferred to | Reason |
|---|---|---|---|
| Live webhook deliveries to the receiver | §1, §2 receiver | Phase 2 | Agreed: receiver is unit-tested only in Phase 1. |
| `docker/` compose overrides per product | §2 | Not built in P2 | The harness owns stacks; overrides go into harness releases. |
| Twenty `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS` and `host.docker.internal` | §4 Twenty | Phase 2 + harness release | Needed only for outbound webhooks. |
| Cal per-run API key creation | §4 Cal | Task 6 probe | Per-run key through the product if the probe finds a path, else the harness-seeded key (§7 Q2). |
| Workflow name `p2-api.yml` and single matrix job | §2, §6 | Replaced | Agreed name is `api.yml` with per-product jobs (D10). |
| `tz-matrix` CI job | §6 | Phase 4 | TZ matrices are Phase 4. |
| On-failure `pg_dump --schema-only` diff and DB-row dumps | §6, §7 | Phase 3 | Product logs and reports are kept in Phase 1; DB dumps matter once async chains assert rows. |
| Settle-time annotations | §7 | Phase 3 | No async chains in Phase 1. |
| Mail catcher (Mailpit/Inbucket) oracle client | §3 | Phase 3 | First used by DOC-REM/DOC-MAIL. |
| Full README checklist | §8 | Phase 4 (stubs in Task 7) | Diagrams and expected-failure lists depend on later phases. |

## 7. Decisions on the open questions (answered 2026-10-20)

1. **Documenso token (Task 4).** Mint the API token per run through the product's own HTTP path:
   sign in, then the api-token tRPC route. Fall back to a harness-provided `DOCUMENSO_API_TOKEN` only
   if the Task 4 probe proves that impossible. Never insert tokens via SQL. (D6)
2. **Cal key (Task 6).** Same rule: a per-run key through the product if the probe finds a path,
   else the harness-seeded `CAL_API_KEY` from env. Never print or commit it. (D6)
3. **Medusa payment (Task 3).** P2-MED-CON-001 completes carts with the system payment provider.
   Stripe is Phase 2.
4. **Required checks.** `check` and `unit` become required after Task 1 merges. Each product job
   (`med-api`, `doc-api`, `tw-api`, `cal-api`) becomes required after two green runs on `main`.
   Jayami adds them to the Main ruleset; agents only report the check names. (D10, Tasks 1, 3–7)
5. **Harness `v0.3.0`** (built in the harness repo, not here) adds:
   - Cal: API v2 on 5555 with Redis.
   - Twenty: `host-gateway` (`host.docker.internal`) and `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS`.
   - Documenso: rate limits off by default in the test env, and a seeded API token as the fallback
     for Q1.
   - Cal process-group handling from P6: ownership check against PID reuse, a second `up` waits for
     ready, reuse only a live recorded group, SIGKILL after SIGTERM, timeout validation.

   Tasks 3–5 start on `v0.2.11` and move to `v0.3.0` when it is released; Task 6 requires it.

No open questions remain for Phase 1. New ones go into the plan doc of the task that raises them.
