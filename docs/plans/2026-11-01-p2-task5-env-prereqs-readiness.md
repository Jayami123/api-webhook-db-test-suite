# P2 foundation Task 5: environment prerequisites and a readiness check per product (plan only)

Builds on Task 4 (`docs/plans/2026-11-01-p2-task4-api-clients-tokens.md`). Index:
`docs/plans/2026-11-01-p2-foundation-index.md`. This task proves the whole foundation against the four real
products: harness, roles, credentials, receiver, signers and the invariant sweep, one product stack at a time.

## 1. Header

- Plan branch `plan/2026-11-01-p2-foundation`. Base commit at plan time: `main` = `fd554c901e82a7a936fb0074af42de6b26f56ab1`.
- Build branch: `feat/<build-date>-p2-task5-env-prereqs-readiness`, `<build-date>` = `date -u +%F`. **Cut from the head
  of the Task 4 branch**, record that SHA. PR base: the Task 4 branch.
- Depends on Tasks 2 to 4. Unit chain: Task 4 head **245** -> this task **261** (+16). Playwright lists **21**
  readiness tests in 4 files. db-guard unchanged (22).
- **Harness pin moves from `v0.2.11` to `v0.2.18`** (`de561c56f9307321358e7c682ed48949229f57a0`): own tag, so the D11
  cooldown does not apply. Reasons: Cal's web server start and stop on Linux need `v0.2.14` and `v0.2.15`
  (`CHANGELOG.md`: detached Next server with a pid record; port listener read from `/proc` because `lsof` cannot
  see the `next-server (v16.x)` name), `v0.2.13` adds `MEDUSA_LOCK`, `v0.2.17` the optional pg-stats and
  event-loop preload, and `v0.2.18` is the tag the k6 suite already runs on.
- Probe date 2026-11-01 on the Claude Code cloud VM: Node v22.23.3, v24.22.0 (`$NODE24`), Docker 29.9.2, 4 cores,
  15 GB RAM, 18 GB free disk, Playwright 1.64.0. Harness `v0.2.18` was built from a scratch clone outside the
  repo and its scripts were used for every probe. Every stack was started with `up` and ended with `down`.
- Verification of this plan: all code below was built in a scratch copy (`npm run check` exit 0, 261/261), and
  **the four readiness specs were run against the real stacks, each twice in a row**, with the results of
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
| `NODE_OPTIONS=--max-old-space-size=7168` or more | Documenso, Cal | **works from P2 env and is required**: Node's default heap here is 2.0 to 2.2 GB; Documenso `react-router typegen && tsc` died with exit 134 `JavaScript heap out of memory` at 2.05 GB; the retry with the larger heap passed. The harness sets a heap only for Cal, and only when `NODE_OPTIONS` is empty (`cal.adapter.ts:53-58`); this cloud image presets `NODE_OPTIONS=--use-openssl-ca`, so even Cal would get no default | live |
| `DANGEROUS_BYPASS_RATE_LIMITS=true` | Documenso | **UNPROBED**: the sandbox's command classifier refused the command that set it ("Safety Bypass Flag"), and it was not worked around. Code: forwarded only when exactly `true` (`documenso-env.ts:276-278`). Not needed by the readiness specs (two sign-ins) | n/a |
| `DAILY_WEBHOOK_SECRET`, `CRON_API_KEY` | Cal | **works from P2 env** | Daily route answered 403/400 as signed; cron POST 401 -> 200 with the key |
| `MEDUSA_REDIS=1` (event-bus-redis) | Medusa | **works from P2 env, in v0.2.11 and v0.2.18**. *The review says v0.2.18 adds it; it does not*: `medusa-env.ts:237-243` already writes `@medusajs/medusa/event-bus-redis` in `v0.2.11`; `v0.2.13` added `MEDUSA_LOCK` | log: "Retrying payment.webhook_received" 3 times for one failing event |
| `MEDUSA_STRIPE=1`, `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET` | Medusa | **works from P2 env**; the seed prints "Stripe on Europe" and `pp_stripe_stripe` is linked to Europe only | live |
| `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS` as an environment variable | Twenty | **does not reach the containers** (`docker exec ... env \| grep -c OUTBOUND` = 0): the overlay lists no such key and the runtime override only forwards the rate-limit allowlist (`twenty-runtime-override.ts`). **Needs a harness release (HR-2)** for the env route. It **can be set from P2** through the admin panel (2.3) | live |
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
at send time only. `scripts/ensure-receiver-hostname.sh` adds the hosts line (idempotent, root or sudo).

### 2.3 Twenty: two lazy mechanisms that drop an early event (found by the readiness run)

```text
POST /admin-panel  mutation { createDatabaseConfigVariable(key:"OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS", value:["172.18.0.1"]) } -> true
  the jane.austen@apple.dev admin may call it; deleteDatabaseConfigVariable removes it.
config-variables-refresh-cron-interval.constants.ts: every process re-reads DB config every 15 s ('*/15 * * * * *')
workspace-cache.service.ts:56  MEMOIZER_TTL_MS = 10_000   (flat webhook maps are memoised for 10 s)
first attempt: webhook created, person created at once -> worker log "Outbound HTTP request: POST http://172.18.0.1:4317/..."
  processed in 16 ms, receiver saw nothing (blocked: the worker had not re-read the allow-list); call-webhook.job.ts catches
  the error and returns, so the event is never retried.
second attempt (allow-list set earlier, webhook created, person created at once): no CallWebhookJob at all for the new
  webhook (memoised map without it).
```

Consequence (D8, D9): the allow-list is set once per worker and waited for with a bounded trigger loop, and every
test that creates a Twenty webhook uses the same loop. Receiver 500 mode on the pinned image: **one** request in
45 s (no retry), contradicting the master plan's "5 requests" baseline (P2-TW-WH-004), see OD-3.

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

stripe-node reads no environment variable for its host (`DEFAULT_HOST = 'api.stripe.com'`,
`stripe.core.js:13-14`), and `api.stripe.com` is not reachable from this sandbox (`curl` exit code 000 through the
proxy). **stripe-mock therefore cannot be used without a fork edit or network interception.** Recorded; no image
is pinned because none is used. What needs no Stripe API call is planned and was proven:

| Rows | Product | Proven |
|---|---|---|
| unsigned / empty payload / garbage / wrong secret / stale (-600 s) / non-synced type / synced type without customer | Documenso `POST /api/stripe/webhook` (billing flag + secret in `up`'s env) | live: 400 `No signature found in request` / 400 `No payload found in request` / 500 `Unknown error` x3 / 200 `Webhook received` x2 |
| the same event with a customer | Documenso | live: 500 (it calls the Stripe API): **blocked** (P2-DOC-STR-002/003) |
| signature rows and the success row | Medusa, with the system-provider session of 2.4 | live: authorized in 5.6 s |
| Twenty billing webhook (`/webhooks/stripe`) | Twenty | UNPROBED, needs HR-2 |

Options for the blocked rows: (a) wait for a fork change that exposes the Stripe host, (b) a TLS-intercepting proxy
trusted through `NODE_EXTRA_CA_CERTS`, (c) keep them as unit-level SDK checks. Recommended default (c); decided by
the owner later (OD-2).

### 2.6 Probe P5 summary and the Cal question

All four products mint and revoke through their HTTP API (Task 4, section 2). Cal's API v2 (5555) is **not
started** by harness `v0.2.18` (connection refused). Without it Task 5 proves for Cal: web health, `qa_ro`, key
mint/delete through the web app, a signed outgoing webhook, the sweep. The `/v2` check is an explicit
`test.fixme("[blocked HR-1] ...")` in `tests/readiness/cal.readiness.spec.ts`: visible in every report with its
reason, never silent.

### 2.7 Readiness runs on the real stacks (2026-11-01)

| Product | Stack start | Roles | Result (run 1, run 2) | Notable |
|---|---|---|---|---|
| Medusa | `up` 4 min cold, 1 min warm; `harness-seed.mjs medusa` | provision/teardown ok | 5 passed, 5 passed | first run found: guest customer leak, worker keys needing `retained`, sales channel for the publishable key (all fixed in Tasks 4/5) |
| Documenso | `up` ~11 min cold (first attempt OOM, exit 134), < 1 min warm | ok | 5 passed (3.2 s), 5 passed (2.6 s) | delivery in about 0.6 s; receiver log redacts `x-documenso-secret` |
| Cal | `up` ~12 min cold (Next compile 2 min + tRPC/turbo build + seed), ~1 min warm | ok | 5 passed + 1 skipped (blocked HR-1) (3.4 s), same (3.1 s) | web app only |
| Twenty | `up` ~2 min + `harness-seed.mjs twenty` ~2 min | ok | 5 passed (33.0 s), 5 passed (33.0 s) | the webhook test needs the allow-list warm-up (~16 s) and one re-trigger (12 s) |

Wall-clock numbers are read from log timestamps (+-1 min); they feed the lane budgets in Task 6.

## 3. Resolved decisions

- **D1. Harness pin `v0.2.18`** (section 1). The lockfile entry becomes `version 0.2.18`, `resolved ...#de561c5...`;
  the harness's own dependency `zod` becomes `^4.6.7` inside the lock. `npm ci` builds its `dist` through its
  `prepare` script (verified).
- **D2. One reach table per product** (`src/webhooks/reach.ts`): Cal loopback; Documenso a hostname for
  `127.0.0.1`; Twenty the gateway of `qa-harness-twenty_default`; Medusa none. The receiver binds loopback plus
  what the product needs, never a wildcard (Task 2 D5). `host.docker.internal` for Twenty waits for HR-2.
- **D3. Readiness = four specs with the same shape:** health + run-id header not rejected, `qa_ro` is the connected
  role and read-only, a credential is minted, accepted, revoked and rejected, the outgoing (or inbound) webhook
  round trip where its prerequisite exists, every invariant rule runs against the live schema and finds nothing.
  Anything blocked by a harness release is an explicit `test.fixme` with the release id.
- **D4. Named SLO budgets** (`src/slo.ts`), each derived from a code-defined timeout plus a stated margin, never
  from an observed latency: Cal delivery 10 s, Documenso 20 s (call timeout 10 s), Twenty 35 s (10 s memo + 5 s
  call + re-trigger), Twenty allow-list 45 s (15 s refresh x 2 + margin), Medusa 25 s (`webhook_delay` 5 s).
- **D5. A worker-scoped `receiverHandle`** starts the receiver once for the project's product, on the addresses
  the product can reach, and stops it at the end (log in `receiver-logs/<run id>.jsonl`).
- **D6. Medusa readiness uses a system-provider session** (2.4), links `pp_system_default` to the US region
  for the test and restores the previous (empty) list, deletes the guest customer through the admin API.
- **D7. Twenty: `allowReceiverHost` + `createTriggerStep`.** Set the allow-list through the admin panel, then
  fire a probe event at most once per 15 s until a delivery is seen, then remove the probe objects; every test
  that creates a webhook uses the same step with a 10.5 s spacing. No sleep: `expect.poll` with the named SLO.
- **D8. Billing cases get a separate Documenso stack run** (billing flag changes document limits, 2.1).
- **D9. Environment is prepared by repo scripts,** not by instructions to remember: `scripts/harness-seed.mjs`,
  `scripts/ensure-receiver-hostname.sh`, the SessionStart hook (heap + hosts line) and Cursor's `start` command
  (section 12).

## 4. Case mapping

No product case runs. The readiness specs exercise, for real, the two framework checks **P2-X-DB-001** (the sweep,
all four products) and **P2-X-WH-001** (signed webhook round trip: Cal HMAC, Documenso secret header, Twenty
timestamp HMAC, Medusa Stripe signature to the database). They prepare every WH, DLY, STR, EB, KEY and CON case
of the lanes; `P2-MED-WH-001..007` can use the system-provider path of 2.4, `P2-DOC-STR-001` and its signature rows
the table of 2.5. Contradictions with the master plan, recorded for the lanes: P2-TW-WH-004 (1 request, not 5),
P2-MED-WH-001/007 ("captured" vs authorized, 2.4), P2-CAL-WH-003 and P2-CAL-TASK-001 (Task 2, 2.1), field names in
P2-CAL-SCH-002 and P2-DOC-REM-001 (Task 3, 2.2).

## 5. Architecture

| File | Change | Responsibility |
|---|---|---|
| `package.json`, `package-lock.json` | edit | harness pin `v0.2.18` |
| `src/env.ts` | edit | comment names `v0.2.18` |
| `src/slo.ts` | new | named SLO budgets and the Twenty lazy-application constants |
| `src/webhooks/reach.ts` | new | which addresses a product can reach, resolved per product |
| `src/readiness/checks.ts` | new | `qa_ro` check, `randomSecret`, `productsRoot` |
| `src/readiness/trigger-step.ts` | new | the bounded re-trigger step for lazily applied changes |
| `src/fixtures/index.ts` | new | final `test`: adds `receiverHandle` and `twentyReady` |
| `src/fixtures/twenty-allowlist.ts` | new | admin-panel allow-list + warm-up |
| `src/auth/twenty.ts` | edit | `setConfigVariable`, `deleteConfigVariable` |
| `src/clients/medusa.ts` | edit | provider link, customer cleanup, variant, payment session |
| `tests/readiness/{cal,doc,med,tw}.readiness.spec.ts` | new | the four specs |
| `playwright.config.ts` | edit | API projects also match `readiness/<code>.readiness.spec.ts` |
| `eslint.config.mjs` | edit | the sleep ban also covers `tests/readiness/**` and `tests/serial/**` |
| `scripts/harness-seed.mjs`, `scripts/ensure-receiver-hostname.sh` | new | seed through the harness; hosts line |
| `.claude/hooks/session-start.sh`, `.cursor/environment.json` | edit | heap and hosts line at session start |
| `.env.example`, `AGENTS.md` | edit | variable names; two Cursor lines |
| tests: `tests/unit/webhooks/reach.test.ts`, `tests/unit/readiness/{checks,trigger-step}.test.ts`, `tests/unit/auth/flows.test.ts` | new/edit | +16 |

## 6. Module contracts (exact code, built and tested in the scratch copy)

### 6.1 Harness pin

Edit `package.json`: in `dependencies`, change the tag at the end of the `qa-portfolio-harness` git URL from
`#v0.2.11` to `#v0.2.18` (nothing else on that line), then:

```bash
export PATH="/usr/local/bin:$PATH"
npm install                     # updates package-lock.json; builds the harness dist through its prepare script
grep -n '"version": "0.2.18"' package-lock.json     # the node_modules/qa-portfolio-harness entry
grep -n 'de561c56f9307321358e7c682ed48949229f57a0' package-lock.json
node -e 'console.log(require("./node_modules/qa-portfolio-harness/package.json").version)'   # 0.2.18
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
      "a new webhook reaches the worker after its workspace-cache memo expires (10 s, workspace-cache.service.ts MEMOIZER_TTL_MS), so one re-trigger may be needed; call-webhook.job.ts axios timeout is 5_000 ms; 10 s margin",
  },
  medWebhookProcessing: {
    ms: 25_000,
    basis:
      "hooks/payment/[provider]/route.js emits with delay webhook_delay || 5000 ms; 20 s margin for the subscriber and workflow",
  },
  twConfigPropagation: {
    ms: 45_000,
    basis:
      "DB-backed config variables are re-read by each Twenty process every 15 seconds (cron) (config-variables-refresh-cron-interval.constants.ts), so the worker needs up to 15 s; two cycles + 15 s margin",
  },
} as const satisfies Record<string, Slo>;

/** Seconds between the cron runs above; the warm-up sends at most one probe event per cycle. */
export const TWENTY_CONFIG_REFRESH_MS = 15_000;

/** Spacing of the re-triggers for a new webhook: the workspace-cache memo lifetime plus 500 ms. */
export const TWENTY_WEBHOOK_VISIBLE_MS = 10_500;
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
 *  - twenty runs in Docker compose without extra_hosts: host.docker.internal does not resolve in
 *    its containers, so the receiver binds the compose network's gateway and the URL uses that IP.
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
      return { bindHosts: ["127.0.0.1", gateway], urlHost: gateway };
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

`src/readiness/trigger-step.ts`

```ts
/**
 * Twenty applies two kinds of change lazily, and an event that arrives too early is dropped, never
 * retried (probe 2026-11-01): a new webhook is visible to the worker only after its workspace-cache
 * memo expires (10 s, workspace-cache.service.ts MEMOIZER_TTL_MS), and a changed outbound
 * allow-list only after the 15 s config refresh. So "create the webhook, fire the event once" can
 * lose the event. This step is the no-sleep answer: fire the trigger, and fire it again no more
 * than once per `everyMs` until the receiver has seen a delivery. Use it as the predicate of
 * `expect.poll(step, { timeout: <named SLO> }).toBe(true)`; every extra trigger is counted.
 */
export interface TriggerStepInput {
  /** Causes one event (e.g. create a record). `attempt` starts at 1. */
  readonly trigger: (attempt: number) => Promise<void>;
  /** True once the receiver has recorded a delivery. */
  readonly delivered: () => boolean;
  /** Minimum spacing between triggers, in ms. */
  readonly everyMs: number;
  readonly now?: () => number;
}

export interface TriggerStep {
  (): Promise<boolean>;
  /** How many events were fired so far. */
  readonly triggers: () => number;
}

export function createTriggerStep(input: TriggerStepInput): TriggerStep {
  const now = input.now ?? ((): number => Date.now());
  let lastAt = Number.NEGATIVE_INFINITY;
  let count = 0;
  const step = async (): Promise<boolean> => {
    if (input.delivered()) return true;
    if (now() - lastAt >= input.everyMs) {
      lastAt = now();
      count += 1;
      await input.trigger(count);
    }
    return input.delivered();
  };
  return Object.assign(step, { triggers: () => count });
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
import { allowReceiverHost } from "./twenty-allowlist.ts";
import { twentyClient } from "../clients/twenty.ts";

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
  { receiverHandle: ReceiverHandle; twentyReady: undefined }
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
  /** Twenty only: the receiver's address is on the outbound allow-list and the worker knows it. */
  twentyReady: [
    async ({ twAuth, receiverHandle }, use) => {
      const { request } = await import("@playwright/test");
      const context = await request.newContext();
      try {
        const client = twentyClient({
          request: context,
          baseUrl: apiBaseUrl("twenty"),
          runPrefix: currentRunPrefix(),
          auth: twAuth,
        });
        const done = await allowReceiverHost({
          auth: twAuth,
          client,
          receiver: receiverHandle.receiver,
          host: receiverHandle.target.urlHost,
          probeUrl: receiverHandle.urlFor("tw-warmup"),
          probeKey: receiverHandle.key("tw-warmup"),
        });
        await use(undefined);
        await done();
      } finally {
        await context.dispose();
      }
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
```

`src/fixtures/twenty-allowlist.ts`

```ts
import { expect } from "@playwright/test";
import type { TwentyAuth } from "../auth/twenty.ts";
import type { TwentyClient } from "../clients/twenty.ts";
import { runScopedName } from "../run/prefix.ts";
import { createTriggerStep } from "../readiness/trigger-step.ts";
import { SLO, TWENTY_CONFIG_REFRESH_MS } from "../slo.ts";
import type { PathKey, Receiver } from "../webhooks/receiver.ts";

export const ALLOWLIST_VARIABLE = "OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS";

/**
 * Puts `host` on Twenty's outbound allow-list through the admin panel and waits until the WORKER
 * (which calls webhooks) has picked it up. The server applies a new value at once, the worker only
 * on its next refresh (every 15 seconds), and a webhook sent before that is blocked and never retried (job
 * catches the error), so the wait is observable only through a delivery: it sends one probe event
 * per refresh cycle, at most, until the receiver sees one. Returns the cleanup.
 */
export async function allowReceiverHost(input: {
  auth: TwentyAuth;
  client: TwentyClient;
  receiver: Receiver;
  host: string;
  probeUrl: string;
  probeKey: PathKey;
  now?: () => number;
}): Promise<() => Promise<void>> {
  await input.auth.setConfigVariable(ALLOWLIST_VARIABLE, [input.host]);
  const webhookId = await input.client.webhooks.create({
    targetUrl: input.probeUrl,
    operations: ["person.created"],
    secret: "warmup-warmup-warmup",
    description: runScopedName("warmup-webhook"),
  });
  const people: string[] = [];
  const removeProbes = async (): Promise<void> => {
    for (const id of people.splice(0)) await input.client.people.remove(id);
    await input.client.webhooks.remove(webhookId);
  };
  const step = createTriggerStep({
    everyMs: TWENTY_CONFIG_REFRESH_MS,
    delivered: () => input.receiver.deliveries(input.probeKey).length > 0,
    trigger: async (attempt) => {
      people.push(await input.client.people.create(runScopedName(`warmup-${String(attempt)}`)));
    },
    ...(input.now === undefined ? {} : { now: input.now }),
  });
  try {
    await expect
      .poll(step, {
        timeout: SLO.twConfigPropagation.ms,
        message: "Twenty worker picked up the outbound allow-list",
      })
      .toBe(true);
  } catch (error) {
    await removeProbes();
    await input.auth.deleteConfigVariable(ALLOWLIST_VARIABLE);
    throw error;
  }
  // The probes have done their job: remove them now so nothing of the warm-up outlives it. Only the
  // allow-list entry stays until the worker ends.
  await removeProbes();
  return async () => {
    await input.auth.deleteConfigVariable(ALLOWLIST_VARIABLE);
  };
}
```

### 6.4 Edits to existing modules

`src/auth/twenty.ts` (diff)

```diff
--- a/src/auth/twenty.ts
+++ b/src/auth/twenty.ts
@@ -13,4 +13,12 @@ export interface TwentyAuth extends MintedAuth {
   /** True while the key is accepted by GET /rest/people?limit=1. */
   isAccepted(): Promise<boolean>;
+  /**
+   * Admin-panel config variable (POST /admin-panel createDatabaseConfigVariable). The harness
+   * passes no OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS into the containers, but the setting can also
+   * live in the database (config-variables.ts:100-106, not env-only); probe 2026-11-01 showed it
+   * takes effect on the next webhook with no restart.
+   */
+  setConfigVariable(key: string, value: unknown): Promise<void>;
+  deleteConfigVariable(key: string): Promise<void>;
 }
 
@@ -37,8 +45,9 @@ export async function mintTwenty(input: {
     variables: Record<string, unknown>,
     accessToken?: SecretString,
+    endpoint = "metadata",
   ): Promise<T> => {
     const res = await http({
       method: "POST",
-      url: `${input.baseUrl}/metadata`,
+      url: `${input.baseUrl}/${endpoint}`,
       headers: {
         "content-type": "application/json",
@@ -116,4 +125,18 @@ export async function mintTwenty(input: {
   let revoked = false;
 
+  const adminPanel = async <T>(
+    step: string,
+    query: string,
+    variables: Record<string, unknown>,
+  ): Promise<T> => {
+    try {
+      return await gql<T>(step, query, variables, access, "admin-panel");
+    } catch (error) {
+      if (!(error instanceof AuthError)) throw error;
+      access = await login();
+      return await gql<T>(step, query, variables, access, "admin-panel");
+    }
+  };
+
   return {
     product: "twenty",
@@ -129,4 +152,18 @@ export async function mintTwenty(input: {
       return res.status === 200;
     },
+    async setConfigVariable(key, value) {
+      await adminPanel(
+        "twenty createDatabaseConfigVariable",
+        "mutation($k:String!,$v:JSON!){ createDatabaseConfigVariable(key:$k,value:$v) }",
+        { k: key, v: value },
+      );
+    },
+    async deleteConfigVariable(key) {
+      await adminPanel(
+        "twenty deleteDatabaseConfigVariable",
+        "mutation($k:String!){ deleteDatabaseConfigVariable(key:$k) }",
+        { k: key },
+      );
+    },
     async revoke() {
       if (revoked) return;
```

`src/clients/medusa.ts` (diff)

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
 * STRIPE_WEBHOOK_SECRET in the environment of `up` (plan Task 5). api.stripe.com is not
 * reachable and no env var redirects the Stripe SDK, so the round trip uses a payment session of
 * the system provider: the Stripe-signed event carries its id as metadata.session_id and
 * payment-stripe's getWebhookActionAndData needs no Stripe API call.
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

  test("a Stripe-signed event authorizes a system-provider payment session (payment-stripe route to DB)", async ({
    med,
  }) => {
    const secret = requireVar("STRIPE_WEBHOOK_SECRET", process.env["STRIPE_WEBHOOK_SECRET"]);
    const regions = (await med.admin.regions()).body.regions;
    const us = regions.find((r) => r.currency_code === "usd");
    expect(us, "the seed has a USD region").toBeDefined();
    const regionId = us?.id ?? "";
    await med.admin.setPaymentProviders(regionId, ["pp_system_default"]);
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
      await med.admin.setPaymentProviders(regionId, []);
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

  test.fixme("[blocked HR-1] API v2 answers on CAL_API_BASE_URL (harness v0.2.18 does not start it)", async ({
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
import { connectedRole, randomSecret } from "../../src/readiness/checks.ts";
import { currentRunPrefix, runScopedName } from "../../src/run/prefix.ts";
import { createTriggerStep } from "../../src/readiness/trigger-step.ts";
import { SLO, TWENTY_WEBHOOK_VISIBLE_MS } from "../../src/slo.ts";
import { verifyTwenty } from "../../src/webhooks/verify.ts";

/**
 * Twenty readiness. The server runs in Docker; the receiver binds the compose network's gateway
 * (src/webhooks/reach.ts) and that IP is put on the outbound allow-list through the admin panel,
 * because harness v0.2.18 passes no OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS to the containers (HR-2
 * would make this unnecessary).
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

  test("person.created reaches the receiver path with a verifiable timestamp HMAC", async ({
    tw,
    twentyReady,
    receiverHandle,
  }) => {
    expect(twentyReady).toBeUndefined(); // the fixture ran: the worker knows the allow-list
    const secret = randomSecret();
    const key = receiverHandle.key("tw-ready-wh");
    let webhookId: string | undefined;
    const people: string[] = [];
    try {
      webhookId = await tw.webhooks.create({
        targetUrl: receiverHandle.urlFor("tw-ready-wh"),
        operations: ["person.created"],
        secret,
        description: runScopedName("ready-webhook"),
      });
      // A new webhook can be invisible to the worker for up to 10 s and an early event is dropped,
      // so re-trigger at most once per memo lifetime until the first delivery (trigger-step.ts).
      const step = createTriggerStep({
        everyMs: TWENTY_WEBHOOK_VISIBLE_MS,
        delivered: () => receiverHandle.receiver.deliveries(key).length > 0,
        trigger: async (attempt) => {
          people.push(await tw.people.create(runScopedName(`ready-person-${String(attempt)}`)));
        },
      });
      await expect
        .poll(step, { timeout: SLO.twWebhookDelivery.ms, message: "Twenty webhook delivery" })
        .toBe(true);
      const delivery = receiverHandle.receiver.deliveries(key)[0];
      expect(
        verifyTwenty({
          secret,
          rawBody: delivery?.rawBody ?? "",
          headers: delivery?.headers ?? {},
          nowMs: Date.now(),
          toleranceMs: null,
        }),
      ).toEqual({ ok: true });
      test
        .info()
        .annotations.push({ type: "triggers-needed", description: String(step.triggers()) });
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

`.claude/hooks/session-start.sh` (diff)

```diff
--- a/.claude/hooks/session-start.sh
+++ b/.claude/hooks/session-start.sh
@@ -8,5 +8,12 @@ if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
     echo 'export NODE24=/opt/node24/bin/node' >> "$CLAUDE_ENV_FILE"
   fi
+  # Harness builds (Documenso typecheck, Cal next build) need more than Node's default ~2 GB heap, and
+  # the harness applies its own 8 GB default only when NODE_OPTIONS is empty (calHeapEnv). The cloud
+  # image already sets NODE_OPTIONS (--use-openssl-ca), so append instead of replacing.
+  echo "export NODE_OPTIONS=\"\${NODE_OPTIONS:+\$NODE_OPTIONS }--max-old-space-size=8192\"" >> "$CLAUDE_ENV_FILE"
 fi
+# Documenso webhooks reach the receiver through a hostname that resolves to 127.0.0.1 (plan Task 5).
+# Never blocks the session: without root or sudo it just says so in the log.
+bash "${CLAUDE_PROJECT_DIR:-.}/scripts/ensure-receiver-hostname.sh" >/dev/null 2>&1 || true
 if command -v dockerd >/dev/null && ! docker info >/dev/null 2>&1; then
   (sudo dockerd 2>&1 | tee /tmp/dockerd.log >/dev/null &)
```

`.cursor/environment.json` (diff)

```diff
--- a/.cursor/environment.json
+++ b/.cursor/environment.json
@@ -4,4 +4,4 @@
   },
   "install": "bash scripts/cloud-install.sh",
-  "start": "sudo service docker start"
+  "start": "sudo service docker start && bash scripts/ensure-receiver-hostname.sh"
 }
```

### 6.7 `.env.example` and `AGENTS.md`

`.env.example`, append after the Task 4 lines (names only):

```text
# Stripe values Medusa's payment-stripe provider is started with (MEDUSA_STRIPE=1). P2 signs events
# with STRIPE_WEBHOOK_SECRET; the API key is never used for a network call (api.stripe.com is unreachable).
STRIPE_API_KEY=
STRIPE_WEBHOOK_SECRET=
```

`AGENTS.md`, under "Cursor Cloud specific instructions" add (and in the same edit replace the personal name on the
commit-note line by "the maintainer"):

```text
- Harness builds need a bigger heap: `export NODE_OPTIONS="--max-old-space-size=8192"` before `up` for Cal or Documenso.
  `scripts/ensure-receiver-hostname.sh` runs from the `start` command; run `npm run qa:passwords` once per VM.
```

and under "Claude Code cloud specific instructions":

```text
- `.claude/hooks/session-start.sh` also appends `--max-old-space-size=8192` to `NODE_OPTIONS` and adds the receiver
  hostname to the hosts file (root). Product readiness runbook: `docs/plans/2026-11-01-p2-task5-env-prereqs-readiness.md` section 8.
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

  test("twenty binds loopback plus the compose gateway and calls the gateway", async () => {
    const asked: string[][] = [];
    const target = await resolveReceiverTarget("twenty", {
      lookup: lookupTo("127.0.0.1"),
      docker: (args) => {
        asked.push([...args]);
        return Promise.resolve("172.18.0.1\n");
      },
    });
    assert.deepEqual(target, { bindHosts: ["127.0.0.1", "172.18.0.1"], urlHost: "172.18.0.1" });
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

`tests/unit/readiness/trigger-step.test.ts`

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createTriggerStep } from "../../../src/readiness/trigger-step.ts";

function harness(everyMs = 10_000) {
  let clock = 1_000_000;
  let delivered = false;
  const fired: number[] = [];
  const step = createTriggerStep({
    trigger: (attempt) => {
      fired.push(attempt);
      return Promise.resolve();
    },
    delivered: () => delivered,
    everyMs,
    now: () => clock,
  });
  return {
    step,
    fired,
    advance: (ms: number) => {
      clock += ms;
    },
    deliver: () => {
      delivered = true;
    },
  };
}

describe("createTriggerStep", () => {
  test("fires the first trigger on the first call and reports not delivered yet", async () => {
    const h = harness();
    assert.equal(await h.step(), false);
    assert.deepEqual(h.fired, [1]);
    assert.equal(h.step.triggers(), 1);
  });

  test("does not fire again before everyMs has passed, then fires once per interval", async () => {
    const h = harness(10_000);
    await h.step();
    h.advance(9_999);
    await h.step();
    assert.deepEqual(h.fired, [1]);
    h.advance(1);
    await h.step();
    assert.deepEqual(h.fired, [1, 2]);
    h.advance(10_000);
    await h.step();
    await h.step();
    assert.deepEqual(h.fired, [1, 2, 3]);
  });

  test("once a delivery is seen it returns true and never fires again", async () => {
    const h = harness();
    await h.step();
    h.deliver();
    h.advance(60_000);
    assert.equal(await h.step(), true);
    assert.deepEqual(h.fired, [1]);
  });

  test("a delivery produced by the trigger itself is reported by the same call", async () => {
    let delivered = false;
    const step = createTriggerStep({
      trigger: () => {
        delivered = true;
        return Promise.resolve();
      },
      delivered: () => delivered,
      everyMs: 10_000,
    });
    assert.equal(await step(), true);
    assert.equal(step.triggers(), 1);
  });

  test("a failing trigger surfaces its error instead of being retried silently", async () => {
    const step = createTriggerStep({
      trigger: () => Promise.reject(new Error("create failed")),
      delivered: () => false,
      everyMs: 1,
    });
    await assert.rejects(step(), /create failed/);
  });
});
```

`tests/unit/auth/flows.test.ts` (diff)

```diff
--- a/tests/unit/auth/flows.test.ts
+++ b/tests/unit/auth/flows.test.ts
@@ -278,4 +278,39 @@ describe("twenty mint and revoke", () => {
   });
 
+  test("config variables go to /admin-panel with the access token, and a stale token signs in again once", async () => {
+    const state = { revoked: false, logins: 0 };
+    const seen: { url: string; body: string }[] = [];
+    const base = twentyRoute(state);
+    let rejectNextAdmin = true;
+    const { http } = port((r) => {
+      if (new URL(r.url).pathname === "/admin-panel") {
+        seen.push({ url: r.url, body: r.body ?? "" });
+        if (rejectNextAdmin) {
+          rejectNextAdmin = false;
+          return reply(200, { errors: [{ message: "token expired" }] });
+        }
+        return reply(200, {
+          data: { createDatabaseConfigVariable: true, deleteDatabaseConfigVariable: true },
+        });
+      }
+      return base(r);
+    });
+    const auth = await mintTwenty({
+      baseUrl: "http://t",
+      email: "jane@x.dev",
+      password: "pw-pw-pw-pw",
+      name,
+      http,
+    });
+    await auth.setConfigVariable("OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS", ["172.18.0.1"]);
+    await auth.deleteConfigVariable("OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS");
+    assert.equal(state.logins, 2, "one fresh sign-in after the rejected call");
+    assert.equal(seen.length, 3);
+    assert.deepEqual((JSON.parse(seen[1]?.body ?? "{}") as { variables: unknown }).variables, {
+      k: "OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS",
+      v: ["172.18.0.1"],
+    });
+  });
+
   test("revoke signs in again once when the 30-minute access token has expired", async () => {
     const state = { revoked: false, logins: 0, failFirstRevoke: true };
```

Counts: `reach.test.ts` 6, `checks.test.ts` 4, `trigger-step.test.ts` 5, `flows.test.ts` +1 = **16**.

## 7. Data isolation, cleanup and leak check

- Everything the specs create carries the run prefix and is removed in `finally`: Cal webhook; Documenso webhook and
  envelope; Medusa guest customer, cart left (no delete API; there is no leak rule on carts, accepted residue of
  the system-provider session), region provider list restored; Twenty person(s), webhook, allow-list variable.
- The P2-X-DB-001 sweep runs after every test (Task 3) and each spec also runs all rules of its product once.
- Credentials: worker-scoped, revoked and verified dead at worker end (Task 4); `retained` covers them meanwhile.
- Roles: provisioned before and torn down after each product run (section 8).
- Hosts file: one line, idempotent, left in place (it is a name for 127.0.0.1).

## 8. Build steps (repo root; on any differing output STOP and paste it; one stack at a time, always ending with `down`)

0. Branch from the Task 4 head, record the SHA. `export PATH="/usr/local/bin:$PATH"`; `npm ci && npm run check` -> `# tests 245`.
1. Harness pin (6.1). `npm run check` still `# tests 245`. Commit 1.
2. `src/slo.ts`, `src/webhooks/reach.ts`, `src/readiness/*.ts`, their unit tests, the `flows.test.ts` and
   `twenty.ts`/`medusa.ts` edits. `node --test tests/unit/webhooks/reach.test.ts tests/unit/readiness/*.test.ts tests/unit/auth/flows.test.ts`
   -> all pass. Commit 2.
3. `src/fixtures/index.ts`, `src/fixtures/twenty-allowlist.ts`, the four specs, `playwright.config.ts`,
   `eslint.config.mjs`. `npx playwright test --list` -> `Total: 21 tests in 4 files`; `npm run check` -> `# tests 261`.
   Commit 3.
4. Scripts, hook, Cursor command, `.env.example`, `AGENTS.md`. `shellcheck scripts/*.sh .claude/hooks/*.sh`
   (install: `python3 -m pip install --target /tmp/shc shellcheck-py`, binary `/tmp/shc/bin/shellcheck`) exits 0;
   `node -e "JSON.parse(require('fs').readFileSync('.cursor/environment.json'))"` prints nothing. Commit 4.
5. **Live runs, one product at a time** (each block ends with `down`; a block that fails once after a root-caused fix
   is a STOP). Common prelude:
   ```bash
   npm run qa:passwords && set -a && . ./.env && set +a
   export PRODUCTS_ROOT="${PRODUCTS_ROOT:-$(cd .. && pwd)/products}"
   bash scripts/bootstrap.sh <medusa|documenso|cal|twenty>      # idempotent
   H=node_modules/qa-portfolio-harness/scripts
   ```
   *Medusa*
   ```bash
   export MEDUSA_REDIS=1 MEDUSA_STRIPE=1 STRIPE_API_KEY="sk_test_$(openssl rand -hex 12)" STRIPE_WEBHOOK_SECRET="whsec_$(openssl rand -hex 16)"
   export MEDUSA_ADMIN_EMAIL=qa-admin@example.test MEDUSA_ADMIN_PASSWORD="$(openssl rand -hex 12)"
   node $H/up.mjs medusa && node scripts/harness-seed.mjs medusa          # "harness seed medusa ok: ..."
   npm run db:roles:provision -- medusa                                   # "db-roles provision: medusa ok"
   npx playwright test --project=med-api tests/readiness/med.readiness.spec.ts   # "5 passed" (run it twice)
   npm run db:roles:teardown -- medusa; node $H/down.mjs medusa
   ```
   *Documenso* (Node 24 for the harness commands, Node 22 for the tests)
   ```bash
   bash scripts/ensure-receiver-hostname.sh
   export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=7168" NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=p2-receiver.test
   PATH="$(dirname "$NODE24"):$PATH" node $H/up.mjs documenso            # ~11 min cold
   npm run db:roles:provision -- documenso
   npx playwright test --project=doc-api tests/readiness/doc.readiness.spec.ts   # "5 passed" (twice)
   npm run db:roles:teardown -- documenso; PATH="$(dirname "$NODE24"):$PATH" node $H/down.mjs documenso
   ```
   *Cal*
   ```bash
   export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=8192" DAILY_WEBHOOK_SECRET="$(head -c 32 /dev/urandom | base64)" CRON_API_KEY="$(openssl rand -hex 16)"
   node $H/up.mjs cal                                                    # ~12 min cold
   npm run db:roles:provision -- cal
   npx playwright test --project=cal-api tests/readiness/cal.readiness.spec.ts   # "5 passed" "1 skipped" (twice)
   npm run db:roles:teardown -- cal; node $H/down.mjs cal
   ```
   *Twenty*
   ```bash
   node $H/up.mjs twenty && node scripts/harness-seed.mjs twenty         # up ~2 min, seed ~2 min
   npm run db:roles:provision -- twenty
   npx playwright test --project=tw-api tests/readiness/tw.readiness.spec.ts     # "5 passed" (~35 s, twice)
   npm run db:roles:teardown -- twenty; TWENTY_DOWN_VOLUMES=1 node $H/down.mjs twenty
   ```
6. If a stack cannot start, or Docker is missing, or a host is blocked (proxy 403, ENOTFOUND): ENV finding, STOP.
   Mark that product's runs "UNPROBED in the build session" in the PR and report the task PARTIAL. Never skip silently.

## 9. Done criteria (machine-checkable)

```bash
npm run check                                   # exit 0; "# tests 261" "# pass 261" "# fail 0"
npx playwright test --list | tail -1            # "Total: 21 tests in 4 files"
npm run list:api | tail -1                      # same listing
node -e 'console.log(require("./node_modules/qa-portfolio-harness/package.json").version)'   # 0.2.18
shellcheck scripts/*.sh .claude/hooks/*.sh      # exit 0
grep -rnE 'setTimeout|setInterval|waitForTimeout' tests/readiness src/fixtures src/readiness ; test $? -eq 1   # no sleep
# live (section 8.5), for every product that could start:
#   med-api 5 passed | doc-api 5 passed | cal-api 5 passed + 1 skipped | tw-api 5 passed, each twice in a row
grep -rlE 'sk_test_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|api_[A-Za-z0-9]{16,}|cal_[A-Za-z0-9]{20,}|Bearer [A-Za-z0-9._-]{20,}' receiver-logs fixture-logs test-results playwright-report 2>/dev/null ; test $? -eq 1   # no secret in any artefact
git status --porcelain                          # empty after the commits (receiver-logs/, fixture-logs/, test-results/ are ignored)
git diff <task4-head>..HEAD -- . ':(exclude)tests/unit' | grep -E '^\+' | grep -nE 'sk_live_|sk_test_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|Bearer [A-Za-z0-9._-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY' ; test $? -eq 1
git diff <task4-head>..HEAD | grep -E '^\+' | grep -niE 'j[a]yami|h[e]ttigoda' ; test $? -eq 1
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

1. `build(harness): move the pin to v0.2.18` - `package.json package-lock.json src/env.ts`
2. `feat(readiness): add slo budgets, reach table and the bounded trigger step` - `src/slo.ts src/webhooks/reach.ts src/readiness/checks.ts src/readiness/trigger-step.ts src/auth/twenty.ts src/clients/medusa.ts tests/unit/webhooks/reach.test.ts tests/unit/readiness/checks.test.ts tests/unit/readiness/trigger-step.test.ts tests/unit/auth/flows.test.ts`
3. `test(readiness): add a readiness spec per product` - `src/fixtures/index.ts src/fixtures/twenty-allowlist.ts tests/readiness/cal.readiness.spec.ts tests/readiness/doc.readiness.spec.ts tests/readiness/med.readiness.spec.ts tests/readiness/tw.readiness.spec.ts playwright.config.ts eslint.config.mjs`
4. `chore(env): seed, hostname and heap setup for cloud sessions` - `scripts/harness-seed.mjs scripts/ensure-receiver-hostname.sh .claude/hooks/session-start.sh .cursor/environment.json .env.example AGENTS.md`

PR title: `test(readiness): add environment prerequisites and a readiness check per product`. No trailers.

## 12. Environment changes

Automatic from the repo (after this PR is merged and the environment rebuilt):

- **Cursor cloud:** `.cursor/environment.json` `start` also runs `scripts/ensure-receiver-hostname.sh`. The
  `install` step (`scripts/cloud-install.sh`) and `.cursor/Dockerfile` are unchanged (Node 22.23, Node 24, Docker,
  `poppler-utils` are already there).
- **Claude Code cloud:** `.claude/hooks/session-start.sh` appends the heap option to `NODE_OPTIONS` (keeping the
  image's `--use-openssl-ca`) and adds the hosts line. The setup script is unchanged.
- `npm ci` installs the harness `v0.2.18` (build of its `dist` through `prepare`).

Pasted by hand: **nothing** is required in either environment's settings. UNPROBED on Cursor cloud: its RAM (the
8 GB heap assumes at least 12 GB) and whether passwordless `sudo` exists at `start` (the Dockerfile grants it to
`ubuntu`).

Manual repository setting: none in this PR (required check names: Task 6).

## 13. Will NOT do / Open decisions / Risks

Will NOT do: edit the harness, a fork or `node_modules`; start two stacks at once; use stripe-mock; run a lane case;
set `DANGEROUS_BYPASS_RATE_LIMITS`; commit a hosts-file change; skip a blocked check silently.

| ID | Question | Options | Evidence | Recommended default |
|---|---|---|---|---|
| OD-1 | Twenty needs HR-2 for the clean path (env allow-list, `host.docker.internal`, billing vars) | (a) keep the admin-panel workaround; (b) release HR-2 first | 2.1, 2.3 | (a); HR-2 is optional for the foundation |
| OD-2 | Documenso STR-002/003 and Twenty STR need a Stripe API | (a) accept (c) unit-level; (b) TLS interception; (c) fork change | 2.5 | (c) accept; owner decides later. Not BLOCKING |
| OD-3 | P2-TW-WH-004 expects 5 requests; the pinned code and image give 1 | (a) lane records 1 as the baseline and changes the case text; (b) investigate a different image | `call-webhook.job.ts` catch block, live 45 s watch | (a) |
| OD-4 | P2-MED-WH-001/007 expect "captured"; payment_intent.succeeded authorizes first | (a) lane asserts the code-defined state (authorized, then capture); (b) change the case | 2.4 | (a) |
| OD-5 | Cal readiness `/v2` check is blocked by HR-1 | (a) `test.fixme` with the release id (done); (b) wait | 2.6 | (a); HR-1 is **required** before any Cal `/v2` case |
| OD-6 | DANGEROUS_BYPASS_RATE_LIMITS is UNPROBED | (a) leave unset; (b) probe where the sandbox allows it | the classifier refused; two sign-ins per run do not hit the limit | (a) |
| OD-7 | Cold start times (Cal ~12 min, Documenso ~11 min) eat a 25 min lane | (a) cache the build directories in CI keyed by the product SHA; (b) accept | harness marker is the git SHA | (a) in the lane tasks; Task 6 only budgets it |

Risks: `up` for Cal/Documenso is long and memory hungry (15 GB machine used about 11 GB during Cal's build); Twenty's
lazy application can change in a new image (the SLO constants name the source lines, the trigger step bounds it);
the guest-customer residue of Medusa carts; the hosts line requires root or sudo.

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
   the commit identity from the environment (`GIT_AUTHOR_*`/`GIT_COMMITTER_*`). If the builder is
   Cursor cloud (it adds a `Co-authored-by` trailer), do not push such commits: stop and report.
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
