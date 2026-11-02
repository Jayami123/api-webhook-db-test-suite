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
- Owner decision (session 2 reply): **accept 285**.

---

## Session 3 (2026-11-02): stack probes, one stack at a time

**Constants for every entry.** Product commit `f677db438f27294fc50e4c7c6612e71ff38eeff5` (fork HEAD equals `MEDUSA_REF`, checked before each stack). Harness version `0.3.0` (`node -p "require('./node_modules/qa-portfolio-harness/package.json').version"`). Harness code lines below are from **0.3.0** (`node_modules/qa-portfolio-harness/src/adapters/medusa-env.ts`), not 0.2.11. Scripts are scratch under `/tmp/p2-lane-probes/probes/` (not committed). Secrets: the per-run values are generated into `/tmp/p2-lane-probes/run.env` (mode 600) and never printed; Stripe values are never echoed.

**Stacks (each: precheck, up, probes, down with `MEDUSA_DOWN_VOLUMES=1`, then zero containers, zero volumes, no listener on 3000 3001 5555 6380 5433 9000 5432 8000 checked via `/proc/net/tcp`, because `ss` is absent in this image).**
- Stack S-A: `up` 68 s (build cached), `MEDUSA_FF_CACHING` value `1`, which loads as **false** (see E4). Ran P-MED-1 to 8, 10 to 13, 14 to 16 (non-cache), 17 to 18, the money and order probes. Ended `down` rc 0.
- Stack S-B: `up` 64 s, `MEDUSA_FF_CACHING=true`, loads as **true** (`backend log: Using flag MEDUSA_FF_CACHING from environment with value true`). Ran P-MED-7 (cache on) and the KWD order probe. Ended `down` rc 0.
- Before S-A, one earlier `up` (cold, 149 s, incl. build) ran with no persisted env; the seeded admin did not match and the stack was torn down (E2, E3).

**Process and environment findings (not product findings):**
- E1 `up` failed at configuration: the harness resolves products under `node_modules/products`. Fix: `PRODUCTS_ROOT=/home/user/products` (the path `bootstrap.sh` documents).
- E2 `down` failed in one shell for the same reason (`PRODUCTS_ROOT` unset). Re-run with the sourced env: rc 0.
- E3 Per-run admin credentials were regenerated in each shell, so the seeded admin did not match the later login. Fix: one persisted run env (`run.env`), `down` with volumes, then `up` again.
- E4 **`MEDUSA_FF_CACHING=1` loads as `false`.** The flag parser accepts only the string `true` (`@medusajs/utils dist/common/is-truthy.js:8-9`: `val.toLowerCase() === "true"`; `dist/feature-flags/register-flag.js:16-19`). The lane must set `true`.
- E5 Stripe account currency: the account is GB and refuses KWD (see P-MED-18).

### P-MED-1. Which event bus runs, and is one event visible in Redis?
- Date (UTC): 2026-11-02T10:2x Z (S-A)
- Product commit: `f677db4`
- Harness version: 0.3.0
- Command: `up medusa` (S-A env: `MEDUSA_REDIS=1 MEDUSA_STRIPE=1`); `grep -E 'Connection to Redis' .harness/medusa-backend.log`; a signed event (P-MED-2); `docker exec qa-harness-medusa-redis-1 redis-cli --scan --pattern '*events*'`; `hget RedisEventBusService:events-queue:6 name`.
- Output (trimmed):
  ```text
  Connection to Redis in module 'event-bus-redis' established
  Connection to Redis in module 'cache-redis' established
  [Workflow-engine-redis] Connection to Redis in module 'workflow-engine-redis' established
  RedisEventBusService:events-queue:{stalled-check,failed,events,meta,id,8,13,...}
  name=payment.webhook_received   opts={"priority":100,"removeOnComplete":true,"delay":5000,"attempts":3}
  ```
  The lines `redisUrl not found. A fake redis instance will be used` and `Local Event Bus installed` come from the **build and migration** processes, which run without `REDIS_URL`; the server process uses Redis.
- Proves: the running server uses the Redis event bus (`RedisEventBusService`), and one `payment.webhook_received` event is a Redis job with the 5 s delay and 3 attempts.
- Citation: harness `medusa-env.ts:273-292` (0.3.0: event-bus-redis, cache-redis, workflow-engine-redis when `MEDUSA_REDIS=1`), `:328` (`redisUrl` line); `@medusajs/medusa dist/api/hooks/payment/[provider]/route.js:21-22`.
- Status: **CONFIRMED.**

### P-MED-2. Signed `payment_intent.succeeded`: status at receipt, at -299 s and -301 s, after the 5000 ms delay
- Command: `node --experimental-strip-types p2-webhook.mjs` (S-A). Each negative case followed by a valid control in a second session.
- Output (trimmed):
  ```text
  A receipt age 0 response: 200 OK; status after: authorized, ms_to_authorized 5190, payments 1
  B receipt age 299 response: 200; control (valid) authorized 5148 ms; B session: pending, has_auth false, payments 0
  D receipt age 301 response: 200; control authorized 5178 ms; D session: pending, payments 0
  ```
- Proves: the route answers 200 before verification; a valid event authorizes after about 5.2 s; a 299 s-old event is rejected and a 301 s-old event is rejected, both with the valid control processed.
- Citation: `route.js:16-29`; `payment-webhook.js:13`; `stripe-base.js:511-519` (verification with no tolerance argument).
- Status: **CONFIRMED** (this is the live MED-WH-006 boundary behaviour).

### P-MED-2b. The lane's planned tolerance values, receipt ages 290 s and 300 s
- Command: `p2b.mjs` (S-A).
- Output (trimmed):
  ```text
  receipt age 290 post 200; session status after control: authorized (control 5090 ms)
  receipt age 300 post 200; session status after control: pending   (control 5186 ms)
  ```
- Proves: processing age 295 s is accepted and processing age 305 s is rejected: the window is measured at processing time (the processing age is the receipt age plus the 5 s delay).
- Citation: as P-MED-2; `stripe@15.12.0 cjs/Webhooks.js:159-160`.
- Status: **CONFIRMED.** Confirms the owner's OD-6 suspected finding (live). See the decision in the plan.

### P-MED-3. Repeat delivery of the same event id: end state
- Command: `p3-p10.mjs` (S-A): two parallel POSTs of identical signed bytes.
- Output (trimmed): `[200, 200]`; control authorized 5192 ms; session `authorized`; payments **1**.
- Proves: one payment and one authorized session after two deliveries of one event.
- Citation: `payment-webhook.js:13`; `stripe-base.js:489-495`.
- Status: **CONFIRMED.**

### P-MED-4. Webhook racing cart completion: end state of one race (lock mechanism not observed)
- Command: `p4-p7.mjs` (S-A): `Promise.all([webhook, POST /store/carts/{id}/complete])`.
- Output (trimmed): webhook `200`; complete `200` → order `order_01...`; session `authorized` after the webhook; payments **1**; orders for the cart **1**.
- Proves: one order and one payment for one race round. The completion succeeded while the session was still pending, so completion does not require authorization for this provider.
- Citation: `process-payment.js:85-88` (lock), `:173-176` (release); upstream source `process-payment.ts:102-105`. The lock's effect was **not** observed (no timing probe).
- Status: **CONFIRMED** for end state (one round). The 20-run design and the lock mechanism remain **UNPROBED**.

### P-MED-5. Currency precision: JPY and KWD
- Command: `p5-money.mjs`, `p9c.mjs` (JPY Stripe), `p5kwd.mjs` (S-A/S-B).
- Output (trimmed):
  ```text
  JPY 1500 stripe session 200; payment_session row: amount 1500 cur jpy; intent amount 1500 intent_currency jpy
  KWD cart line unit_price 1.234 qty 3 (system provider); order_summary.totals.current_order_total 3.702 (raw "3.702")
  ```
- Proves: JPY is stored in whole yen and reaches Stripe unchanged; KWD keeps three decimals through the cart and the order totals (3 × 1.234 = 3.702). `order_item.unit_price` is **null** on the KWD order (see the schema in P-MED-8: the price is on the line tables); the lane's oracle must not read `order_item.unit_price`.
- Citation: `@medusajs/utils dist/defaults/currencies.js:518-524, 563-569`.
- Status: **CONFIRMED** for JPY (Stripe and system) and KWD (system). **UNPROBED** for KWD through Stripe: see P-MED-18.

### P-MED-6. Authorization (end state only; P5 owns the verdict)
- Command: `p6.mjs` (S-A): an anonymous `POST /store/carts/{other}/line-items` on another guest's **open** cart.
- Output (trimmed):
  ```text
  P6 anonymous add to open cart [200]
  P6 anonymous read of open cart [200]
  P6 victim lines before/after: [{n:1,q:1}] -> [{n:1,q:4}]
  ```
  An earlier attempt on a **completed** cart returned `400 "Cart ... is already completed."` with rows unchanged.
- Proves: a guest cart is changed by any caller who knows its id: the quantity went from 1 to 4 with no authentication. Whether that is a defect depends on whether a cart id is meant to be a capability. **FINDING (P5 verdict pending).**
- Citation: `store/carts` route (not read in this session: UNPROBED for the route's guard).
- Status: **CONFIRMED** (end state). Verdict **open** (P5).

### P-MED-7. Cache keys on a warm read; price change visibility
- Command: S-A: `p4-p7.mjs` and `p7b.mjs`; S-B: `p7on.mjs` (flag `true`).
- Output (trimmed):
  ```text
  S-A (flag value "1" = false): warm reads 200,200; new Redis keys after 3 s: 0
  S-B (flag true): warm reads 200,200; new Redis keys after 2 s: 0; cache-looking keys: []
  S-B price 1500 -> admin 1200: visible on next read after 45 ms
  Redis keyspace db0 only: bull:* and RedisEventBusService:* (no cache keys)
  backend log: no 'error occurred while setting cache'
  ```
- Proves: with the flag on, **no cache entry is written**, so the 45 ms price visibility proves nothing about invalidation. The cause is a registration gap: the harness registers `@medusajs/medusa/cache-redis` under the module key `cache` (`medusa-env.ts:283-285`, 0.3.0), while the query-cache decorator resolves the module key `caching` (`@medusajs/utils dist/modules-sdk/definition.js:34` `CACHING: "caching"`; `dist/caching/index.js:74-77` returns the uncached call when `Modules.CACHING` does not resolve). The core ships `dist/modules/caching.js` and `dist/modules/caching-redis.js`; the harness registers neither.
- Citation: as above; `@medusajs/medusa dist/api/store/products/route.js:52-53, 85-86` (`cache: { enable: true }`); `@medusajs/query dist/query/query.js:248-254`.
- Status: **CONFIRMED** (no cache keys with the flag on, and no error). **Cause: CONFIRMED by code; the fix is UNPROBED** (it needs a harness change). Filed as **HR-4** in the plan.

### P-MED-8. Schema of the money, order, payment and inventory tables (through `qa_ro`)
- Command: `p8-schema.mjs` (S-A), `information_schema.columns`.
- Output (trimmed):
  ```text
  order: id, region_id, status, currency_code, email, canceled_at, deleted_at
  order_summary: id, order_id, version, totals (jsonb)     totals keys: paid_total, accounting_total, current_order_total, original_order_total, pending_difference, raw_* ...
  order_cart: order_id, cart_id, deleted_at
  order_item: order_id, item_id, quantity, unit_price (numeric)  (null on the probe order)
  payment: id, amount, currency_code, payment_session_id, captured_at, deleted_at
  payment_session: id, amount, currency_code, provider_id, data (jsonb), status, authorized_at, payment_collection_id
  inventory_level: inventory_item_id, location_id, stocked_quantity, reserved_quantity, deleted_at
  reservation_item: line_item_id, location_id, quantity, inventory_item_id, deleted_at
  cart_line_item: cart_id, variant_id, quantity, unit_price, deleted_at
  price_list: status, starts_at, ends_at, type, deleted_at;   price: price_list_id, price_set_id, amount, currency_code
  ```
- Proves: the table and column names used by the lane's oracle (section 6.4 and 6.8a of the plan) are these. The review's names were not used.
- Status: **CONFIRMED.** `order_line_item` and the line-price column are not read in this session (**UNPROBED**; the KWD total above is from `order_summary`).

### P-MED-9. Stripe smallest-unit rounding (KWD, JPY, USD)
- Command: `pure-probes.cjs` (session 1, pure); live: S-A `p9b.mjs`/`p9c.mjs`.
- Output: pure: `getSmallestUnit(1.234,'KWD')=1240`; live: JPY 1500 → intent 1500 (no rounding case). KWD live: not reached (P-MED-18).
- Proves: the function rounds a 3-decimal KWD charge up to a multiple of 10 fils (session 1). Live KWD rounding is **UNPROBED** (P-MED-18).
- Status: **CONFIRMED** (pure); live KWD **UNPROBED**.

### P-MED-10. A bad signature makes the subscriber throw; retries and parking
- Command: `p3-p10.mjs` and `p10b.mjs`/`p10c.mjs` (S-A): one POST with `stripe-signature: t=1,v1=000…` for one session, then a valid event for another session; then Redis job fields.
- Output (trimmed):
  ```text
  P10 bad-sig post 200
  P10 valid after poison: authorized (5078 ms)
  P10 poison session: pending, has_auth false
  failed set RedisEventBusService:events-queue:failed = {6, 8, 13}
  job 6: name=payment.webhook_received atm=3 ats=3 finishedOn=… opts={"attempts":3,"delay":5000}
  job 8: atm=3 ats=3;  job 13: atm=3 ats=3
  ```
  Job 6 and 8 are the 299 s and 301 s rejections (P-MED-2); job 13 is the bad signature.
- Proves: the bad signature is attempted **3 times** and parked in the failed set; the next valid event is still processed; a deterministic rejection (tolerance or signature) replays identically on every attempt (**finding F1**).
- Status: **CONFIRMED.**

### P-MED-11. Price-list boundary on the database clock
- Command: `p11-totals.mjs` (S-A): `price_list.starts_at = dbNow + 5 s`, price read every 100 ms.
- Output (trimmed): `price before start: 1500`; `price poll to sale (1000): reached 1000 after 4928 ms`; `db_now 2026-11-02T10:28:01.515Z`, `starts_at 2026-11-02T10:28:06.515Z`.
- Proves: the store price changes at the boundary on the database clock (the poll began about 0.1 s after creation; the change appears within the 5 s wait).
- Citation: `@medusajs/pricing dist/repositories/pricing.js:137, 188`.
- Status: **CONFIRMED** (within the polling resolution, 100 ms steps).

### P-MED-12a / P-MED-12b. SDK boundary and processing-time age
- Pure probes (session 1): `verify at age 299 s -> accepted; 300 -> accepted; 301 -> rejected`; `receipt 299 s processed 5 s later (304) -> rejected`.
- Live: P-MED-2 and P-MED-2b agree (processing age 295 accepted, 305 rejected).
- Status: **CONFIRMED** (SDK pure; product live).

### P-MED-13. Product CSV import: bad row and the import flow
- Command: `p13b.mjs`, `p13c.mjs`, `p13d.mjs`, `p13e.mjs` (S-A).
- Output (trimmed):
  ```text
  POST /admin/uploads (multipart, field "files")        200  {files:[{id,url}]}
  POST /admin/products/imports {file_key,originalname,extension,size,mime_type}  202 {transaction_id, summary:{toCreate:2}}
  POST /admin/products/imports/{transaction_id}/confirm  202
  bad row (price "abc", 100-row file) POST /admin/products/imports  400 "Row 150: Invalid value provided for \"variant price usd\"..."
  products with the run prefix after the bad file: 2 (from the valid file only)
  required columns: Product Handle, Product Title, Product Status, Variant Option 1 Name, Variant Option 1 Value, Variant Title, Variant SKU, Variant Price USD
  "Option 1 Name" → 400 Invalid column name(s)
  no option columns → confirm workflow fails: "Product options are not provided for: [...]" (backend log)
  ```
- Proves: the whole file is refused at preview when one price is invalid (**all-or-nothing at preview**: no transaction, no product). A valid file is imported after confirm.
- Not run: a 100-row file with every price valid (UNPROBED; not needed for the bad-row case).
- Status: **CONFIRMED** for the bad-row outcome; the 100-row good file **UNPROBED**.

### P-MED-14. Any product-wide scheduled job? (code, not a runtime probe)
- Command: `grep` for `ScheduledJob|scheduleJob|cron:|schedule: {` under the installed `@medusajs/*/dist`.
- Output: only framework job-loader files (`@medusajs/framework dist/job…`). No product-defined scheduled job under `@medusajs/medusa dist/jobs` (directory absent) or `@medusajs/core-flows`.
- Proves: no Medusa-defined recurring job was found in the installed packages. Runtime behaviour **UNPROBED**.
- Status: **CONFIRMED by code (not runtime).** The lane keeps `tests/serial/med/` empty (RD-16).

### P-MED-15. Is a store OpenAPI document served?
- Command: `p15-inv.mjs` and `p15b.mjs` (S-A): GET `/docs/store/openapi.json`, `/store/openapi.json` (with and without the publishable key), `/openapi.json`, `/docs`.
- Output (trimmed): `/docs/store/openapi.json 404`; `/store/openapi.json 400 "Publishable API key required"` without key, `404 "Cannot GET"` with key; `/openapi.json 404`; `/docs 404`.
- Proves: no OpenAPI document is served at these paths. The contract snapshot must come from upstream (plan OD-2).
- Status: **CONFIRMED** (paths tested; others not tried).

### P-MED-16. Admin and store request shapes the lane uses
- Command: `p16-api.mjs`, `p16b-create.mjs`, `p5b.mjs`, `p11-totals.mjs`, `p15-inv.mjs`, `p16c-reserve.mjs` (S-A, S-B).
- Output (trimmed, status and the field that mattered):
  ```text
  GET /admin/regions?fields=id,name,currency_code,countries.iso_2                      200 (seed: Europe eur, United States usd; countries dk fr de it es se gb us)
  POST /admin/regions {name, currency_code:'jpy', countries:['jp'], payment_providers:['pp_system_default']}   200
  POST /admin/products {title, status, sales_channels, options, variants:[{..., prices:[{currency_code,amount}]}]}  200
  product without shipping_profile_id: cart completion succeeds (system provider)                       200
  POST /admin/inventory-items {sku}  200;  POST /admin/inventory-items/{id}/location-levels {location_id, stocked_quantity}  200
  POST /admin/inventory-items/{id} {requires_shipping:false}   200  (needed for managed variants without a shipping method)
  POST /admin/price-lists {title, description, type:'sale', status:'active', starts_at, rules:{}, prices:[{amount,currency_code,variant_id}]}  200
  GET /store/products/{id}?region_id&fields=*variants.calculated_price   200
  POST /admin/regions/{id} {payment_providers:[...]}   200
  store: POST /store/carts, /line-items, /payment-collections, /payment-sessions {provider_id}, /complete   200
  ```
- Status: **CONFIRMED** (each shape returned 200 with the stated fields). Other fields in the plan remain **UNPROBED** until used.

### P-MED-16b. Reservation on completion, release on cancel (managed inventory)
- Command: `p16c-reserve.mjs` (S-A).
- Output (trimmed): level `stocked 5, reserved 0`; complete (qty 2) `200`; level `stocked 5, reserved 2`; reservations `[{q:2, live:true}]`; cancel order `200`; level `reserved 0`; reservations `[{q:2, live:false}]`.
- Proves: completion reserves; cancel releases (reservation soft-deleted). The model for INV-001 maps `reserve` to completion and `release` to cancel.
- Status: **CONFIRMED.**

### P-MED-17. Is Stripe reachable from the stack?
- Command: `p9c.mjs` (JPY session 200 with `pp_stripe_stripe`); `curl -sS -m 10 -o /dev/null -w '%{http_code}' https://api.stripe.com/v1/charges` (unauthenticated).
- Output (trimmed): JPY session creates a PaymentIntent (`intent_status: requires_payment_method`); curl `401`.
- Proves: `api.stripe.com` is reachable from this sandbox and the stack. This **contradicts index U14** (`403` in planning).
- Status: **CONFIRMED.**

### P-MED-18. Does this Stripe account accept KWD?
- Command: `p9b.mjs` (S-A): three KWD products (0.5, 1, 5.124) in the lane KWD region with `pp_stripe_stripe`.
- Output: each `POST payment-sessions` → `500 unknown_error` (client). Backend log (root cause): `Invalid currency: kwd. Stripe accounts in GB do not support kwd. Your account currently supports these currencies: usd, aed, afn, …`.
- Also seen once in S-A (a KWD region with a JPY-only product): `The amount must be greater than or equal to the minimum charge amount allowed for your account and the currency`. The amount was not recorded.
- Proves: KWD Stripe charges are **not possible on this account**, so KWD rows that use Stripe cannot be measured here. This is an account and ENV finding, not a product bug.
- Status: **CONFIRMED** (account, from the Stripe error). The minimum charge for KWD is **UNPROBED**.

### P-MED-19. Money: KWD order via the system provider
- See P-MED-5 (KWD order totals `3.702`).

---

### Findings from session 3 (for the plan)
- **F1** Deterministic rejections replay: a tolerance or signature rejection is attempted 3 times and parked (P-MED-10). This belongs to MED-EB-002.
- **F2** Anonymous write to a guest cart by id (P-MED-6). P5 verdict.
- **F3** The cache is registered under the wrong module key (P-MED-7). HR-4 blocks MED-CACHE-001.
- **F4** The flag value must be `true` (E4).
- **F5** Stripe KWD is refused by the account (P-MED-18). KWD Stripe rows need an account that supports KWD.
- **F6** Index U14 is contradicted: `api.stripe.com` is reachable (P-MED-17).
- **F7** The CSV import needs its own columns and the whole file is refused at preview on one bad price (P-MED-13).
- **F8** `order_item.unit_price` is null on the probe order; line prices are elsewhere (P-MED-5; UNPROBED table).


---

## Decisions after session 3 (owner reply, recorded in the plan)

- **OD-16 (F2):** the cart id is treated as a bearer capability (Medusa's documented guest-cart design; not re-checked in this session). F2 is recorded here as a **FINDING for P5**: an anonymous write to an open guest cart by id is accepted (P-MED-6: 200, quantity 1 to 4). FC-MED-A asserts this observed behaviour; it is not a bug and not a `test.fail`.
- **OD-17 (tolerance):** kept as a design finding with the live results of P-MED-2 and P-MED-2b. No `test.fail`.
- **OD-18 (KWD via Stripe):** the KWD Stripe variant of ORD-001 is a `test.skip` with the reason "this Stripe account refuses KWD (Invalid currency: kwd; P-MED-18)".
- **HR-4:** the caching-module registration goes into **harness v0.3.1**. CACHE-001 stays **DEFERRED** until v0.3.1 is in use and P-MED-7 passes on it.
