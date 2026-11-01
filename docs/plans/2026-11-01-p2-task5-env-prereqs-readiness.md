# P2 foundation Task 5: environment prerequisites and a readiness check per product (plan only)

Builds on Task 4 (`docs/plans/2026-11-01-p2-task4-api-clients-tokens.md`). Index:
`docs/plans/2026-11-01-p2-foundation-index.md`. This task proves the whole foundation against the four real
products: harness, roles, credentials, receiver, signers and the invariant sweep, one product stack at a time.

## 1. Header

- Plan branch `plan/2026-11-01-p2-foundation`. Base commit at plan time: `main` = `fd554c901e82a7a936fb0074af42de6b26f56ab1`.
- Build branch: `feat/<build-date>-p2-task5-env-prereqs-readiness`, `<build-date>` = `date -u +%F`. **Cut from the head
  of the Task 4 branch**, record that SHA. PR base: the Task 4 branch.
- Depends on Tasks 2 to 4 **and on the harness release HR-1, HR-2 and HR-3 (index section 8), tagged `v0.3.0` before this
  task starts** (a required step; a release that is not tagged is a STOP, section 14, never a `test.fixme`). Unit chain: Task 4
  head **250** -> this task **265** (+15, index section 1). Playwright lists **21** readiness tests in 4 files; Cal lists 6
  (no `test.fixme`). db-guard unchanged (22).
- **Harness pin moves from `v0.2.11` to `v0.3.0`** (the HR-1/HR-2/HR-3 release; not yet cut, its SHA is UNPROBED). The probes
  below ran on `v0.2.18` (`de561c56f9307321358e7c682ed48949229f57a0`): own tag, so the D11
  cooldown does not apply. Reasons: Cal's web server start and stop on Linux need `v0.2.14` and `v0.2.15`
  (`CHANGELOG.md`: detached Next server with a pid record; port listener read from `/proc` because `lsof` cannot
  see the `next-server (v16.x)` name), `v0.2.13` adds `MEDUSA_LOCK`, `v0.2.17` the optional pg-stats and
  event-loop preload, and `v0.2.18` is the tag the k6 suite already runs on.
- Probe date 2026-11-01 on the Claude Code cloud VM: Node v22.23.3, v24.22.0 (`$NODE24`), Docker 29.9.2, 4 cores,
  15 GB RAM, 18 GB free disk, Playwright 1.64.0. Harness `v0.2.18` was built from a scratch clone outside the
  repo and its scripts were used for every probe. Every stack was started with `up` and ended with `down`.
- Verification: revision 1 was built in a scratch copy (`npm run check` exit 0, 261/261) and **its four readiness specs were run
  against the real stacks on `v0.2.18`, each twice in a row**, with the results of
  section 2.7.

## 2. Probe findings

> Raw results live in `docs/probes/2026-11-01-p2-foundation-probes.md` (sections 1.1 to 1.6, 2.1 to 2.4, 4.4, 4.5, 4.6). The text below summarises and cites them.

### 2.1 Probe P1: can a variable reach the product through the harness without editing it?

The harness merges `process.env` into every process it spawns (`src/internal/spawn-detached.ts:46`,
`src/internal/run.ts:54`: `{ ...process.env, ...options.env }`) and passes only listed keys into Twenty's
compose. Verdicts, each tested live unless marked:

| Prerequisite | Product | Verdict | Evidence |
|---|---|---|---|
| `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=p2-receiver.test` | Documenso | **works from P2 env**, with two conditions: the value must be in the environment of `up` (the list is read once at module load, `assert-webhook-url.ts:50-56`), and the receiver URL must use a **hostname** (the create-time schema check has no bypass, 2.2) | delivered live; `127.0.0.1` URL -> 400 at create |
| `NEXT_PUBLIC_FEATURE_BILLING_ENABLED=true` | Documenso | **works from P2 env**; it also makes envelope creation fail with `400 LIMIT_EXCEEDED "You have reached your document limit for this month"`, so billing cases need their own stack run | live 2026-11-01 |
| cached Documenso build hides a changed `NEXT_PUBLIC_*` flag? | Documenso | **no**: the build marker is the product git SHA only (`documenso.adapter.ts:160-195`); a restart printed "Documenso build matches HEAD ...; skipping the build" and the flag change took effect (server code reads `process.env` at request time, `packages/lib/utils/env.ts`) | live: envelope create 400 -> 200 after the restart without the flag |
| `NODE_OPTIONS` heap for the Documenso and Cal builds | Documenso, Cal | **root cause, fixed by HR-3, not by a global variable.** Node's default heap here is 2.0 to 2.2 GB; Documenso `react-router typegen && tsc` died with exit 134 `JavaScript heap out of memory` at 2.05 GB, and a retry with a larger heap passed. The harness sets its default heap only when `NODE_OPTIONS` is empty (`calHeapEnv`, `cal.adapter.ts:53-58`); this cloud image presets `NODE_OPTIONS=--use-openssl-ca`, so Cal gets no default either, and Documenso has none. HR-3 merges the default into an existing `NODE_OPTIONS`. No heap variable is exported anywhere in this plan | live (v0.2.18) |
| `DANGEROUS_BYPASS_RATE_LIMITS=true` | Documenso | **UNPROBED**: the sandbox's command classifier refused the command that set it ("Safety Bypass Flag"), and it was not worked around. Code: forwarded only when exactly `true` (`documenso-env.ts:276-278`). Not needed by the readiness specs (two sign-ins) | n/a |
| `DAILY_WEBHOOK_SECRET`, `CRON_API_KEY` | Cal | **works from P2 env** | Daily route answered 403/400 as signed; cron POST 401 -> 200 with the key |
| `MEDUSA_REDIS=1` (event-bus-redis) | Medusa | **works from P2 env, in v0.2.11 and v0.2.18**. *The review says v0.2.18 adds it; it does not*: `medusa-env.ts:237-243` already writes `@medusajs/medusa/event-bus-redis` in `v0.2.11`; `v0.2.13` added `MEDUSA_LOCK` | log: "Retrying payment.webhook_received" 3 times for one failing event |
| `MEDUSA_STRIPE=1`, `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET` | Medusa | **works from P2 env**; the seed prints "Stripe on Europe" and `pp_stripe_stripe` is linked to Europe only | live |
| `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS` as an environment variable | Twenty | **does not reach the containers** (`docker exec ... env \| grep -c OUTBOUND` = 0): the overlay lists no such key and the runtime override only forwards the rate-limit allowlist (`twenty-runtime-override.ts`). **Needs a harness release (HR-2)** for the env route. The admin-panel route is **not used** by this plan (2.3); HR-2 is the route | live |
| `host.docker.internal` in Twenty's containers | Twenty | **does not resolve** (no `extra_hosts`): needs HR-2. The network-gateway IP literal works today | `getent hosts host.docker.internal` -> none |
| Twenty billing variables (`IS_BILLING_ENABLED`, Stripe secret) | Twenty | **UNPROBED, needs HR-2** (not in the compose overlay) | n/a |

### 2.2 Documenso: create-time check vs send-time check

```text
tRPC webhook.createWebhook {webhookUrl:"http://127.0.0.1:4317/r/x", ...} -> 400
  "Webhook URL cannot point to a private or loopback address"          (webhook-router/schema.ts:6-14, isPrivateUrl, no bypass)
same call with http://p2-receiver.test:4317/... (hosts file: 127.0.0.1 p2-receiver.test) -> 200
send time: assertNotPrivateUrl skips every host listed in NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS -> delivered
```

So the review's statement "private URLs blocked unless listed in `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS`" is true
at send time only. The receiver is reached by a hostname that resolves to 127.0.0.1: `scripts/ensure-receiver-hostname.sh` adds
that hosts line (idempotent, root or sudo), because the create-time check refuses a literal loopback address (first block above).

### 2.3 Twenty: two lazy mechanisms that drop an early event (found by the readiness run)

```text
POST /admin-panel  mutation { createDatabaseConfigVariable(key:"OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS", value:["172.18.0.1"]) } -> true
  (probe only: the admin-panel write works. This plan does NOT use it: a global mutation of a shared product database
  is not a test of the product, so the allow-list comes from the environment of `up` (HR-2) instead.)
config-variables-refresh-cron-interval.constants.ts: every process re-reads DB config every 15 s ('*/15 * * * * *')
workspace-cache.service.ts:56  MEMOIZER_TTL_MS = 10_000   (flat webhook maps are memoised for 10 s)
first attempt (probe): webhook created, person created at once -> worker log "Outbound HTTP request: POST http://172.18.0.1:4317/..."
  processed in 16 ms, receiver saw nothing (blocked: the worker had not re-read the allow-list); call-webhook.job.ts catches
  the error and returns, so the event is never retried.
second attempt (probe): allow-list set earlier, webhook created, person created at once: no CallWebhookJob at all for the new
  webhook (memoised map without it).
```

Consequence (D7): the allow-list is read from the environment of `up` (HR-2; UNPROBED on the release until its acceptance
check passes, index section 8). The 10 s memo still applies to a new webhook, so the readiness test asserts the webhook is
visible with a **canary precondition** (section 6.2, `src/readiness/canary.ts`) and then fires the real event once. An event
still dropped after the canary is the product bug B1 (index section 5): it is asserted, never retried.
Receiver 500 mode on the pinned image: **one** request in 45 s (no retry), contradicting the master plan's "5 requests"
baseline (P2-TW-WH-004), see OD-3.

### 2.4 Medusa: Stripe route, system provider, payment states

```text
POST /hooks/payment/stripe_stripe  with a valid signature | a bad signature | no signature | an unknown provider  -> always 200 "OK"
  hooks/payment/[provider]/route.js emits payment.webhook_received with delay webhook_delay||5000, attempts webhook_retries||3
  verification happens later: log "No signatures found matching the expected signature..." / "No stripe-signature header value was provided"
cart region: Europe has pp_stripe_stripe only, United States has no provider; POST /admin/regions/{id} {payment_providers:["pp_system_default"]} -> 200
system-provider session: pending. Stripe-signed payment_intent.succeeded with metadata.session_id = that session id
  -> status authorized, authorized_at set, 1 payment row, after 5577 ms (webhook_delay 5000)
  stripe-base.js:418-429 (getWebhookActionAndData needs no Stripe API call), core-flows process-payment.js:96-117
  (SUCCESSFUL authorizes, and captures only when payment data exists). The master plan expects "captured": see OD-4.
Stripe provider session creation: 400 "Payment provider pp_stripe_stripe is not enabled in the cart's region" / needs api.stripe.com
a cart with an email also creates a guest customer that the store API cannot delete (leak rule found it); the admin API deletes it
a new publishable key has no sales channel: GET /store/products -> 400 until POST /admin/api-keys/{id}/sales-channels {add:[id]}
```

### 2.5 Probe P2: can stripe-mock replace Stripe for these products?

| Product | Stripe client construction | Host option | Evidence |
|---|---|---|---|
| Documenso | `new Stripe(key, {apiVersion:'2022-11-15', typescript:true})`, stripe 12.18.0 | none | `packages/lib/server-only/stripe/index.ts:5-8` |
| Twenty | `new Stripe(stripeApiKey, {})`, stripe 20.4.1 | none | `billing/stripe/stripe-sdk/services/stripe-sdk.service.ts:9-10` |
| Medusa `payment-stripe` | `new Stripe(options.apiKey)`, stripe 15.12.0 / 19.1.0 | none | `payment-stripe/dist/core/stripe-base.js:27` |

stripe-node reads no environment variable for its host (`DEFAULT_HOST = 'api.stripe.com'`, `stripe.core.js:13-14`), and none
of the three products passes a host, port or protocol (table above). **stripe-mock is therefore unusable without a fork edit,
and it is not used.** Re-check 2026-11-01 10:16Z from the planning sandbox: `curl` to `https://api.stripe.com/v1/charges` fails
with `CONNECT tunnel failed, response 403` from the agent proxy. That is an ENV finding of this sandbox, not a statement about
CI or the cloud VMs, which have not been probed: the first CI run probes it (section 13, OD-2).

What needs no Stripe API call is planned and was proven:

| Rows | Product | Proven |
|---|---|---|
| unsigned / empty payload / garbage / wrong secret / stale (-600 s) / non-synced type / synced type without customer | Documenso `POST /api/stripe/webhook` (billing flag + secret in `up`'s env) | live: 400 `No signature found in request` / 400 `No payload found in request` / 500 `Unknown error` x3 / 200 `Webhook received` x2 |
| the same event with a customer | Documenso | live: 500 (it calls the Stripe API): **blocked** without a Stripe key (P2-DOC-STR-002/003) |
| signature rows and the success row | Medusa, with the system-provider session of 2.4 | live: authorized in 5.6 s |
| Twenty billing webhook (`/webhooks/stripe`) | Twenty | UNPROBED, needs HR-2 |

Options for the Stripe-dependent rows (decided in section 13, OD-2):
- **(4) recommended:** a Stripe test-mode key (`sk_test_...`) and its webhook secret (`whsec_...`) as CI and cloud secrets. The
  products call `api.stripe.com`, the host Stripe documents for test-mode keys (Stripe documentation, UNPROBED here). The
  first CI run probes reachability: `curl -s -o /dev/null -w '%{http_code}' https://api.stripe.com/v1/charges` must print
  `401` (an unauthenticated request; UNPROBED expectation). Any other result is an ENV finding.
- **(c) fallback:** unit-level SDK checks only, no network.
- **Rejected:** (a) a fork change that exposes the Stripe host (the forks are never edited); (b) TLS interception with a
  proxy-trusted CA through `NODE_EXTRA_CA_CERTS` (it weakens TLS verification for the test process and tests the proxy, not Stripe).

### 2.6 Probe P5 summary and the Cal question

All four products mint and revoke through their HTTP API (Task 4, section 2). Cal's API v2 (5555) is **not started** by harness
`v0.2.18` (connection refused, probed). HR-1 starts it, with Redis, in the harness release. Task 5 then runs the `/v2` check as
a normal test: no `test.fixme`, no skip. Until HR-1 is tagged, Task 5 does not start (section 14).

### 2.7 Readiness runs on the real stacks (2026-11-01)

| Product | Stack start | Roles | Result (run 1, run 2) | Notable |
|---|---|---|---|---|
| Medusa | `up` 4 min cold, 1 min warm; `harness-seed.mjs medusa` | provision/teardown ok | 5 passed, 5 passed | first run found: guest customer leak, worker keys needing `retained`, sales channel for the publishable key (all fixed in Tasks 4/5) |
| Documenso | `up` ~11 min cold (first attempt OOM, exit 134), < 1 min warm | ok | 5 passed (3.2 s), 5 passed (2.6 s) | delivery in about 0.6 s; receiver log redacts `x-documenso-secret` |
| Cal | `up` ~12 min cold (Next compile 2 min + tRPC/turbo build + seed), ~1 min warm | ok | 5 passed + 1 skipped (blocked HR-1) (3.4 s), same (3.1 s); recorded on `v0.2.18`, before HR-1 | web app only |
| Twenty | `up` ~2 min + `harness-seed.mjs twenty` ~2 min | ok | 5 passed (33.0 s), 5 passed (33.0 s) | recorded on `v0.2.18` with the admin-panel warm-up (~16 s) and one re-trigger (12 s) that this revision removes; the re-run on `v0.3.0` is UNPROBED |

Wall-clock numbers are read from log timestamps (+-1 min); they feed the lane budgets in Task 6.

## 3. Resolved decisions

- **D1. Harness pin `v0.3.0`** (section 1, HR release). The lockfile entry becomes `version 0.3.0`, `resolved` = the tag's SHA (UNPROBED until tagged);
  the harness's own dependency `zod` becomes `^4.6.7` inside the lock. `npm ci` builds its `dist` through its
  `prepare` script (verified).
- **D2. One reach table per product** (`src/webhooks/reach.ts`): Cal loopback; Documenso a hostname for
  `127.0.0.1`; Twenty `host.docker.internal` (HR-2 `host-gateway`), which resolves in its containers to the compose gateway,
  where the receiver binds; Medusa none. The receiver binds loopback plus what the product needs, never a wildcard (Task 2 D5).
- **D3. Readiness = four specs with the same shape:** health + run-id header not rejected, `qa_ro` is the connected
  role and read-only, a credential is minted, accepted, revoked and rejected, the outgoing (or inbound) webhook
  round trip where its prerequisite exists, every invariant rule runs against the live schema and finds nothing.
  A harness release that is not tagged is a STOP, never a `test.fixme` or a skip (HR-1 to HR-3 are required first).
- **D4. Named SLO budgets** (`src/slo.ts`), each derived from a code-defined timeout plus a stated margin, never
  from an observed latency: Cal delivery 10 s, Documenso 20 s (call timeout 10 s), Twenty 35 s (10 s memo + 5 s
  call + re-trigger), Twenty allow-list 45 s (15 s refresh x 2 + margin), Medusa 25 s (`webhook_delay` 5 s).
- **D5. A worker-scoped `receiverHandle`** starts the receiver once for the project's product, on the addresses
  the product can reach, and stops it at the end (log in `receiver-logs/<run id>.jsonl`).
- **D6. Medusa: no shared-region mutation in the default path.** With OD-2 option (4) the flow uses the seed region that is
  already linked to `pp_stripe_stripe` (Europe, 2.4) and changes nothing. Until option (4) is set up, the flow reads the region's
  exact previous provider list, sets `pp_system_default`, asserts the new list, and restores the exact list it read (not `[]`)
  and asserts the restore. The flow is labelled **route/signature reachability only**; MED-WH lanes must not reuse it. The guest
  customer is deleted through the admin API; the cart is named with the run prefix and retained by id (section 7).
- **D7. Twenty: no admin-panel mutation and no warm-up loop.** The allow-list is the HR-2 environment value set at `up`. Each
  webhook test (a) creates the webhook with a per-run secret (`randomSecret()`); (b) asserts a **canary precondition**
  (`src/readiness/canary.ts`): one canary event at creation, a second after one memo window (10 s), and it asserts that the
  canary is delivered within `SLO.twWebhookDelivery` and that the canary trigger count is `<= CANARY_MAX_TRIGGERS` (2). A bound
  that is only annotated does not count, so the bound is an assertion; (c) fires the real event **once** and asserts it **once
  by record id**. There is no retry: an event dropped after the canary is B1 and fails the test. The Twenty B1 test is a lane
  item (section 4).
- **D8. Billing cases get a separate Documenso stack run** (billing flag changes document limits, 2.1).
- **D9. Environment is prepared by repo scripts,** not by instructions to remember: `scripts/harness-seed.mjs`,
  `scripts/ensure-receiver-hostname.sh`, the SessionStart hook (qa-passwords; hosts line with a printed warning) and Cursor's `start` command (qa-passwords, hosts line)
  (section 12).

## 4. Case mapping

No product case runs in this task. The readiness specs exercise, for real, the two framework checks **P2-X-DB-001** (the sweep,
all four products) and **P2-X-WH-001** (signed webhook round trip: Cal HMAC, Documenso secret header, Twenty timestamp HMAC,
Medusa Stripe signature to the database). Both are **review IDs** (index section 4, C9): they are not in
`docs/master-plan.html` (checked, no match), and the owner adds their rows (index section 9, item 5). They prepare the WH, DLY,
STR, EB, KEY and CON cases that the review keeps. `P2-MED-WH-001..008` do not use the Medusa readiness flow (D6: route and
signature reachability only); `P2-DOC-STR-001` and its signature rows use the table of 2.5.
Contradictions with the master plan, recorded for the lanes: P2-TW-WH-004 (1 request, not 5), P2-MED-WH-001/007 ("captured"
vs authorized, 2.4), P2-CAL-WH-003 and P2-CAL-TASK-001 (Task 2, 2.1), field names in P2-CAL-SCH-002 and P2-DOC-REM-001 (Task 3, 2.2).

**Lane item, not built here: the Twenty B1 test.** Its ID is assigned by the owner (`<TW-B1-ID>`).

1. Setup in `beforeAll` (must pass): a per-run webhook and the canary precondition of D7.
2. Positive control, asserted **first**, a normal test that must pass: one event after the canary is delivered, and its
   timestamp HMAC verifies (`verifyTwenty`).
3. The only assertion under `test.fail`: **"first event delivered"**: a person created at once after the webhook is created,
   `expect.poll` within `SLO.twWebhookDelivery` for its record id. While B1 is open this assertion fails, so the test passes as
   expected. Playwright's `test.fail` applies to a whole test, so the assertion sits alone in its own test, after the control
   inside a `test.describe.serial` block: if the control fails, the block stops and nothing is marked expected.
4. The marker and its reason are recorded in the test title and in index section 5 (B1). When B1 is fixed the test fails, and the
   owner removes the marker. (The Playwright behaviour of `test.fail` in serial blocks is UNPROBED; the lane verifies it.)

## 5. Architecture

| File | Change | Responsibility |
|---|---|---|
| `package.json`, `package-lock.json` | edit | harness pin `v0.3.0` (HR release) |
| `src/env.ts` | edit | comment names `v0.3.0` |
| `src/slo.ts` | new | named SLO budgets; the Twenty memo constant (`TWENTY_WEBHOOK_MEMO_MS`) |
| `src/webhooks/reach.ts` | new | which addresses a product can reach, resolved per product |
| `src/readiness/checks.ts` | new | `qa_ro` check, `randomSecret`, `productsRoot` |
| `src/readiness/canary.ts` | new | the canary precondition for a lazily applied webhook (at most 2 canary triggers) |
| `src/fixtures/index.ts` | new | final `test`: adds `receiverHandle` |
| `src/auth/twenty.ts` | no change | no admin-panel helpers are added |
| `src/clients/medusa.ts` | edit | provider list read and restore, customer cleanup, variant, payment session |
| `tests/readiness/{cal,doc,med,tw}.readiness.spec.ts` | new | the four specs |
| `playwright.config.ts` | edit | API projects also match `readiness/<code>.readiness.spec.ts` |
| `eslint.config.mjs` | edit | the sleep ban also covers `tests/readiness/**` and `tests/serial/**` |
| `scripts/harness-seed.mjs`, `scripts/ensure-receiver-hostname.sh` | new | seed through the harness; hosts line |
| `.claude/hooks/session-start.sh`, `.cursor/environment.json` | edit | qa-passwords and the hosts line at session start (no heap variable) |
| `.env.example`, `AGENTS.md` | edit | Stripe variable names (option 4); the Cursor and Claude lines (no heap line) |
| tests: `tests/unit/webhooks/reach.test.ts`, `tests/unit/readiness/{checks,canary}.test.ts` | new | +15 |

## 6. Module contracts (exact code, built and tested in the scratch copy)

### 6.1 Harness pin

Edit `package.json`: in `dependencies`, change the tag at the end of the `qa-portfolio-harness` git URL from
`#v0.2.11` to `#v0.3.0` (the HR release tag; nothing else on that line), then:

```bash
export PATH="/usr/local/bin:$PATH"
npm install                     # updates package-lock.json; builds the harness dist through its prepare script
grep -n '"version": "0.3.0"' package-lock.json     # the node_modules/qa-portfolio-harness entry
grep -n '<SHA of v0.3.0, written from the tag: UNPROBED until tagged>' package-lock.json
node -e 'console.log(require("./node_modules/qa-portfolio-harness/package.json").version)'   # 0.3.0
git diff --stat -- package.json package-lock.json   # package.json 1 line; package-lock.json about 15 lines changed
```

### 6.2 SLO budgets, reach table, readiness helpers

`src/slo.ts`

```ts
/**
 * Named SLO budgets for async chains (AGENTS.md: expect.poll with an explicit deadline). A budget
 * is a policy bound derived from a CODE-DEFINED timeout plus a stated margin, never from an
 * observed latency (observed values go in test annotations only).
 */
export interface Slo {
  readonly ms: number;
  readonly basis: string;
}

export const SLO = {
  calWebhookDelivery: {
    ms: 10_000,
    basis:
      "sendPayload has no timeout (sendPayload.ts:312-322); one request on the web process, 10 s policy bound",
  },
  docWebhookDelivery: {
    ms: 20_000,
    basis:
      "executeWebhookCall times out at 10_000 ms (execute-webhook-call.ts WEBHOOK_TIMEOUT_MS) + 10 s for job dispatch",
  },
  twWebhookDelivery: {
    ms: 35_000,
    basis:
      "a new webhook reaches the worker after its workspace-cache memo (10 s, TWENTY_WEBHOOK_MEMO_MS); the canary precondition waits one memo window, then the call (5 s, call-webhook.job.ts) and a 20 s margin",
  },
  medWebhookProcessing: {
    ms: 25_000,
    basis:
      "hooks/payment/[provider]/route.js emits with delay webhook_delay || 5000 ms; 20 s margin for the subscriber and workflow",
  },
} as const satisfies Record<string, Slo>;

/** Twenty's workspace-cache memo lifetime (workspace-cache.service.ts:56, MEMOIZER_TTL_MS): a new webhook is invisible to the worker for this long. */
export const TWENTY_WEBHOOK_MEMO_MS = 10_000;

/** Margin added to the memo window before the canary precondition is judged (a policy bound, section 6.2 canary). */
export const CANARY_MARGIN_MS = 500;
```

`src/webhooks/reach.ts`

```ts
import type { ProductId } from "../env.ts";
import { networkGateway, type DockerRunner } from "./docker-net.ts";

/**
 * How each product's process reaches the receiver (plan Task 5, probes P1/P3 on harness v0.2.18):
 *  - cal and documenso run as HOST processes, so loopback works. Documenso additionally refuses a
 *    literal private or loopback host when a webhook is CREATED (webhook-router/schema.ts), so it
 *    gets a hostname that resolves to 127.0.0.1 and is listed in
 *    NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS (read once at process start).
 *  - twenty: with HR-2 (`extra_hosts: host.docker.internal:host-gateway`) the name resolves in its containers to the
 *    compose gateway: the receiver binds that gateway and the URL uses the name. Before HR-2 (probe 2.1) the URL had to
 *    use the gateway IP literal.
 *  - medusa has no outgoing webhook; its Stripe route is inbound only.
 */
export type ReceiverReach =
  | { readonly kind: "host-loopback"; readonly urlHost: string }
  | { readonly kind: "container-gateway"; readonly network: string }
  | { readonly kind: "none" };

export const DOCUMENSO_RECEIVER_HOSTNAME = "p2-receiver.test";
export const TWENTY_COMPOSE_NETWORK = "qa-harness-twenty_default";

export const PRODUCT_REACH: Readonly<Record<ProductId, ReceiverReach>> = {
  cal: { kind: "host-loopback", urlHost: "127.0.0.1" },
  documenso: { kind: "host-loopback", urlHost: DOCUMENSO_RECEIVER_HOSTNAME },
  medusa: { kind: "none" },
  twenty: { kind: "container-gateway", network: TWENTY_COMPOSE_NETWORK },
};

export interface ReachDeps {
  readonly docker?: DockerRunner;
  /** Resolves a hostname to its first IPv4 address (dns.lookup in production). */
  readonly lookup: (hostname: string) => Promise<string>;
}

export interface ReceiverTarget {
  /** Addresses the receiver must bind for this product to reach it. */
  readonly bindHosts: readonly string[];
  /** Host part of the URL the product is told to call. */
  readonly urlHost: string;
}

export class ReachError extends Error {
  override readonly name = "ReachError";
  constructor(message: string) {
    super(`ENV: ${message}`);
  }
}

export async function resolveReceiverTarget(
  product: ProductId,
  deps: ReachDeps,
): Promise<ReceiverTarget> {
  const reach = PRODUCT_REACH[product];
  switch (reach.kind) {
    case "none":
      throw new ReachError(`${product} has no outgoing webhook, so no receiver URL`);
    case "host-loopback": {
      if (reach.urlHost !== "127.0.0.1") {
        const address = await deps.lookup(reach.urlHost).catch(() => "unresolved");
        if (address !== "127.0.0.1") {
          throw new ReachError(
            `${reach.urlHost} must resolve to 127.0.0.1 (found ${address}); add the line "127.0.0.1 ${reach.urlHost}" to the hosts file`,
          );
        }
      }
      return { bindHosts: ["127.0.0.1"], urlHost: reach.urlHost };
    }
    case "container-gateway": {
      const gateway = await networkGateway(reach.network, deps.docker).catch(() => {
        throw new ReachError(
          `docker network ${reach.network} not found: is the ${product} stack up?`,
        );
      });
      return { bindHosts: ["127.0.0.1", gateway], urlHost: "host.docker.internal" };
    }
  }
}
```

`src/readiness/checks.ts`

```ts
import { randomBytes } from "node:crypto";
import path from "node:path";
import { readOnlyDb } from "../db/pg.ts";
import type { ProductId } from "../env.ts";

/** Shared pieces of the four readiness specs (plan Task 5). */
export async function connectedRole(
  product: ProductId,
): Promise<{ user: string; readOnly: string }> {
  const rows = await readOnlyDb(product).select<{ u: string; ro: string }>(
    `SELECT current_user::text AS u, current_setting('transaction_read_only') AS ro`,
  );
  const row = rows[0];
  if (row === undefined) throw new Error("TEST BUG: current_user returned no row");
  return { user: row.u, readOnly: row.ro };
}

/** A throwaway webhook secret: 16 random bytes as hex. Never logged. */
export function randomSecret(): string {
  return randomBytes(16).toString("hex");
}

/** The fork checkout the harness uses; only static assets (example.pdf) are read from it. */
export function productsRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env["PRODUCTS_ROOT"]?.trim();
  return path.resolve(
    configured && configured !== "" ? configured : path.join(process.cwd(), "..", "products"),
  );
}
```

`src/readiness/canary.ts`

```ts
/**
 * Canary precondition for a Twenty webhook (plan Task 5, D7). Twenty applies a new webhook to the worker only after its
 * workspace-cache memo expires (TWENTY_WEBHOOK_MEMO_MS = 10 s), and an event sent earlier is dropped (B1, index section 5).
 * This is a PRECONDITION, not a retry loop: at most CANARY_MAX_TRIGGERS canary events are sent. A canary that is still
 * not delivered after the second one fails. The real event is sent by the caller, once, after this returns.
 * No sleep: `waitUntil` is expect.poll with a named deadline in the spec, and a predicate loop in the unit tests.
 */
export const CANARY_MAX_TRIGGERS = 2; // one at creation, one after one memo window

export interface CanaryInput {
  /** Sends one canary event (a person.created on the test's own webhook). */
  readonly trigger: () => Promise<void>;
  /** True once the canary delivery is recorded (matched by the canary's record id in the spec). */
  readonly delivered: () => boolean;
  /** Milliseconds since the webhook was created. */
  readonly elapsedMs: () => number;
  /** Resolves when the predicate holds; rejects at the deadline. */
  readonly waitUntil: (predicate: () => boolean, timeoutMs: number, message: string) => Promise<void>;
  readonly memoTtlMs: number;
  readonly deliveryMs: number;
  readonly marginMs: number;
}

/** Returns how many canary triggers were sent (1 or 2). */
export async function canaryPrecondition(input: CanaryInput): Promise<number> {
  await input.trigger(); // canary 1: may fall inside the memo window and be dropped
  await input.waitUntil(
    () => input.delivered() || input.elapsedMs() >= input.memoTtlMs,
    input.memoTtlMs + input.marginMs,
    "canary: memo window elapsed or canary delivered",
  );
  let triggers = 1;
  if (!input.delivered()) {
    await input.trigger(); // canary 2: after the memo window; the last one
    triggers = 2;
  }
  await input.waitUntil(input.delivered, input.deliveryMs, "canary delivered");
  return triggers;
}
```

### 6.3 Fixtures

`src/fixtures/index.ts`

```ts
import { lookup } from "node:dns/promises";
import path from "node:path";
import { apiBaseUrl, receiverConfig, type ProductId } from "../env.ts";
import { productOfProject } from "../invariants/rules.ts";
import { currentRunPrefix } from "../run/prefix.ts";
import { startReceiver, type PathKey, type Receiver } from "../webhooks/receiver.ts";
import { resolveReceiverTarget, type ReceiverTarget } from "../webhooks/reach.ts";
import { test as authTest } from "./auth.ts";

/**
 * The receiver for the product of the current project, started once per worker on the addresses
 * that product can reach (src/webhooks/reach.ts), stopped at the end. Every delivery is logged to
 * receiver-logs/<run id>.jsonl (secrets redacted).
 */
export interface ReceiverHandle {
  readonly product: ProductId;
  readonly receiver: Receiver;
  readonly target: ReceiverTarget;
  /** URL the PRODUCT must call for this test: `/r/{runId}/{testId}` on the reachable host. */
  urlFor(testId: string): string;
  key(testId: string): PathKey;
}

export const test = authTest.extend<
  object,
  { receiverHandle: ReceiverHandle }
>({
  receiverHandle: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring pattern
    async ({}, use, workerInfo) => {
      const product = productOfProject(workerInfo.project.name);
      if (product === undefined)
        throw new Error(`TEST BUG: project ${workerInfo.project.name} has no product`);
      const target = await resolveReceiverTarget(product, {
        lookup: async (hostname) => (await lookup(hostname, { family: 4 })).address,
      });
      const runId = currentRunPrefix();
      const config = receiverConfig();
      const receiver = await startReceiver({
        hosts: [...new Set([...config.hosts, ...target.bindHosts])],
        port: config.port,
        logFile: path.join("receiver-logs", `${runId}.jsonl`),
      });
      await use({
        product,
        receiver,
        target,
        key: (testId) => ({ runId, testId }),
        urlFor: (testId) => receiver.urlFor({ runId, testId }, target.urlHost),
      });
      await receiver.stop();
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
```

`src/fixtures/twenty-allowlist.ts`: removed. It was the admin-panel allow-list and its warm-up; the allow-list is HR-2's
environment value, so no fixture writes to the product.

### 6.4 Edits to existing modules

`src/auth/twenty.ts`: **no change in this task.** Revision 1 added `setConfigVariable` and `deleteConfigVariable` (an admin-panel
write to the product database) and a `/admin-panel` endpoint. They are removed: a shared product-database write is not a
readiness check, and the allow-list comes from HR-2.

`src/clients/medusa.ts` (diff). It adds `paymentProviders(regionId): Promise<string[]>`, the exact provider id list of a region read before any change (the field name is UNPROBED: the build reads it from the region response and STOPs on a shape it does not know). D6 and the readiness spec use it.

```diff
--- a/src/clients/medusa.ts
+++ b/src/clients/medusa.ts
@@ -8,8 +8,19 @@ export interface MedusaClient {
       CallResult<{ regions: { id: string; name: string; currency_code: string }[] }>
     >;
+    /** POST /admin/regions/{id}: the seed links only Stripe to Europe and nothing to the US region. */
+    setPaymentProviders(regionId: string, providerIds: string[]): Promise<void>;
+    /**
+     * A cart created with an email also creates a guest customer that the store API cannot
+     * delete (probe 2026-11-01, caught by the P2-X-DB-001 leak rule). Deletes every customer whose
+     * email starts with `emailPrefix` through the admin API; returns how many.
+     */
+    deleteCustomersByEmailPrefix(emailPrefix: string): Promise<number>;
   };
   store: {
     createCart(regionId: string, email: string): Promise<string>;
     addLineItem(cartId: string, variantId: string): Promise<void>;
+    firstVariantId(regionId: string): Promise<string>;
+    /** Payment collection for the cart, then a session for the provider; returns the session id. */
+    createPaymentSession(cartId: string, providerId: string): Promise<string>;
   };
   hooks: {
@@ -39,5 +50,21 @@ export function medusaClient(input: {
   const anonymous = createCaller({ request, baseUrl, runPrefix });
   return {
-    admin: { regions: () => admin("GET", "/admin/regions?limit=20&fields=id,name,currency_code") },
+    admin: {
+      regions: () => admin("GET", "/admin/regions?limit=20&fields=id,name,currency_code"),
+      async deleteCustomersByEmailPrefix(emailPrefix) {
+        const found = await admin<{ customers: { id: string; email: string }[] }>(
+          "GET",
+          `/admin/customers?q=${encodeURIComponent(emailPrefix)}&fields=id,email&limit=100`,
+        );
+        const mine = found.body.customers.filter((c) => c.email.startsWith(emailPrefix));
+        for (const customer of mine) await admin("DELETE", `/admin/customers/${customer.id}`);
+        return mine.length;
+      },
+      async setPaymentProviders(regionId, providerIds) {
+        await admin("POST", `/admin/regions/${regionId}`, {
+          body: { payment_providers: providerIds },
+        });
+      },
+    },
     store: {
       async createCart(regionId, email) {
@@ -52,4 +79,32 @@ export function medusaClient(input: {
         });
       },
+      async firstVariantId(regionId) {
+        const res = await store<{ products: { variants: { id: string }[] }[] }>(
+          "GET",
+          `/store/products?limit=1&region_id=${regionId}&fields=id,*variants`,
+        );
+        const id = res.body.products[0]?.variants[0]?.id;
+        if (id === undefined) throw new Error("TEST BUG: the seed has no product variant");
+        return id;
+      },
+      async createPaymentSession(cartId, providerId) {
+        const collection = await store<{ payment_collection: { id: string } }>(
+          "POST",
+          "/store/payment-collections",
+          { body: { cart_id: cartId } },
+        );
+        const session = await store<{
+          payment_collection: { payment_sessions: { id: string }[] };
+        }>(
+          "POST",
+          `/store/payment-collections/${collection.body.payment_collection.id}/payment-sessions`,
+          {
+            body: { provider_id: providerId },
+          },
+        );
+        const id = session.body.payment_collection.payment_sessions[0]?.id;
+        if (id === undefined) throw new Error("TEST BUG: no payment session was created");
+        return id;
+      },
     },
     hooks: {
```

`src/env.ts` (diff)

```diff
--- a/src/env.ts
+++ b/src/env.ts
@@ -49,5 +49,5 @@ const bindHostList = z
   );
 
-// Defaults are the harness's public local defaults (qa-portfolio-harness v0.2.11 src/config.ts),
+// Defaults are the harness's public local defaults (qa-portfolio-harness v0.2.18 src/config.ts),
 // with localhost rewritten to 127.0.0.1. They are not secrets. Never log a URL taken from env.
 const schema = z.object({
```

`playwright.config.ts` (diff)

```diff
--- a/playwright.config.ts
+++ b/playwright.config.ts
@@ -13,5 +13,11 @@ const isCI = Boolean(process.env["CI"]);
 /** One project per product. Folder codes match the project names: cal, doc, med, tw. */
 function apiProject(name: string, code: string): Project {
-  return { name, testMatch: [`{contracts,webhooks,integration}/${code}/**/*.spec.ts`] };
+  return {
+    name,
+    testMatch: [
+      `{contracts,webhooks,integration}/${code}/**/*.spec.ts`,
+      `readiness/${code}.readiness.spec.ts`,
+    ],
+  };
 }
 
```

`eslint.config.mjs` (diff)

```diff
--- a/eslint.config.mjs
+++ b/eslint.config.mjs
@@ -39,5 +39,11 @@ export default tseslint.config(
   },
   {
-    files: ["tests/contracts/**", "tests/webhooks/**", "tests/integration/**"],
+    files: [
+      "tests/contracts/**",
+      "tests/webhooks/**",
+      "tests/integration/**",
+      "tests/readiness/**",
+      "tests/serial/**",
+    ],
     rules: {
       "no-restricted-globals": [
```

### 6.5 Readiness specs

`tests/readiness/med.readiness.spec.ts`

```ts
import { test, expect } from "../../src/fixtures/index.ts";
import { mintMedusa } from "../../src/auth/medusa.ts";
import { loadAuthEnv, requireVar } from "../../src/auth/env.ts";
import { revokeAndVerify } from "../../src/auth/lifecycle.ts";
import { RUN_ID_HEADER } from "../../src/clients/base.ts";
import { readOnlyDb } from "../../src/db/pg.ts";
import { apiBaseUrl } from "../../src/env.ts";
import { runSweep } from "../../src/invariants/engine.ts";
import { retained } from "../../src/invariants/fixture.ts";
import { rulesFor } from "../../src/invariants/rules.ts";
import { connectedRole } from "../../src/readiness/checks.ts";
import { currentRunPrefix, runScopedName } from "../../src/run/prefix.ts";
import { SLO } from "../../src/slo.ts";
import { signStripe } from "../../src/webhooks/sign.ts";

/**
 * Medusa readiness. Needs MEDUSA_REDIS=1 and MEDUSA_STRIPE=1 plus STRIPE_API_KEY and
 * STRIPE_WEBHOOK_SECRET in the environment of `up` (plan Task 5). The round trip uses a payment session of
 * the system provider: the Stripe-signed event carries its id as metadata.session_id and payment-stripe's
 * getWebhookActionAndData needs no Stripe API call. Label: route/signature reachability only (not a MED-WH case).
 * With the Stripe test key (OD-2 option 4) the seed region linked to pp_stripe_stripe is used and nothing is changed.
 */
test.describe("medusa readiness", () => {
  test("the backend answers and the run-id header is not rejected", async ({ request }) => {
    const url = `${apiBaseUrl("medusa")}/health`;
    const plain = await request.get(url);
    const tagged = await request.get(url, { headers: { [RUN_ID_HEADER]: currentRunPrefix() } });
    expect([plain.status(), tagged.status()]).toEqual([200, 200]);
    expect(await tagged.text()).toBe("OK");
  });

  test("the oracle connects as qa_ro in a read-only session", async () => {
    expect(await connectedRole("medusa")).toEqual({ user: "qa_ro", readOnly: "on" });
  });

  test("API keys are minted from the admin login and revoked again; the secret key then answers 401", async () => {
    const env = loadAuthEnv();
    const auth = await mintMedusa({
      baseUrl: apiBaseUrl("medusa"),
      email: requireVar("MEDUSA_ADMIN_EMAIL", env.MEDUSA_ADMIN_EMAIL),
      password: requireVar("MEDUSA_ADMIN_PASSWORD", env.MEDUSA_ADMIN_PASSWORD),
      name: (label) => runScopedName(`ready-${label}`),
    });
    expect(await auth.isAccepted()).toBe(true);
    await revokeAndVerify(auth, () => auth.isAccepted());
  });

  test("route/signature reachability only: a Stripe-signed event authorizes a system-provider payment session", async ({
    med,
  }) => {
    const secret = requireVar("STRIPE_WEBHOOK_SECRET", process.env["STRIPE_WEBHOOK_SECRET"]);
    const regions = (await med.admin.regions()).body.regions;
    const us = regions.find((r) => r.currency_code === "usd");
    expect(us, "the seed has a USD region").toBeDefined();
    const regionId = us?.id ?? "";
    // The exact provider list before any change (not []); restored and asserted in finally.
    const previous = await med.admin.paymentProviders(regionId);
    await med.admin.setPaymentProviders(regionId, ["pp_system_default"]);
    expect(await med.admin.paymentProviders(regionId)).toEqual(["pp_system_default"]);
    const buyer = runScopedName("ready-buyer");
    try {
      const cartId = await med.store.createCart(regionId, `${buyer}@example.test`);
      await med.store.addLineItem(cartId, await med.store.firstVariantId(regionId));
      const sessionId = await med.store.createPaymentSession(cartId, "pp_system_default");
      const payload = JSON.stringify({
        id: `evt_${runScopedName("ready").slice(-12).replaceAll("-", "")}`,
        object: "event",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_ready",
            object: "payment_intent",
            currency: "usd",
            amount: 1000,
            amount_received: 1000,
            metadata: { session_id: sessionId },
          },
        },
      });
      const signed = signStripe({
        payload,
        secret,
        timestampSeconds: Math.floor(Date.now() / 1000),
      });
      expect(
        (await med.hooks.payment("stripe_stripe", signed.body, { ...signed.headers })).status,
      ).toBe(200);
      await expect
        .poll(
          async () =>
            (
              await readOnlyDb("medusa").select<{ status: string }>(
                `SELECT "status" AS status FROM "payment_session" WHERE "id" = $1`,
                [sessionId],
              )
            )[0]?.status,
          { timeout: SLO.medWebhookProcessing.ms, message: "Medusa payment webhook processing" },
        )
        .toBe("authorized");
    } finally {
      await med.admin.deleteCustomersByEmailPrefix(buyer);
      await med.admin.setPaymentProviders(regionId, previous);
      expect(await med.admin.paymentProviders(regionId)).toEqual(previous);
    }
  });

  test("every Medusa invariant rule runs against the live schema and finds nothing", async () => {
    const found = await runSweep(readOnlyDb("medusa"), rulesFor("medusa"), {
      runPrefix: currentRunPrefix(),
      retained,
      includeLeaks: true,
    });
    expect(found).toEqual([]);
  });
});
```

`tests/readiness/doc.readiness.spec.ts`

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../../src/fixtures/index.ts";
import { mintDocumenso } from "../../src/auth/documenso.ts";
import { loadAuthEnv } from "../../src/auth/env.ts";
import { revokeAndVerify } from "../../src/auth/lifecycle.ts";
import { RUN_ID_HEADER } from "../../src/clients/base.ts";
import { readOnlyDb } from "../../src/db/pg.ts";
import { apiBaseUrl } from "../../src/env.ts";
import { runSweep } from "../../src/invariants/engine.ts";
import { retained } from "../../src/invariants/fixture.ts";
import { rulesFor } from "../../src/invariants/rules.ts";
import { connectedRole, productsRoot, randomSecret } from "../../src/readiness/checks.ts";
import { currentRunPrefix, runScopedName } from "../../src/run/prefix.ts";
import { SLO } from "../../src/slo.ts";
import { verifyDocumenso } from "../../src/webhooks/verify.ts";

/**
 * Documenso readiness. Needs Node 24 and a 7 GB heap for the harness build (plan Task 5), the
 * receiver hostname in the hosts file and NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=<that hostname>
 * in the environment of `up` (the list is read once at process start).
 */
test.describe("documenso readiness", () => {
  test("the app answers and the run-id header is not rejected", async ({ request }) => {
    const url = `${apiBaseUrl("documenso")}/api/auth/csrf`;
    const plain = await request.get(url);
    const tagged = await request.get(url, { headers: { [RUN_ID_HEADER]: currentRunPrefix() } });
    expect([plain.status(), tagged.status()]).toEqual([200, 200]);
  });

  test("the oracle connects as qa_ro in a read-only session", async () => {
    expect(await connectedRole("documenso")).toEqual({ user: "qa_ro", readOnly: "on" });
  });

  test("an API token is minted through the session and revoked again, and then answers 401", async () => {
    const env = loadAuthEnv();
    const db = readOnlyDb("documenso");
    const auth = await mintDocumenso({
      baseUrl: apiBaseUrl("documenso"),
      email: env.P2_DOC_USER_EMAIL,
      password: env.P2_DOC_USER_PASSWORD,
      name: (label) => runScopedName(`ready-${label}`),
      teamId: async () => {
        const rows = await db.select<{ id: number }>(
          `SELECT t."id" AS id FROM "Team" t JOIN "Organisation" o ON o."id" = t."organisationId" JOIN "User" u ON u."id" = o."ownerUserId" WHERE u."email" = $1 ORDER BY t."id" LIMIT 1`,
          [env.P2_DOC_USER_EMAIL],
        );
        return rows[0]?.id ?? Number.NaN;
      },
    });
    expect(await auth.isAccepted()).toBe(true);
    await revokeAndVerify(auth, () => auth.isAccepted());
  });

  test("DOCUMENT_CREATED reaches the receiver path with the configured secret header", async ({
    doc,
    receiverHandle,
  }) => {
    const secret = randomSecret();
    const key = receiverHandle.key("doc-ready-wh");
    const webhookId = await doc.webhooks.create({
      webhookUrl: receiverHandle.urlFor("doc-ready-wh"),
      eventTriggers: ["DOCUMENT_CREATED"],
      secret,
    });
    let envelopeId: string | undefined;
    try {
      const pdf = readFileSync(path.join(productsRoot(), "documenso", "assets", "example.pdf"));
      envelopeId = await doc.envelopes.create({
        title: runScopedName("ready-envelope"),
        pdf,
        recipients: [],
      });
      await expect
        .poll(() => receiverHandle.receiver.deliveries(key).length, {
          timeout: SLO.docWebhookDelivery.ms,
          message: "Documenso webhook delivery",
        })
        .toBe(1);
      const delivery = receiverHandle.receiver.deliveries(key)[0];
      expect(verifyDocumenso({ secret, headers: delivery?.headers ?? {} })).toEqual({ ok: true });
      expect(
        (JSON.parse(delivery?.rawBody.toString("utf8") ?? "{}") as { event?: string }).event,
      ).toBe("DOCUMENT_CREATED");
    } finally {
      if (envelopeId !== undefined) await doc.envelopes.remove(envelopeId);
      await doc.webhooks.remove(webhookId);
    }
  });

  test("every Documenso invariant rule runs against the live schema and finds nothing", async () => {
    const found = await runSweep(readOnlyDb("documenso"), rulesFor("documenso"), {
      runPrefix: currentRunPrefix(),
      retained,
      includeLeaks: true,
    });
    expect(found).toEqual([]);
  });
});
```

`tests/readiness/cal.readiness.spec.ts`

```ts
import { test, expect } from "../../src/fixtures/index.ts";
import { mintCal } from "../../src/auth/cal.ts";
import { loadAuthEnv } from "../../src/auth/env.ts";
import { revokeAndVerify } from "../../src/auth/lifecycle.ts";
import { readOnlyDb } from "../../src/db/pg.ts";
import { loadEnv } from "../../src/env.ts";
import { rulesFor } from "../../src/invariants/rules.ts";
import { connectedRole, randomSecret } from "../../src/readiness/checks.ts";
import { runScopedName, currentRunPrefix } from "../../src/run/prefix.ts";
import { RUN_ID_HEADER } from "../../src/clients/base.ts";
import { SLO } from "../../src/slo.ts";
import { verifyCal } from "../../src/webhooks/verify.ts";
import { runSweep } from "../../src/invariants/engine.ts";
import { retained } from "../../src/invariants/fixture.ts";

/**
 * Cal readiness. The harness (v0.2.18) starts the web app on 3000 and Postgres 18 only; API v2 on
 * 5555 is not started, so everything here goes through the web app (plan Task 5, HR-1).
 */
const web = (): string => loadEnv().CAL_BASE_URL.replace(/\/$/, "");

test.describe("cal readiness", () => {
  test("the web app answers and the run-id header is not rejected", async ({ request }) => {
    const plain = await request.get(`${web()}/api/auth/csrf`);
    const tagged = await request.get(`${web()}/api/auth/csrf`, {
      headers: { [RUN_ID_HEADER]: currentRunPrefix() },
    });
    expect([plain.status(), tagged.status()]).toEqual([200, 200]);
  });

  test("the oracle connects as qa_ro in a read-only session", async () => {
    expect(await connectedRole("cal")).toEqual({ user: "qa_ro", readOnly: "on" });
  });

  test("an API key is minted through the web app and revoked again, with the row gone", async () => {
    const env = loadAuthEnv();
    const db = readOnlyDb("cal");
    const auth = await mintCal({
      baseUrl: web(),
      email: env.P2_CAL_USER_EMAIL,
      password: env.P2_CAL_USER_PASSWORD,
      name: (label) => runScopedName(`ready-${label}`),
      keyId: async (note) =>
        (
          await db.select<{ id: string }>(`SELECT "id" AS id FROM "ApiKey" WHERE "note" = $1`, [
            note,
          ])
        )[0]?.id,
    });
    expect(await auth.isPresent()).toBe(true);
    await revokeAndVerify(auth, () => auth.isPresent());
  });

  test("a signed webhook reaches the receiver path with an HMAC over the raw bytes", async ({
    cal,
    receiverHandle,
  }) => {
    const secret = randomSecret();
    const key = receiverHandle.key("cal-ready-wh");
    const id = await cal.webhooks.create({
      subscriberUrl: receiverHandle.urlFor("cal-ready-wh"),
      eventTriggers: ["BOOKING_CREATED"],
      secret,
    });
    try {
      await cal.webhooks.testTrigger({
        url: receiverHandle.urlFor("cal-ready-wh"),
        secret,
        type: "BOOKING_CREATED",
      });
      await expect
        .poll(() => receiverHandle.receiver.deliveries(key).length, {
          timeout: SLO.calWebhookDelivery.ms,
          message: "Cal webhook delivery",
        })
        .toBe(1);
      const delivery = receiverHandle.receiver.deliveries(key)[0];
      expect(delivery).toBeDefined();
      expect(
        verifyCal({ secret, rawBody: delivery?.rawBody ?? "", headers: delivery?.headers ?? {} }),
      ).toEqual({ ok: true });
    } finally {
      await cal.webhooks.remove(id);
    }
  });

  test("every Cal invariant rule runs against the live schema and finds nothing", async () => {
    const found = await runSweep(readOnlyDb("cal"), rulesFor("cal"), {
      runPrefix: currentRunPrefix(),
      retained,
      includeLeaks: true,
    });
    expect(found).toEqual([]);
  });

  test("API v2 answers on CAL_API_BASE_URL (HR-1; the path /v2/health is UNPROBED until HR-1 is tagged)", async ({
    request,
  }) => {
    const res = await request.get(`${loadEnv().CAL_API_BASE_URL}/v2/health`);
    expect(res.status()).toBe(200);
  });
});
```

`tests/readiness/tw.readiness.spec.ts`

```ts
import { test, expect } from "../../src/fixtures/index.ts";
import { loadAuthEnv } from "../../src/auth/env.ts";
import { revokeAndVerify } from "../../src/auth/lifecycle.ts";
import { mintTwenty } from "../../src/auth/twenty.ts";
import { RUN_ID_HEADER } from "../../src/clients/base.ts";
import { readOnlyDb } from "../../src/db/pg.ts";
import { apiBaseUrl } from "../../src/env.ts";
import { runSweep } from "../../src/invariants/engine.ts";
import { retained } from "../../src/invariants/fixture.ts";
import { rulesFor } from "../../src/invariants/rules.ts";
import { connectedRole, randomSecret, recordIdOf } from "../../src/readiness/checks.ts";
import { canaryPrecondition, CANARY_MAX_TRIGGERS } from "../../src/readiness/canary.ts";
import { currentRunPrefix, runScopedName } from "../../src/run/prefix.ts";
import { CANARY_MARGIN_MS, SLO, TWENTY_WEBHOOK_MEMO_MS } from "../../src/slo.ts";
import { verifyTwenty } from "../../src/webhooks/verify.ts";

/**
 * Twenty readiness. The server runs in Docker; the receiver's name is on the outbound allow-list from the
 * environment of `up` (HR-2, src/webhooks/reach.ts). No admin-panel write and no warm-up loop.
 */
test.describe("twenty readiness", () => {
  test("the server answers and the run-id header is not rejected", async ({ request }) => {
    const url = `${apiBaseUrl("twenty")}/healthz`;
    const plain = await request.get(url);
    const tagged = await request.get(url, { headers: { [RUN_ID_HEADER]: currentRunPrefix() } });
    expect([plain.status(), tagged.status()]).toEqual([200, 200]);
  });

  test("the oracle connects as qa_ro in a read-only session", async () => {
    expect(await connectedRole("twenty")).toEqual({ user: "qa_ro", readOnly: "on" });
  });

  test("an API key is minted from the workspace login and revoked again; the key then answers 403", async () => {
    const env = loadAuthEnv();
    const auth = await mintTwenty({
      baseUrl: apiBaseUrl("twenty"),
      email: env.TWENTY_EMAIL,
      password: env.TWENTY_PASSWORD,
      name: (label) => runScopedName(`ready-${label}`),
    });
    expect(await auth.isAccepted()).toBe(true);
    await revokeAndVerify(auth, () => auth.isAccepted());
  });

  test("person.created: canary precondition, then one real event asserted once by record id", async ({
    tw,
    receiverHandle,
  }) => {
    const secret = randomSecret(); // per run; the literal "warmup-warmup-warmup" of revision 1 is gone
    const key = receiverHandle.key("tw-ready-wh");
    const people: string[] = [];
    const createdAt = Date.now();
    let webhookId: string | undefined;
    try {
      webhookId = await tw.webhooks.create({
        targetUrl: receiverHandle.urlFor("tw-ready-wh"),
        operations: ["person.created"],
        secret,
        description: runScopedName("ready-webhook"),
      });
      let canaryId: string | undefined;
      const canaryDelivered = (): boolean =>
        canaryId !== undefined &&
        receiverHandle.receiver.deliveries(key).some((d) => recordIdOf(d) === canaryId);

      // Precondition (asserted): the webhook is visible to the worker within the memo-derived bound.
      const canaryTriggers = await canaryPrecondition({
        trigger: async () => {
          canaryId = await tw.people.create(runScopedName("ready-canary"));
          people.push(canaryId);
        },
        delivered: canaryDelivered,
        elapsedMs: () => Date.now() - createdAt,
        waitUntil: async (predicate, timeoutMs, message) => {
          await expect.poll(predicate, { timeout: timeoutMs, message }).toBe(true);
        },
        memoTtlMs: TWENTY_WEBHOOK_MEMO_MS,
        deliveryMs: SLO.twWebhookDelivery.ms,
        marginMs: CANARY_MARGIN_MS,
      });
      expect(canaryTriggers, "canary triggers within the memo-derived bound").toBeLessThanOrEqual(
        CANARY_MAX_TRIGGERS,
      );

      // The real event: fired once, asserted by its own record id.
      const realId = await tw.people.create(runScopedName("ready-real"));
      people.push(realId);
      await expect
        .poll(
          () =>
            receiverHandle.receiver.deliveries(key).filter((d) => recordIdOf(d) === realId).length,
          { timeout: SLO.twWebhookDelivery.ms, message: "Twenty real event delivered" },
        )
        .toBe(1);
      const delivery = receiverHandle.receiver.deliveries(key).find((d) => recordIdOf(d) === realId);
      expect(
        verifyTwenty({
          secret,
          rawBody: delivery?.rawBody ?? "",
          headers: delivery?.headers ?? {},
          nowMs: Date.now(),
          toleranceMs: null,
        }),
      ).toEqual({ ok: true });
    } finally {
      for (const id of people) await tw.people.remove(id);
      if (webhookId !== undefined) await tw.webhooks.remove(webhookId);
    }
  });

  test("every Twenty invariant rule runs against the live schemas and finds nothing", async () => {
    const found = await runSweep(readOnlyDb("twenty"), rulesFor("twenty"), {
      runPrefix: currentRunPrefix(),
      retained,
      includeLeaks: true,
    });
    expect(found).toEqual([]);
  });
});
```

### 6.6 Scripts, hook and Cursor start command

`scripts/harness-seed.mjs`

```js
// Runs the harness's own seed() for one product (plan Task 5). The harness owns what is seeded; this
// script only calls it, because `up` does not seed Medusa (admin user) or Twenty (workspace users).
//   node scripts/harness-seed.mjs <medusa|twenty>
// Needs the product running and, for Medusa, MEDUSA_ADMIN_EMAIL / MEDUSA_ADMIN_PASSWORD in the
// environment. Prints the product and the account emails, never a password or a token.
import { getAdapter } from "qa-portfolio-harness";

const id = process.argv[2];
if (id !== "medusa" && id !== "twenty") {
  console.error("usage: node scripts/harness-seed.mjs <medusa|twenty>");
  process.exit(2);
}
try {
  const result = await getAdapter(id).seed();
  console.log(
    `harness seed ${id} ok: ${result.users.map((user) => user.email).join(", ") || "(no users)"}`,
  );
} catch (error) {
  console.error(
    `harness seed ${id} FAILED: ${error instanceof Error ? error.message.split("\n")[0] : "unknown error"}`,
  );
  process.exit(1);
}
```

`scripts/ensure-receiver-hostname.sh`

```bash
#!/usr/bin/env bash
# Documenso refuses a literal private or loopback webhook URL when the webhook is CREATED, so the
# receiver is reached through a hostname that resolves to 127.0.0.1 (plan Task 5). This adds that name
# to the hosts file once. Idempotent. Needs root or passwordless sudo (Claude Code cloud: root;
# Cursor cloud and GitHub runners: sudo). Usage: bash scripts/ensure-receiver-hostname.sh [hostname]
set -euo pipefail
HOSTNAME_TO_ADD="${1:-p2-receiver.test}"
case "$HOSTNAME_TO_ADD" in
  *[!a-z0-9.-]* | "" ) echo "[hosts] invalid hostname" >&2; exit 2 ;;
esac
HOSTS_FILE="${P2_HOSTS_FILE:-/etc/hosts}"
if grep -Eq "^127\.0\.0\.1[[:space:]]+.*\b${HOSTNAME_TO_ADD//./\\.}\b" "$HOSTS_FILE"; then
  echo "[hosts] $HOSTNAME_TO_ADD already maps to 127.0.0.1"
  exit 0
fi
SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi
printf '127.0.0.1 %s\n' "$HOSTNAME_TO_ADD" | $SUDO tee -a "$HOSTS_FILE" >/dev/null
echo "[hosts] added $HOSTNAME_TO_ADD -> 127.0.0.1"
```

`.claude/hooks/session-start.sh` (diff). No heap variable: the heap is HR-3's job. Output of both scripts is printed on failure,
never discarded; a failure is a WARNING and the hook never blocks the session.

```diff
--- a/.claude/hooks/session-start.sh
+++ b/.claude/hooks/session-start.sh
@@ -8,5 +8,15 @@ if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
     echo 'export NODE24=/opt/node24/bin/node' >> "$CLAUDE_ENV_FILE"
   fi
 fi
+# Idempotent password setup (scripts/qa-passwords.sh, through npm run qa:passwords).
+if ! passwords_out=$(cd "${CLAUDE_PROJECT_DIR:-.}" && npm run -s qa:passwords 2>&1); then
+  echo "WARNING: npm run qa:passwords failed; the product stacks cannot start until it passes:"
+  echo "$passwords_out"
+fi
+# Documenso webhooks reach the receiver through a hostname that resolves to 127.0.0.1 (plan Task 5).
+if ! hosts_out=$(bash "${CLAUDE_PROJECT_DIR:-.}/scripts/ensure-receiver-hostname.sh" 2>&1); then
+  echo "WARNING: scripts/ensure-receiver-hostname.sh failed; Documenso webhook tests cannot reach the receiver:"
+  echo "$hosts_out"
+fi
 if command -v dockerd >/dev/null && ! docker info >/dev/null 2>&1; then
```

`.cursor/environment.json` (diff)

```diff
--- a/.cursor/environment.json
+++ b/.cursor/environment.json
@@ -4,4 +4,4 @@
   },
   "install": "bash scripts/cloud-install.sh",
-  "start": "sudo service docker start"
+  "start": "sudo service docker start && { bash scripts/ensure-receiver-hostname.sh || echo 'WARNING: ensure-receiver-hostname.sh failed'; } && { npm run -s qa:passwords || echo 'WARNING: npm run qa:passwords failed'; }"
 }
```

### 6.7 `.env.example` and `AGENTS.md`

`.env.example`, append after the Task 4 lines (names only):

```text
# Stripe test-mode values (OD-2 option 4, recommended): CI and cloud secrets, never committed. STRIPE_API_KEY is a
# sk_test_ key and STRIPE_WEBHOOK_SECRET a whsec_ value; Medusa's payment-stripe provider reads both (MEDUSA_STRIPE=1).
STRIPE_API_KEY=
STRIPE_WEBHOOK_SECRET=
```

`AGENTS.md`, under "Cursor Cloud specific instructions" add (and in the same edit replace the personal name on the
commit-note line by "the maintainer"):

```text
- `scripts/ensure-receiver-hostname.sh` and `npm run qa:passwords` run from the `start` command (both idempotent).
  Stripe test-mode keys are CI and cloud secrets (`STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`).
```

and under "Claude Code cloud specific instructions":

```text
- `.claude/hooks/session-start.sh` runs `npm run qa:passwords` and `scripts/ensure-receiver-hostname.sh` (root or sudo)
  and prints a WARNING with the script's output for either failure. Product readiness runbook: `docs/plans/2026-11-01-p2-task5-env-prereqs-readiness.md` section 8.
```

### 6.8 Unit tests (exact names are the contract)

`tests/unit/webhooks/reach.test.ts`

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DOCUMENSO_RECEIVER_HOSTNAME,
  PRODUCT_REACH,
  ReachError,
  resolveReceiverTarget,
  TWENTY_COMPOSE_NETWORK,
} from "../../../src/webhooks/reach.ts";

const lookupTo = (address: string) => (): Promise<string> => Promise.resolve(address);

describe("receiver reach per product", () => {
  test("the table matches the probes: cal and documenso on the host, twenty in a container, medusa inbound only", () => {
    assert.deepEqual(PRODUCT_REACH, {
      cal: { kind: "host-loopback", urlHost: "127.0.0.1" },
      documenso: { kind: "host-loopback", urlHost: DOCUMENSO_RECEIVER_HOSTNAME },
      medusa: { kind: "none" },
      twenty: { kind: "container-gateway", network: TWENTY_COMPOSE_NETWORK },
    });
    assert.equal(TWENTY_COMPOSE_NETWORK, "qa-harness-twenty_default");
  });

  test("cal binds and calls loopback without any lookup", async () => {
    const target = await resolveReceiverTarget("cal", {
      lookup: () => Promise.reject(new Error("must not be called")),
    });
    assert.deepEqual(target, { bindHosts: ["127.0.0.1"], urlHost: "127.0.0.1" });
  });

  test("documenso needs a hostname that resolves to 127.0.0.1", async () => {
    const ok = await resolveReceiverTarget("documenso", { lookup: lookupTo("127.0.0.1") });
    assert.deepEqual(ok, { bindHosts: ["127.0.0.1"], urlHost: "p2-receiver.test" });
    await assert.rejects(
      resolveReceiverTarget("documenso", { lookup: lookupTo("93.184.216.34") }),
      (e: unknown) =>
        e instanceof ReachError &&
        /must resolve to 127\.0\.0\.1 \(found 93\.184\.216\.34\).*hosts file/.test(e.message),
    );
    await assert.rejects(
      resolveReceiverTarget("documenso", { lookup: () => Promise.reject(new Error("ENOTFOUND")) }),
      /found unresolved/,
    );
  });

  test("twenty binds loopback plus the compose gateway and is called by host.docker.internal", async () => {
    const asked: string[][] = [];
    const target = await resolveReceiverTarget("twenty", {
      lookup: lookupTo("127.0.0.1"),
      docker: (args) => {
        asked.push([...args]);
        return Promise.resolve("172.18.0.1\n");
      },
    });
    assert.deepEqual(target, {
      bindHosts: ["127.0.0.1", "172.18.0.1"],
      urlHost: "host.docker.internal",
    });
    assert.deepEqual(asked[0]?.slice(0, 3), ["network", "inspect", "qa-harness-twenty_default"]);
  });

  test("twenty without its stack up is an ENV error that names the network", async () => {
    await assert.rejects(
      resolveReceiverTarget("twenty", {
        lookup: lookupTo("127.0.0.1"),
        docker: () => Promise.reject(new Error("docker network failed (exit 1)")),
      }),
      (e: unknown) =>
        e instanceof ReachError &&
        e.message.startsWith("ENV:") &&
        e.message.includes("qa-harness-twenty_default"),
    );
  });

  test("medusa has no outgoing webhook and refuses a receiver URL", async () => {
    await assert.rejects(
      resolveReceiverTarget("medusa", { lookup: lookupTo("127.0.0.1") }),
      /no outgoing webhook/,
    );
  });
});
```

`tests/unit/readiness/checks.test.ts`

```ts
import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { productsRoot, randomSecret } from "../../../src/readiness/checks.ts";
import { SLO, TWENTY_CONFIG_REFRESH_MS, TWENTY_WEBHOOK_VISIBLE_MS } from "../../../src/slo.ts";

describe("readiness helpers", () => {
  test("randomSecret is 32 hex characters and different each time", () => {
    const a = randomSecret();
    assert.match(a, /^[0-9a-f]{32}$/);
    assert.notEqual(a, randomSecret());
  });

  test("productsRoot uses PRODUCTS_ROOT, ignores blank, and defaults next to the repo", () => {
    assert.equal(productsRoot({ PRODUCTS_ROOT: "/srv/products" }), path.resolve("/srv/products"));
    assert.equal(
      productsRoot({ PRODUCTS_ROOT: "  " }),
      path.resolve(process.cwd(), "..", "products"),
    );
    assert.equal(productsRoot({}), path.resolve(process.cwd(), "..", "products"));
  });
});

const ms = (name: keyof typeof SLO): number => SLO[name].ms;

describe("SLO budgets", () => {
  test("every budget is a positive whole number of ms with a stated basis that names its source", () => {
    for (const [name, slo] of Object.entries(SLO)) {
      assert.ok(Number.isInteger(slo.ms) && slo.ms >= 1_000, name);
      assert.ok(slo.basis.length > 30, name);
    }
  });

  test("the Twenty budgets cover the lazy-application cycles they are derived from", () => {
    assert.ok(ms("twConfigPropagation") >= 2 * TWENTY_CONFIG_REFRESH_MS);
    assert.ok(ms("twWebhookDelivery") >= 2 * TWENTY_WEBHOOK_VISIBLE_MS);
    assert.ok(ms("docWebhookDelivery") >= 10_000, "Documenso times a call out at 10_000 ms");
    assert.ok(
      ms("medWebhookProcessing") >= 5_000,
      "Medusa delays the event by webhook_delay (5000 ms)",
    );
  });
});
```

`tests/unit/readiness/canary.test.ts`

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CANARY_MAX_TRIGGERS, canaryPrecondition } from "../../../src/readiness/canary.ts";

const MEMO = 10_000;
const MARGIN = 500;
const DELIVERY = 35_000;

/** A fake clock and a fake Twenty: an event sent before `visibleAt` is dropped (the memo). No timers. */
function fake(visibleAt: number, failTrigger = false) {
  let clock = 0;
  let delivered = false;
  const sent: number[] = [];
  const input = {
    trigger: (): Promise<void> => {
      if (failTrigger) return Promise.reject(new Error("create failed"));
      sent.push(clock);
      if (clock >= visibleAt) delivered = true;
      return Promise.resolve();
    },
    delivered: () => delivered,
    elapsedMs: () => clock,
    waitUntil: (predicate: () => boolean, timeoutMs: number, message: string): Promise<void> => {
      const end = clock + timeoutMs;
      while (!predicate()) {
        if (clock >= end) return Promise.reject(new Error(`timed out: ${message}`));
        clock += 500;
      }
      return Promise.resolve();
    },
    memoTtlMs: MEMO,
    deliveryMs: DELIVERY,
    marginMs: MARGIN,
  };
  return { input, sent };
}

describe("canaryPrecondition", () => {
  test("a canary delivered inside the first window needs one trigger", async () => {
    const f = fake(0);
    assert.equal(await canaryPrecondition(f.input), 1);
    assert.deepEqual(f.sent, [0]);
  });

  test("a canary dropped by the memo is sent once more, after one memo window, and that one is delivered", async () => {
    const f = fake(MEMO);
    const triggers = await canaryPrecondition(f.input);
    assert.equal(triggers, 2);
    assert.deepEqual(f.sent, [0, MEMO]);
    assert.ok(triggers <= CANARY_MAX_TRIGGERS);
  });

  test("a canary never delivered fails after the second trigger, with no third", async () => {
    const f = fake(Number.POSITIVE_INFINITY);
    await assert.rejects(canaryPrecondition(f.input), /timed out: canary delivered/);
    assert.equal(f.sent.length, CANARY_MAX_TRIGGERS);
  });

  test("the bound is two triggers, one at creation and one after one memo window", () => {
    assert.equal(CANARY_MAX_TRIGGERS, 2);
  });

  test("a failing trigger surfaces its error instead of being retried", async () => {
    const f = fake(0, true);
    await assert.rejects(canaryPrecondition(f.input), /create failed/);
    assert.equal(f.sent.length, 0);
  });
});
```

`tests/unit/auth/flows.test.ts`: no change in this task (the admin-panel test of revision 1 is removed with
`setConfigVariable`).

Counts: `reach.test.ts` 6, `checks.test.ts` 4, `canary.test.ts` 5, `flows.test.ts` 0 = **15**.

## 7. Data isolation, cleanup and leak check

- Everything the specs create carries the run prefix and is removed in `finally`: Cal webhook; Documenso webhook and envelope;
  Medusa guest customer (deleted through the admin API); Medusa cart, **named with the run prefix and retained by id** in the
  retained list (the leak rule for carts is not widened; the system-provider session leaves it); the region's provider list
  restored to the exact list read, and asserted (D6); Twenty person(s) and webhook.
- No test writes an allow-list variable to Twenty: the allow-list is HR-2's environment value.
- The P2-X-DB-001 sweep runs after every test (Task 3) and each spec also runs all rules of its product once.
- Credentials: worker-scoped, revoked and verified dead at worker end (Task 4); `retained` covers them meanwhile.
- Roles: provisioned before and torn down after each product run (section 8).
- Hosts file: one line, idempotent, left in place (it is a name for 127.0.0.1).

## 8. Build steps (repo root; on any differing output STOP and paste it; one stack at a time, always ending with `down`)

0. Branch from the Task 4 head, record the SHA. `export PATH="/usr/local/bin:$PATH"`; `npm ci && npm run check` -> `# tests 250`.
   **Harness release acceptance (HR-1, HR-2, HR-3 tagged `v0.3.0`; index section 8).** Run before step 1; a failing check is a STOP:
   - HR-1: `node $H/up.mjs cal`; `curl -sf "$CAL_API_BASE_URL/v2/health"` returns 200 (the path is UNPROBED until HR-1 is tagged);
     after `down`, `ss -ltn | grep -c ':5555 '` prints `0`.
   - HR-2: `docker exec <twenty server container> getent hosts host.docker.internal` prints a gateway address;
     `docker exec <twenty server container> printenv OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS` prints the value given to `up`.
   - HR-3: with `NODE_OPTIONS=--use-openssl-ca` preset and no heap variable exported by this plan,
     `node -e 'console.log(require("v8").getHeapStatistics().heap_size_limit >= 7e9)'` prints `true` under the harness environment,
     and the Documenso `up` build passes.
1. Harness pin (6.1). `npm run check` still `# tests 250`. Commit 1.
2. `src/slo.ts`, `src/webhooks/reach.ts`, `src/readiness/*.ts`, their unit tests and the `twenty.ts`/`medusa.ts` edits. `node --test tests/unit/webhooks/reach.test.ts tests/unit/readiness/*.test.ts` -> all pass. Commit 2.
3. `src/fixtures/index.ts`, the four specs, `playwright.config.ts`, `eslint.config.mjs`. `npx playwright test --list` -> `Total: 21 tests in 4 files`; `npm run check` -> `# tests 265`. Commit 3.
4. Scripts, hook, Cursor command, `.env.example`, `AGENTS.md`. `shellcheck scripts/*.sh .claude/hooks/*.sh`
   (install: `python3 -m pip install --target /tmp/shc shellcheck-py`, binary `/tmp/shc/bin/shellcheck`) exits 0;
   `node -e "JSON.parse(require('fs').readFileSync('.cursor/environment.json'))"` prints nothing. Commit 4.
5. **Live runs, one product at a time.** Each block ends with `down`. A non-zero exit or a timeout prints the log tail and is a
   STOP (section 14), not a retry. The timeouts are 1.5 x the probed cold start (section 2.7): Medusa 6 min, Documenso 17 min,
   Cal 18 min, Twenty 3 min. Common prelude:
   ```bash
   npm run qa:passwords && set -a && . ./.env && set +a
   export PRODUCTS_ROOT="${PRODUCTS_ROOT:-$(cd .. && pwd)/products}"
   bash scripts/bootstrap.sh <medusa|documenso|cal|twenty>      # idempotent
   H=node_modules/qa-portfolio-harness/scripts
   ```
   *Medusa*
   ```bash
   export MEDUSA_REDIS=1 MEDUSA_STRIPE=1
   : "${STRIPE_API_KEY:=sk_test_$(openssl rand -hex 12)}"         # option 4: the test key from the secrets; else the fallback (c)
   : "${STRIPE_WEBHOOK_SECRET:=whsec_$(openssl rand -hex 16)}"
   export STRIPE_API_KEY STRIPE_WEBHOOK_SECRET
   export MEDUSA_ADMIN_EMAIL=qa-admin@example.test MEDUSA_ADMIN_PASSWORD="$(openssl rand -hex 12)"
   timeout 360 node $H/up.mjs medusa || { tail -n 80 <up log>; STOP; }  && node scripts/harness-seed.mjs medusa   # "harness seed medusa ok: ..."
   npm run db:roles:provision -- medusa                                   # "db-roles provision: medusa ok"
   npx playwright test --project=med-api tests/readiness/med.readiness.spec.ts   # "5 passed" (run it twice)
   npm run db:roles:teardown -- medusa; node $H/down.mjs medusa
   ```
   *Documenso* (Node 24 for the harness commands, Node 22 for the tests; no heap variable: HR-3 is in the tagged release)
   ```bash
   bash scripts/ensure-receiver-hostname.sh
   export NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=p2-receiver.test
   PATH="$(dirname "$NODE24"):$PATH" timeout 1020 node $H/up.mjs documenso || { tail -n 80 <up log>; STOP; }   # ~11 min cold
   npm run db:roles:provision -- documenso
   npx playwright test --project=doc-api tests/readiness/doc.readiness.spec.ts   # "5 passed" (twice)
   npm run db:roles:teardown -- documenso; PATH="$(dirname "$NODE24"):$PATH" node $H/down.mjs documenso
   ```
   *Cal*
   ```bash
   export DAILY_WEBHOOK_SECRET="$(head -c 32 /dev/urandom | base64)" CRON_API_KEY="$(openssl rand -hex 16)"
   timeout 1080 node $H/up.mjs cal || { tail -n 80 <up log>; STOP; }   # ~12 min cold
   npm run db:roles:provision -- cal
   npx playwright test --project=cal-api tests/readiness/cal.readiness.spec.ts   # "6 passed" (twice; the /v2 test runs)
   npm run db:roles:teardown -- cal; node $H/down.mjs cal
   ```
   *Twenty*
   ```bash
   export OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS=host.docker.internal   # HR-2: the allow-list value (UNPROBED until HR-2 is tagged)
   timeout 180 node $H/up.mjs twenty || { tail -n 80 <up log>; STOP; } && node scripts/harness-seed.mjs twenty   # up ~2 min, seed ~2 min
   npm run db:roles:provision -- twenty
   npx playwright test --project=tw-api tests/readiness/tw.readiness.spec.ts     # "5 passed" (twice)
   npm run db:roles:teardown -- twenty; TWENTY_DOWN_VOLUMES=1 node $H/down.mjs twenty
   ```
   The record-id field of the Twenty payload (`recordIdOf`) is UNPROBED in this plan (Task 2, section 2 does not record it). The
   first Twenty run reads it from the receiver log; if the field is absent, it is a STOP (section 14).
6. If a stack cannot start, or Docker is missing, or a host is blocked (proxy 403, ENOTFOUND): ENV finding, STOP.
   Mark that product's runs "UNPROBED in the build session" in the PR and report the task PARTIAL. Never skip silently.

## 9. Done criteria (machine-checkable)

```bash
npm run check                                   # exit 0; "# tests 265" "# pass 265" "# fail 0"
npx playwright test --list | tail -1            # "Total: 21 tests in 4 files"
npm run list:api | tail -1                      # same listing
node -e 'console.log(require("./node_modules/qa-portfolio-harness/package.json").version)'   # 0.3.0
shellcheck scripts/*.sh .claude/hooks/*.sh      # exit 0
grep -rnE 'setTimeout|setInterval|waitForTimeout' tests/readiness src/fixtures src/readiness ; test $? -eq 1   # no sleep
grep -rnE 'test\.fixme|triggers-needed|setConfigVariable|deleteConfigVariable|admin-panel|warmup-warmup' tests src ; test $? -eq 1   # no fixme, no annotated bound, no admin write, no literal secret
grep -rnE 'max-old-space|NODE_OPTIONS=' .claude scripts .cursor AGENTS.md .env.example ; test $? -eq 1   # no global heap variable (HR-3 owns it)
# live (section 8.5), for every product that could start:
#   med-api 5 passed | doc-api 5 passed | cal-api 6 passed | tw-api 5 passed, each twice in a row
grep -rlE 'sk_test_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|api_[A-Za-z0-9]{16,}|cal_[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,}' receiver-logs fixture-logs test-results playwright-report 2>/dev/null ; test $? -eq 1   # no secret in any artefact
git status --porcelain                          # empty after the commits (receiver-logs/, fixture-logs/, test-results/ are ignored)
git diff <task4-head>..HEAD -- . ':(exclude)tests/unit' | grep -E '^\+' | grep -nE 'sk_live_|sk_test_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|Bearer [A-Za-z0-9._-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY' ; test $? -eq 1
git diff <task4-head>..HEAD | grep -E '^\+' | grep -niE 'j[a]yami|h[e]ttigoda' ; test $? -eq 1
git log <task4-head>..HEAD --format=%B | grep -iE 'co-?authored-?by|generated[ ]with|claude-?session' ; test $? -eq 1   # no trailers, checked before any push
docker ps --format '{{.Names}}'                 # empty: every stack is down
```

(The lockfile's harness line necessarily contains the repository owner's handle in its URL; it is a path, not text
written by this task, and it is not matched by the scan because the pin edit is not an added line of the pattern.)

## 10. Self-verification

From a clean `npm ci` and a clean `.env` (delete it, run `npm run qa:passwords`), repeat the runbook for every
product and paste, per product: the `up` and `seed` last lines, the provision and teardown lines, both
`playwright` summaries and the `down` line. Paste the `receiver-logs/*.jsonl` first line of one product to show
redaction. No result may be claimed without pasted output.

## 11. Commit plan (lowercase Conventional Commits, explicit paths, never `git add -A`)

1. `build(harness): move the pin to v0.3.0` - `package.json package-lock.json src/env.ts`
2. `feat(readiness): add slo budgets, reach table and the canary precondition` - `src/slo.ts src/webhooks/reach.ts src/readiness/checks.ts src/readiness/canary.ts src/clients/medusa.ts tests/unit/webhooks/reach.test.ts tests/unit/readiness/checks.test.ts tests/unit/readiness/canary.test.ts`
3. `test(readiness): add a readiness spec per product` - `src/fixtures/index.ts tests/readiness/cal.readiness.spec.ts tests/readiness/doc.readiness.spec.ts tests/readiness/med.readiness.spec.ts tests/readiness/tw.readiness.spec.ts playwright.config.ts eslint.config.mjs`
4. `chore(env): qa-passwords, hostname and hook setup for cloud sessions` - `scripts/harness-seed.mjs scripts/ensure-receiver-hostname.sh .claude/hooks/session-start.sh .cursor/environment.json .env.example AGENTS.md`

PR title: `test(readiness): add environment prerequisites and a readiness check per product`. No trailers.

## 12. Environment changes

Automatic from the repo (after this PR is merged and the environment rebuilt):

- **Cursor cloud:** `.cursor/environment.json` `start` runs `scripts/ensure-receiver-hostname.sh` and `npm run qa:passwords`,
  both idempotent; a failure prints a WARNING and the start continues. The `install` step (`scripts/cloud-install.sh`) and
  `.cursor/Dockerfile` are unchanged (Node 22.23, Node 24, Docker, `poppler-utils` are already there).
- **Claude Code cloud:** `.claude/hooks/session-start.sh` runs `npm run qa:passwords` and `scripts/ensure-receiver-hostname.sh`
  and prints the output of a failure as a WARNING. It sets no heap variable. The setup script is unchanged.
- `npm ci` installs the harness `v0.3.0` (build of its `dist` through `prepare`).

Pasted by hand (environment secrets and network policy; the only manual items):

| Environment | Item | Why |
|---|---|---|
| Cursor cloud and Claude Code cloud | `STRIPE_API_KEY` (a Stripe test-mode `sk_test_` key) and `STRIPE_WEBHOOK_SECRET` (`whsec_`) as secrets | OD-2 option (4), recommended; never committed |
| Cursor cloud and Claude Code cloud | the network allow-list entry `api.stripe.com` | option (4) needs the host reachable; the cloud allow-list is UNPROBED for it |
| GitHub Actions (CI) | the same two secrets, and the first-run probe of `api.stripe.com` (section 13, OD-2) | option (4) |

Manual repository setting: none in this PR (required check names: Task 6).

UNPROBED on Cursor cloud: its RAM (the 8 GB heap assumed by the harness is HR-3's concern, and needs at least 12 GB) and whether
passwordless `sudo` exists at `start` (the Dockerfile grants it to `ubuntu`).

## 13. Will NOT do / Open decisions / Risks

Will NOT do: edit the harness, a fork or `node_modules`; start two stacks at once; use stripe-mock; run a lane case;
set `DANGEROUS_BYPASS_RATE_LIMITS`; commit a hosts-file change; skip a blocked check silently; write to a product's
database through its admin panel; export a heap variable (HR-3 owns it).

| ID | Question | Options | Evidence | Recommended default |
|---|---|---|---|---|
| OD-1 | Twenty needs HR-2 for the allow-list, `host.docker.internal` and the billing variables | (a) HR-2 required, environment route; (b) an admin-panel write | 2.1, 2.3 | (a): HR-2 is **required** and tagged before this task; no admin-panel write |
| OD-2 | Stripe-dependent rows (Documenso STR-002/003, Twenty STR, Medusa flow) | (4) a Stripe test-mode key as CI and cloud secrets, against `api.stripe.com`; (c) unit-level only. Rejected: stripe-mock (no host option), TLS interception, a fork change | 2.5 (sandbox proxy 403 re-check) | (4). The first CI run probes `curl -s -o /dev/null -w '%{http_code}' https://api.stripe.com/v1/charges`: expect `401` (UNPROBED expectation); any other code is an ENV finding and the fallback is (c). Not BLOCKING |
| OD-3 | P2-TW-WH-004 expects 5 requests; the pinned code and image give 1 | (a) lane records 1 as the baseline and changes the case text; (b) investigate a different image | `call-webhook.job.ts` catch block; live 45 s watch | (a) |
| OD-4 | P2-MED-WH-001/007 expect "captured"; payment_intent.succeeded authorizes first | (a) lane asserts the code-defined state (authorized, then capture); (b) change the case | 2.4 | (a) |
| OD-5 | Cal `/v2` check needs HR-1 | (a) HR-1 required, a real test with no `test.fixme`; (b) wait | 2.6 | (a); HR-1 is **required** before this task |
| OD-6 | DANGEROUS_BYPASS_RATE_LIMITS is UNPROBED | (a) leave unset; (b) probe where the sandbox allows it | the classifier refused; two sign-ins per run do not hit the limit | (a) |
| OD-7 | Cold start times (Cal ~12 min, Documenso ~11 min) | build caching keyed on product, pinned SHA, harness tag, Node version and lockfile hash (Task 6 D4/OD-4), or prebuilt harness images | harness marker is the git SHA (2.1) | the caching decision is Task 6's; this task's timeouts use the cold times (section 8 step 5) |

Risks: `up` for Cal and Documenso is long and memory hungry (15 GB machine used about 11 GB during Cal's build); without HR-3 the
Documenso build hits the heap limit (exit 134, 2.1); Twenty's lazy application can change in a new image (the SLO constants name
the source lines; the canary precondition bounds it and the B1 lane test pins it); the guest-customer residue of Medusa carts
(retained by id, section 7); the hosts line requires root or sudo.

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
- A harness release (HR-1, HR-2 or HR-3) is not tagged, or its acceptance check (section 8 step 0) fails: STOP. Nothing is skipped or
  faked in its place.
- The Twenty record-id field (section 8 step 5) is absent from the payload: STOP and report the observed payload shape.
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
   the commit identity from the environment (`GIT_AUTHOR_*`/`GIT_COMMITTER_*`). Build environment: Claude Code cloud
   (its `.claude/settings.json` turns attribution off). A Cursor build needs the owner to turn off Cursor's commit
   attribution first (index section 9); a build that still adds a trailer stops before push. The trailer grep in
   section 9 is the pre-push gate.
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
