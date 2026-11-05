# P2 Medusa lane: plan (plan only, nothing built)

Date 2026-11-02 (UTC). Plan branch `plan/2026-11-02-p2-lane-medusa` from `origin/main`. Never merged, no PR, no tag.
Probe record for this plan: `docs/probes/2026-11-02-p2-lane-medusa-probes.md`.

## Session 2 update (2026-11-02, approval given for the install): gate STOP, no stack started

- Approval was given for `bash scripts/cloud-install.sh`. It ran to completion (rc 0): `npm ci` added 138 packages; `bootstrap.sh` ran `pnpm install --frozen-lockfile` in the fork (done) and skipped the Twenty image, which runs from Docker.
- Installed: `qa-portfolio-harness` **0.3.0**; `stripe` **23.0.1**; fork HEAD `f677db438f27294fc50e4c7c6612e71ff38eeff5` (the pin).
- **Unit baseline on `main` (`aa10ec1`), measured: 285 tests, 285 pass, 0 fail.** Not 277. The gate requires 277, so the run **stopped here**. Evidence: per-file runs sum to 275 and the top-level `tests/unit/env.test.ts` adds 10 (`npm run unit` matches it; my first glob missed it). The foundation index's 277 is its revision-2 count, which the index itself says was never rebuilt (index section 2). `npm run check:static` exits 0 on this install.
- No probe, no `up`, no stack. The probe record's section "Session 2" records this gate.
- Decisions now in the plan: OD-3 (merge EB-001 into EB-002), OD-4 (cut PL-002), OD-6 (suspected finding; live confirmation; `test.fail` only if proven), OD-7 (KWD gap is a finding, not a bug), OD-13 (plan default). Section 14.2 has the decided values.
- **Open before probes can run: OD-15**, the unit anchor (285 measured vs 277 stated). Default: accept 285 with this evidence, after which L0 counts are base+N from 285.

## Status (session 3, 2026-11-02): the stack probes ran; section 2a is the current result

Session 3 ran the probes one stack at a time (two stacks, each `down` with volumes, verified clean). Results are in section 2a and in the probe record (session 3). Four things changed the plan: the flag value is `true` (not `1`); the cache is not registered by the harness (HR-4 is now required for MED-CACHE-001); Stripe is reachable but this account refuses KWD; and the anonymous cart write (P-MED-6) is a finding for P5. The text below is the session-1 and session-2 plan; where it conflicts with section 2a, **2a wins**.

## Status (session 1, historical): the probes did not run; the plan is provisional until L0 settles them

The planning session stopped its probe phase (brief section 11). Two facts:

1. **Harness version.** The installed `node_modules/qa-portfolio-harness` is `0.2.11`. `package-lock.json:1608-1610` pins `0.3.0`. The brief requires 0.3.0.
2. **Stale install.** `stripe` is declared (`package.json`, `23.0.1`) and locked (`package-lock.json`, one `node_modules/stripe` entry), but **absent from the installed `node_modules`**. Consequences on this install: `npm run unit` gives 249 tests, 247 pass, 2 fail (`tests/unit/webhooks/sign.test.ts`, `verify.test.ts`, `Cannot find package 'stripe'`); `npm run check:static` exits 1 with 12 type-resolution errors; `npx playwright test --list` fails on the same import. The base count 277 (brief) is therefore **UNMEASURED** here.
3. **The corrective `npm ci` was refused** by the sandbox permission classifier (it deletes `node_modules`). It was not retried and no other route was used. A rerun session with the approval (or the environment setup script, section 12) must do it first.

So: no `up` ran, every stack-dependent claim below is **UNPROBED**, and the first build task (L0) starts with `npm ci` and a version check (section 8). Code-read facts carry file:line citations and are labelled CR in the probe record. Nothing in this plan states a runtime fact without one of: a CONFIRMED probe in the probe record (two pure-function probes), a CR citation, or an UNPROBED label.

---

## 1. Header

| Item | Value |
|---|---|
| Base | `origin/main` = `aa10ec11bada21b3e3e5803a948e33023d648505` (`aa10ec1`, ancestor check passed) |
| Plan branch | `plan/2026-11-02-p2-lane-medusa` (from `origin/main`; no PR) |
| Build branches (stacked) | `feat/2026-11-02-p2-medusa-l0-probes-helpers`, `...-l1-contracts`, `...-l2-webhooks`, `...-l3-async-chains`, `...-l4-db-invariants`, `...-l5-ci` (`feat/<date>-p2-medusa-l<n>-<topic>`; `<date>` = the UTC day the builder starts) |
| Stacking rule | Each build branch is cut from the previous build branch head. Each PR targets `main`; GitHub retargets it when its base merges. **If the previous PR is not merged yet**, the builder stacks on the previous branch head, says so in the PR body, and does not start a second PR on the same head. **If the previous PR was closed without merge**, STOP. |
| Pinned product | Medusa starter `f677db438f27294fc50e4c7c6612e71ff38eeff5` (`scripts/bootstrap.sh:10`); Medusa packages `2.21.2` (fork `apps/backend/package.json`) |
| Pinned harness | `qa-portfolio-harness` `0.3.0` (`package-lock.json:1608-1610`) |
| Index | `docs/plans/2026-11-01-p2-foundation-index.md` on `plan/2026-11-01-p2-foundation` (head `f15a05e`, not on `main`) |

Case IDs. The index and the master plan write the cases as `P2-MED-*`. The brief writes `MED-*`. This plan uses the **index form** `P2-MED-*` everywhere, exactly. The brief's short names map one to one.

---

## 2. Probe findings

Full entries: `docs/probes/2026-11-02-p2-lane-medusa-probes.md`. Status legend: CONFIRMED (run in this session), UNPROBED (not run, reason in the record), CONTRADICTS (observed or code-read value differs from the cited expectation).

| ID | Question | Status | One-line proof or reason |
|---|---|---|---|
| P-MED-1 | Which event bus is loaded; one event in Redis | UNPROBED | STOP (harness 0.2.11). Code: `medusa-env.ts:237-252` (0.2.11) |
| P-MED-2 | Signed `payment_intent` at receipt, at -299 s and -301 s, status after the delay | UNPROBED | STOP. SDK arithmetic predicts -299 s is rejected at processing (P-MED-12b) |
| P-MED-3 | Repeat delivery of one event id: end state | UNPROBED | STOP. Prior record (plan branch, not on main): one authorized session, one payment |
| P-MED-4 | Webhook racing cart completion: lock behaviour and one race's end state | UNPROBED | STOP. Lock `process-payment.js:85-88`; default lock in memory (CR-9) |
| P-MED-5 | JPY and KWD carts: stored amounts vs minor units | UNPROBED | STOP. Currency table CR-15 |
| P-MED-6 | Cross-customer store call: rows unchanged | UNPROBED | STOP. P5 owns the verdict |
| P-MED-7 | Redis keys on a warm store read | UNPROBED | STOP. Cache flag CR-12 |
| P-MED-8 (new) | Table and column names of the money and inventory tables via `qa_ro` | UNPROBED | STOP. Names in this plan are **not** taken from the review; L0 reads them |
| P-MED-9 | Stripe smallest-unit rounding (KWD, JPY, USD) | **CONFIRMED** (pure function) | `getSmallestUnit(1.234,'KWD')=1240`; `getSmallestUnit(10.005,'USD')=1001`; `getAmountFromSmallestUnit(1240,'KWD')=1.24` |
| P-MED-10 (new) | A bad signature makes the subscriber throw; retries stop at `attempts`, then the job parks | UNPROBED | STOP. Code CR-3, CR-10; prior record shows three error lines for one event |
| P-MED-11 (new) | Price-list boundary on the database clock | UNPROBED | STOP. CR-11 |
| P-MED-12a (new) | Pinned SDK accepts receipt age 299 and 300 s, rejects 301 s | **CONFIRMED** (SDK, pure) | `verify at age 299 s -> accepted`, `300 -> accepted`, `301 -> rejected` |
| P-MED-12b (new) | The verification age is the processing age (receipt age + 5 s delay) | **CONFIRMED** arithmetic, product **UNPROBED** | `receipt 294 s, processed 5 s later -> accepted`; `receipt 299 s, processed 5 s later -> rejected` |
| P-MED-13 (new) | Product CSV import: partial or all-or-nothing on a bad row | UNPROBED | STOP. `parse-product-csv.js:38` only |
| P-MED-14 (new) | Does any Medusa case need a product-wide serial job | UNPROBED | Assumed no (section 3, RD-16); to be confirmed in L0 |
| P-MED-15 (new) | Medusa store OpenAPI document served by the running server | UNPROBED | The installed core ships no OpenAPI route (grep, empty) |
| P-MED-16 (new) | Admin and store API request shapes the lane uses (regions, products with prices, price lists, inventory, cart complete, import) | UNPROBED | Field names in section 6 are marked; L0 confirms each |

### 2a. Session 3 results (stack probes, 2026-11-02; entries in the probe record, session 3)

| ID | Status | Result |
|---|---|---|
| P-MED-1 | CONFIRMED | Server uses the Redis event bus (`RedisEventBusService`); job `payment.webhook_received`, `delay 5000`, `attempts 3` |
| P-MED-2 | CONFIRMED | Receipt age 0: authorized in 5.19 s (1 payment). Receipt age 299 s and 301 s: session stays pending, valid control authorized |
| P-MED-2b | CONFIRMED | Receipt age 290 s accepted; receipt age 300 s rejected (processing window 295 s and 305 s) |
| P-MED-3 | CONFIRMED | Two parallel deliveries of one event: one payment, one authorized session |
| P-MED-4 | CONFIRMED (end state, one round) | Webhook 200 and completion 200: one order, one payment. Lock mechanism and the 20-run case UNPROBED |
| P-MED-5 | CONFIRMED (JPY Stripe and system; KWD system) | JPY intent 1500 JPY. KWD 3 × 1.234 = 3.702 (`order_summary.totals`). KWD through Stripe: UNPROBED (P-MED-18) |
| P-MED-6 | CONFIRMED finding (F2; P5 verdict) | Anonymous `POST` to another guest's open cart: 200, quantity 1 → 4 |
| P-MED-7 | CONFIRMED (no cache keys, flag on or off); cause CONFIRMED by code (F3) | The harness registers `cache-redis` as module `cache`; the decorator resolves module `caching`. HR-4 |
| P-MED-8 | CONFIRMED | Table and column names (probe record). `order_summary.totals` is jsonb |
| P-MED-9 | CONFIRMED (pure); live KWD UNPROBED | `getSmallestUnit(1.234,'KWD')=1240` |
| P-MED-10 | CONFIRMED | Bad signature: attempted 3 times, parked in `RedisEventBusService:events-queue:failed`; the next valid event processed (F1) |
| P-MED-11 | CONFIRMED | Price changes at `starts_at` on the database clock (4.9 s after the first poll) |
| P-MED-12a/b | CONFIRMED (SDK pure and live) | See P-MED-2b |
| P-MED-13 | CONFIRMED (bad row); 100-row good file UNPROBED | A bad price refuses the whole file at preview (no transaction, no product). Import needs upload → imports → confirm, and `Variant Option 1 Name/Value` columns (F7) |
| P-MED-14 | CONFIRMED by code (not runtime) | No product-defined scheduled job in the installed packages |
| P-MED-15 | CONFIRMED | No OpenAPI document served at the tested paths (OD-2 stands) |
| P-MED-16 | CONFIRMED shapes | Regions, products, price lists, inventory levels, cart completion, payment sessions (probe record) |
| P-MED-16b | CONFIRMED | Completion reserves (`reservation_item` qty 2, `reserved` 0 → 2); cancel releases (reserved → 0) |
| P-MED-17 | CONFIRMED (contradicts U14) | `api.stripe.com` is reachable from the stack; JPY session creates an intent |
| P-MED-18 | CONFIRMED (account) | This Stripe account refuses KWD (`Invalid currency: kwd. Stripe accounts in GB do not support kwd`) (F5) |

**CONTRADICTS (code and pure probes, against the index or the master plan):**
- Master plan MED-WH-006 "stale timestamp (>tolerance) rejected; 299 s accepted" (its BVA reading): the 299 s receipt case is rejected once the 5 s emit delay is counted (P-MED-12b). MED-WH-006 is rewritten (section 4).
- Index U14 (`api.stripe.com` unreachable from the sandbox): **CONTRADICTED** (P-MED-17; the JPY Stripe session succeeded).
- Index U10 "Medusa event retries need a custom provider in the fork": **CONTRADICTED by code**. A bad signature makes the subscriber throw deterministically (CR-6, `stripe-base.js:511-519`), which is enough to exercise retry and parking without a fork edit (P-MED-10 to confirm live).

---

## 3. Resolved decisions, with evidence

| # | Decision | Evidence |
|---|---|---|
| RD-1 | Case IDs in index form `P2-MED-*` | Index section 9 item 5; master plan rows |
| RD-2 | `P2-MED-WH-002` keeps the master-plan case "parallel duplicates (5 at once), same end state as WH-001". The review's label "(cart lock)" names what the parallel calls exercise, not a different case | Master plan `P2-MED-WH-002` row; brief lane list |
| RD-3 | C8 applies: a completed Stripe-style flow ends `authorized`; `captured` only with payment data | CR-7 (`process-payment.js:94-120`); foundation probe 4.5 (prior record) |
| RD-4 | The Redis event bus is wired by `MEDUSA_REDIS=1` in harness 0.2.11, not added by 0.2.18 (review fact 13 CONTRADICTED, index C1 holds) | `medusa-env.ts:237-243` (0.2.11, read in this session) |
| RD-5 | The cart lock: the index citation `process-payment.ts 102-105` is the **upstream source** at tag `v2.21.2` (`packages/core/core-flows/src/payment/workflows/process-payment.ts:102-105`, checked this session). The shipped compiled code is `process-payment.js:85-88`. Both are cited | CR-8 |
| RD-6 | MED-WH-006 is rewritten to the **processing-time** boundary (accepted at processing age 295 s, rejected at 305 s); the 299 s receipt case is recorded as a SUSPECTED design finding, not asserted either way until a decision is pending (OD-6) | P-MED-12b; CR-6 |
| RD-7 | MED-CACHE-001 runs only with `MEDUSA_FF_CACHING=true` (the string; `1` loads as false, F4) plus `MEDUSA_REDIS=1`, and only after HR-4 (the harness registers the cache under the wrong module key, F3; P-MED-7). Until HR-4 it is deferred, not skipped. With the flag off the spec skips with that exact reason. The cache covers store product reads (`store/products/route.js:52-53, 85-86`), regions and promotions (CR-13), not a separate price cache | CR-12, CR-13 |
| RD-8 | MED-EB-001 ("provider throws once, processed on attempt 2") needs a transient failure. No transient failure is reachable without a provider edit (the failing paths are deterministic: bad signature, missing session). Proposed merge into MED-EB-002 (OD-3) | CR-3, CR-6, CR-10 |
| RD-9 | MED-PL-002 ("server TZ != DB TZ") runs the same boundary query (`pricing.js:137, 188`, `now()` on the database) as MED-PL-001. The server TZ is not read on that path. Proposed CUT as a duplicate (OD-4) | CR-11 |
| RD-10 | Upstream coverage **verified**, not trusted: the review's `price-list.spec.ts` and `pending-authorization.spec.ts` exist at upstream tag `v2.21.2` under `integration-tests/http/__tests__/price-list/admin/` and `payment/store/` | Upstream blobless clone (metadata only), commit `0205653` |
| RD-11 | The upstream price-list spec has **no `starts_at` boundary test** (fixed 2022 dates, CRUD and search titles only). MED-PL-001 is kept | `price-list/admin/price-list.spec.ts:118-276` (titles) |
| RD-12 | Upstream test config sets `webhook_delay: 0` and `webhook_retries: 0`, so upstream never exercises the production 5000 ms delay or 3 attempts. The harness does not override them (CR-18). The lane runs the production defaults | `integration-tests/http/medusa-config.js:66-67`; harness has no match |
| RD-13 | The KWD round-up is **intended upstream** (`get-smallest-unit.ts:9`: `5.124 KWD -> 5130`). The lane records the gap between the charge and the order total (up to 9 fils), and does not call it a payment defect | P-MED-9; upstream test |
| RD-14 | A 3-decimal USD total (tax can produce one) is charged rounded to cents (`10.005 -> 1001`, P-MED-9). The money oracle refuses to assert fractional cents (`toMinor` throws). A case that needs such a total is UNPROBED until L0 checks whether Medusa can store one | P-MED-9; section 6.1 |
| RD-15 | The lane's own regions: a run-prefixed region per currency with a country code not used by the seed, and `pp_system_default` only. The lane never edits the seeded US region (the readiness spec does that and restores it) | `tests/readiness/med.readiness.spec.ts:57-58, 106-107`; seed `medusa-seed.ts:165-168` (US region; Stripe on Europe only with a key) |
| RD-16 | No Medusa case needs a product-wide serial job; `tests/serial/med/` stays empty and the L5 job runs `med-api` only. Confirmed by L0 (P-MED-14) or the decision changes it (OD-9) | Index: no serial MED case; `playwright.config.ts` `med-serial` depends on `med-api` |
| RD-17 | The OpenAPI source for the store contract is not in the repo and the installed core serves none (P-MED-15). Default: commit a snapshot taken in L1 (OD-2) | `main` has no `contracts/` directory (`git ls-tree origin/main`); installed core: no openapi match |
| RD-18 | Shared harness environment for Medusa: the installed harness reads `MEDUSA_REDIS` and `MEDUSA_STRIPE` and writes the Redis modules; it reads neither `MEDUSA_FF_CACHING` nor `MEDUSA_LOCK` nor `webhook_*` | `medusa-env.ts:142-149, 237-252`; `src` grep |
| RD-19 | Medusa needs `STRIPE_API_KEY` to construct the Stripe provider (`validateOptions` throws without it); live Stripe rows are therefore key-gated, and the system-provider rows are key-gated too because verification runs in the Stripe provider | CR-3 (`stripe-base.js:12-19`); seed `medusa-seed.ts:166` |
| RD-21 | Tolerance is evaluated at processing time (live, P-MED-2b): processing age 295 s accepted, 305 s rejected; the 299 s receipt case is rejected live (P-MED-2). MED-WH-006 asserts the processing-time values; the receipt-age case is a suspected finding (OD-6, OD-17) | P-MED-2, P-MED-2b |
| RD-22 | Deterministic rejections (tolerance, bad signature) are attempted 3 times and parked; MED-EB-002 covers the parking and the replay (F1) | P-MED-10 |
| RD-23 | This Stripe account refuses KWD (`Invalid currency: kwd`, GB account). The KWD Stripe variant of ORD-001 is an unconditional skip with that named reason (OD-18). KWD is measured on the system path (3.702) and by the pure function | P-MED-18 |
| RD-24 | Order totals come from `order_summary.totals` (jsonb); line prices come from the line tables, because `order_item.unit_price` is null on the probe order (F8) | P-MED-5, P-MED-8 |
| RD-20 | Stripe test-mode key is present in the planning environment (presence only, value never read). Live rows do not call `api.stripe.com` on the system-provider path (no PaymentIntent is created); the stripe provider's constructor makes no call (`stripe-base.js:27`) | CR-3, CR-4; index U14 (proxy 403 for `api.stripe.com` observed in planning, foundation) |

---

## 4. Case mapping

### 4.1 Upstream-coverage gate

Searched: the upstream monorepo at tag `v2.21.2` (commit `020565398e436a2bc65777a3b1ad347b4735d6df`, metadata-only clone, names and selected blobs), and the fork's own `apps/backend/integration-tests` (`setup.js` only). Verdict KEEP means P2 asserts DB end state, signature, or timing that the upstream row does not.

| ID | Upstream file:line (verified) | Verdict |
|---|---|---|
| P2-MED-CON-001 | `integration-tests/http/__tests__/cart/store/cart.spec.ts` covers the cart flow; OAS conformance not checked upstream | KEEP (OAS plus DB order row) |
| P2-MED-CON-002 | none found for store invalid variant; P1 `contract.spec.ts` covers admin error shape only (`P1-MED-FW-X02`) | KEEP (no duplicate) |
| P2-MED-CON-003 | none found (OAS sweep) | KEEP |
| P2-MED-LOC-002 | `cart/store/cart.spec.ts:3313, 3324, 3603` (reserved quantities); no split-stock case found | KEEP (provisional) |
| P2-MED-WH-001 | `payment-stripe/src/core/__tests__/stripe-base.spec.ts:89` is a unit test of an invalid signature; no integration webhook test found | KEEP |
| P2-MED-WH-002 | none found (parallel duplicates) | KEEP |
| P2-MED-WH-003 | `stripe-base.ts:751` handles `amount_capturable_updated` in source only; no ordering test found | KEEP |
| P2-MED-WH-006 | none found (`tolerance`, `DEFAULT_TOLERANCE` in the integration tree: none) | KEEP (rewritten, RD-6) |
| P2-MED-WH-008 | none found | KEEP |
| P2-MED-EB-001 | none found for retry-then-success; `attempts` matches are unrelated | **PROPOSE MERGE** into EB-002 (OD-3, RD-8) |
| P2-MED-EB-002 | none found for poison parking | KEEP |
| P2-MED-PL-001 | `price-list/admin/price-list.spec.ts:118-276` (CRUD and search titles, fixed 2022 dates) | KEEP (RD-11) |
| P2-MED-PL-002 | none found; same query path as PL-001 (CR-11) | **PROPOSE CUT** as duplicate (OD-4, RD-9) |
| P2-MED-CSV-001 | `product/admin/product-import.spec.ts` and `product-imports.spec.ts`: titles include non-existent fields and missing source file (`product-imports.spec.ts:632`); no bad-row-mid-file title | KEEP |
| P2-MED-CACHE-001 | none found for the caching flag in the integration tree | KEEP (flag-gated) |
| P2-MED-MON-001 (new) | `integration-tests/http/__tests__/store/admin/store.spec.ts:214, 229` (JPY store currency); `get-smallest-unit.ts:6, 9` (rounding unit tests) | KEEP (no JPY or KWD money end to end through the database) |
| P2-MED-ORD-001 (new) | none found for total conservation (the P1 money unit test is arithmetic only, `tests/unit/medusa-money.spec.ts`) | KEEP |
| P2-MED-INV-001 (new) | `cart/store/cart.spec.ts:3313-3603` checks reserved quantities as values; no model-based sequence found | KEEP |

The review's claim about the two named upstream specs is **true by name**. Its implied coverage is **not** true for the boundary (RD-11).

### 4.2 CUT list (not built; in no task, no spec title, no file name, no commit)

P2-MED-LOC-001, P2-MED-WH-004, P2-MED-WH-005, P2-MED-WH-007, P2-MED-CSV-002, P2-MED-LOC18N-001, **P2-MED-PL-002** (cut by the decision, 2026-11-02, OD-4: duplicate of P2-MED-PL-001 on the database clock, RD-9). P2-MED-EB-001 is **merged into P2-MED-EB-002** (decision OD-3, 2026-11-02, RD-8): no separate EB-001 test; EB-002 covers the deterministic failure path. The security side of the signature rows (invalid and missing signatures) and the captured case move to P5 (index section 9 item 5).

### 4.3 Framework checks (no IDs)

- **FC-MED-A** A guest cart id is a bearer capability (decision OD-16, following Medusa's guest-cart design). The check asserts the **observed** behaviour, not a bug: an anonymous write to a guest cart is accepted and changes that cart's rows only, and a completed cart refuses the write. This is recorded as finding F2 for P5 (P-MED-6); it is not a `test.fail`.
- **FC-MED-B** Rate limiting: **not real in this harness**. Evidence: no rate-limit match in the installed `@medusajs/medusa` or `@medusajs/framework` dist (empty grep this session) and no rate setting in the harness adapter. Re-check at L0 against harness 0.3.0 (UNPROBED for 0.3.0).
- **FC-MED-C** The Stripe signed round trip, Medusa cell of `P2-X-WH-001`: covered by `P2-MED-WH-001` and `P2-MED-WH-006`; no separate test.

### 4.4 Case table

Spec file names and test titles are final. Test titles carry the case ID and no CUT ID.

| ID | Task | Spec file | Test title |
|---|---|---|---|
| P2-MED-CON-001 | L1 | `tests/contracts/med/cart-contract.spec.ts` | `P2-MED-CON-001 cart create, add item, payment session and complete each match the store OAS, and the order row exists` |
| P2-MED-CON-002 | L1 | `tests/contracts/med/invalid-variant.spec.ts` | `P2-MED-CON-002 an invalid variant returns the documented error shape and leaves no cart line` |
| P2-MED-CON-003 | L1 | `tests/contracts/med/store-get-oas.spec.ts` | `P2-MED-CON-003 every GET store route with valid parameters matches the OAS and returns no 5xx` |
| P2-MED-LOC-002 | L1 | `tests/integration/med/location-split.spec.ts` | `P2-MED-LOC-002 stock split 1+1 for quantity 2: the recorded behaviour holds in the database` |
| P2-MED-WH-001 | L2 | `tests/webhooks/med/signed-event.spec.ts` | `P2-MED-WH-001 the same signed payment_intent.succeeded twice leaves one authorized session and one payment` |
| P2-MED-WH-002 | L2 | `tests/webhooks/med/parallel-duplicates.spec.ts` | `P2-MED-WH-002 five parallel deliveries of one signed event leave the end state of one delivery` |
| P2-MED-WH-003 | L2 | `tests/webhooks/med/out-of-order.spec.ts` | `P2-MED-WH-003 succeeded before amount_capturable_updated ends authorized in the database` |
| P2-MED-WH-006 | L2 | `tests/webhooks/med/tolerance.spec.ts` | three titles: `P2-MED-WH-006 processing age 295 s is accepted`; `P2-MED-WH-006 processing age 305 s is rejected`; `P2-MED-WH-006 a tampered body is rejected` |
| P2-MED-WH-008 | L2 | `tests/webhooks/med/race-completion.spec.ts` | 20 titles generated by a loop: `P2-MED-WH-008 webhook and cart completion race, run 01 of 20` ... `run 20 of 20`; each leaves exactly one order |
| P2-MED-EB-002 | L3 | `tests/integration/med/poison-event.spec.ts` | `P2-MED-EB-002 a poison event is parked after the configured attempts and the next valid event is still processed` |
| P2-MED-PL-001 | L3 | `tests/integration/med/price-list-boundary.spec.ts` | `P2-MED-PL-001 a price list is active exactly at starts_at on the database clock` |
| P2-MED-CSV-001 | L3 | `tests/integration/med/csv-bad-row.spec.ts` | `P2-MED-CSV-001 a CSV with a bad price on row 50 of 100 leaves the outcome the database records` |
| P2-MED-CACHE-001 (deferred until HR-4) | L3 | `tests/integration/med/cache-visibility.spec.ts` | `P2-MED-CACHE-001 an admin price change is visible on the next store read while the cache is on` |
| P2-MED-MON-001 | L4 | `tests/integration/med/money-jpy-kwd.spec.ts` | `P2-MED-MON-001 JPY and KWD carts keep their minor units end to end` |
| P2-MED-ORD-001 | L4 | `tests/integration/med/order-conservation.spec.ts` | `P2-MED-ORD-001 order total equals item totals plus shipping plus tax minus discounts, in minor units` |
| P2-MED-INV-001 | L4 | `tests/integration/med/inventory-model.spec.ts` | `P2-MED-INV-001 a seeded operation sequence keeps reserved plus available equal to stocked after every step` |
| FC-MED-A | L4 | `tests/integration/med/framework-cross-customer.spec.ts` | `Framework check: a guest cart id is a bearer capability; an anonymous write changes only that cart's rows, and a completed cart refuses it (F2, observed)` |

Counts: 4 (L1) + 26 (L2: 1+1+1+3+20) + 4 (L3) + 4 (L4) = **38 new Playwright tests**. Live or skipped: every L2 row is key-gated, so without `STRIPE_API_KEY` L2 shows 26 skipped. P2-MED-CACHE-001 is flag-gated (1 skipped without the flag).

Baseline med-api listed tests: **5**, the readiness spec (`tests/readiness/med.readiness.spec.ts`, five `test(` calls at lines 24, 32, 36, 48, 111). Expected after L5: **43 listed** (5 + 38).

### 4.5 Why these cases are real for Medusa

- **Signature and tolerance (WH-006).** CR-4 and CR-6: the SDK default 300 s and the call-time check.
- **Idempotency and parallel duplicates (WH-001, WH-002).** CR-5 and CR-7: a repeat event either reprocesses or no-ops; the end state is what matters.
- **Race with completion (WH-008).** CR-5, CR-7: the lock (CR-8) and the completion workflow both act on the cart.
- **Poison (EB-002).** CR-6, CR-10.
- **Price-list boundary (PL-001).** CR-11.
- **Cache (CACHE-001).** CR-12, CR-13.
- **Money (MON-001, ORD-001).** CR-15, P-MED-9, RD-13, RD-14.
- **Inventory (INV-001).** CR-14.

---

## 5. Architecture

### 5.1 Approach (named)

- **Contract testing against an OpenAPI document** with AJV validation (the foundation's `ContractSpec`, `src/contracts/oas.ts`).
- **Event-driven (asynchronous) testing with a database oracle**: a signed event goes in, the test polls a read-only database row with an explicit budget (`expect.poll`, `POLL_INTERVALS`).
- **Idempotent-consumer and at-least-once delivery testing**: parallel duplicates and repeat deliveries are judged by end state, not by call count.
- **Boundary value analysis** for the tolerance and price-list boundaries, each with a margin wide enough to absorb scheduler jitter (section 5.3).
- **Model-based (stateful) testing** for inventory: a seeded operation sequence checked against a small model after every step.
- **Money with integer minor units (ISO 4217)** and an oracle that refuses silent rounding.

### 5.2 Data flow per case

| Case | Trigger | Product path | Oracle | Foundation module |
|---|---|---|---|---|
| CON-001 | store HTTP | cart, line item, payment collection, session, complete | OAS validate (response), `order` link row (DB) | `contracts/oas.ts`, `clients/medusa.ts`, `db/pg.ts` |
| CON-002 | store HTTP with a bad variant id | cart line creation rejected | response error shape; cart line count (DB) | `clients/medusa.ts`, `db/pg.ts` |
| CON-003 | store GET list | all GET store routes | OAS validate; no 5xx | `contracts/oas.ts` |
| LOC-002 | store complete with two locations | inventory reservation | reservation rows (DB) | `db/pg.ts` |
| WH-001/002/003/006 | signed POST `/hooks/payment/stripe_stripe` | route emits with `webhook_delay` (5000 ms); subscriber verifies and runs the workflow | `payment_session.status` (DB) | `webhooks/sign.ts` (`signStripe`), `webhooks/verify.ts` (`verifyStripe`), `db/pg.ts` |
| WH-008 | signed webhook plus completion, concurrently | lock step, completion workflow, subscriber | `order` count per cart (DB) | as above |
| EB-002 | signed event with a bad signature, then a valid one | subscriber throws, event bus retries, parks | session status of the valid one (DB) and of the bad one (unchanged) | as above |
| PL-001 | admin price list with `starts_at = db now() + 5 s` | pricing query on `now()` | store price before and after (API) | `clients/medusa.ts` (new methods) |
| CSV-001 | admin product import | parse step, import workflow | product rows with the run prefix (DB) and the import summary (API) | `db/pg.ts` |
| CACHE-001 | admin price update after a warm store read | cache-enabled product route | store price on next read (API); cache keys (`redis-cli`) | `webhooks/docker-net.ts` (`composeServiceContainer`, `dockerRunner`) |
| MON-001 | JPY and KWD carts (system provider) | cart totals, completion, payment | minor-unit columns (DB) | `db/pg.ts`, `lanes/med/money.ts` |
| ORD-001 | completed orders in JPY, KWD, USD | totals | conservation identity in minor units (DB) | `db/pg.ts`, `lanes/med/money.ts` |
| INV-001 | seeded operation sequence | restock (admin), reserve (cart completion), release (order cancel) | `inventory_level` and `reservation_item` (DB) against the model | `lanes/med/inventory-model.ts`, `db/pg.ts` |
| FC-MED-A | guest cart id (bearer capability) | store route | cart quantity before and after (DB) | `db/pg.ts` |

### 5.3 Budgets

Every wait is `expect.poll` with an explicit `timeout` from `SLO` and `intervals: POLL_INTERVALS`. Derivations (section 6.5 adds three SLO entries):

- `medWebhookProcessing` 25 s (existing, `src/slo.ts`): 5 s emit delay plus a 20 s margin.
- `medPriceListBoundary` 20 s (new): the boundary is set 5 s ahead of the database clock; 15 s covers the poll and the store request.
- `medCacheVisibility` 10 s (new): equals `expect.timeout` (`playwright.config.ts`); the invalidation timing is UNPROBED.
- `medPoisonParked` 30 s (new): `attempts` from `route.js:22` (default 3), immediate retries (no backoff is configured in `event-bus-redis`, UNPROBED), the 5 s delay, and a 20 s margin.

Tolerance boundaries use margins of 5 s around the processing-time edge (295 s accepted, 305 s rejected). Jitter of the delay (BullMQ scheduling, UNPROBED) is far below 5 s.

---

## 6. Module contracts

All paths are new unless marked **exists**. Imports are real (`.ts` extensions, as in the repo). Every helper below has unit tests in `tests/unit/lanes/med/` (task L0, section 8).

### 6.1 `src/lanes/med/money.ts` (L0, new)

```ts
// Independent money oracle. Minor units follow ISO 4217, the same table the product ships
// (@medusajs/utils currencies.js:518-524 JPY 0, :563-569 KWD 3). Integers only; a value with more
// decimals than its currency is refused, never rounded silently.
const MINOR_UNITS: Readonly<Record<string, number>> = { USD: 2, EUR: 2, JPY: 0, KWD: 3 };

export function minorUnits(currency: string): number {
  const digits = MINOR_UNITS[currency.toUpperCase()];
  if (digits === undefined) throw new Error(`TEST BUG: no minor-unit entry for ${currency}`);
  return digits;
}

export function toMinor(amount: number, currency: string): number {
  const scaled = amount * 10 ** minorUnits(currency);
  const nearest = Math.round(scaled);
  if (Math.abs(scaled - nearest) > 1e-9) {
    throw new Error(`TEST BUG: ${String(amount)} ${currency} has more decimals than the currency allows`);
  }
  return nearest;
}

export function isWithinPrecision(amount: number, currency: string): boolean {
  try {
    toMinor(amount, currency);
    return true;
  } catch {
    return false;
  }
}

export interface OrderLinesMinor {
  readonly items: readonly { readonly unitMinor: number; readonly quantity: number }[];
  readonly shippingMinor: number;
  readonly taxMinor: number;
  readonly discountMinor: number;
}

/** Conservation identity: sum(unit x qty) + shipping + tax - discounts, in integers. */
export function orderTotalMinor(lines: OrderLinesMinor): number {
  const items = lines.items.reduce((sum, line) => sum + line.unitMinor * line.quantity, 0);
  return items + lines.shippingMinor + lines.taxMinor - lines.discountMinor;
}

/**
 * The charge the product sends for an amount, under the upstream rule for 3-decimal currencies:
 * round UP to a multiple of 10 minor units (payment-stripe get-smallest-unit.ts:9 asserts
 * 5.124 KWD -> 5130; product code get-smallest-unit.js:52-54). Used only to compare; a gap is
 * recorded (RD-13), never hidden.
 */
export function stripeChargeMinor(amount: number, currency: string): number {
  const minor = toMinor(amount, currency);
  return minorUnits(currency) === 3 ? Math.ceil(minor / 10) * 10 : minor;
}
```

Unit tests (`tests/unit/lanes/med/money.test.ts`, 8): see section 8, L0 list.

### 6.2 `src/lanes/med/stripe-event.ts` (L0, new)

```ts
import { signStripe, type SignedRequest } from "../../webhooks/sign.ts";

/** Stripe event for the system-provider round trip. session_id absent = NOT_SUPPORTED (stripe-base.js:418-429). */
export interface PaymentIntentEventInput {
  readonly eventId: string; // evt_<run-scoped id>; the same string for a repeat delivery
  readonly type: "payment_intent.succeeded" | "payment_intent.amount_capturable_updated";
  readonly sessionId: string | undefined;
  readonly currency: string; // lower case, as Stripe sends it
  readonly amountMinor: number; // amount and amount_received, smallest unit
}

export function paymentIntentEvent(input: PaymentIntentEventInput): string {
  const metadata = input.sessionId === undefined ? {} : { session_id: input.sessionId };
  return JSON.stringify({
    id: input.eventId,
    object: "event",
    type: input.type,
    data: {
      object: {
        id: `pi_${input.eventId.replace(/^evt_/, "")}`,
        object: "payment_intent",
        currency: input.currency.toLowerCase(),
        amount: input.amountMinor,
        amount_received: input.amountMinor,
        metadata,
      },
    },
  });
}

/**
 * Signs with timestamp = receipt time - age at receipt. The product verifies at processing time,
 * so the age that matters is ageAtProcessing (route.js:21 delay). Never a fixed timestamp.
 */
export function signAtAge(input: {
  readonly payload: string;
  readonly secret: string;
  readonly receiptNowSec: number;
  readonly ageAtReceiptSec: number;
}): SignedRequest {
  return signStripe({
    payload: input.payload,
    secret: input.secret,
    timestampSeconds: input.receiptNowSec - input.ageAtReceiptSec,
  });
}

/** Age at verification = age at receipt + the product's emit delay (5000 ms default, route.js:21). */
export function ageAtProcessing(ageAtReceiptSec: number, delayMs = 5_000): number {
  return ageAtReceiptSec + delayMs / 1000;
}

/** Per-run secret from the environment of the run; never printed, never a default. */
export function runWebhookSecret(env: NodeJS.ProcessEnv = process.env): string {
  const value = env["STRIPE_WEBHOOK_SECRET"];
  if (value === undefined || value === "") {
    throw new Error("TEST BUG: STRIPE_WEBHOOK_SECRET is not set for this run");
  }
  return value;
}
```

Unit tests (`tests/unit/lanes/med/stripe-event.test.ts`, 6): see section 8.

### 6.3 `src/lanes/med/buyer.ts` (L0, new)

```ts
import { runScopedName } from "../../run/prefix.ts";

/** Customer email that the leak rule (`med-leak-customer-email`, prefix LIKE) can find. */
export function buyerEmail(label: string): string {
  return `${runScopedName(label)}@example.test`;
}

/** Product or region title that the product leak rule can find. */
export function runTitle(label: string): string {
  return runScopedName(label);
}
```

Unit test: 1 (`tests/unit/lanes/med/buyer.test.ts`).

### 6.4 `src/lanes/med/oracle.ts` (L0, new)

Every query goes through `readOnlyDb("medusa")` (qa_ro, `select-guard.ts`). Names marked **UNPROBED** must be confirmed by P-MED-8 before the query is used; `assertSelectOnly` (in the unit test) passes on all of them.

```ts
import { readOnlyDb } from "../../db/pg.ts";

const db = () => readOnlyDb("medusa");

export interface SessionRow {
  readonly id: string;
  readonly status: string;
  readonly authorizedAt: string | null;
}

// payment_session.status and authorized_at are confirmed live (invariant rule med-payment-session-authorized-has-authorized-at, verified 2026-11-01).
export async function paymentSession(sessionId: string): Promise<SessionRow | undefined> {
  const rows = await db().select<{ id: string; status: string; authorized_at: string | null }>(
    `SELECT "id" AS id, "status" AS status, "authorized_at" AS authorized_at FROM "payment_session" WHERE "id" = $1`,
    [sessionId],
  );
  const row = rows[0];
  return row === undefined ? undefined : { id: row.id, status: row.status, authorizedAt: row.authorized_at };
}

// UNPROBED (P-MED-8): table "payment" and column names. Shape only; L0 fixes the names.
export async function paymentRowCount(sessionId: string): Promise<number> {
  const rows = await db().select<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM "payment" WHERE "payment_session_id" = $1 AND "deleted_at" IS NULL`,
    [sessionId],
  );
  return Number(rows[0]?.n ?? "0");
}

// UNPROBED (P-MED-8): the order-to-cart link table and order columns.
export async function orderCountForCart(cartId: string): Promise<number> {
  const rows = await db().select<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM "order_cart" WHERE "cart_id" = $1 AND "deleted_at" IS NULL`,
    [cartId],
  );
  return Number(rows[0]?.n ?? "0");
}
```

Unit test: the SQL strings pass `assertSelectOnly` (section 8, oracle.test.ts).

### 6.5 `src/lanes/med/redis.ts` (L0, new)

Reads Redis through the harness container with `redis-cli` (no client dependency; `package.json` gets none).

```ts
import { composeServiceContainer, dockerRunner, type DockerRunner } from "../../webhooks/docker-net.ts";

export function parseRedisScan(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Keys matching a glob. The pattern is validated: no shell, no spaces. */
export async function redisKeys(pattern: string, run: DockerRunner = dockerRunner): Promise<string[]> {
  if (!/^[A-Za-z0-9:*_.-]{1,200}$/.test(pattern)) {
    throw new Error(`TEST BUG: unsafe redis pattern ${JSON.stringify(pattern)}`);
  }
  const container = await composeServiceContainer("qa-harness-medusa", "redis", run);
  const out = await run(["exec", container, "redis-cli", "--scan", "--pattern", pattern]);
  return parseRedisScan(out);
}
```

UNPROBED: the compose project name `qa-harness-medusa` and the service `redis` (prior record names `qa-harness-medusa-redis-1`), and `redis-cli` in the image (P-MED-7).

### 6.6 `src/lanes/med/inventory-model.ts` (L0, new)

```ts
/** Stateful model for P2-MED-INV-001. Pure: the same seed gives the same sequence, printed by the spec. */
export interface LevelModel {
  readonly stocked: number;
  readonly reserved: number;
}
export type Op =
  | { readonly kind: "restock"; readonly qty: number }
  | { readonly kind: "reserve"; readonly qty: number }
  | { readonly kind: "release"; readonly qty: number };

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const EMPTY: LevelModel = { stocked: 0, reserved: 0 };

/** Legal-by-construction: the generator asks the model before choosing reserve or release. */
export function nextOp(model: LevelModel, rnd: () => number): Op {
  const available = model.stocked - model.reserved;
  const pick = rnd();
  const qty = 1 + Math.floor(rnd() * 3);
  if (pick < 0.3 || (available === 0 && model.reserved === 0)) return { kind: "restock", qty };
  if (pick < 0.8 && available >= qty) return { kind: "reserve", qty };
  if (model.reserved >= qty) return { kind: "release", qty };
  return { kind: "restock", qty };
}

export function apply(model: LevelModel, op: Op): LevelModel {
  switch (op.kind) {
    case "restock":
      return { ...model, stocked: model.stocked + op.qty };
    case "reserve":
      if (op.qty > model.stocked - model.reserved) throw new Error("model refuses a reserve above available");
      return { ...model, reserved: model.reserved + op.qty };
    case "release":
      if (op.qty > model.reserved) throw new Error("model refuses a release above reserved");
      return { ...model, reserved: model.reserved - op.qty };
  }
}

/** The identity checked against the product after every step. */
export function identityHolds(model: LevelModel, availableFromProduct: number): boolean {
  return model.reserved >= 0 && model.stocked - model.reserved >= 0 && model.stocked - model.reserved === availableFromProduct;
}
```

Live mapping (UNPROBED until L0 confirms): `restock` = admin inventory level update of `stocked_quantity`; `reserve` = cart completion that creates a reservation; `release` = order cancellation. Which events release reservations is UNPROBED (P-MED-8).

### 6.7 Specs (`tests/...`): skeletons

Common header (every Medusa spec in this lane):

```ts
import { test, expect } from "../../../src/fixtures/index.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";
import { paymentRowCount, paymentSession } from "../../../src/lanes/med/oracle.ts";
import { openPaidSession } from "../../../src/lanes/med/cart-flow.ts";
import { laneClient } from "../../../src/lanes/med/lane-client.ts";
import { paymentIntentEvent, signAtAge, runWebhookSecret } from "../../../src/lanes/med/stripe-event.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
```

**Shared cart flow** (`src/lanes/med/cart-flow.ts`, L0, new). It is the one place a lane region and a paid session are created:

```ts
import type { MedusaClient } from "../../clients/medusa.ts";
import { buyerEmail } from "./buyer.ts";

/** A cart on a lane-owned region (pp_system_default only) with one line, and its payment session. */
export async function openPaidSession(
  med: MedusaClient,
  input: { regionId: string; variantId: string; label: string },
): Promise<{ cartId: string; sessionId: string }> {
  const cartId = await med.store.createCart(input.regionId, buyerEmail(input.label));
  await med.store.addLineItem(cartId, input.variantId);
  const sessionId = await med.store.createPaymentSession(cartId, "pp_system_default");
  return { cartId, sessionId };
}
```

Region and product creation go through new client methods (section 6.8). Their shapes are UNPROBED (P-MED-16); the names below are the contract the specs depend on.

**Spec skeleton: P2-MED-WH-001** (`tests/webhooks/med/signed-event.spec.ts`):

```ts
const hasKey = Boolean(process.env["STRIPE_API_KEY"]);
test.skip(!hasKey, "STRIPE_API_KEY not set: signed rows are unit-only (plan rule 11)");

test("P2-MED-WH-001 the same signed payment_intent.succeeded twice leaves one authorized session and one payment", async ({ med }) => {
  const label = "wh001";
  const region = await med.lane.regionFor("usd"); // lane-owned region, section 6.8
  const { sessionId } = await openPaidSession(med, { regionId: region.id, variantId: region.variantId, label });
  const now = Math.floor(Date.now() / 1000);
  const eventId = `evt_${currentRunPrefix().slice(-12).replaceAll("-", "")}${label}`; // unique per run
  const payload = paymentIntentEvent({ eventId, type: "payment_intent.succeeded", sessionId, currency: "usd", amountMinor: 1000 });
  const signed = signAtAge({ payload, secret: runWebhookSecret(), receiptNowSec: now, ageAtReceiptSec: 0 });
  // Positive control: the first delivery is accepted by the route.
  expect((await med.hooks.payment("stripe_stripe", signed.body, signed.headers)).status).toBe(200);
  await expect.poll(async () => (await paymentSession(sessionId))?.status, {
    timeout: SLO.medWebhookProcessing.ms, intervals: POLL_INTERVALS, message: "first delivery authorizes the session",
  }).toBe("authorized");
  // Repeat delivery, same bytes.
  expect((await med.hooks.payment("stripe_stripe", signed.body, signed.headers)).status).toBe(200);
  // Drain marker (section 6.9): a second valid session is authorized only after the queue has
  // processed the repeat, so the count below is read after "nothing else happened". No sleep.
  const marker = await openPaidSession(med, { regionId: region.id, variantId: region.variantId, label: "wh001m" });
  const markerSigned = signAtAge({
    payload: paymentIntentEvent({ eventId: `${eventId}m`, type: "payment_intent.succeeded", sessionId: marker.sessionId, currency: "usd", amountMinor: 1000 }),
    secret: runWebhookSecret(),
    receiptNowSec: Math.floor(Date.now() / 1000),
    ageAtReceiptSec: 0,
  });
  expect((await med.hooks.payment("stripe_stripe", markerSigned.body, markerSigned.headers)).status).toBe(200);
  await expect
    .poll(async () => (await paymentSession(marker.sessionId))?.status, {
      timeout: SLO.medWebhookProcessing.ms, intervals: POLL_INTERVALS, message: "drain marker authorized",
    })
    .toBe("authorized");
  expect(await paymentRowCount(sessionId)).toBe(1);
});
```

Note: the repeat-delivery step must not use a sleep. Section 6.9 specifies the **bounded marker** that replaces it: a second, valid event for a second session, polled to `authorized`, proves the subscriber has drained the queue for this run before the count is read. That is the positive control, and it is the only way to wait for "nothing else happened".

**Spec skeleton: P2-MED-WH-006** (`tests/webhooks/med/tolerance.spec.ts`), the three titles:

```ts
test("P2-MED-WH-006 processing age 295 s is accepted", async ({ med }) => {
  // receipt age 290 s + 5 s delay = processing age 295 s (ageAtProcessing)
  const { sessionId } = await openPaidSession(med, { regionId, variantId, label: "wh006a" });
  const signed = signAtAge({ payload: paymentIntentEvent({ /* ... */ }), secret: runWebhookSecret(), receiptNowSec: now(), ageAtReceiptSec: 290 });
  expect((await med.hooks.payment("stripe_stripe", signed.body, signed.headers)).status).toBe(200);
  await expect.poll(async () => (await paymentSession(sessionId))?.status, { timeout: SLO.medWebhookProcessing.ms, intervals: POLL_INTERVALS, message: "accepted at processing age 295 s" }).toBe("authorized");
});

test("P2-MED-WH-006 processing age 305 s is rejected", async ({ med }) => {
  // receipt age 300 s + 5 s delay = processing age 305 s: outside the 300 s tolerance (stripe@15.12.0 Webhooks.js:159-160)
  const { sessionId } = await openPaidSession(med, { regionId, variantId, label: "wh006r" });
  // rejected event first
  const bad = signAtAge({ payload: paymentIntentEvent({ eventId: "evt_wh006r", type: "payment_intent.succeeded", sessionId, currency: "usd", amountMinor: 1000 }), secret: runWebhookSecret(), receiptNowSec: now(), ageAtReceiptSec: 300 });
  expect((await med.hooks.payment("stripe_stripe", bad.body, bad.headers)).status).toBe(200); // the route answers 200 before verifying
  // positive control: a valid event in a second session is processed after it
  const control = await openPaidSession(med, { regionId, variantId, label: "wh006c" });
  const ok = signAtAge({ payload: paymentIntentEvent({ eventId: "evt_wh006c", type: "payment_intent.succeeded", sessionId: control.sessionId, currency: "usd", amountMinor: 1000 }), secret: runWebhookSecret(), receiptNowSec: now(), ageAtReceiptSec: 0 });
  expect((await med.hooks.payment("stripe_stripe", ok.body, ok.headers)).status).toBe(200);
  await expect.poll(async () => (await paymentSession(control.sessionId))?.status, { timeout: SLO.medWebhookProcessing.ms, intervals: POLL_INTERVALS, message: "control processed" }).toBe("authorized");
  expect((await paymentSession(sessionId))?.status).toBe("pending");
});

test("P2-MED-WH-006 a tampered body is rejected", async ({ med }) => {
  // sign valid bytes, send one byte changed: the signature no longer matches; control as above
  // assertion: session stays pending after the control is authorized
});
```

The `now()` helper is `Math.floor(Date.now() / 1000)` read once per event, never a constant.

**Spec skeleton: P2-MED-CACHE-001** (`tests/integration/med/cache-visibility.spec.ts`):

```ts
// Deferred until HR-4 (the harness must register the caching module, P-MED-7). Then:
test.skip(process.env["MEDUSA_FF_CACHING"] !== "true", "MEDUSA_FF_CACHING is not the string true: the core cache is off (feature-flags/caching.js:3-8; is-truthy.js:8-9)");
test("P2-MED-CACHE-001 an admin price change is visible on the next store read while the cache is on", async ({ med }) => {
  const product = await med.lane.productWithPrice("usd", 1000); // lane-owned
  expect((await med.store.productPrice(product.id, "usd")).amount).toBe(1000);
  const keysBefore = await redisKeys("*cache*");
  expect(keysBefore.length).toBeGreaterThan(0); // the warm read created keys: positive control
  await med.lane.setVariantPrice(product.variantId, "usd", 1500);
  await expect.poll(() => med.store.productPrice(product.id, "usd").then((p) => p.amount), { timeout: SLO.medCacheVisibility.ms, intervals: POLL_INTERVALS, message: "the new price appears" }).toBe(1500);
  await med.lane.remove(product.id);
});
```

The `keysBefore.length > 0` assertion is the positive control: without it a cache that never fills would pass.

**Spec skeleton: P2-MED-PL-001** (`tests/integration/med/price-list-boundary.spec.ts`):

```ts
test("P2-MED-PL-001 a price list is active exactly at starts_at on the database clock", async ({ med, dbClock }) => {
  const dbNow = await dbNowIso(); // SELECT now() via qa_ro (section 6.8)
  const startsAt = new Date(Date.parse(dbNow) + 5_000).toISOString();
  const product = await med.lane.productWithPrice("usd", 1000);
  await med.lane.createPriceList({ variantId: product.variantId, currency: "usd", amount: 800, startsAt, status: "active" });
  expect((await med.store.productPrice(product.id, "usd")).amount).toBe(1000); // before: positive control
  await expect.poll(() => med.store.productPrice(product.id, "usd").then((p) => p.amount), { timeout: SLO.medPriceListBoundary.ms, intervals: POLL_INTERVALS, message: "sale price after starts_at" }).toBe(800);
  await med.lane.remove(product.id);
});
```

**Spec skeleton: P2-MED-MON-001** and **P2-MED-ORD-001** (`money-jpy-kwd.spec.ts`, `order-conservation.spec.ts`): create a JPY region and a KWD region (lane-owned, countries JP and KW, UNPROBED that they are unused by the seed), a product with a variant priced in each currency, complete one order per currency with the system provider, then read the order's totals in minor units:

```ts
const { minor } = await orderTotalsMinor(orderId, currency); // oracle.ts, UNPROBED names
expect(minor.total).toBe(orderTotalMinor({ items, shippingMinor, taxMinor, discountMinor }));
expect(minor.total).toBe(toMinor(expectedMajor, currency));
```

KWD: a total with 4 or more decimal places is refused by `toMinor`, so the spec only uses 3-decimal amounts (1.234 KWD, 0.500 KWD). The conservation case with a Stripe charge is skipped for this account with a named reason (OD-18: the account refuses KWD, P-MED-18): `expect(stripeChargeMinor(total, "KWD") - toMinor(total, "KWD")).toBeLessThan(10)`; the gap is printed as an annotation, not asserted to be zero (RD-13).

**Spec skeleton: P2-MED-INV-001** (`inventory-model.spec.ts`):

```ts
const seed = Number.parseInt(process.env["P2_INV_SEED"] ?? String(Date.now() % 2 ** 31), 10);
test("P2-MED-INV-001 a seeded operation sequence keeps reserved plus available equal to stocked after every step", async ({ med }) => {
  test.info().annotations.push({ type: "seed", description: String(seed) }); // printed for replay
  const level = await med.lane.inventoryLevelFor("usd"); // lane-owned item and level
  let model = EMPTY;
  const rnd = mulberry32(seed);
  for (let step = 0; step < 12; step++) {
    const op = nextOp(model, rnd);
    model = apply(model, op);
    await med.lane.apply(level, op); // admin restock, cart completion, or order cancel
    const row = await inventoryRow(level.id); // oracle.ts, UNPROBED names
    expect(identityHolds(model, row.available), `step ${step} ${JSON.stringify(op)} seed ${seed}`).toBe(true);
    expect(row.reserved).toBe(model.reserved);
  }
});
```

**Spec skeleton: FC-MED-A** (`framework-cross-customer.spec.ts`). Basis: P-MED-6 (session 3). Decision OD-16: the cart id is a bearer capability, so the check asserts the **observed** behaviour. It is not a bug and it is not `test.fail`.

```ts
test("Framework check: a guest cart id is a bearer capability; an anonymous write changes only that cart's rows, and a completed cart refuses it", async ({ med }) => {
  const victim = await openPaidSession(med, { regionId, variantId, label: "fca-victim" });     // one line, quantity 1
  const bystander = await openPaidSession(med, { regionId, variantId, label: "fca-bystander" });
  const victimBefore = await cartQuantity(victim.cartId);       // oracle.ts: SUM(cart_line_item.quantity), confirmed P-MED-6
  const bystanderBefore = await cartQuantity(bystander.cartId);
  await test.step("an anonymous write to an open guest cart is accepted (observed)", async () => {
    const write = await med.store.rawPost(`/store/carts/${victim.cartId}/line-items`, { variant_id: variantId, quantity: 3 });
    expect(write.status).toBe(200);                              // P-MED-6: 200 with no customer token
    expect(await cartQuantity(victim.cartId)).toBe(victimBefore + 3);
    expect(await cartQuantity(bystander.cartId)).toBe(bystanderBefore); // only that cart changed
  });
  await test.step("a completed guest cart refuses the same write (observed)", async () => {
    await med.store.completeCart(victim.cartId);                 // completes the victim cart with its paid session
    const after = await cartQuantity(victim.cartId);
    const write = await med.store.rawPost(`/store/carts/${victim.cartId}/line-items`, { variant_id: variantId, quantity: 1 });
    expect(write.status).toBe(400);                              // P-MED-6: "Cart ... is already completed."
    expect(await cartQuantity(victim.cartId)).toBe(after);
  });
});
```

Helpers: `cartQuantity` (oracle.ts, whitelisted SQL) and `rawPost` (lane-client.ts, next to `rawGet`) are added in L4. The finding F2 is written to the P5 queue by the probe record, not by a test.

**Spec skeleton: P2-MED-CON-001** (`cart-contract.spec.ts`):

```ts
test("P2-MED-CON-001 cart create, add item, payment session and complete each match the store OAS, and the order row exists", async ({ med, store }) => {
  // every step: validate the response body against the OAS operation with the ContractSpec (src/contracts/oas.ts)
  const spec = await loadSpec("medusa-store", "contracts/medusa/store.openapi.yaml"); // OD-2 snapshot
  const created = await med.store.createCart(regionId, buyerEmail("con001"));
  expect(spec.validate({ method: "post", path: "/store/carts" }, { status: 200 }, created.body).ok).toBe(true);
  // ... add line item, payment collection and session, complete: same pattern
  expect(await orderCountForCart(cartId)).toBe(1); // DB end state
});
```

`ContractSpec.validate(op, response, body)` returns `{ ok, errors }` (`src/contracts/oas.ts:257`; confirm the `ok` field name in L1).

**Spec skeleton: P2-MED-CON-002** (`invalid-variant.spec.ts`):

```ts
test("P2-MED-CON-002 an invalid variant returns the documented error shape and leaves no cart line", async ({ med }) => {
  const cartId = await med.store.createCart(regionId, buyerEmail("con002"));
  const res = await med.store.raw("POST", `/store/carts/${cartId}/line-items`, { data: { variant_id: "variant_does_not_exist", quantity: 1 } });
  expect(res.status()).toBe(400);
  const body = JSON.parse(await res.text()) as { type?: string; message?: string };
  expect(body.type).toBe("not_found"); // UNPROBED: the exact type, L1 probes it
  expect(await cartLineCount(cartId)).toBe(0); // DB end state
});
```

**Spec skeleton: P2-MED-CON-003** (`store-get-oas.spec.ts`): iterate the GET paths in the OAS (valid parameters from a fixture, UNPROBED list), `expect(status).toBeLessThan(500)` and `expect(validate(...).ok).toBe(true)` per path, one test.

**Spec skeleton: P2-MED-LOC-002** (`location-split.spec.ts`): two lane-owned stock locations A (1 unit) and B (1 unit), one cart line of quantity 2. The recorded behaviour is the one L0's probe observes (RD: a constant with the probe entry cited above it). The test asserts the reservation rows match that behaviour (`split`: two reservation rows of 1; `reject`: no order, no reservation). The branch that is not observed fails loudly; there is no `oneOf` assertion.

**Spec skeleton: P2-MED-WH-002 / WH-003 / WH-008**: same header; WH-002 sends five `med.hooks.payment` calls with `Promise.all` and asserts one authorized session and one payment; WH-003 sends `amount_capturable_updated` after `succeeded` (and the reverse, in two sub-steps) and asserts the final status `authorized` only, with no captured status (C8); WH-008 is a loop of 20 tests, each opening a paid session and firing `Promise.all([completeCart(cartId), hook(signed)])`, asserting `orderCountForCart(cartId) === 1` and the session status is `authorized` or `captured` only if payment data exists (it does not here, so `authorized`).

**Spec skeleton: P2-MED-EB-002** (`poison-event.spec.ts`):

```ts
test("P2-MED-EB-002 a poison event is parked after the configured attempts and the next valid event is still processed", async ({ med }) => {
  const { sessionId: bad } = await openPaidSession(med, { regionId, variantId, label: "eb002b" });
  const badSigned = { body: Buffer.from(paymentIntentEvent({ eventId: "evt_eb002bad", type: "payment_intent.succeeded", sessionId: bad, currency: "usd", amountMinor: 1000 })), headers: { "stripe-signature": "t=1,v1=00" } }; // the signature fails: the subscriber throws
  expect((await med.hooks.payment("stripe_stripe", badSigned.body, badSigned.headers)).status).toBe(200);
  const { sessionId: good } = await openPaidSession(med, { regionId, variantId, label: "eb002g" });
  const goodSigned = signAtAge({ payload: paymentIntentEvent({ eventId: "evt_eb002good", type: "payment_intent.succeeded", sessionId: good, currency: "usd", amountMinor: 1000 }), secret: runWebhookSecret(), receiptNowSec: now(), ageAtReceiptSec: 0 });
  expect((await med.hooks.payment("stripe_stripe", goodSigned.body, goodSigned.headers)).status).toBe(200);
  await expect.poll(async () => (await paymentSession(good))?.status, { timeout: SLO.medPoisonParked.ms, intervals: POLL_INTERVALS, message: "valid event after the poison" }).toBe("authorized");
  expect((await paymentSession(bad))?.status).toBe("pending");
  // The parked-job assertion reads RedisEventBusService:events-queue:failed (members are job ids); each
  // job's hash field atm equals 3 (P-MED-10, session 3). Read through lane/redis.ts (redisKeys, hget).
});
```

Key-gated like the other L2 rows (the provider needs the key to load). The bad signature in this spec is a **retry trigger, not a security case** (the security verdict is P5's; no CUT ID appears here).

**Spec skeleton: P2-MED-CSV-001** (`csv-bad-row.spec.ts`): build a 100-row CSV in memory (run-prefixed titles and handles, row 50 with price `abc`), import through the admin import route (UNPROBED shape, P-MED-13), then assert: products with the run prefix count equals the count the import summary reports, and no row without a valid price exists (DB: the price rows of the run). The partial-versus-all-or-nothing outcome is recorded as an annotation with the observed behaviour and asserted thereafter (same pattern as LOC-002).

### 6.8 Client additions (L0, `src/lanes/med/lane-client.ts`, new)

A thin wrapper over the existing `MedusaClient` (`src/clients/medusa.ts`, **exists**), adding the calls the lane needs. Names are final; request shapes are UNPROBED until P-MED-16:

```ts
export interface LaneRegion { readonly id: string; readonly currency: string; readonly variantId: string }
export interface LaneClient {
  regionFor(currency: "usd" | "jpy" | "kwd"): Promise<LaneRegion>;  // creates or reuses a run-prefixed region
  productWithPrice(currency: string, amountMinor: number): Promise<{ id: string; variantId: string }>;
  setVariantPrice(variantId: string, currency: string, amountMinor: number): Promise<void>;
  createPriceList(input: { variantId: string; currency: string; amount: number; startsAt: string; status: "active" }): Promise<void>;
  inventoryLevelFor(currency: string): Promise<{ id: string; locationId: string }>;
  apply(level: { id: string; locationId: string }, op: Op): Promise<void>;
  remove(productId: string): Promise<void>;
}
```

`regionFor` uses countries that the seed does not use (JP for JPY, KW for KWD, CA for USD; UNPROBED that they are unused: L0 reads `GET /admin/regions` countries). The region has `pp_system_default` only.

`dbNowIso()`: `SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS now` via `readOnlyDb("medusa")`. The spec uses the database clock because the product compares to `now()` (CR-11).

Specs obtain the lane client as `const lane = laneClient(med);` (exported by `lane-client.ts`); the skeletons write `med.lane` for brevity. Two store helpers are added to the same file: `productPrice(productId, currency)` (store product read with a region and the calculated price; UNPROBED request shape) and `rawGet(path)` / `rawPost(path, body)` (store GET or POST with the publishable key, returns status and text for the contract checks).

### 6.8a Remaining helper skeletons (L1 and L4)

These are the helpers the skeletons call. Table and column names are UNPROBED until P-MED-8; each query is `SELECT` only and passes `assertSelectOnly`. Table names come from a fixed whitelist, never from input.

```ts
// src/lanes/med/oracle.ts (additions)
import { toMinor } from "./money.ts";

const COUNT_SQL: Readonly<Record<string, string>> = {
  cart: `SELECT COUNT(*)::text AS n FROM "cart" WHERE "deleted_at" IS NULL`,        // UNPROBED columns
  payment_session: `SELECT COUNT(*)::text AS n FROM "payment_session" WHERE "deleted_at" IS NULL`,
  order_cart: `SELECT COUNT(*)::text AS n FROM "order_cart" WHERE "deleted_at" IS NULL`,
};

/** Row counts of whitelisted tables. An unlisted name is a TEST BUG, never interpolated. */
export async function rowCountsFor(tables: readonly string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of tables) {
    const sql = COUNT_SQL[table];
    if (sql === undefined) throw new Error(`TEST BUG: table ${table} is not in the count whitelist`);
    const rows = await db().select<{ n: string }>(sql, []);
    out[table] = Number(rows[0]?.n ?? "0");
  }
  return out;
}

/** Lines of one cart (UNPROBED table and column names). */
export async function cartLineCount(cartId: string): Promise<number> {
  const rows = await db().select<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM "cart_line_item" WHERE "cart_id" = $1 AND "deleted_at" IS NULL`,
    [cartId],
  );
  return Number(rows[0]?.n ?? "0");
}

/** stocked, reserved and available of one inventory level (UNPROBED names). */
export async function inventoryRow(levelId: string): Promise<{ stocked: number; reserved: number; available: number }> {
  const rows = await db().select<{ stocked: string; reserved: string }>(
    `SELECT "stocked_quantity"::text AS stocked, "reserved_quantity"::text AS reserved FROM "inventory_level" WHERE "id" = $1`,
    [levelId],
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`TEST BUG: inventory level ${levelId} not found`);
  const stocked = Number(row.stocked);
  const reserved = Number(row.reserved);
  return { stocked, reserved, available: stocked - reserved };
}

/** Order totals in minor units. A decimal the currency cannot hold makes toMinor throw (no rounding). */
export async function orderTotalsMinor(
  orderId: string,
  currency: string,
): Promise<{ total: number; items: number; shipping: number; tax: number; discount: number }> {
  const rows = await db().select<Record<string, string>>(
    `SELECT "total"::text AS total, "item_total"::text AS items, "shipping_total"::text AS shipping, "tax_total"::text AS tax, "discount_total"::text AS discount FROM "order_summary_view" WHERE "order_id" = $1`, // UNPROBED: view or table name
    [orderId],
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`TEST BUG: no totals for order ${orderId}`);
  const pick = (key: string) => toMinor(Number(row[key]), currency);
  return { total: pick("total"), items: pick("items"), shipping: pick("shipping"), tax: pick("tax"), discount: pick("discount") };
}

/** Database clock as an ISO string (section 6.8). */
export async function dbNowIso(): Promise<string> {
  const rows = await db().select<{ now: string }>(
    `SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS now`,
    [],
  );
  const now = rows[0]?.now;
  if (now === undefined) throw new Error("TEST BUG: database clock returned no row");
  return now;
}
```

`orderCountForCart` (section 6.4) and `paymentRowCount` use the same pattern. **Session 3 corrections (P-MED-8, P-MED-5):** the order totals table is `order_summary` with a `totals` jsonb column (`current_order_total`, `original_order_total`, `accounting_total`, and `raw_*` strings), not `order_summary_view`; use `order_summary.totals->>'current_order_total'`. `order_item.unit_price` is null on the probe order, so line prices come from the line tables (RD-24, table not yet probed). Every helper's SQL is covered by the `assertSelectOnly` unit test (section 8.1, `oracle.test.ts`); the whitelist and the `$n` rule are covered by unit test 22.

### 6.9 Positive control for "nothing else happened"

To prove that a repeat delivery did nothing, the spec sends a second valid event for another session after the repeat, polls that session to `authorized` (bounded by `medWebhookProcessing`), and only then reads the first session's counts. A timing-based sleep is forbidden (AGENTS.md). Same pattern for WH-006 and EB-002.

### 6.10 Invariant rules (`src/invariants/rules.ts`, **exists**; shared file, section 9.2)

Two new rules, appended to the `medusa` array. Both are "basis: source" until P-MED-8 confirms table and column names. Each has the unit test pair in section 8 (L4).

```ts
{
  id: "med-inv-level-reserved-matches-reservations",
  kind: "consistency",
  description: "For each inventory level created by this run, reserved_quantity equals the sum of its reservation rows",
  cite: "@medusajs/inventory 2.21.2 inventory-level.js:12-13 (reserved_quantity); reservation_item table UNPROBED (P-MED-8)",
  basis: "source",
  verified: "2026-11-02",
  param: RUN_START,
  sql: `SELECT l."id" AS id, l."reserved_quantity"::text AS value FROM "inventory_level" l LEFT JOIN (SELECT "location_id", "inventory_item_id", SUM("quantity") AS q FROM "reservation_item" WHERE "deleted_at" IS NULL GROUP BY 1, 2) r ON r."location_id" = l."location_id" AND r."inventory_item_id" = l."inventory_item_id" WHERE l."created_at" >= $1::timestamptz AND l."deleted_at" IS NULL AND l."reserved_quantity" <> COALESCE(r.q, 0)`,
},
{
  id: "med-order-total-conservation",
  kind: "consistency",
  description: "For each order created by this run, total equals item totals plus shipping plus tax minus discounts",
  cite: "order totals columns UNPROBED (P-MED-8); identity from section 6.1",
  basis: "source",
  verified: "2026-11-02",
  param: RUN_START,
  sql: `UNPROBED until P-MED-8: the query selects orders whose stored total differs from the sum of their line and adjustment columns`,
},
```

`RUN_START` and `LEAK_LIKE_PREFIX` are the existing constants in `rules.ts:10-13`. The second rule's SQL is written in L4 from the P-MED-8 output; until then the rule is not added (no placeholder SQL in a commit).

### 6.11 SLO additions (`src/slo.ts`, **exists**; shared file, section 9.2)

```ts
  medPriceListBoundary: {
    ms: 20_000,
    basis:
      "starts_at is set to the database now() plus 5 s (test choice); pricing repository reads now() (pricing.js:137, 188); 15 s covers the poll and the store request",
  },
  medCacheVisibility: {
    ms: 10_000,
    basis: "equals expect.timeout (playwright.config.ts, 10 s); the invalidation timing is UNPROBED (P-MED-7)",
  },
  medPoisonParked: {
    ms: 30_000,
    basis:
      "attempts (route.js:22, default 3) times the event bus retry (no backoff configured, UNPROBED), plus the 5 s emit delay (route.js:21), plus a 20 s margin",
  },
```

### 6.12 Client additions to exports

`src/lanes/med/lane-client.ts` is the only new file that imports from `src/clients/medusa.ts`. `src/clients/medusa.ts` itself is **not** edited by the lane.

---

## 7. Data isolation, cleanup and leak check

- **Run prefix.** Every name the lane creates comes from `runScopedName` (`src/run/prefix.ts:51`), so it starts with `p2-qa-<timestamp>-<hex>-` and is visible to `med-leak-product-title` (`LIKE prefix%`), `med-leak-customer-email`, and `med-leak-api-key-title` (rules.ts `medusa`).
- **Regions.** Each lane region has a run-prefixed name and an unused country. Creation: `POST /admin/regions` (UNPROBED shape). Removal: `DELETE /admin/regions/{id}` (UNPROBED; if the product rejects delete, the region stays and is named by the prefix, recorded as a finding, and the run is not failed for it). Regions are not in any leak rule today; a region rule is **not** added (no need shown).
- **Products and variants.** Created with the run-prefixed title; removed with `DELETE /admin/products/{id}` (soft delete; `med-leak-product-title` checks `deleted_at IS NULL`, so a soft-deleted product is not a leak).
- **Customers.** Each cart uses `buyerEmail(label)`. The guest customer the cart creates is removed in `afterAll` of its describe with `med.admin.deleteCustomersByEmailPrefix(prefix)` (exists, `clients/medusa.ts:70-78`). The leak rule then passes.
- **Carts.** The lane never deletes a cart; whether the store API can delete one is UNPROBED (P-MED-16). Carts have no leak rule. Each cart belongs to a run-prefixed buyer and is named by it.
- **Price lists and inventory items.** Created with run-prefixed titles or SKUs; removed by the admin API. A new inventory leak rule is **not** added (the level rule in 6.10 is a consistency rule that covers the run's rows).
- **Seeded state.** The lane never writes to the seeded regions, products, locations or inventory levels. The readiness spec's region change is restored by that spec in `finally` (`med.readiness.spec.ts:105-107`); no lane test depends on it.
- **Sweep.** Every spec runs under the P2-X-DB-001 afterEach sweep (`src/invariants/fixture.ts`, auto fixture). Lane rules added in L4 run in that sweep. `testInfo.config.workers` must be 1 (playwright config).
- **Fixture writes.** None. Medusa has no `qa_fixture` role (`scripts/db-roles.ts`, Task 3 plan), and `src/db/fixture-allowlist.ts` is unchanged.
- **Retained registry.** Not used by the lane (no retained objects).

---

## 8. Build steps, per task, in order

### 8.0 Autonomous build protocol (applies to every task)

One task per session. No person is available; the builder does not ask questions.

1. Confirm the base: `git fetch origin && git rev-parse origin/main`. For L0 it must be `aa10ec11bada21b3e3e5803a948e33023d648505` or a descendant. For Lk it must include the L(k-1) branch head, or the previous PR must be merged.
2. Create the task branch from the previous head (`git checkout -b feat/<date>-p2-medusa-l<n>-<topic> <prev-head>`). If it exists on origin, STOP.
3. Install the locked dependencies: `export PATH="/usr/local/bin:$PATH"; npm ci`.
4. Check the harness: `node -p "require('./node_modules/qa-portfolio-harness/package.json').version"` must print `0.3.0`; the fork HEAD must be `f677db438f27294fc50e4c7c6612e71ff38eeff5` (`git -C /home/user/products/medusa-dtc-starter rev-parse HEAD`, or the path under `PRODUCTS_ROOT`). Otherwise STOP.
5. Record the base: `npm run unit 2>&1 | grep -E '^# (tests|pass|fail)'` must be `# tests 285`, `# pass 285`, `# fail 0` (measured on `main` in session 2; OD-15 accepted). Otherwise STOP (section 14).
6. Do the task steps below, in order.
7. Run the task's done criteria (section 9). If one fails, root-cause it with file:line and label it (PRODUCT BUG, TEST BUG, ENV, NOT A BUG) with evidence. Never weaken an assertion, raise a timeout, add a retry, or skip a test to get green.
8. Commit with explicit paths (section 11). Push: `git push -u origin <branch>`; on a network error retry with 2, 4, 8, 16 s backoff, at most four retries.
9. Open the PR against `main` (a maintainer merges). Use the repository's PR template if one exists (none at `main` as of this plan). Subscribe the session to the PR's CI (`subscribe_pr_activity`). Fix CI failures by root cause, push again. The builder never merges, tags or dispatches a workflow.
10. The final message is the report of section 12 of the brief.

### 8.1 L0: probes and helpers (`feat/2026-11-02-p2-medusa-l0-probes-helpers`)

Time budget: `npm ci` 5 to 10 min; cold `up medusa` UNPROBED (budget 30 min, deadline 1.5x measured; the foundation's Cal took 12 min cold, Medusa is not recorded); probes 20 min; helpers and tests 60 min; down 2 min.

1. Verify the harness 0.3.0 in `node_modules/qa-portfolio-harness/src/adapters/medusa-env.ts`: read it at the installed version. Record in the L0 probe file: whether `MEDUSA_LOCK`, `MEDUSA_FF_CACHING` and `webhook_*` are set or passed through, and the Redis switches (replaces CR-18 for 0.3.0).
2. Create the L0 probe file `docs/probes/<date>-p2-medusa-l0-probes.md` (never edit the 2026-11-02 file). One entry per probe, as the brief's section 4 format.
3. Stack (one at a time). Precheck:
   ```bash
   docker ps --format '{{.Names}}' | grep -E '^qa-harness-' && { echo "STOP: another stack is up"; exit 1; } || true
   ss -ltn | grep -E ':(3000|3001|5555|6380|6381|5433|9000|5432) ' && { echo "STOP: a product port is taken"; exit 1; } || true
   ```
   Per-run values, generated and never printed:
   ```bash
   export P2_RUN_ID="$(node -e 'const d=new Date();const p=n=>String(n).padStart(2,"0");console.log(`p2-qa-${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}t${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}z-${require("node:crypto").randomBytes(4).toString("hex")}`)')"
   export STRIPE_WEBHOOK_SECRET="whsec_$(openssl rand -hex 24)"
   export MEDUSA_ADMIN_EMAIL="p2-admin-$(openssl rand -hex 4)@example.test"
   export MEDUSA_ADMIN_PASSWORD="$(openssl rand -hex 16)"
   export PRODUCTS_ROOT=/home/user/products   # without it up and down fail (session 3, E1)
   export MEDUSA_REDIS=1 MEDUSA_STRIPE=1 MEDUSA_FF_CACHING=true   # the string true: "1" loads as false (E4)
   ```
   `STRIPE_API_KEY` comes from the environment (set in planning; never echoed). The `P2_RUN_ID` expression must match `RUN_PREFIX_PATTERN` (`src/run/prefix.ts:4`); L0 checks it with the unit test on `makeRunPrefix`.
4. Up with a deadline: `START=$(date +%s); timeout 1800 node node_modules/qa-portfolio-harness/scripts/up.mjs medusa; echo "up rc=$? secs=$(( $(date +%s)-START ))"` (the deadline is 30 min until the cold time is measured).
5. Probes P-MED-1 to P-MED-8, P-MED-10, P-MED-11, P-MED-13, P-MED-14, P-MED-15, P-MED-16 as scratch scripts in `/tmp/p2-lane-probes/` using the foundation clients and `src/db/pg.ts`. Bounded waits only: `timeout 60 bash -c 'until <check>; do sleep 1; done' || exit 1`. A probe needing a retry loop is recorded as a finding (the first attempt is the record).
6. `MEDUSA_DOWN_VOLUMES=1 node node_modules/qa-portfolio-harness/scripts/down.mjs medusa; echo "down rc=$?"` runs even when a probe fails (use `trap` or a separate command).
7. Helpers: write `src/lanes/med/money.ts`, `stripe-event.ts`, `buyer.ts`, `oracle.ts`, `redis.ts`, `inventory-model.ts`, `cart-flow.ts`, `lane-client.ts` exactly as section 6, adjusting only the UNPROBED names to the probe results. Keep the probe findings in the probe file, not in code comments.
8. Unit tests (22 + 1 buyer = 23). Titles are final:

   `tests/unit/lanes/med/money.test.ts` (8):
   1. `minorUnits: JPY 0, KWD 3, USD 2`
   2. `minorUnits throws a TEST BUG for an unlisted currency`
   3. `isWithinPrecision accepts 1234 JPY and rejects 1234.5 JPY`
   4. `isWithinPrecision accepts 1.234 KWD and rejects 1.2345 KWD`
   5. `toMinor converts 1.234 KWD to 1234 and throws on 1.2345 KWD (no silent rounding)`
   6. `orderTotalMinor sums items, shipping and tax and subtracts discounts in integers`
   7. `orderTotalMinor changes by one minor unit when tax changes by one (conservation mutation)`
   8. `stripeChargeMinor: 1.234 KWD -> 1240, 5.124 KWD -> 5130 (upstream rule), 1234 JPY -> 1234`

   `tests/unit/lanes/med/stripe-event.test.ts` (6):
   9. `paymentIntentEvent includes metadata.session_id when a session id is given`
   10. `paymentIntentEvent omits session_id when undefined (NOT_SUPPORTED path)`
   11. `signAtAge timestamps the header at receipt time minus age`
   12. `a header signed at receipt age 290 s verifies at processing age 295 s and is rejected at 305 s` (uses `verifyStripe` with `nowMs`, `src/webhooks/verify.ts:134-163`)
   13. `a header signed at receipt age 299 s is rejected at processing age 304 s (documents the processing-time boundary)`
   14. `runWebhookSecret throws a TEST BUG when STRIPE_WEBHOOK_SECRET is unset`

   `tests/unit/lanes/med/redis.test.ts` (2):
   15. `parseRedisScan splits redis-cli output and drops blank lines`
   16. `redisKeys rejects an unsafe pattern and runs redis-cli through the container (fake runner)`

   `tests/unit/lanes/med/inventory-model.test.ts` (4):
   17. `the same seed gives the same operation sequence`
   18. `a different seed gives a different first operation within 20 steps`
   19. `nextOp never chooses an illegal reserve or release; identityHolds stays true for 200 steps`
   20. `apply refuses a reserve above available (the model can fail)`

   `tests/unit/lanes/med/oracle.test.ts` (2):
   21. `every oracle SQL string passes assertSelectOnly (src/db/select-guard.ts:115)`
   22. `oracle SQL contains no string interpolation (only $n parameters)`

   `tests/unit/lanes/med/buyer.test.ts` (1):
   23. `buyerEmail starts with the run prefix so the customer leak rule can see it`

   Expected unit count after L0: base + 23 = **300**.
9. Run: `npm run check` (exit 0), `npm run unit` (`# tests 300`, `# pass 300`, `# fail 0`).
10. Spec files: none in L0 (probes are scratch).
11. Commit the probe file, the helpers and the unit tests (section 11).

### 8.1a Session-3 facts that change L0 (from the probe record, session 3)

- The harness needs `PRODUCTS_ROOT` in the environment of `up` and `down` (E1, E2).
- Persist one run env per stack (mode 600), source it in every command, and `down` with volumes before a new stack (E3).
- `MEDUSA_FF_CACHING` is the string `true` (E4). Medusa's Redis event bus, cache module and workflow engine come from `MEDUSA_REDIS=1` (P-MED-1).
- The seed admin, roles and `harness-seed.mjs` must be run after each `up` (volumes are removed by `down` with volumes).
- Stripe: the account refuses KWD (P-MED-18). JPY works. Test-mode PaymentIntents are created by every Stripe-provider session; cap them in the tests.
- The probe scripts in the session are the starting point for L0's probes; they are scratch and not committed.

### 8.2 L1: contracts (`feat/2026-11-02-p2-medusa-l1-contracts`, stacked on L0)

1. OAS snapshot (OD-2): if P-MED-15 shows a served document, fetch it once and commit it as `contracts/medusa/store.openapi.yaml` with a header comment giving the URL, the product version and the fetch date. Otherwise build the subset from the upstream CLI at tag `v2.21.2` (`packages/cli/oas/medusa-oas-cli`) and commit the result. If neither works within 60 minutes, STOP and file OD-2 as a blocker for L1 (the default fallback is a subset written by the lane and labelled as such, a decision for the decision).
2. Specs: `tests/contracts/med/cart-contract.spec.ts`, `invalid-variant.spec.ts`, `store-get-oas.spec.ts`, `tests/integration/med/location-split.spec.ts` (section 6.7).
3. Run: `npm run specs:validate` (the snapshot is valid), `npx playwright test --list --project=med-api` (lists 5 + 4 = **9**), then the lane run:
   ```bash
   START=$(date +%s); timeout 1800 node node_modules/qa-portfolio-harness/scripts/up.mjs medusa
   npx playwright test --project=med-api tests/contracts/med tests/integration/med/location-split.spec.ts
   MEDUSA_DOWN_VOLUMES=1 node node_modules/qa-portfolio-harness/scripts/down.mjs medusa
   ```
   Expected: 4 new tests pass; 5 readiness tests run only in `med-api` (the run selects the four files, so the readiness five are not part of this command).
4. Unit: base + 23 (L0) = 300 (no new unit tests in L1).

### 8.3 L2: webhooks (`feat/2026-11-02-p2-medusa-l2-webhooks`, stacked on L1)

1. Specs: `tests/webhooks/med/signed-event.spec.ts` (WH-001), `parallel-duplicates.spec.ts` (WH-002), `out-of-order.spec.ts` (WH-003), `tolerance.spec.ts` (WH-006, three titles), `race-completion.spec.ts` (WH-008, twenty titles generated by a loop, section 4.4).
2. Stack with `STRIPE_API_KEY` set (the lane run). `STRIPE_WEBHOOK_SECRET` is generated per run (section 8.1 step 3).
3. Run: `npx playwright test --project=med-api tests/webhooks/med` → expected **26 listed, 26 passed** with the key; **26 skipped** without it (the skip reason is printed).
4. Mutation checks (section 10) run on this branch in a scratch copy, never committed.
5. Unit: 300 (no new).

### 8.4 L3: async chains (`feat/2026-11-02-p2-medusa-l3-async-chains`, stacked on L2)

1. Specs: `tests/integration/med/poison-event.spec.ts` (EB-002), `price-list-boundary.spec.ts` (PL-001), `csv-bad-row.spec.ts` (CSV-001). `cache-visibility.spec.ts` (CACHE-001) is **deferred until HR-4 lands**; it is not built in L3.
2. Run with the lane env (`MEDUSA_FF_CACHING=true`; CACHE-001 is deferred): `npx playwright test --project=med-api tests/integration/med/poison-event.spec.ts tests/integration/med/price-list-boundary.spec.ts tests/integration/med/csv-bad-row.spec.ts tests/integration/med/cache-visibility.spec.ts` → expected 3 passed with the key (CACHE-001 is deferred until HR-4; drop its path until then).
3. Unit: 300.

### 8.5 L4: database invariants and money (`feat/2026-11-02-p2-medusa-l4-db-invariants`, stacked on L3)

1. Add the two rules (section 6.10) to `src/invariants/rules.ts` **after** the probe confirms the names. The conservation rule is added only with the P-MED-8 SQL.
2. Unit tests `tests/unit/invariants/med-rules.test.ts` (4):
   1. `med-inv-level-reserved-matches-reservations: clean rows give no violation` (fake `ReadOnlyDb` returns `[]`)
   2. `med-inv-level-reserved-matches-reservations: a level with reserved 2 and reservations 1 is reported` (fake returns one row)
   3. `med-order-total-conservation: clean rows give no violation`
   4. `med-order-total-conservation: an order whose total is one minor unit off is reported`

   The fake database is the one `tests/unit/invariants/engine.test.ts` uses (existing pattern; check it at L4 start).
3. Specs: `money-jpy-kwd.spec.ts` (MON-001), `order-conservation.spec.ts` (ORD-001), `inventory-model.spec.ts` (INV-001), `framework-cross-customer.spec.ts` (FC-MED-A).
4. Run: `npx playwright test --project=med-api tests/integration/med/money-jpy-kwd.spec.ts tests/integration/med/order-conservation.spec.ts tests/integration/med/inventory-model.spec.ts tests/integration/med/framework-cross-customer.spec.ts`. Expected 4 passed (the Stripe variant of ORD-001 is key-gated and annotated).
5. Unit: 300 + 4 = **304**.

### 8.6 L5: CI lane job (`feat/2026-11-02-p2-medusa-l5-ci`, stacked on L4)

1. Add the `med-api` job to `.github/workflows/api.yml`, after `foundation`, using the same pinned action SHAs as the other jobs (section 9.2 hunk).
2. Update `tests/unit/ci/workflow.test.ts`: the exact job-list assertion gains `med-api`, and a comment cites this plan. This is an update to a changed contract, not a weakening: the test still asserts the exact list.
3. Confirm the job's commands locally where possible (`npm run check`, `npm run unit`); the job itself runs in CI.
4. Unit: 304 (the workflow test changes, its count does not).
5. The job runs `--project=med-api` only (RD-16). If `tests/serial/med/` is ever non-empty, add `--project=med-serial` in the same job.

---

## 9. Done criteria, per task (machine-checkable)

### 9.1 Common to every task

- `npm run check` exits 0 (static: format, lint, typecheck; unit).
- Unit count is base + N and printed: `npm run unit 2>&1 | grep -E '^# (tests|pass|fail)'` shows `# tests <base+N>`, `# pass <base+N>`, `# fail 0`. Base is 277 (L0 start, after `npm ci`).
- `npm run list:api` shows the exact new titles of the task (section 4.4), in the `med-api` project.
- Lane project on its live stack: the exact counts of section 8 (passed/skipped), and `down` ran (its rc printed).
- `git status --porcelain` is empty after the commit.
- Secret scan (must print nothing and exit 1 from grep):
  ```bash
  git diff origin/main...HEAD | grep -nE '(sk_(test|live)_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.)'; test $? -eq 1
  ```
- Trailer gate (exits 0 when clean):
  ```bash
  BASE=$(git rev-parse origin/main); git rev-parse --verify "$BASE" || exit 1; git log "$BASE"..HEAD | grep -iE 'co-authored-by|generated with'; test $? -eq 1
  ```
- Plan-file gate: `git diff --name-only origin/main...HEAD` lists only the task's own paths (no sibling lane file).

### 9.2 Shared-file touch list (exact hunks)

Other lanes build in parallel from the same base. Only these files may change, and only with these hunks.

1. `src/slo.ts` (L3): add the three entries of section 6.11 inside `SLO`, before the closing `} as const satisfies Record<string, Slo>;`.
2. `src/invariants/rules.ts` (L4): two objects appended to the `medusa` array, section 6.10 (after the probe confirms the names).
3. `.github/workflows/api.yml` (L5): a `med-api` job after `foundation`:
   ```yaml
     med-api:
       name: med-api
       needs: foundation
       runs-on: ubuntu-24.04
       timeout-minutes: 30            # 25 min budget + 5 min cleanup; re-derive from the measured cold up (section 14)
       env:
         PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
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
         - name: Per-run secrets (generated, masked, never printed)
           run: |
             set -euo pipefail
             run_id="p2-qa-$(date -u +%Y%m%dt%H%M%Sz)-$(openssl rand -hex 4)"
             secret="whsec_$(openssl rand -hex 24)"
             admin_pw="$(openssl rand -hex 16)"
             echo "::add-mask::$secret"; echo "::add-mask::$admin_pw"
             {
               echo "P2_RUN_ID=$run_id"
               echo "STRIPE_WEBHOOK_SECRET=$secret"
               echo "MEDUSA_ADMIN_EMAIL=p2-admin-$(openssl rand -hex 4)@example.test"
               echo "MEDUSA_ADMIN_PASSWORD=$admin_pw"
             } >> "$GITHUB_ENV"
         - name: Bootstrap the product at its pinned ref
           run: bash scripts/bootstrap.sh medusa
         - name: Harness up (Redis, Stripe, feature flag caching)
           env:
             MEDUSA_REDIS: "1"
             MEDUSA_STRIPE: "1"
             MEDUSA_FF_CACHING: "true"   # the string true (E4)
             STRIPE_API_KEY: ${{ secrets.STRIPE_API_KEY }}
           run: timeout 1800 node node_modules/qa-portfolio-harness/scripts/up.mjs medusa
         - name: Provision roles
           run: npm run db:roles:provision -- medusa
         - name: Seed the admin user
           run: node scripts/harness-seed.mjs medusa
         - name: Run the lane
           env:
             STRIPE_API_KEY: ${{ secrets.STRIPE_API_KEY }}
             MEDUSA_FF_CACHING: "true"   # the string true (E4); CACHE-001 is deferred until HR-4
           run: npx playwright test --project=med-api
         - name: Upload report, junit, receiver and fixture logs
           if: always()
           uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
           with:
             name: med-api-artifacts
             path: |
               playwright-report/
               results/
               receiver-logs/
               fixture-logs/
             if-no-files-found: warn
             retention-days: 7
         - name: Harness down (always)
           if: always()
           env:
             MEDUSA_DOWN_VOLUMES: "1"
           run: node node_modules/qa-portfolio-harness/scripts/down.mjs medusa
   ```
   The `harness-seed.mjs` step is needed for the admin user (foundation Task 5 note); the Playwright step runs only `med-api` (RD-16). `junit` is written by the `reporter` in CI (`playwright.config.ts`).
4. `tests/unit/ci/workflow.test.ts` (L5): the exact-job-list assertion (the test named "the jobs are exactly check, unit, db-guard, specs and foundation…") gains `med-api`. Its other assertions are unchanged.
5. `playwright.config.ts`: **no change** (both `med-api` and `med-serial` already exist).
6. `src/db/fixture-allowlist.ts`, `scripts/db-roles.ts`: **no change** (no fixture role for Medusa).
7. `package.json`, `package-lock.json`: **no change** (no new dependency; Redis is read through the container).

### 9.3 Expected counts (cumulative; written for base 277)

**Session 3 correction:** the measured base was accepted **285** (OD-15). Add 8 to every unit count in this section: L0 308, L1 to L3 308, L4 and L5 312. CACHE-001 is deferred until HR-4, so the L3 Playwright count is 3 built and 1 deferred, and the total new Playwright tests are 37 built now and 38 after HR-4.

| Task | Unit tests | New Playwright tests (med-api) | Lane run (with key, flag on) |
|---|---|---|---|
| L0 | 300 (+23) | 0 | the readiness five (unchanged) |
| L1 | 300 | +4 | 9 listed |
| L2 | 300 | +26 | 35 listed; 26 key-gated |
| L3 | 300 | +4 | 39 listed |
| L4 | 304 (+4) | +4 | 43 listed |
| L5 | 304 | 0 | 43 listed; the CI job runs the same |

Without `STRIPE_API_KEY`: L2's 26 are skipped; L3's EB-002 and the three others that use the provider are skipped too (they need the key to load the provider, RD-19). Only the CACHE-001 flag and the Stripe-free cases run. The number of skipped tests is printed, not inferred.

---

## 10. Self-verification: each assertion must be able to fail

For each case, the builder runs the mutation or bad input in a **scratch copy** (never committed), confirms the test goes red, and records it in the PR body. Nothing below is committed.

| Case | Mutation or bad input | Expected red |
|---|---|---|
| CON-001 | response body with one field renamed, validated against the OAS | `validate(...).ok` false |
| CON-002 | a valid variant id instead of the bad one | status 201, the error assertion fails |
| CON-003 | a GET path with a required parameter removed | the 5xx or OAS assertion fails |
| LOC-002 | the recorded behaviour changed to the other branch | the reservation-row assertion fails |
| WH-001 | the second delivery's signature from another secret | the status-only positive control still passes; the count assertion is the one that proves no double processing |
| WH-002 | `Promise.all` replaced by a sequence that doubles the authorization count (scratch change to the expected count, 2) | count assertion fails |
| WH-003 | expected status `captured` (wrong by C8) | the poll times out and fails |
| WH-006 | a tampered body (the 305 s case, changed bytes) with a valid header | the "tampered" test fails only if the product accepts it (it must not) |
| WH-006 | expected boundary moved to receipt age 300 s, expecting acceptance | the 305 s rejection test still asserts rejection; the 295 s acceptance test passes: the mutation proves the expectations are on opposite sides |
| WH-008 | expected count 2 | red on the first run |
| EB-002 | the bad signature replaced by a valid one | the poison assertion (bad session still pending) fails |
| PL-001 | `startsAt` set to the server clock (ahead by 1 hour) | the boundary poll times out |
| CSV-001 | row 50 price valid | the "no invalid price" assertion passes and the count assertion is the one that fails: the mutation changes the expected outcome |
| CACHE-001 | the cache keys assertion removed | the mutation proves why the positive control is required: a never-filling cache would pass |
| MON-001 | `toMinor` expected +1 for JPY | the exact-minor-units assertion fails |
| ORD-001 | `tax` +1 minor unit in the oracle | the identity fails |
| INV-001 | `nextOp` producing an illegal reserve (unit mutation) | `apply` throws; the unit test 20 proves the model refuses |
| FC-MED-A | the expected quantity change removed (+3 becomes +0) | the quantity assertion fails; a completed-cart write that is accepted fails the second step |
| rules | a clean row replaced with a bad one in the fake | the violation unit test fails |

---

## 11. Commit plan

Lowercase Conventional Commits, one per logical step, explicit paths only (never `git add -A` or `git add .`). Example for L0:

```bash
git add src/lanes/med/money.ts src/lanes/med/stripe-event.ts src/lanes/med/buyer.ts
git commit -m "feat(med): add money, stripe event and buyer helpers for the lane"
git add src/lanes/med/oracle.ts src/lanes/med/redis.ts src/lanes/med/inventory-model.ts src/lanes/med/cart-flow.ts src/lanes/med/lane-client.ts
git commit -m "feat(med): add oracle, redis, inventory model and lane client helpers"
git add tests/unit/lanes/med/money.test.ts tests/unit/lanes/med/stripe-event.test.ts tests/unit/lanes/med/redis.test.ts tests/unit/lanes/med/inventory-model.test.ts tests/unit/lanes/med/oracle.test.ts tests/unit/lanes/med/buyer.test.ts
git commit -m "test(med): unit tests for the lane helpers (23)"
git add docs/probes/<date>-p2-medusa-l0-probes.md
git commit -m "docs(probes): record the medusa lane l0 probes"
```

The planning branch's own commits (this session): `docs(probes): record the medusa lane probe stop and pure probes` (the probe file) and `docs(plans): plan the p2 medusa lane` (this file). Both are committed with explicit paths. No trailer lines (repo rule 2, AGENTS.md).

---

## 12. Environment changes

Each change lists exact steps for Cursor cloud and Claude Code cloud, and says what is automatic versus pasted by hand.

| Change | Automatic from the repo | Set by hand |
|---|---|---|
| Locked install (`npm ci`) so the harness is 0.3.0 and `stripe` is present | Cursor: automatic. `.cursor/environment.json` `install` is `bash scripts/cloud-install.sh` (verified on `main`): `npm ci` once the lockfile exists, then `scripts/bootstrap.sh` for all four products. Claude Code: `.claude/hooks/session-start.sh` does **not** install (verified: no `npm ci`, no bootstrap) | Claude Code: paste `bash scripts/cloud-install.sh` into the environment **setup script** (the entry point `cloud-install.sh` names as its Claude use). Without it the installed harness stays 0.2.11 and the probes STOP (this session's result). Without it, the installed harness stays 0.2.11 and the probes STOP (this session's result) |
| `STRIPE_API_KEY` (test mode) | Nothing; the key is read from the environment | Cursor: Secrets panel, `STRIPE_API_KEY`. Claude Code: environment variables, `STRIPE_API_KEY`. CI: repository secret `STRIPE_API_KEY` (the job reads `${{ secrets.STRIPE_API_KEY }}`). Without it, L2 to L3 rows skip with their reason |
| `STRIPE_WEBHOOK_SECRET` | Generated per run by the shell (section 8.1 step 3, section 9.2 CI step); never stored | Nothing |
| `MEDUSA_FF_CACHING=true` (the string; `1` loads as false), `MEDUSA_REDIS=1`, `MEDUSA_STRIPE=1` | Set on the `up` command line in the job (section 9.2) and in section 8.1 step 3 | Local runs: export them before `up` (Cursor: in the `start` command or a shell profile; Claude Code: in the shell where `up` runs). Not secrets |
| Per-run admin credentials for the harness seed | Generated per run (section 9.2) | Nothing |
| `scripts/ensure-receiver-hostname.sh` and `npm run qa:passwords` | Already in the Cursor `start` and the Claude Code session hook (foundation Task 5) | Nothing new |
| Medusa fork installed (pnpm) | Automatic in CI through `scripts/bootstrap.sh medusa`; in a cloud session, `PRODUCTS_ROOT` must point at a checkout with `node_modules` (this sandbox has it at `/home/user/products/medusa-dtc-starter`) | Cursor: automatic (`install` runs `bootstrap.sh` for all four products, verified). Claude Code: automatic once the setup script runs `cloud-install.sh` (row above) |
| Network: `api.stripe.com` | Reachable from the stack (P-MED-17). The JPY Stripe path works; KWD is refused by this account (P-MED-18) | Only if a Stripe-provider cart is created (not in this lane): a person checks the environment network policy. The sandbox returned 403 for it in planning (index U14) |

---

## 13. Harness requests

- **HR-4 (scheduled for harness v0.3.1; MED-CACHE-001 stays DEFERRED, F3): register the core caching module.**
- **Redis container name** (confirmed in session 3, P-MED-1): `qa-harness-medusa-redis-1`, reached through `docker exec` (section 6.5 unchanged).
- **Previous HR-4 text (superseded):** none required by current findings. The lane reads Redis through the container with `docker exec` (section 6.5) and needs the harness's compose project name `qa-harness-medusa` and service `redis`. If L0 shows the name differs at 0.3.0, the request is: expose the Redis URL in the harness output (not a `docker` hack). Blocks: P2-MED-CACHE-001 keys assertion and EB-002's parked-job check only. Not a KEEP-case blocker today.
- No other harness change is needed. `MEDUSA_FF_CACHING`, `webhook_*` and `MEDUSA_LOCK` reach the product through the environment of `up` if the 0.3.0 adapter passes it through (L0 probe). If not, the request is an HR item with the adapter line and the cases it blocks (CACHE-001 for the flag; none for the webhook defaults, which are the product's defaults).

---

## 14. Will not do; open decisions; risks; time budget; STOP conditions

### 14.1 Will not do

- Edit the Medusa fork, its `.env`, its `node_modules`, or the harness. (Brief rule 3.)
- Use the upstream repository's tests as the lane's oracle (they run with a zero delay, RD-12).
- Build the CUT cases (section 4.2) or put their IDs in any title, file name or commit.
- Build MED-EB-001 as written (RD-8) or MED-PL-002 (RD-9) unless a decision rejects the proposed cut (OD-3, OD-4).
- Capture a payment by hand to satisfy a money invariant (brief section 5).
- Assert the KWD round-up away (RD-13).
- Use a fixed sleep or a fixed timestamp for a signature (AGENTS.md; section 6.2).
- Add a Redis client dependency.

### 14.2 Open decisions (every one has a default; none is BLOCKING)

| ID | Decision | Default taken in this plan | Evidence |
|---|---|---|---|
| OD-1 | Install the locked harness (0.3.0) and `stripe` before any probe | Build L0 starts with `npm ci`; an environment STOP stops the build, it is not a decision | Section 0 of this plan; `package-lock.json:1608-1610`; `npm ci` refused in planning |
| OD-2 | Source of the store OpenAPI snapshot | Snapshot from a served document if P-MED-15 finds one; else build from upstream at `v2.21.2`; else a labelled subset written by the lane (decision to confirm) | RD-17; P-MED-15 (no OpenAPI route in installed core) |
| OD-3 | Merge MED-EB-001 into MED-EB-002 (propose CUT of EB-001 as written) | Not built as written; EB-002 covers the deterministic failure. **Decided 2026-11-02: merged into P2-MED-EB-002** | RD-8; CR-3, CR-6, CR-10 |
| OD-4 | Propose CUT of MED-PL-002 as a duplicate of MED-PL-001 | Not built; the boundary path does not read the server TZ. **Decided 2026-11-02: cut** | RD-9; CR-11 |
| OD-5 | Stripe-backed rows run live only with `STRIPE_API_KEY` | Live with the key; skipped with the reason without it (brief rule 11) | RD-19, RD-20 |
| OD-6 | MED-WH-006 at receipt age 299 s | Asserted only at processing age 295 s (accepted) and 305 s (rejected). The receipt-age 299 s case is a SUSPECTED design finding (the window is measured at processing, RD-6). **Decided 2026-11-02: keep as a suspected finding.** **Confirmed live in session 3 (P-MED-2, P-MED-2b): the processing-time window is real.** `test.fail` is **not** used: the live result shows the behaviour, not a proven defect. Whether it is a defect is the P5 verdict (OD-17). | P-MED-12b; CR-6 |
| OD-7 | Stripe charge vs order total for KWD (up to 9 fils) | Recorded as an annotation with the gap; not asserted to be zero. **Decided 2026-11-02: a finding, not a bug.** Live KWD through Stripe is refused by this account (P-MED-18), so the rounding is measured on the function (pure, session 1) and the system path (3.702, P-MED-5). The KWD gap (charge minus order total, at most 9 fils) is recorded as an annotation with the value; the conservation rule does not treat it as a defect. | RD-13; P-MED-9; upstream test `get-smallest-unit.ts:9` |
| OD-8 | Admin and store API request shapes | L0 probe P-MED-16 fixes them before any spec uses them | Section 6.8 (UNPROBED) |
| OD-9 | No Medusa serial job | `tests/serial/med/` empty; CI runs `med-api` only. A decision changes it if a product-wide job is found (P-MED-14) | RD-16 |
| OD-10 | Lane region countries (JP, KW, CA) unused by the seed | Chosen; L0 checks `GET /admin/regions` and changes the codes if one is used | RD-15 |
| OD-11 | Cold `up` time and the job deadline | 30-minute job, 1.5x the measured cold `up` once measured | Foundation Task 6 skeleton; no Medusa cold time recorded |
| OD-12 | Authorization probe (P-MED-6) | DB end state only; P5 owns the verdict | Brief section 3 ownership |
| OD-13 | Cache flag for the whole lane | `MEDUSA_FF_CACHING=true` (the string, F4) for the one stack. CACHE-001 is deferred until HR-4 (F3). Flag-off behaviour is not covered by a second stack; CACHE-001 skips with its reason when off. **Decided 2026-11-02: plan default** (one stack, flag on; flag-off not covered by a second stack). | RD-7; CR-12 |
| OD-14 | Medusa lock provider at harness 0.3.0 | Unknown; the lane assumes nothing and L0 records it. If in-memory, WH-002 and WH-008 still run in one process | CR-9; RD-18 |

| OD-15 | Unit anchor for the base | **Accepted 2026-11-02: 285** (decision OD-15) (`main`, locked deps, 0 failures; `tests/unit/env.test.ts` adds 10). Build counts are base + N from 285 | Session 2 update |
| OD-16 | FC-MED-A expected outcome | **Decided 2026-11-02 : the cart id is a bearer capability** (Medusa's documented guest-cart design; the citation was not re-checked in session 3). FC-MED-A asserts the observed behaviour (anonymous write accepted, that cart's rows change, completed cart refused). F2 is recorded as a FINDING for P5. Not a `test.fail` | P-MED-6 |
| OD-17 | Tolerance defect verdict | **Decided 2026-11-02 : keep as a design finding; no `test.fail`.** The processing-time window is live-confirmed (P-MED-2, P-MED-2b). MED-WH-006 asserts the processing-time values | P-MED-2b |
| OD-18 | KWD rows through Stripe on this account | **Decided 2026-11-02 : skip with the named reason.** The KWD Stripe variant of ORD-001 is `test.skip` with the reason "this Stripe account refuses KWD (Invalid currency: kwd; P-MED-18)". It is not gated by a flag, because the account refuses KWD regardless of configuration | P-MED-18 |

**BLOCKING decisions:** none. OD-16, OD-17 and OD-18 are decided (session 3 decision reply).

### 14.3 Risks

- **R1 Stale install.** The planning checkout's `node_modules` is not the locked one (harness 0.2.11, no `stripe`). Every count and probe here depends on L0's `npm ci`. Impact: the plan's numbers are provisional.
- **R2 Processing-time tolerance.** The 5 s delay makes a live boundary test sensitive to scheduler jitter. The margins (5 s each side) are the mitigation; the live value is UNPROBED.
- **R3 Serial subscriber.** WH-006's control assumes the subscriber processes events in order. If BullMQ runs them concurrently, the control can pass before the rejected event is handled. L0 measures the order (P-MED-10); if not in order, the control waits for the rejected session's own status change to be impossible to observe, and the test is rewritten, not weakened.
- **R4 Region delete.** If the product cannot delete a region, lane regions remain (named by the prefix). No failure is raised for it (section 7).
- **R5 Lock provider.** If the lock is per process and the harness adds Redis locking at 0.3.0, WH-008 changes its behaviour. The test asserts the end state, so it stays valid, but the L0 note must record which provider ran.
- **R6 Money shapes.** A 3-decimal USD total might not be storable (RD-14). The KWD cases use 3 decimals; the USD cases use 2.
- **R7 Redis key names.** Pattern-based key reads depend on the caching provider's naming (UNPROBED). A failure here is the probe's finding, not a reason to loosen the assertion.
- **R9 Cache registration (F3).** MED-CACHE-001 cannot run until HR-4 lands. It is deferred, not skipped, so nothing passes by accident.
- **R10 Stripe account currency (F5).** KWD Stripe rows cannot be measured on this account. They are skipped with the named reason (OD-18) and the reason is printed in the report.
- **R11 Live Stripe objects.** Every Stripe-provider session creates a test-mode PaymentIntent in the account (P-MED-17/18). The lane caps the number of such sessions per run and says so in the report.
- **R12 Deterministic replay (F1).** Rejections are retried three times and land in the failed set. The EB-002 assertions must not depend on counts of other failed jobs.
- **R8 Upstream drift.** The upstream evidence is at tag `v2.21.2`. A later fork pin would need the coverage gate rerun.

### 14.4 Time budget (builder estimates, cold `up` UNPROBED)

| Task | Budget | Includes |
|---|---|---|
| L0 | 3 h | `npm ci` 10 min, harness read 15 min, cold `up` up to 30 min (UNPROBED), probes 40 min, helpers and 23 unit tests 60 min, down and commit 15 min |
| L1 | 2 h (3 h if OD-2 needs a build) | snapshot, four specs, one stack |
| L2 | 2 h | 26 key-gated specs, one stack, mutation checks in scratch |
| L3 | 2 h | four async specs, one stack (flag on) |
| L4 | 2.5 h | two rules with unit tests, four specs, one stack |
| L5 | 1 h plus one CI run (UNPROBED duration) | workflow hunk and its unit test update |

### 14.5 STOP conditions for the builder

STOP and report (do not work around) if any of these hold:

- `origin/main` is not `aa10ec1` or a descendant; or the previous build branch is closed without merge.
- The installed harness is not `0.3.0` after `npm ci`, or `npm ci` fails.
- The fork HEAD is not `f677db438f27294fc50e4c7c6612e71ff38eeff5`.
- The unit base after `npm ci` is not 277 green (`npm run check` fails at base).
- Another stack or a product port is up (the precheck in section 8.1 step 3).
- `up medusa` fails twice for the same reason, or passes its deadline.
- A host is blocked (proxy 403, ENOTFOUND): an ENV finding; stop and report (AGENTS.md).
- A probe needs a fork, harness or `.env` edit.
- A secret would be printed (any value of `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, admin password, publishable or secret key).
- The branch already exists on `origin`.
- A sibling lane's plan file appears in the diff.
- An assertion would have to be weakened to pass (use the root-cause path in section 8.0 step 7).

---

## Build measurements (2026-11-02, build branch `feat/2026-11-03-p2-lane-med`)

This section writes back the values the plan marked UNPROBED. The measured record, with commands and outputs, is `docs/probes/2026-11-02-p2-medusa-l0-probes.md` (sections 1 to 7). The plan text above is unchanged.

| Plan ID | Measured on harness 0.3.1, fork f677db4, Medusa 2.21.2 |
|---|---|
| P-MED-1 | Redis event bus; job `payment.webhook_received`, `delay 5000`, `attempts 3`; the failed set is a sorted set |
| P-MED-2 | receipt age 0 authorized (5.4 s); 299 and 301 pending (controls authorized) |
| P-MED-2b | receipt age 290 accepted (processing 295 s); 300 rejected (processing 305 s) |
| P-MED-3 | two parallel deliveries: one payment, authorized |
| P-MED-4 | one order and one payment per race round; lock is in-process (`MEDUSA_LOCK` unset = memory, medusa-env.ts:177); 20-run end state: one order each (WH-008) |
| P-MED-5 | JPY 3 x 1500 = 4500; KWD 3 x 1.234 = 3.702 (system path) |
| P-MED-6 | anonymous write to an open guest cart accepted: quantity 1 to 4; other carts unchanged (F2, P5) |
| P-MED-7 | cache on: `mc:*` keys 16 → 25 after the first warm read, flat after; price change visible in 51 ms |
| P-MED-8 | names in section 2 of the probe record (order_summary.totals has no item, shipping, tax or discount keys) |
| P-MED-9 | pure, unchanged: KWD 1.234 charges 1240 minor |
| P-MED-10 | bad signature: 3 attempts, parked in the failed sorted set, `atm 3` `ats 3`; the next valid event authorized in 5.1 s |
| P-MED-11 | price change at starts_at on the database clock, 4902 ms after creation |
| P-MED-13 | bad row (row 50) refused at preview: 400 invalid_data, no product; 100-row valid file: 100 products after confirm, 255 ms |
| P-MED-14 | no product-defined scheduled job in the installed packages (code) |
| P-MED-15 | no OpenAPI document served (404 / 400 on the probed paths) |
| P-MED-16, 16b | request shapes and reserve/release: completion reserves 2 (0 to 2), cancel releases (2 to 0) |
| P-MED-17 | Stripe reachable from the stack (session 3, unchanged this session) |
| P-MED-18 | KWD through Stripe refused by the account (500 unknown_error; Invalid currency: kwd, session 3) |
| LOC-002 | two channel-linked 1-unit locations, quantity 2: 400 not_allowed "Not enough stock available"; no split, no reservation, no live order |
| FC-MED-B | rate limiting not present: 60 of 60 reads answered 200 |
| CON-002 | invalid variant: 400 `invalid_data` with the message "do not exist or belong to a product that is not published" |
| CON-003 | 13 GET routes: 11 answer 200, two answer 401 (customer routes), none 5xx |
| WH-003 | both orders end authorized with one payment (no captured status) |
| WH-006 tampered | route 200, control authorized, tampered target pending |
| CACHE-001 | built (HR-4 is in 0.3.1; `medusa-env.ts:282-300`); the warm read writes keys, the price change is visible |
| Unit anchor | B0 = 288 on `fcc4654` (plan: 285 on `aa10ec1`; PR #10 added 3) |
| Cold up | 146 s on the first stack, 60 to 62 s later (cached image build) |

## Addendum decisions (2026-11-03, Asia/Colombo time)

The original text above is kept as written. These decisions change its meaning and are listed here, each with the probe that supports it (probe record, section 8).

- **C8 and RD-3 corrected.** The text said the payment is "never captured". The session status never reads `captured` (the payment module authorizes sessions), but the payment row is captured: a `succeeded` event captures it, and the `capture` table holds one row (P-MED-19). Specs assert the capture on the payment (`captured_at` and capture rows).
- **WH-008 meaning.** The 20 runs are titled "completion before the delayed webhook (product webhook_delay 5000 ms)". With the 5 s emit delay, the completion lands first, so the runs do not measure a simultaneous race. WH-008b (webhook first, then the client completes the same cart) is the deterministic case. The true simultaneous race is UNPROBED.
- **D6 (contract source).** The lane-written subset is removed. The contract is the upstream store OpenAPI at tag v2.21.2, verified by sha256 (PROVENANCE.md). Its validation runs through the deviation register: SPEC entries (the spec omits nullable; the 401 documentation is text/plain) and PRODUCT entries (a required key is absent from the response). PRODUCT entries are asserted red by a test.fail.
- **D7 (zero terms).** The order identity asserts shipping and live tax lines are zero from the database before it is applied. Tax lines store a rate, not an amount, so a tax term cannot be read; zero is the precondition.
- **Tolerance (WH-006).** The accepted receipt age is derived (300 - 5 - 25 = 270 s), not chosen. Receipt age 299 s is a separate rejected case: a design finding for P5 (no test.fail; no published contract is broken).
- **Environment gate.** A missing or wrong `STRIPE_API_KEY` (and a wrong `MEDUSA_FF_CACHING`) skips locally with the reason and throws in CI. The count of conditional skips is six on the key and one on the cache flag (seven files), not eight.
- **CSV deadline.** `medCsvImport` = 20 s, derived from the workflow margin of `medWebhookProcessing`; cited in `src/slo/medusa.ts`.
