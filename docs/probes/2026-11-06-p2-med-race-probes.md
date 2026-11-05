# P2 Medusa probe (charter Task 3) — 2026-11-05 to 2026-11-06

Times: Asia/Colombo (UTC+05:30). Branch `feat/2026-11-05-p2-discovery-probes`. Harness 0.3.1 (D2 applied: plan step 8.0.4 accepts 0.3.1 in place of 0.3.0). Fork HEAD `f677db438f27294fc50e4c7c6612e71ff38eeff5` (checked with `git -C /home/user/products/medusa-dtc-starter rev-parse HEAD`, matches the pin). One stack at a time; every stack taken down and confirmed gone.

## Runs

| Run | Times | What | Result | Cause |
|---|---|---|---|---|
| 1 | 00:00:01 to 00:04:25 | `up medusa`, `npm run db:roles:provision -- med`, tests | 23 failed: `password authentication failed for user "qa_ro"` | ENV/command: `med` is not a valid provisioning target (usage: `cal|documenso|medusa|twenty|all`). The role was never created. |
| 2 | ended 00:04:25 (start time not logged separately) | same with `medusa` target | 23 failed: `TEST BUG: auth step "medusa login" failed (HTTP 401)` | Admin account not created: `up` does not seed Medusa (`scripts/harness-seed.mjs:2`). |
| 3 (diagnostic) | 00:06:26 to 00:06:29 | `up`, direct login probe, one test | Direct `POST /auth/user/emailpass` on `127.0.0.1:9000` returned `401` with the per-run credentials; `EB-002` failed with HTTP 401 | Same cause as run 2 (no admin user). Confirms it is not a fixture mismatch. |
| 4 (final) | 00:07:52 to 00:10:28 | `up medusa` (`UP_RC=0`, 60 s warm); `node scripts/harness-seed.mjs medusa` (`SEED_RC=0`, `harness seed medusa ok`); `db:roles:provision -- medusa` (`PROVISION_RC=0`); `npx playwright test --project=med-api -g "P2-MED-(WH-008\|EB-002\|CACHE-001)"`; `down` with `MEDUSA_DOWN_VOLUMES=1` (`DOWN_RC=0`, `PS_AFTER 0`) | **23 passed (2.5 min)**, `TEST_RC=0` | Clean |

Secrets: `STRIPE_WEBHOOK_SECRET`, `MEDUSA_ADMIN_PASSWORD`, `P2_QA_*_PASSWORD` were generated per run inside the shell and not printed. `STRIPE_API_KEY` was present in the shell (presence only checked, value never printed). The scripts are in the session scratchpad, not committed.

## Final-run evidence (trimmed)

```
harness seed medusa ok: p2-admin-…@example.test     (address elided)
✓ P2-MED-CACHE-001 an admin price change is visible on the next store read while the cache is on (1.5s)
✓ P2-MED-EB-002 a poison event is parked after the configured attempts and the next valid event is still processed (9.1s)
✓ P2-MED-WH-008 completion before the delayed webhook (product webhook_delay 5000 ms), run 01 of 20 … run 20 of 20 (≈6.5s each)
✓ P2-MED-WH-008b webhook first, then the client completes the same cart: one order, one payment, one capture (6.9s)
23 passed (2.5m)
```

## Code read: payment webhook route (route.js 21-22 claim verified)

Read-only, pinned fork (`f677db4`), installed core package `@medusajs/medusa` 2.21.2:
`node_modules/.pnpm/@medusajs+medusa@2.21.2_…/node_modules/@medusajs/medusa/dist/api/hooks/payment/[provider]/route.js`

```
16  // we delay the processing of the event to avoid a conflict caused by a race condition
17  await eventBus.emit({ name: PaymentWebhookEvents.WebhookReceived, data: event }, {
20  }, {
21      delay: options.webhook_delay || 5000,
22      attempts: options.webhook_retries || 3,
23  });
29  res.sendStatus(200);
```

The route does not verify the signature. It emits the event with a delay (default 5000 ms, default 3 attempts) and returns `200`. Verification happens later, in the subscriber that processes the delayed event. The lane plan citation `hooks/payment/[provider]/route.js:21-22` is correct; the path is under the installed package, not `apps/backend/src`.

## Verdicts (charter rows)

| Row | Verdict | Basis |
|---|---|---|
| P2-MED-WH-008 (completion before delayed webhook, 20 runs) | COVERED | `tests/webhooks/med/race-completion.spec.ts:42` passes 20 of 20 on the fork (run 4). |
| P2-MED-WH-008b (webhook first, then completion) | COVERED | `race-completion.spec.ts:86` passes (run 4). Together the two cases cover both sequential orderings. |
| P2-MED-WH-008 simultaneous overlap (P-MED-4) | STILL BLOCKED | Both cases are sequential orderings across the 5 s window. A true same-instant overlap is not shown. The candidate (completion inside the emit delay) is not isolated as a deterministic overlap in this run; not attempted further. |
| backlog-med-webhook-200-before-verify (P5) | PRODUCT DEFECT (design) | The route responds `200` (`route.js:29`) before any signature check, and verification runs in the subscriber after the delay. This matches the lane's P5 design finding. Upstream issue: draft only. |
| P2-MED-EB-002 (poison event parked after attempts, next valid event processed) | COVERED | `tests/integration/med/poison-event.spec.ts:46` passes (run 4, 9.1 s). |
| P2-MED-CACHE-001 (cache visibility, HR-4 gate) | COVERED | `tests/integration/med/cache-visibility.spec.ts:22` passes with `MEDUSA_FF_CACHING=true` and `MEDUSA_REDIS=1` on harness 0.3.1 (run 4, 1.5 s). The HR-4 deferral is stale on disk (reconciliation R5). |
| P2-MED-WH-006 (299 s receipt age, OD-17) | Not re-run | Live result already on record: receipt 299 s stays pending (med plan `:76-77`). Owner decision D10 stands; no `test.fail`. |
| backlog-harness-products-root / P-MED-1 (event bus) | Not re-run | Event bus is Redis under `MEDUSA_REDIS=1` (run 4 cache and race cases used it). |

## Stack state

After run 4: `DOWN_RC=0`, `PS_AFTER 0`.
