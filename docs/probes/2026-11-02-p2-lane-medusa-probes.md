# P2 Medusa lane probe record, 2026-11-02

Immutable once merged. New probe runs go into a new dated file. This file records **what was run in
the planning session** and **why the stack-dependent probes did not run**. It does not edit or extend
`2026-11-01-p2-foundation-probes.md` (plan branch `plan/2026-11-01-p2-foundation`, not on `main`), whose
entries P1 to P7 are cited by the Medusa plan only as prior records.

## Session summary

- Base: `origin/main` = `aa10ec11bada21b3e3e5803a948e33023d648505` (`git merge-base --is-ancestor aa10ec1 origin/main` passed).
- Fork: `/home/user/products/medusa-dtc-starter` HEAD = `f677db438f27294fc50e4c7c6612e71ff38eeff5`, equal to `MEDUSA_REF` (`scripts/bootstrap.sh:10`).
- Harness: installed `node_modules/qa-portfolio-harness` reports version **0.2.11**. `package-lock.json:1608-1610` pins **0.3.0** (`git+ssh`, commit `be86e0e6`). The brief requires 0.3.0.
- **STOP (planning brief section 11): harness version is not 0.3.0.** The corrective step, `npm ci`, was refused by the sandbox permission classifier as "Irreversible Local Destruction" (it deletes `node_modules`). It was not retried and no other route was tried. Because of this refusal and the version mismatch, **no `up`, no stack and no product request was made in this session.**
- Stack check before any `up` (not needed, nothing started): `docker ps` lists no `qa-harness-*` container; `ss -ltn` shows none of 3000, 3001, 5555, 5432, 5433, 6380, 6381, 9000 taken (Medusa API 9000 and DB 5433 from `node_modules/qa-portfolio-harness/src/config.ts:38,43`).
- Environment presence (values never read or printed): `STRIPE_API_KEY` set; `STRIPE_WEBHOOK_SECRET` unset; `MEDUSA_FF_CACHING` unset.
- Date check: `date -u +%F` = `2026-11-02`; no file named `docs/probes/2026-11-02-p2-lane-medusa-probes.md` existed on any branch.

Status vocabulary: **CONFIRMED** (run in this session, output below), **UNPROBED** (not run; reason given), **CONTRADICTS** (observed value differs from the cited expectation).

Pure probes need no stack: they import the fork's installed packages and run pure functions. Their script is `/tmp/p2-lane-probes/pure-probes.cjs` (scratch, not committed). No secret is generated or printed by it: the test secret is random, local and never written out.

---

## P-MED-9. Does the fork's Stripe smallest-unit conversion round a 3-decimal KWD total, and what does it do to JPY and USD?

- Date (UTC): 2026-11-02T10:0x Z (session run)
- Product commit: `f677db438f27294fc50e4c7c6612e71ff38eeff5` (fork HEAD equals the pin)
- Harness version: not used (pure function, no stack)
- Command: `node /tmp/p2-lane-probes/pure-probes.cjs` (first section), importing `getSmallestUnit` and `getAmountFromSmallestUnit` from the fork's `@medusajs/payment-stripe@2.21.2` `dist/utils/get-smallest-unit.js`
- Output (trimmed):
  ```text
  getSmallestUnit(1.234, KWD) = 1240
  getSmallestUnit(1.2, KWD) = 1200
  getSmallestUnit(1, KWD) = 1000
  getSmallestUnit(1234.5, JPY) = 1235
  getSmallestUnit(1234, JPY) = 1234
  getSmallestUnit(10, USD) = 1000
  getSmallestUnit(10.005, USD) = 1001
  getAmountFromSmallestUnit(1240, KWD) = 1.24
  ```
- Proves: a KWD amount is rounded **up** to a multiple of 10 fils before it reaches Stripe, so a 1.234 KWD total is charged 1.240 KWD when read back. A 3-decimal USD total is rounded half-up to whole cents.
- Citation: `@medusajs/payment-stripe@2.21.2 dist/utils/get-smallest-unit.js:6-27` (multipliers, `3: ["BHD","IQD","JOD","KWD","OMR","TND"]`), `:45-56` (`Math.ceil(numeric / 10) * 10` for multiplier 1000, comment "rounding to the nearest ten"). Upstream intent: `packages/modules/providers/payment-stripe/src/utils/__tests__/get-smallest-unit.ts:9` (monorepo tag `v2.21.2`, commit `0205653`) asserts `getSmallestUnit(5.124, "KWD") === 5130`, so the round-up is tested upstream, not an accident.
- Status: **CONFIRMED** for the function. Whether the Stripe network rule behind the round-up is real is **UNPROBED** (no Stripe call made). The conservation consequence (charged amount vs order total) is **UNPROBED** live; see P-MED-8 and P-MED-10.

## P-MED-12a. Does the pinned Stripe SDK accept a signature at receipt age 299 s, 300 s and reject 301 s?

- Date (UTC): 2026-11-02T10:0x Z (session run)
- Product commit: `f677db438f27294fc50e4c7c6612e71ff38eeff5` (the SDK is the one `@medusajs/payment-stripe` resolves: `node_modules/.pnpm/stripe@15.12.0`, reached by its symlink)
- Harness version: not used (pure SDK call, no stack)
- Command: `node /tmp/p2-lane-probes/pure-probes.cjs` (second section): `Stripe.webhooks.generateTestHeaderString` then `Stripe.webhooks.constructEvent(payload, header, secret, undefined, undefined, checkAtMs)` with `checkAtMs` equal to the signing time plus the age.
- Output (trimmed):
  ```text
  DEFAULT_TOLERANCE = 300
  verify at age 299 s (checked at receipt) -> accepted
  verify at age 300 s (checked at receipt) -> accepted
  verify at age 301 s (checked at receipt) -> rejected: Timestamp outside the tolerance zone
  ```
- Proves: at the SDK level the boundary is inclusive at 300 s and the default tolerance is 300 s. This is the SDK's behaviour, not Medusa's.
- Citation: `stripe@15.12.0 cjs/Webhooks.js:8` (`DEFAULT_TOLERANCE: 300`), `:13` (`tolerance || Webhook.DEFAULT_TOLERANCE`), `:159-160` (`timestampAge = floor(now/1000) - t; if (tolerance > 0 && timestampAge > tolerance) throw`). Medusa passes no tolerance and no `receivedAt`: `@medusajs/payment-stripe@2.21.2 dist/core/stripe-base.js:511-519`.
- Status: **CONFIRMED** (SDK). Product-level acceptance at a receipt time is **UNPROBED** (needs the stack, P-MED-2).

## P-MED-12b. Is the tolerance evaluated when the subscriber runs, 5 s after receipt?

- Date (UTC): 2026-11-02T10:0x Z (session run)
- Product commit: `f677db438f27294fc50e4c7c6612e71ff38eeff5`
- Harness version: not used (pure SDK call)
- Command: `node /tmp/p2-lane-probes/pure-probes.cjs` (third section): the same signed header, checked at `receipt age + 5 s` (what a 5000 ms emit delay does; the delay itself is code, not run).
- Output (trimmed):
  ```text
  verify at receipt age 294 s, processed 5 s later (age 299) -> accepted
  verify at receipt age 295 s, processed 5 s later (age 300) -> accepted
  verify at receipt age 299 s, processed 5 s later (age 304) -> rejected: Timestamp outside the tolerance zone
  ```
- Proves: if the subscriber verifies 5 s after the webhook arrived, a Stripe event signed 299 s before arrival is rejected. The window that matters is measured at processing, so the two-sided boundary is about 295 s at receipt, not 300 s.
- Citation: `@medusajs/medusa@2.21.2 dist/api/hooks/payment/[provider]/route.js:16-23` (emit with `delay: options.webhook_delay || 5000`), `dist/subscribers/payment-webhook.js:13` (`getWebhookActionAndData` runs in the subscriber), `@medusajs/payment-stripe@2.21.2 dist/core/stripe-base.js:511-519` (verification at call time, no `receivedAt`).
- Status: **CONFIRMED** for the SDK arithmetic. **UNPROBED** for the product: that the subscriber really runs 5 s after receipt, and the rejection in a live stack (P-MED-2 and P-MED-3). The brief's MED-WH-006 expectation "299 s accepted" is **CONTRADICTED** by this arithmetic at the code level and must be re-checked live before any test asserts either side.

---

## Stack-dependent probes: UNPROBED (STOP, not run)

Each was planned under brief section 4. None ran, because the harness is 0.2.11, not 0.3.0, and `up` was not started. Each row below states the code that the probe will settle; the probe itself is written as a build task (plan L0).

### P-MED-1. Event bus: which module is loaded, and is one event visible in Redis?
- Status: **UNPROBED** (STOP: harness 0.2.11 installed, 0.3.0 required).
- Code under test: installed harness `node_modules/qa-portfolio-harness/src/adapters/medusa-env.ts:237-252` (writes `@medusajs/medusa/event-bus-redis`, `cache-redis` and `workflow-engine-redis` when `MEDUSA_REDIS=1`). The harness pinned at 0.3.0 has not been read in this session.
- Settled by: L0 probe (plan section 8). Prior record (plan branch, not on main): one `payment.webhook_received` event was retried three times with Redis, `2026-11-01 probe 1.5`.

### P-MED-2. Stripe payment webhook end to end: status at receipt, at -299 s and -301 s, and after the 5000 ms delay
- Status: **UNPROBED** (STOP). `STRIPE_API_KEY` is set in this environment; `STRIPE_WEBHOOK_SECRET` is unset, so a per-run secret must be generated and passed to `up` before any signed case can run (plan section 12).
- Code under test: `dist/api/hooks/payment/[provider]/route.js:21` (delay), `dist/subscribers/payment-webhook.js:13`, `stripe-base.js:418-429` (no `metadata.session_id` returns NOT_SUPPORTED), `stripe-base.js:489-495` (`payment_intent.succeeded` returns SUCCESSFUL).

### P-MED-3. Repeat delivery of the same event id: end state (one payment, one order, no double capture)
- Status: **UNPROBED** (STOP). Code: `process-payment.js:94-120` (capture only when payment data exists; authorize-only otherwise). Prior record: `status authorized, payments 1` after a single signed event (`2026-11-01 probe 4.5`, plan branch).

### P-MED-4. Webhook racing cart completion: what the cart lock does and the end state of one race
- Status: **UNPROBED** (STOP). Code: lock at `dist/payment/workflows/process-payment.js:85-88` (`acquireLockStep`, key cartId, timeout 30 s, ttl 2 min) and release at `:173-176`. The upstream source at tag `v2.21.2` has the same step at `packages/core/core-flows/src/payment/workflows/process-payment.ts:102-105`. The default lock provider is in-memory (`@medusajs/locking/dist/loaders/providers.js:26-32`), which is per-process; the pinned harness's `MEDUSA_LOCK` setting is **UNPROBED** (not read at 0.3.0).

### P-MED-5. Currency precision: a JPY and a KWD region, one cart each, stored amounts against the expected minor units
- Status: **UNPROBED** (STOP). Code: `@medusajs/utils@2.21.2 dist/defaults/currencies.js:518-524` (JPY `decimal_digits: 0`), `:563-569` (KWD `decimal_digits: 3`). The seed has no JPY or KWD price (harness `medusa-seed.ts`, US region and Europe only).

### P-MED-6. Authorization: a store call with another customer's cart or order id changes no rows
- Status: **UNPROBED** (STOP). P5 owns the verdict; this probe records only the DB end state.

### P-MED-7. Cache: which keys appear in Redis on a warm read
- Status: **UNPROBED** (STOP). The core cache is off unless `MEDUSA_FF_CACHING=1`: `@medusajs/medusa/dist/feature-flags/caching.js:3-8` (`default_val: false`, `env_key: "MEDUSA_FF_CACHING"`, "[WIP]"). With the flag on, `@medusajs/medusa/dist/api/store/products/route.js:52-53` and `:85-86` enable the cache for store product reads, and `@medusajs/utils/dist/caching/index.js:19-23` and `:77` bypass it when the flag or the module is absent. The harness does not set `MEDUSA_FF_CACHING` at 0.2.11 (`medusa-env.ts`, no match).

### P-MED-8 (new). Schema of the money and inventory tables through `qa_ro`
- Status: **UNPROBED** (STOP). Needed before any MED-ORD-001, MED-MON-001 or MED-INV-001 SQL is written. Query: `information_schema.columns` for `order`, `order_summary`, `payment`, `payment_session`, `inventory_level`, `reservation_item`, and the order link table to the cart. Names in the plan are **not** taken from the review; they are to be read here.

### P-MED-10 (new). A bad signature makes the subscriber throw; the event bus retries it `attempts` times and then parks it
- Status: **UNPROBED** (STOP). Code: `stripe-base.js:511-519` (`constructWebhookEvent` throws `buildError`), `@medusajs/event-bus-redis@2.21.2 dist/services/event-bus-redis.js:48-50` (`job.attemptsMade`, `job.opts.attempts`), `:105` (warns "Retrying is not configured" when `attempts` is absent), `dist/api/hooks/payment/[provider]/route.js:22` (`attempts: options.webhook_retries || 3`). Prior record: three error lines for one event (`2026-11-01 probe 1.5`).

### P-MED-11 (new). Price-list boundary read on the database clock
- Status: **UNPROBED** (STOP). Code: `@medusajs/pricing@2.21.2 dist/repositories/pricing.js:137` and `:188` (`pl.starts_at IS NULL OR pl.starts_at <= now()`, the database's `now()`, not the server clock).

### P-MED-13 (new). Product CSV import: all-or-nothing or partial on a bad row mid-file
- Status: **UNPROBED** (STOP). Code read: `@medusajs/core-flows@2.21.2 dist/product/steps/parse-product-csv.js:38` throws `INVALID_DATA` for a missing handle. The import workflow's partial/all-or-nothing behaviour is not read in the dist.

### P-MED-14 (new). Does the lane need a serial (product-wide scheduled) Medusa job?
- Status: **UNPROBED** (STOP). No Medusa case in the index needs a cron or sweep job; the plan assumes "no serial task" and records the assumption as an open decision.

---

## Code-read facts (not runtime claims)

These are read from the pinned fork's installed packages or from the upstream monorepo at tag `v2.21.2`. They do not establish runtime behaviour; the plan cites them only to say what a probe must check.

| ID | Fact | Citation |
|---|---|---|
| CR-1 | The payment hook returns 200 after enqueue and 400 only when the emit itself throws | `@medusajs/medusa@2.21.2 dist/api/hooks/payment/[provider]/route.js:16-29` |
| CR-2 | The subscriber resolves the action at processing time; it skips events without `session_id` and the NOT_SUPPORTED, CANCELED, FAILED, REQUIRES_MORE, PENDING actions | `dist/subscribers/payment-webhook.js:13-34` |
| CR-3 | Stripe provider construction requires `apiKey` (throws otherwise); webhook secret missing only warns | `@medusajs/payment-stripe@2.21.2 dist/core/stripe-base.js:12-19, 27` |
| CR-4 | Events without `metadata.session_id` are NOT_SUPPORTED | `dist/core/stripe-base.js:418-429` |
| CR-5 | `payment_intent.succeeded` maps to SUCCESSFUL with `amount` from `amount_received` | `dist/core/stripe-base.js:489-495` |
| CR-6 | Verification passes no tolerance and no `receivedAt`; the SDK default applies at call time | `dist/core/stripe-base.js:511-519`; `stripe@15.12.0 cjs/Webhooks.js:8,13,159-160` |
| CR-7 | Capture happens only when payment data exists; otherwise the session is authorized (the C8 fact) | `@medusajs/core-flows@2.21.2 dist/payment/workflows/process-payment.js:94-120` |
| CR-8 | Cart lock: acquire at `:85-88`, release at `:173-176`; upstream source at `packages/core/core-flows/src/payment/workflows/process-payment.ts:102-105` | as cited |
| CR-9 | Default lock provider: in-memory, per process | `@medusajs/locking/dist/loaders/providers.js:26-32` |
| CR-10 | Event retries need an explicit `attempts`; the warning names it | `@medusajs/event-bus-redis@2.21.2 dist/services/event-bus-redis.js:48-50, 105` |
| CR-11 | Price lists are active when `starts_at` is null or `<= now()` on the database | `@medusajs/pricing@2.21.2 dist/repositories/pricing.js:137, 188` |
| CR-12 | Store product reads are cache-enabled, behind the flag | `@medusajs/medusa@2.21.2 dist/api/store/products/route.js:52-53, 85-86`; `dist/feature-flags/caching.js:3-8` |
| CR-13 | Regions and promotions are also cache-enabled behind the flag | `@medusajs/core-flows@2.21.2 dist/cart/steps/find-one-or-any-region.js:13,23,33`; `dist/cart/steps/get-promotion-codes-to-apply.js:58` |
| CR-14 | Inventory levels store `stocked_quantity` and `reserved_quantity` (default 0) | `@medusajs/inventory@2.21.2 dist/models/inventory-level.js:12-13` |
| CR-15 | Currency table: JPY 0 decimals, KWD 3 decimals | `@medusajs/utils@2.21.2 dist/defaults/currencies.js:518-524, 563-569` |
| CR-16 | The pinned fork ships no backend tests: `apps/backend/integration-tests/setup.js` only; installed `@medusajs` packages ship dashboard UI tests only | fork `apps/backend/integration-tests/`; `node_modules/@medusajs/*` |
| CR-17 | Upstream at tag `v2.21.2` (commit `0205653`) has price-list, pending-authorization and product-import specs, and upstream test config sets `webhook_delay: 0` and `webhook_retries: 0` | `integration-tests/http/__tests__/price-list/admin/price-list.spec.ts`; `.../payment/store/pending-authorization.spec.ts`; `.../product/admin/product-import.spec.ts`, `product-imports.spec.ts`; `integration-tests/http/medusa-config.js:66-67` |
| CR-18 | Harness 0.2.11 does not set `webhook_delay`, `webhook_retries`, `MEDUSA_FF_CACHING` or `MEDUSA_LOCK` | `node_modules/qa-portfolio-harness/src` (no match) |
| CR-19 | P1 contract spec (read-only clone of the P1 repository, commit `a9fc8f3`) covers admin credential separation and error shape (`P1-MED-FW-X01`, `X02`); not the store invalid-variant case | `tests/medusa/api/contract.spec.ts` |
| CR-20 | P1 known issues: concurrent admin cancel and fulfil both return 200 (`P1-MED-FW-X04`, `X05`); the lane does not own these | `docs/observations/medusa-known-issues.md` |

---

## Unprobed items carried forward

- Every runtime claim of the lane plan (plan section 2) that is not a CR row above.
- Harness 0.3.0 contents (not installed; the lane must read its `medusa-env.ts` at the pinned tag before relying on `MEDUSA_LOCK`, `MEDUSA_FF_CACHING` pass-through, or any change to the Redis switch).
- Whether `npm ci` can install `0.3.0` from `git+ssh` in this sandbox (not tested; it was refused as a local-destruction command).

---

## Session 2 (2026-11-02, owner-approved install): gate record

No probe ran in session 2. This section records the gate that stopped the run; it does not replace session 1.

- Date (UTC): 2026-11-02 (session 2, after `date -u +%FT%TZ`).
- Command: `bash scripts/cloud-install.sh` (owner approved). Output (trimmed): `added 138 packages`; `bootstrap` ran `pnpm install --frozen-lockfile` in the fork (`Done`), skipped the Twenty image (Docker), exit 0.
- Installed evidence: `qa-portfolio-harness` **0.3.0** (`node -p require(.../package.json).version`); `stripe` **23.0.1**; fork HEAD `f677db438f27294fc50e4c7c6612e71ff38eeff5` (equals `MEDUSA_REF`).
- Unit baseline on `main` `aa10ec1` (`npm run unit`): `# tests 285`, `# pass 285`, `# fail 0`, exit 0. `npm run check:static`: exit 0.
- Gate: the owner required 277 with 0 failures. Measured 285 with 0 failures. **STOP**, per the owner's rule. Reason for the difference: per-file runs of `tests/unit/**` sum to 275; `tests/unit/env.test.ts` (top level, 10 tests) makes 285. The index's 277 is revision-2 and was not rebuilt (index section 2).
- Stack state at the gate: no `up` run; no `qa-harness-*` container started by this session. The stack prechecks were not needed.
- Probe status: every stack-dependent probe remains UNPROBED. P-MED-9 and P-MED-12a/b remain CONFIRMED (session 1).
- Decision pending: OD-15 (unit anchor) per the plan. Default: accept 285.
