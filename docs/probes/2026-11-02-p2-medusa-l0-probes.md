# P2 Medusa lane: L0 probe record (build branch, 2026-11-02 UTC)

Probe record for the build: one live stack on harness **0.3.1** (`package-lock.json` pin `7d4a3ae`, installed `node_modules/qa-portfolio-harness` 0.3.1), product fork `f677db4` (checked before the stack), Medusa `2.21.2`, Node 22.23.3, Docker 29.9.2. One stack, brought up with `node node_modules/qa-portfolio-harness/scripts/up.mjs medusa` (rc 0, 146 s cold build), seeded with `scripts/harness-seed.mjs medusa`, roles provisioned with `npm run db:roles:provision -- medusa`. No ids, tokens, secrets or passwords are recorded here. Scratch probe scripts live outside the repo and are not committed. Probe result states: **CONFIRMED** (run on this stack), **CONFIRMED (code)** (read in the installed package, file:line), **UNPROBED** (not run; reason given).

## 0. Environment and harness facts (0.3.1)

| Item | Result | Evidence |
|---|---|---|
| Harness version after `npm ci` | 0.3.1 (the 0.3.0 install in the foundation session is replaced) | `node -p "require('./node_modules/qa-portfolio-harness/package.json').version"` |
| Caching switch | `MEDUSA_FF_CACHING=true` (exact string) registers `@medusajs/medusa/caching` with provider `cache-redis` | `node_modules/qa-portfolio-harness/src/adapters/medusa-env.ts:184-186, 282-300` |
| Redis switch | `MEDUSA_REDIS=1` wires `event-bus-redis`, `cache-redis`, `workflow-engine-redis` | `medusa-env.ts:282-320` |
| Lock provider | `MEDUSA_LOCK` unset resolves to `memory` (the default) | `medusa-env.ts:162, 176-177`. OD-14 resolved: in-process lock |
| Payment webhook route | `@medusajs/medusa` 2.21.2 `dist/api/hooks/payment/[provider]/route.js`, lines 21-22: `delay: options.webhook_delay \|\| 5000`, `attempts: options.webhook_retries \|\| 3`. Not in the fork source (the fork has no hooks directory); it is in the installed package | `node_modules/.pnpm/@medusajs+medusa@2.21.2_*/node_modules/@medusajs/medusa/dist/api/hooks/payment/[provider]/route.js:21-22` |
| Event bus retry | `event-bus-redis` has no backoff setting; attempts come from the emit options | `@medusajs/event-bus-redis` `dist/services/event-bus-redis.js:48-50, 105`; no `backoff` match in its `dist` |
| Payment verification | `constructEvent` with no tolerance argument (SDK default 300 s) | `@medusajs/payment-stripe` `dist/core/stripe-base.js:511-519` |
| Price window | pricing reads `now()` on the database | `@medusajs/pricing` `dist/repositories/pricing.js:137, 188` |
| Cart lock | `lock-cart-when-available` step | `@medusajs/core-flows` `dist/payment/workflows/process-payment.js:85-88` |

Process facts (not product findings): `scripts/db-roles` and the read-only oracle need `P2_QA_RO_PASSWORD` in `.env`, written by `npm run qa:passwords` (gitignored). Without it every oracle call fails with a TEST BUG message. `npm run up`/`down` scripts do not exist in `package.json`; the plan's harness entry points are used directly.

## 1. Probes on the 0.3.1 stack

### P-MED-1. Event bus and one event in Redis
- Server log: `Connection to Redis in module 'event-bus-redis' established`, `cache-redis`, `workflow-engine-redis`.
- Parked job fields (one bad-signature event): `name=payment.webhook_received`, `delay=5000`, `attempts=3`, `atm=3`, `ats=3`.
- Status: **CONFIRMED**.

### P-MED-2. Signed `payment_intent.succeeded` by receipt age (system-provider session, signed with the run secret)
| Receipt age (s) | Route answer | Control (valid, second session) authorized | Target session after control | Payments |
|---|---|---|---|---|
| 0 | 200 | yes (5465 ms) | authorized | 1 |
| 299 | 200 | yes (5157 ms) | **pending** | 0 |
| 301 | 200 | yes (5079 ms) | **pending** | 0 |

The route answers 200 before verification. Status: **CONFIRMED**.

### P-MED-2b. Processing-time window (receipt ages 290 and 300)
| Receipt age (s) | Processing age (s) | Target session |
|---|---|---|
| 290 | 295 | authorized (accepted) |
| 300 | 305 | pending (rejected) |

The window is measured when the subscriber verifies, five seconds after receipt. Status: **CONFIRMED**. The 299 s receipt case is rejected, which is OD-6/OD-17 (kept as a design finding, no `test.fail`).

### P-MED-3. Repeat delivery of one event (two parallel POSTs, identical bytes)
- Responses `[200, 200]`; session `authorized` after 5135 ms; payments **1**. Status: **CONFIRMED**.

### P-MED-4. Webhook racing cart completion (one round)
- Webhook 200; completion 200 with `type: order`; session `authorized`; live orders for the cart **1**; payments **1**. Status: **CONFIRMED** (one round). The 20-run end state is measured by the WH-008 spec on the stack. The lock is in-process (OD-14).

### P-MED-5. Currency precision (system provider, one cart, quantity 3)
| Currency | Unit | Cart total | Order `current_order_total` (`order_summary.totals`) |
|---|---|---|---|
| JPY | 1500 | 4500 | 4500 |
| KWD | 1.234 | 3.702 | 3.702 (raw `"3.702"`) |

Status: **CONFIRMED**.

### P-MED-6. Guest cart write by id (finding F2 for P5; not a bug per OD-16)
- Anonymous `POST /store/carts/{other}/line-items` on another guest's open cart: `200`; victim quantity **1 → 4**; bystander cart **1 → 1**. Status: **CONFIRMED** (end state; verdict P5).

### P-MED-7. Cache keys and price visibility (flag on, harness 0.3.1)
- Fresh product, region `usd`. `mc:*` keys: before first read **16**; after first warm read **25**; after second read **25** (a hit writes nothing new).
- Key shapes: `mc:<hash>`, `mc:tag:<hash>`, `mc:tags:<hash>`.
- Admin price update of the variant from 10 to 15 USD: `200`; the store read returns `15` after **51 ms**.
- Status: **CONFIRMED**. This resolves the 0.2.11 registration gap (F3, HR-4): the cache is registered in 0.3.1.

### P-MED-8. Schema through the read-only role
Confirmed names used by the lane (columns not listed here are not read):
- `order` (`currency_code`, `status`, `region_id`, `email`, `deleted_at`, `canceled_at`); `order_summary` (`order_id`, `version`, `totals` jsonb with `current_order_total`, `original_order_total`, `accounting_total`, `paid_total`, `transaction_total`, `refunded_total`, `pending_difference`, `credit_line_total` and `raw_*`; **no** item, shipping, tax or discount keys).
- `order_item` (`order_id`, `version`, `item_id`, `quantity` numeric, `unit_price` numeric (null on the probe orders), `deleted_at`); `order_line_item` (`id`, `unit_price` numeric, `variant_id`, `product_id`).
- `order_cart` (`order_id`, `cart_id`, `deleted_at`); `cart` (`id`, `currency_code`, `completed_at`); `cart_line_item` (`cart_id`, `quantity`, `unit_price`, `deleted_at`).
- `payment` (`payment_session_id`, `amount`, `currency_code`, `captured_at`, `deleted_at`); `payment_session` (`status`, `authorized_at`, `payment_collection_id`, `provider_id`).
- `inventory_level` (`inventory_item_id`, `location_id`, `stocked_quantity`, `reserved_quantity`, `deleted_at`); `reservation_item` (`line_item_id`, `location_id`, `inventory_item_id`, `quantity`, `deleted_at`); `product_variant_inventory_item` (`variant_id`, `inventory_item_id`).
- `price_list` (`status`, `starts_at`, `ends_at`, `deleted_at`); `price` (`price_list_id`, `price_set_id`, `amount`, `currency_code`); `api_key` (`title`, `type`, `revoked_at`); `region` (`name`, `currency_code`, `deleted_at`); `customer` (`email`, `deleted_at`); `product` (`title`, `handle`, `status`, `deleted_at`).
- There is no `location_level` table (inventory levels are `inventory_level`).
- Status: **CONFIRMED**. Latest-version rule: for an order, the live lines are the `order_item` rows whose `version` equals the largest `order_summary.version` of the order (`order_item` keeps earlier versions; probe order: version 1 and 2 rows, 1 row at version 2).

### P-MED-9. Stripe smallest-unit rounding
- Pure (session 1, unchanged): `getSmallestUnit(1.234, 'KWD') = 1240`; `10.005 USD → 1001`. Live KWD through Stripe is refused by the account (P-MED-18). Status: **CONFIRMED** (pure).

### P-MED-10. Bad signature: retries and parking
- Bad-signature event answered 200; the next valid event (second session) authorized after 5140 ms; the bad session stayed `pending`.
- Failed set is a sorted set `RedisEventBusService:events-queue:failed` (`zrange`, not `smembers`). The parked job hash has `name=payment.webhook_received`, `atm=3`, `ats=3`, `opts.attempts=3`, `opts.delay=5000`, and `data` holds the stored headers (the marker the EB-002 test uses to find its own job).
- Status: **CONFIRMED**. Finding F1: a deterministic rejection replays identically three times and parks.

### P-MED-11. Price-list boundary on the database clock
- Database `now()` at creation 18:33:05.984Z; `starts_at` = now + 5 s; store price (base 1500 JPY) changed to the list price (800) after **4902 ms** of 100 ms polling. Status: **CONFIRMED**.

### P-MED-13. Product CSV import
- `POST /admin/uploads` (multipart, field `files`) → `200 {files:[{id,url}]}`.
- `POST /admin/products/imports` `{file_key, originalname, extension, size, mime_type}`:
  - good 100-row file → `202 {transaction_id, summary:{toCreate:100}}`; `POST /admin/products/imports/{transaction_id}/confirm` → `202`; **100** products with the run prefix after **255 ms**;
  - bad file (row 50 price `abc`) → `400 {"type":"invalid_data","message":"Row 150: Invalid value provided for \"variant price usd\". Expected value to be a number, received \"abc\""}`; the whole file is refused at preview, no product written.
- `POST /admin/product-imports` is `404` (wrong path).
- Status: **CONFIRMED**. Outcome: all-or-nothing at preview (F7). The reported row number (150) is the importer's row index; the test asserts the message text, not the number.

### P-MED-14. Product-wide scheduled job
- No product-defined scheduled job in the installed packages (framework job loader only). Status: **CONFIRMED (code)**. The serial project stays empty (RD-16).

### P-MED-15. Store OpenAPI document
- `/docs/store/openapi.json` 404; `/store/openapi.json` 400 without the publishable key; `/openapi.json` 404; `/docs` 404; `/store/openapi.yaml` 400 without the key. No document served. Installed packages contain no OpenAPI file. Status: **CONFIRMED**. OD-2 applies (see the build's decision log in the PR body).

### P-MED-16. Admin and store request shapes (all 200 unless stated)
- `GET /admin/regions` → seed regions: `eur` (dk fr de it es se gb), `usd` (us).
- `POST /admin/regions {name, currency_code, countries:[iso], payment_providers:['pp_system_default']}` → 200 (`jp`, `kw`, `ca` unused by the seed; a second region with the same country → 400 "already assigned").
- `POST /admin/products {title, status:'published', sales_channels:[{id}], options:[{title,values}], variants:[{title, sku, options:{Size:'One'}, manage_inventory, prices:[{currency_code, amount}]}]}` → 200. A duplicate handle → 400.
- `GET /admin/sales-channels` → 200 (the seed's "Default Sales Channel").
- Store: `POST /store/carts {region_id, email}`, `POST /store/carts/{id}/line-items {variant_id, quantity}`, `POST /store/payment-collections {cart_id}`, `POST /store/payment-collections/{id}/payment-sessions {provider_id}`, `POST /store/carts/{id}/complete` → 200 `{type:'order'}`.
- Price list: `POST /admin/price-lists {title, description, type:'sale', status:'active', starts_at, rules:{}, prices:[{amount, currency_code, variant_id}]}` → 200 (`variant_id` required per price; without it 400).
- Inventory: `POST /admin/inventory-items/{id}/location-levels {location_id, stocked_quantity}` → 200; `POST /admin/inventory-items/{id}/location-levels/{location_id} {stocked_quantity}` → 200 (restock); `POST /admin/inventory-items/{id} {requires_shipping:false}` → 200 (needed for a managed variant without a shipping method; without it complete → 400 `invalid_data`).
- Stock locations: `POST /admin/stock-locations {name}` → 200; `POST /admin/stock-locations/{id}/sales-channels {add:[channel]}` → 200.
- Status: **CONFIRMED**.

### P-MED-16b. Reservation on completion, release on cancel (managed inventory)
- Level stocked 9, reserved 0 → complete qty 2 → reserved **2**, one live `reservation_item` (quantity 2) → `POST /admin/orders/{id}/cancel` 200 → reserved **0**, reservation soft-deleted. Status: **CONFIRMED**.

### P-MED-17. Stripe reachable from the stack
- Earlier session (S-A) and this session: a Stripe-provider JPY session creates a PaymentIntent. Status: **CONFIRMED** (session 3; not repeated here).

### P-MED-18. KWD through Stripe on this account
- Stripe-provider KWD session → `500 {"code":"unknown_error"}`. Account refuses KWD (`Invalid currency: kwd. Stripe accounts in GB do not support kwd`, session 3). Status: **CONFIRMED** (account). OD-18: skip with the named reason. ENV finding, not a product bug.

### P-MED-LOC-002. Two stock locations, one unit each, quantity 2
- Run 1, locations not linked to the sales channel: complete qty 2 → 200 (`type: order`) with **no** reservation at either location, because the channel does not use them. Run 2, both locations linked to the channel: the result below. LOC-002 uses the linked configuration.
- Complete qty 2 → **400 `not_allowed`**, message `Not enough stock available for item … at location …`. No split. No reservation (`reservation_item` count 0). Live order links for the cart **0**, orders **0**, payment session `pending`, cart not completed.
- A rejected completion leaves soft-deleted `order_cart` rows that point at no order (2 such rows on this stack, both `deleted_at` set): compensation, not orders. The oracle counts live links only.
- Status: **CONFIRMED**. The branch is "reject" (LOC-002 asserts it; there is no `oneOf`).

### P-MED-FC-B. Rate limiting
- 60 sequential `GET /store/regions` → 60 × `200`. No rate limit in this harness. Status: **CONFIRMED** (FC-MED-B: not real here).

### CON-002 (invalid variant)
- `POST /store/carts/{cart}/line-items {variant_id:'variant_does_not_exist', quantity:1}` → **400** `{"type":"invalid_data","message":"Variants … do not exist or belong to a product that is not published"}`; live cart lines **0**. Status: **CONFIRMED**.

### CON-003 (store GET routes, valid parameters)
| Route | Status |
|---|---|
| `/store/regions` | 200 |
| `/store/products?limit=2` | 200 |
| `/store/product-categories?limit=2` | 200 |
| `/store/collections?limit=2` | 200 |
| `/store/product-tags?limit=2` | 200 |
| `/store/product-types?limit=2` | 200 |
| `/store/shipping-options?cart_id=…` | 200 |
| `/store/carts/{id}` | 200 |
| `/store/currencies?limit=2` | 200 |
| `/store/return-reasons` | 200 |
| `/store/payment-providers?region_id=…` | 200 |
| `/store/customers/me` | 401 (`{"message":"Unauthorized"}`, requires a customer) |
| `/store/orders` | 401 (requires a customer) |
| `/store/locales`, `/store/store` | 404 (not routes) |

### P-MED-12a/b (SDK boundary)
- Pure (session 1): the pinned SDK accepts 299 and 300 s and rejects 301 s at the SDK level; the product's processing age decides in practice (P-MED-2b). Status: **CONFIRMED** (SDK pure, product live).

### P-MED-14/16 (read again on 0.3.1)
- Re-measured above. Status: **CONFIRMED**.

## 2. Findings for the plan (not product bugs)

- **F1** Deterministic rejections (bad signature, tolerance) are attempted three times and parked (P-MED-10). EB-002 asserts it.
- **F2** Guest cart id is a bearer capability (P-MED-6; OD-16 decided). FC-MED-A asserts the observed behaviour; P5 owns the verdict.
- **F3** Cache registration: **resolved in 0.3.1** (P-MED-7).
- **F4** The flag is the string `true` (`medusa-env.ts:185`).
- **F5** The Stripe account refuses KWD (P-MED-18). ENV finding; KWD Stripe rows skip with the reason (OD-18).
- **F6** `api.stripe.com` is reachable from the stack (P-MED-17).
- **F7** The CSV import refuses the whole file at preview on one bad price (P-MED-13).
- **F8** `order_item.unit_price` is null on the probe orders; line prices are in `order_line_item.unit_price` (P-MED-8).
- **F9** A rejected completion leaves soft-deleted `order_cart` link rows (LOC-002). Not counted by the oracle.
- **F10** Order totals JSON has no item, shipping, tax or discount keys (P-MED-8). The conservation rule computes them from line, shipping and adjustment tables (latest version).

No product bug is suspected in L0. Any red case later is root-caused and recorded here or in the PR body.

## 3. Store response shapes behind the contract subset (L1)

Top-level keys of each route's 200 body on the same stack (values and ids not recorded). The contract subset (`contracts/med/store.openapi.yaml`) requires only the keys below and allows the rest.

| Route | Status | Top-level keys (required in the subset, with types) |
|---|---|---|
| `POST /store/carts` | 200 | `cart`: `id`, `region_id`, `currency_code`, `email`, `item_total`, `subtotal`, `total`, `items` (array; empty before a line) |
| `POST /store/carts/{id}/line-items` | 200 | `cart` (same; `items` non-empty) |
| `GET /store/carts/{id}` | 200 | `cart` (same) |
| `POST /store/payment-collections` | 200 | `payment_collection`: `id`, `currency_code`, `amount`, `payment_sessions` |
| `POST /store/payment-collections/{id}/payment-sessions` | 200 | `payment_collection` (same; the session has `provider_id`) |
| `POST /store/carts/{id}/complete` | 200 | `type` (`order`), `order`: `id`, `currency_code` |
| `GET /store/regions` | 200 | `count`, `limit`, `offset`, `regions` |
| `GET /store/products` | 200 | `count`, `limit`, `offset`, `products` |
| `GET /store/product-categories` | 200 | `count`, `limit`, `offset`, `product_categories` |
| `GET /store/collections` | 200 | `count`, `limit`, `offset`, `collections` |
| `GET /store/product-tags` | 200 | `count`, `limit`, `offset`, `product_tags` |
| `GET /store/product-types` | 200 | `count`, `limit`, `offset`, `product_types` |
| `GET /store/currencies` | 200 | `count`, `limit`, `offset`, `currencies` |
| `GET /store/return-reasons` | 200 | `count`, `limit`, `offset`, `return_reasons` |
| `GET /store/payment-providers?region_id` | 200 | `count`, `limit`, `offset`, `payment_providers` |
| `GET /store/shipping-options?cart_id` | 200 | `shipping_options` |
| `GET /store/customers/me` | 401 | `message` |
| `GET /store/orders` | 401 | `message` |
| `POST /store/carts/{id}/line-items` (invalid variant) | 400 | `type` (`invalid_data`), `message` |

The CON-002 error type is `invalid_data`, not the plan's UNPROBED `not_found` (corrected in the spec).

## 4. Webhook probes for L2 (the cases the plan marked UNPROBED)

Each row is one session with a valid control in a second session, on the 0.3.1 stack, signed with the run secret.

| Probe | Sequence | Observed |
|---|---|---|
| WH-003 A | `amount_capturable_updated`, then `succeeded` (one session) | both answers 200; authorized after 5204 ms (the capturable update); still authorized after `succeeded`; payments **1** |
| WH-003 B | `succeeded`, then `amount_capturable_updated` | 200; authorized after 5168 ms; still authorized after the capturable update; payments **1** |
| WH-006 tampered | header signed for the original bytes, body changed (`"amount":1000` → `"amount":1001`) | route answers 200; the valid control is authorized (5215 ms); the tampered target stays **pending** |

Neither order produces `captured` (no payment data on this path; C8, RD-3). The end state of both orders is `authorized` with one payment.

The L2 webhook layer (26 tests: WH-001, WH-002, WH-003 in two sub-steps, WH-006 three titles, WH-008 twenty runs) passed 26 of 26 on a fresh stack (2026-11-02 build, `med-api` project, `STRIPE_API_KEY` set, 1.7 min).

## 5. L3 run on a fresh stack

The async-chain layer (EB-002, PL-001, CSV-001, CACHE-001) passed 4 of 4 on a fresh stack (`med-api`, flag `true`, `STRIPE_API_KEY` set, 39.6 s). Measured inside the tests: the poison job is parked with `name=payment.webhook_received`, `atm=3`, `ats=3` (EB-002); the price list reaches the sale price 4.9 s after creation (PL-001, observed on the probe, within the 20 s budget); the cache key count is above zero after the warm read and the price change is visible on the next read (CACHE-001, 51 ms on the probe, within the 10 s budget); a 100-row file with an invalid price on row 50 is refused at preview with 400 `invalid_data` and no product, and the valid 100-row control imports 100 products after confirm (CSV-001).

## 6. L4 facts and the full run

- **Cart edits void the open payment session (observed while building L4).** An anonymous line write, or a promotion, changes the cart total; the open system session is then gone and completion answers 400 `invalid_data` "Payment sessions are required to complete cart". A new session on the cart's payment collection completes with 200. The specs renew the session after such an edit (`renewPaymentSession`). This is recorded as observed behaviour, not a defect verdict.
- **Promotion discount.** `POST /admin/promotions` (standard, fixed 1.00 USD, target items, allocation across) and `POST /store/carts/{id}/promotions {promo_codes}` apply to the cart. The order's line adjustment is 1.00 USD (100 minor units) in `order_line_item_adjustment` for the latest version.
- **Inventory cancel with live reservations.** `DELETE /admin/products/{id}` is refused (400 `invalid_data`, "Cannot remove … since they have reservations") while an order holds a reservation of the product's inventory item. The INV-001 cleanup cancels the remaining orders first.
- **Price lists are not removed with the product.** The PL-001 case deletes its price list by id.
- **Leak count after the full run, all lane-owned tables** (product title, variant sku, customer email, region name, stock location name, price list title, API key title, promotion code, inventory item sku), by the run prefix: **0 each**.
- **Full `med-api` run on a fresh stack:** 43 of 43 passed (5 readiness, 4 L1, 26 L2, 4 L3, 4 L4), 2.7 min.

## 7. Self-verification (plan section 10): each mutation was run in the working tree, its case was run alone, and the file was restored from git. Nothing below is committed.

| Case | Mutation | Result | Reason given |
|---|---|---|---|
| WH-002 | expected payment count 2 | red (1 failed) | five parallel deliveries: one payment |
| WH-003 | expected `captured` (wrong by C8) | red | `succeeded authorizes the session`: Expected captured, Received authorized |
| WH-006 (305 s) | receipt age moved to 290 s (accepted) | red | `stale event rejected`: Expected pending, Received authorized |
| WH-008 | expected order count 2 (run 01 of 20) | red | live orders for the cart: Expected 2, Received 1 |
| CON-001 | response body without the cart currency | red | the contract names the missing `currency_code` (and `id`, `region_id`) |
| CON-002 | expects 201 for an invalid variant | red | status mismatch (the product answers 400) |
| EB-002 | the bad signature replaced by a valid one | red | the parked-event assertions fail (no job parked for the marker) |
| PL-001 | `starts_at` on the server clock, one hour ahead | red | the price never changes within the budget |
| MON-001 | JPY expected one minor unit more | red | order total in minor units |
| FC-MED-A | expected quantity change +0 (was +3) | red | quantity assertion |
| LOC-002 | expects the split branch (200) | red | `split: completion status`: Expected 200, Received 400 |
| CSV-001 | row 50 price valid | red | the bad-file refusal assertion |
| ORD-001 | tax +1 minor unit in the identity | red | total equals the identity |
| rules | a clean row replaced by a bad one | red (unit) | `med-inv-level-reserved-matches-reservations` and `med-order-total-conservation` each report the bad row |
| INV-001 | `nextOp` makes an illegal reserve | red (unit) | `apply` refuses a reserve above available (unit test 20) |
| CACHE-001 | cache-keys positive control removed | **not red** | expected: a never-filling cache would pass without the control, which is why the control stays |

Not run as live mutations: WH-001 (second delivery signed by another secret; the count assertion is the proof, covered by WH-002's count mutation), WH-006 tampered body (covered by the product's answer, which is asserted green), and CACHE-001 with the control removed (shown above as green, the reason the control exists).

## 8. Addendum probes (2026-11-03, Asia/Colombo time; fork f677db4, harness 0.3.1, Medusa 2.21.2)

### P-MED-19. Capture: where a capture is recorded (corrects C8 and RD-3)
- Earlier text said the payment is "never captured" (C8, RD-3). That was wrong about the payment. A session status never reads `captured` (the payment module authorizes sessions), but the payment row is captured.
- Code (@medusajs/core-flows dist/payment/workflows/process-payment.js): `succeeded` with payment data captures (lines 94-97, `capturePaymentWorkflow`); `succeeded` without payment data autocaptures (lines 110-114). A completed cart is created by the webhook when none exists (lines 180-190, `completeCartAfterPaymentStep`).
- Measured on one fresh stack (WH-001 flow, and the sequences below). Oracle: `payment.captured_at` and rows of the `capture` table (`payment_id`, `amount`, `deleted_at`).

| Sequence | Session status | Payments | captured_at | Capture rows (amount) |
|---|---|---|---|---|
| `succeeded` alone (autocapture) | authorized | 1 | set | 1 (10) |
| `amount_capturable_updated` alone | authorized | 1 | null | 0 |
| `amount_capturable_updated`, then `succeeded` | authorized | 1 | set | 1 (10) |
| five parallel `succeeded` (WH-002) | authorized | 1 | set | 1 (10) |
| webhook plus completion, one round (WH-008) | authorized | 1 | set | 1 (10); 1 live order |

- The failed set stayed empty throughout (no parked job). So no capture failure was observed; the capture is recorded as expected.
- Status: CONFIRMED (live). Specs now assert the capture on the payment rows (WH-001, WH-002, WH-003 both orders, WH-008, WH-008b).

### P-MED-20. Inventory availability field
- `GET /admin/inventory-items/{id}/location-levels` returns `stocked_quantity`, `reserved_quantity` and `available_quantity` per level (keys listed; stocked 9, reserved 0, available 9 on the probe). The lane compares the product's own `available_quantity` with the model.
- Status: CONFIRMED.

### P-MED-21. Shipping and tax tables (zero terms)
- Tables (information_schema via qa_ro): `order_shipping` (order_id, version, shipping_method_id), `order_shipping_method` (amount), `order_line_item_tax_line` (item_id, rate; no amount column), `order_shipping_method_tax_line` (shipping_method_id, rate; no amount column).
- Tax lines store a rate, not an amount, so a tax term cannot be read; the identity relies on the live tax-line count being zero. The probe orders have no shipping method and no tax lines (ORD-001 asserts both zero before the identity).
- Status: CONFIRMED (schema and probe orders).

### P-MED-WH-008b. Webhook first, then the client completes the same cart
- Webhook 200; the webhook created the order within 5340 ms (`completeCartAfterPaymentStep`); the client completion then answered 200, `type: order`, and returned the SAME order id; live orders 1; payments 1; captured 1; capture rows 1.
- UNPROBED: a true simultaneous race (a client completion landing during webhook processing, not after it). The product's emit delay (`dist/api/hooks/payment/[provider]/route.js:21`) makes the simultaneous case land the completion first, so it is not what WH-008 measures.

### P-MED-WH-006 (tolerance, by receipt age). Design finding, routed to P5
- Accepted case: receipt age 270 s = 300 - 5 (route delay) - 25 (medWebhookProcessing budget, rounded up). Rejected: 299 s (processing age 304 s, observed rejected on the earlier probe P-MED-2), 300 s, and a tampered body.
- Finding: the route answers 200 before it verifies (route.js:16-29); the subscriber verifies later with the SDK's 300 s tolerance (stripe@23.0.1 cjs/Webhooks.js:15, 23). A valid event that waits in the queue past about 295 s is dropped for good. Medusa's three retries reuse the same stale signature (F1). Stripe does not redeliver after a 2xx, and its retries get a fresh signature and timestamp.
- Cited Stripe guidance (fetched 2026-11-03, https://docs.stripe.com/webhooks): "Quickly returns a successful status code (2xx) before any complex logic that might cause a timeout"; "If Stripe retries an event ... we generate a new signature and timestamp for the new delivery attempt"; "a 2xx status code" stops automatic retries. No published contract is broken, so no test.fail.

### P-MED-CONTRACT. Upstream store OpenAPI at v2.21.2
- Fetched `https://raw.githubusercontent.com/medusajs/medusa/v2.21.2/www/apps/api-reference/specs/store/openapi.full.yaml`; sha256 `cc4af9d7b00fead80c8ab75bd3b2ab97fec0397086bc0d0eccc2f7cb12b7032a` (matches). OpenAPI 3.0.0, 52 `/store` paths; `info.version` reads 2.21.1 (noted in PROVENANCE.md).
- Validation of the lane's responses (raw Ajv errors, all branches): 526 errors in 238 signatures: 406 `type` (null where the spec declares a non-null type) and 137 signatures SPEC; 117 `required` misses and 1 derived `oneOf` (101 signatures PRODUCT). The 401 operations (`/store/customers/me`, `/store/orders`) are documented as text/plain; the shared validator throws on a non-JSON schema (src/contracts/oas.ts, "has no application/json schema"), so those two are asserted by hand and recorded as SPEC.
- Shared-code note (not edited): `ContractSpec.validate()` truncates its errors ("... and N more") and the lane reads Ajv's raw errors instead.
- Register: `src/lanes/med/deviation-register.json` (generated from these runs; counts are informational; the lane compares signatures per operation and status).
- Status: CONFIRMED.
