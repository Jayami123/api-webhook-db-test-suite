# P2 foundation probe record, 2026-11-01

Immutable record. Later probes go into **new dated files** in `docs/probes/`; this file is never edited after it
lands on `main`. Plans cite sections here instead of repeating raw output.

- Date: 2026-11-01 (Asia/Colombo, UTC+05:30). Probes ran about 13:00 to 14:45 Colombo (07:30 to 09:15 UTC).
- Host: Claude Code cloud VM, Node v22.23.3 (`/usr/local/bin`), Node v24.22.0 (`$NODE24`), Docker 29.9.2, 4 cores, 15 GB RAM, Playwright 1.64.0.
- Repo base: `main` = `fd554c901e82a7a936fb0074af42de6b26f56ab1`.
- Harness: `qa-portfolio-harness` pinned in the repo at `v0.2.11` (`f96038f951c8d62521ac60098661a851df9f65bb`); every live probe
  used `v0.2.18` (`de561c56f9307321358e7c682ed48949229f57a0`) built from a scratch clone outside the repo
  (`git clone ... && git checkout v0.2.18 && npm ci`), run with `PRODUCTS_ROOT=/home/user/products`.
- Product pins (`scripts/bootstrap.sh`): Cal `c2b7ac44c66f24ffef1662b276f0653988a609a3`, Documenso `f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c`,
  Medusa starter `f677db438f27294fc50e4c7c6612e71ff38eeff5` (Medusa 2.21.2), Twenty fork `7cbdfec6f346b43715bc2056932f4fad5886f733` with image `twentycrm/twenty:v2.44.0`.
- Method: one product stack at a time, each ended with the harness `down`. Probe scripts were scratch files in the session
  scratchpad and are not committed; the **command** field names the script and what it did. Secrets are redacted
  (`<redacted>`); throwaway passwords and keys were generated per probe.
- Status vocabulary: **CONFIRMED** (observed or read, matches the plan), **UNPROBED** (not run; reason given),
  **CONTRADICTS REVIEW** (observed value differs from the senior review or the master plan).
- "Real output" is trimmed, never edited. Numbers in brackets are explanatory.

Index: P1 env reach (1.1 to 1.4) | P2 stripe-mock reach (2.1 to 2.4) | P3 receiver reach (3) | P4 live webhook shapes (4.1 to 4.4)
| P5 per-run tokens (5.1 to 5.4) | P6 roles (6.1 to 6.5) | P7 base counts (7) | S code-read facts for the review list (8).

---

## P1 Env reach: can a variable reach each product through the harness without editing it?

### 1.1 Cal
- Date: 2026-11-01. Product `c2b7ac4`. Harness `v0.2.18`.
- Command: read `src/internal/spawn-detached.ts` and `src/internal/run.ts`; then `node scripts/up.mjs cal` with `DAILY_WEBHOOK_SECRET=<redacted> CRON_API_KEY=<redacted> NODE_OPTIONS="--use-openssl-ca --max-old-space-size=8192"`, then a signed POST to the Daily route and POSTs to the cron route (`cal-probe.mjs`, curl).
- Output (trimmed):
  ```text
  spawn-detached.ts:46  env: { ...process.env, ...options.env }       run.ts:54  env: { ...process.env, ...options.env }
  daily reserialised sig, spaced body -> 400 {"message":"Invalid Payload"}   (signature accepted: the secret reached the web process)
  POST /api/cron/webhookTriggers no key -> 401 | ?apiKey=wrong -> 401 | ?apiKey=<right> -> 200 {"ok":true} | Authorization:<right> -> 200
  ```
- Establishes: `DAILY_WEBHOOK_SECRET` and `CRON_API_KEY` set in the environment of `up` reach Cal's web process (works from P2 env). Cron route is POST (GET -> 405) and takes `Authorization: <key>` without `Bearer`.
- Citation: `qa-portfolio-harness@v0.2.18 src/internal/spawn-detached.ts:46`, `src/internal/run.ts:54`; `apps/web/app/api/cron/webhookTriggers/route.ts:7-12` (Cal `c2b7ac4`).
- Status: CONFIRMED.

### 1.2 Cal heap
- Command: `node -e 'v8.getHeapStatistics().heap_size_limit'` (Node 22 and 24); `echo $NODE_OPTIONS`; read `src/adapters/cal.adapter.ts:53-58`.
- Output: `2096 MB default heap limit (node 22)`, `2240 MB (node 24)`, `NODE_OPTIONS=--use-openssl-ca`; `calHeapEnv`: `NODE_OPTIONS: processEnv.NODE_OPTIONS?.trim() || "--max-old-space-size=8192"`.
- Establishes: the harness applies its 8 GB default only when `NODE_OPTIONS` is empty; this image presets it, so the default is skipped. Cal `up` with an explicit 8192 heap compiled and started (about 12 minutes cold).
- Citation: `qa-portfolio-harness@v0.2.18 src/adapters/cal.adapter.ts:53-58`.
- Status: CONFIRMED.

### 1.3 Documenso
- Date: 2026-11-01. Product `f4105e4`. Harness `v0.2.18`.
- Command: `PATH=/opt/node24/bin:$PATH node scripts/up.mjs documenso` with `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=127.0.0.1 NEXT_PUBLIC_FEATURE_BILLING_ENABLED=true NEXT_PRIVATE_STRIPE_WEBHOOK_SECRET=<redacted> NEXT_PRIVATE_STRIPE_API_KEY=<redacted>`; second attempt with `NODE_OPTIONS="--use-openssl-ca --max-old-space-size=7168"`; restart without the billing variables; Stripe route and envelope-create probes (`doc-probe2.mjs`, `doc-stripe.mjs`).
- Output (trimmed):
  ```text
  attempt 1: FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
             npm error command sh -c react-router typegen && tsc   (exit code 134, Mark-Compact 2044.7 MB)
  attempt 2 (7168 MB): Documenso web is up at http://127.0.0.1:3001
  billing on : POST /api/v2/envelope/create -> 400 "You have reached your document limit for this month. Please upgrade your plan." (LIMIT_EXCEEDED)
  restart w/o flag: "Documenso build matches HEAD f4105e47...; skipping the build"   -> envelope/create 200 {"id":"envelope_..."}
  ```
- Establishes: env vars reach Documenso (host process); the heap must be set explicitly; the billing flag takes effect on restart and a cached build does not hide it (marker is the git SHA only; server code reads `process.env` at request time); billing on breaks document creation (separate stack run for billing cases).
- Citation: `qa-portfolio-harness@v0.2.18 src/adapters/documenso.adapter.ts:160-195` (marker), `src/adapters/documenso-env.ts:276-278`; Documenso `packages/lib/utils/env.ts:12-19`, `packages/lib/constants/app.ts:54`.
- Status: CONFIRMED.

### 1.4 Documenso `DANGEROUS_BYPASS_RATE_LIMITS`
- Command: the same `up` command with `DANGEROUS_BYPASS_RATE_LIMITS=true` added.
- Output: `Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Safety Bypass Flag].` The command did not run; the flag was dropped and not worked around.
- Establishes: nothing about the flag's effect. Code only: forwarded when exactly `"true"`.
- Citation: `qa-portfolio-harness@v0.2.18 src/adapters/documenso-env.ts:276-278`.
- Status: UNPROBED (sandbox classifier refusal).

### 1.5 Medusa
- Date: 2026-11-01. Product `f677db4`. Harness `v0.2.18` (and `v0.2.11` by code read).
- Command: `MEDUSA_REDIS=1 MEDUSA_STRIPE=1 STRIPE_API_KEY=<redacted> STRIPE_WEBHOOK_SECRET=<redacted> node scripts/up.mjs medusa`; `docker ps`; log grep; `grep -n -i 'event-bus\|MEDUSA_REDIS' src/adapters/medusa-env.ts` in the v0.2.11 install and the v0.2.18 clone.
- Output (trimmed):
  ```text
  qa-harness-medusa-postgres-1 127.0.0.1:5433->5432   qa-harness-medusa-redis-1 127.0.0.1:6380->6379
  seed: "Medusa seed step Stripe on Europe: 0.070 s"     regions: Europe:eur:pp_stripe_stripe | United States:usd:(none)
  log: "Retrying payment.webhook_received which has 1 subscribers (1 of them failed)"  (3 error lines for one event)
  v0.2.11 medusa-env.ts:237-243  resolve: "@medusajs/medusa/event-bus-redis"     v0.2.18 adds MEDUSA_LOCK (medusa-env.ts:162-181)
  ```
- Establishes: `MEDUSA_REDIS=1`, `MEDUSA_STRIPE=1` and the Stripe variables work from P2 env in both harness versions; event retries are 3 attempts with Redis. v0.2.18 does not add event-bus-redis.
- Citation: `qa-portfolio-harness@v0.2.11 src/adapters/medusa-env.ts:237-243`; `@v0.2.18 ...:162-181`; `CHANGELOG.md` v0.2.13.
- Status: CONTRADICTS REVIEW (review fact 13).

### 1.6 Twenty
- Date: 2026-11-01. Fork `7cbdfec`, image `v2.44.0`. Harness `v0.2.18`.
- Command: `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS="host.docker.internal,172.17.0.1" node scripts/up.mjs twenty`; then `docker exec qa-harness-twenty-server-1 sh -c 'env | grep -c OUTBOUND; getent hosts host.docker.internal'`; `docker network inspect qa-harness-twenty_default`.
- Output:
  ```text
  0
  host.docker.internal: no resolution
  172.18.0.1
  ```
- Establishes: the variable does not reach the containers (compose lists no such key; the runtime override forwards only rate-limit names); `host.docker.internal` does not resolve (no `extra_hosts`); the compose network gateway is `172.18.0.1`.
- Citation: `qa-portfolio-harness@v0.2.18 docker/twenty.compose.yml:1-50`, `src/adapters/twenty-runtime-override.ts:41-72`.
- Status: CONTRADICTS REVIEW (review fact 7 for Twenty; the env route needs a harness release).

---

## P2 stripe-mock reach: can any Stripe SDK be redirected?

### 2.1 Documenso
- Command: `sed` of `packages/lib/server-only/stripe/index.ts`; `grep -n DEFAULT_HOST` in `documenso/node_modules/stripe/cjs/stripe.core.js`; `grep process.env` in the stripe cjs files.
- Output: `new Stripe(env('NEXT_PRIVATE_STRIPE_API_KEY') ?? '', { apiVersion: '2022-11-15', typescript: true })`; stripe `12.18.0`; `const DEFAULT_HOST = 'api.stripe.com'`; no `process.env` host lookup.
- Establishes: no host option and no environment variable.
- Citation: `packages/lib/server-only/stripe/index.ts:5-8` (Documenso `f4105e4`); `stripe@12.18.0 cjs/stripe.core.js:13`.
- Status: CONFIRMED (stripe-mock unusable without a fork edit or interception).

### 2.2 Twenty
- Command: `sed` of `stripe-sdk.service.ts`; `grep '"stripe"' package.json`.
- Output: `return new Stripe(stripeApiKey, {});` stripe `20.4.1`.
- Citation: `packages/twenty-server/src/engine/core-modules/billing/stripe/stripe-sdk/services/stripe-sdk.service.ts:9-10` (Twenty `7cbdfec`).
- Status: CONFIRMED.

### 2.3 Medusa
- Command: `grep` in `@medusajs/payment-stripe/dist/core/stripe-base.js`; `grep DEFAULT_HOST` in the pnpm stripe copies.
- Output: `this.stripe_ = new stripe_1.default(options.apiKey);` stripe `15.12.0` and `19.1.0`, both `DEFAULT_HOST = 'api.stripe.com'`.
- Citation: `@medusajs/payment-stripe@2.21.2 dist/core/stripe-base.js:27` (Medusa starter `f677db4`).
- Status: CONFIRMED.

### 2.4 Network
- Command: `curl -sS -m 10 -o /dev/null -w '%{http_code}' https://api.stripe.com/v1/charges` through the sandbox proxy.
- Output: `000`.
- Establishes: `api.stripe.com` is unreachable from the sandbox. No stripe-mock image was pinned because none is used.
- Status: CONFIRMED (ENV finding, not worked around).

---

## P3 Receiver reach from a container

- Date: 2026-11-01. Docker 29.9.2. No product involved (images `alpine:3.20`, `postgres:15`).
- Command: for each bind in `127.0.0.1 172.17.0.1 0.0.0.0`: start `node listen.mjs <bind> 4317` on the host, then
  `docker run --rm --add-host host.docker.internal:host-gateway alpine:3.20 sh -c 'getent hosts host.docker.internal; wget -q -T 4 -O- http://host.docker.internal:4317/'`; also `docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}'` (and through `networkGateway("bridge")` of the Task 2 helper in the scratch copy).
- Output:
  ```text
  172.17.0.1
  == bind 127.0.0.1   172.17.0.1 host.docker.internal ... wget: can't connect to remote host (172.17.0.1): Connection refused
  == bind 172.17.0.1  ... ok-172.17.0.1
  == bind 0.0.0.0     ... ok-0.0.0.0
  ```
- Establishes: loopback is unreachable from containers; the bridge gateway and the wildcard are reachable. Decision: bind loopback plus the gateway of the product's Docker network; never a wildcard. Twenty's compose network has its own gateway (`172.18.0.1`, see 1.6).
- Citation: Docker docs behaviour of `host-gateway`; `docker/twenty.compose.yml` (no `extra_hosts`).
- Status: CONFIRMED.

---

## P4 Live webhook shapes (receiver captured raw headers and bytes)

### 4.1 Cal
- Date: 2026-11-01. `c2b7ac4`, harness `v0.2.18`.
- Command: next-auth credentials login as the seeded user, tRPC `webhook/create` and `webhook/testTrigger` to `http://127.0.0.1:4317/r/<run id>/cal1` (`cal-probe.mjs`, receiver from the scratch copy of the Task 2 code).
- Output:
  ```text
  headers {"host":"127.0.0.1:4317","connection":"keep-alive","content-type":"application/json","x-cal-signature-256":"<len 64> hmac(raw)=true",
           "x-cal-webhook-version":"2021-10-20","accept":"*/*","user-agent":"node","content-length":"455"}
  body keys [ 'triggerEvent', 'createdAt', 'payload' ]  triggerEvent BOOKING_CREATED
  daily: reserialised sig over spaced body -> 400 Invalid Payload | raw sig over the same bytes -> 403 Signature does not match
         tampered body -> 403 | no headers -> 403
  ```
- Establishes: header names, HMAC over the raw bytes; Daily raw and reserialised modes behave as the route code says; the self-hosted SSRF check allows a loopback receiver.
- Citation: `packages/features/webhooks/lib/sendPayload.ts:296-299, 312-322`; `apps/web/app/api/recorded-daily-video/route.ts:40-45, 62-75`; `packages/lib/ssrfProtection.ts:140-147`.
- Status: CONFIRMED.

### 4.2 Documenso
- Date: 2026-11-01. `f4105e4`, harness `v0.2.18`, hosts line `127.0.0.1 p2-receiver.test`, `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=p2-receiver.test`, billing off.
- Command: tRPC `webhook.createWebhook` with a loopback URL, then with the hostname; `POST /api/v2/envelope/create`; receiver mode `500`; DB reads of `WebhookCall` and `BackgroundJob` (`doc-probe.mjs`, `doc-probe2.mjs`).
- Output:
  ```text
  createWebhook http://127.0.0.1:4317/...  -> 400 "Webhook URL cannot point to a private or loopback address"
  headers {"host":"p2-receiver.test:4317","content-type":"application/json","x-documenso-secret":"<len 21> equals configured: true","user-agent":"node","content-length":"2086"}
  body keys [ 'event', 'payload', 'createdAt', 'webhookEndpoint' ]  event DOCUMENT_CREATED     (first delivery 378 ms after the call)
  WebhookCall rows [{"status":"SUCCESS","responseCode":200,"event":"DOCUMENT_CREATED"}]
  mode 500: 4 deliveries within ~82 ms (03.471 03.504 03.530 03.553)   BackgroundJob FAILED retried=3 maxRetries=3
  ```
- Establishes: plain secret header, create-time vs send-time URL check, retries (initial + 3, no back-off).
- Citation: `packages/lib/server-only/webhooks/execute-webhook-call.ts`; `packages/trpc/server/webhook-router/schema.ts:6-14`; `packages/lib/jobs/client/local.ts:318`; `schema.prisma:1129`.
- Status: CONFIRMED (the create-time behaviour CONTRADICTS REVIEW fact 3 as the review states it; see 8).

### 4.3 Twenty
- Date: 2026-11-01. `7cbdfec`, image `v2.44.0`, harness `v0.2.18`.
- Command: sign in, exchange the loginToken, `createDatabaseConfigVariable` via `/admin-panel`, REST `POST /rest/webhooks` (target `http://172.18.0.1:4317/r/<run id>/tw1`), `POST /rest/people`, receiver mode `ok` then `500` watched 45 s (`tw-probe.mjs`).
- Output:
  ```text
  headers {"content-type":"application/json","x-twenty-webhook-timestamp":"1793519354730","x-twenty-webhook-signature":"9667f7…(64)",
           "x-twenty-webhook-nonce":"07b9da…(32)","user-agent":"axios/1.19.0","content-length":"1232"}
  hmac(secret, ts:rawBody) matches = true | ts digits 13 | body bytes 1232
  body keys [targetUrl, eventName, objectMetadata, workspaceId, webhookId, eventDate, record]  eventName person.created
  mode 500, 45 s: deliveries 1
  ```
- Establishes: millisecond timestamp, unsigned nonce, signature over `${timestamp}:${rawBody}`, a single request on 500.
- Citation: `packages/twenty-server/src/engine/metadata-modules/webhook/jobs/call-webhook.job.ts` (`generateSignature`, header block, `timeout: 5_000`, catch block).
- Status: CONFIRMED for the construction; the single request CONTRADICTS REVIEW (master plan P2-TW-WH-004 expects 5).

### 4.4 Twenty lazy application (found by the readiness run)
- Command: `npx playwright test --project=tw-api tests/readiness/tw.readiness.spec.ts` in the scratch copy; `docker logs qa-harness-twenty-worker-1 | grep -E "Outbound HTTP|CallWebhookJob"`; read `config-variables-refresh-cron-interval.constants.ts` and `workspace-cache.service.ts`.
- Output (trimmed): attempt 1, worker log `Outbound HTTP request: POST http://172.18.0.1:4317/r/.../tw-ready-wh` then `processed ... in 16.81ms`, receiver 0 deliveries; constants `CONFIG_VARIABLES_REFRESH_CRON_INTERVAL = '*/15 * * * * *'`, `MEMOIZER_TTL_MS = 10_000`. After the bounded re-trigger: 5 passed (33.0 s) twice.
- Establishes: a freshly set allow-list needs up to 15 s in the worker and a new webhook up to 10 s; an early event is dropped, not retried.
- Citation: `twenty-config/constants/config-variables-refresh-cron-interval.constants.ts:1`; `workspace-cache/services/workspace-cache.service.ts:55-57`; `call-webhook.job.ts` catch block.
- Status: CONFIRMED.

### 4.5 Medusa inbound (no outgoing webhook)
- Date: 2026-11-01. `f677db4`, harness `v0.2.18` with Redis and Stripe.
- Command: `POST /hooks/payment/stripe_stripe` with a valid, a bad, a missing signature and an unknown provider (`med-probe2.mjs`, header from Stripe SDK 19.1.0 `generateTestHeaderString`); then a system-provider payment session and a signed `payment_intent.succeeded` with `metadata.session_id` set to it (`med-probe3.mjs`, `med-probe4.mjs`).
- Output:
  ```text
  stripe-signature shape t=1793518811,v1=<v1:64hex>
  POST signed -> 200 "OK" | bad sig -> 200 | no sig -> 200 | unknown provider -> 200
  log: "No signatures found matching the expected signature for payload" / "No stripe-signature header value was provided"
  payment session (stripe provider) -> 400 "Payment provider pp_stripe_stripe is not enabled in the cart's region"
  before {status:'pending'} -> webhook 200 -> settled after 5577 ms {status:'authorized', authorized:true}; payments {c:1}
  ```
- Establishes: the hook always answers 200 and verifies later; a Stripe-signed event drives a system-provider session to `authorized` in about 5.6 s with no Stripe API call; success authorizes first.
- Citation: `@medusajs/medusa@2.21.2 dist/api/hooks/payment/[provider]/route.js` (delay `webhook_delay || 5000`, attempts 3); `payment-stripe/dist/core/stripe-base.js:418-429`; `core-flows/dist/payment/workflows/process-payment.js:96-117`.
- Status: CONFIRMED (the "captured" expectation of P2-MED-WH-001/007 CONTRADICTS REVIEW).

### 4.6 Documenso Stripe route (billing run)
- Date: 2026-11-01. Billing flag and secret in `up`'s environment.
- Command: eight `POST /api/stripe/webhook` requests with headers from the Task 2 `signStripe` (Stripe SDK 23.0.1) (`doc-stripe.mjs`).
- Output:
  ```text
  unsigned 400 {"message":"No signature found in request"} | empty body 400 "No payload found in request" | garbage 500 "Unknown error"
  wrong secret 500 | stale (-600 s) 500 | charge.succeeded (non-synced) 200 | synced type, no customer 200 | synced type with customer 500
  ```
- Establishes: the rows that need no Stripe API call; the 23.0.1 header is accepted by Documenso's stripe 12.18.0 (same `v1` scheme).
- Citation: `packages/ee/server-only/stripe/webhook/handler.ts:26-118`.
- Status: CONFIRMED.

---

## P5 Per-run tokens: the HTTP path that mints and revokes

### 5.1 Medusa
- Date: 2026-11-01. `f677db4`.
- Command: `med-probe.mjs`: login, create secret key, Basic and Bearer calls, revoke, delete, publishable delete; later readiness run for the sales channel.
- Output:
  ```text
  login 200 [ 'token' ]   jwt claims actor_id, actor_type, auth_identity_id, ..., iat, exp  ttl_s 86400
  create secret key 200 { api_key: id, token, redacted, title, type, ... }
  basic users/me 404 | bearer(secret) users/me 401 "A secret API key was passed as a Bearer token..."
  revoke 200 | basic after revoke 401 {"message":"Unauthorized"} | delete 200 {"deleted":true}
  delete publishable (not revoked) 400 | revoke then delete 200
  readiness: GET /store/products with a new publishable key -> 400 "Publishable key needs to have a sales channel configured"
  ```
- Establishes: mint with the admin JWT, Basic auth for the secret key, revoke then delete, post-revoke 401, and the sales-channel link a publishable key needs.
- Citation: `@medusajs/framework@2.21.2 dist/http/middlewares/authenticate-middleware.js:6-8, 64-70`.
- Status: CONFIRMED.

### 5.2 Twenty
- Command: `tw-probe.mjs` (sign in, exchange, `getRoles`, `createApiKey`, `generateApiKeyToken`, REST call, `revokeApiKey`, REST call).
- Output:
  ```text
  harness authenticate() token type WORKSPACE_AGNOSTIC -> getRoles errors FORBIDDEN "This endpoint is not available to this caller"
  exchanged token type ACCESS, claims sub,userId,workspaceId,workspaceMemberId,userWorkspaceId,type,authProvider,isImpersonating,iat,exp, ttl_s 1800
  getRoles ["Admin","Guest","Object-restricted","Impersonate-only","Member"] | createApiKey 200 | REST people with minted key 200
  revokeApiKey 200 | REST people after revoke 403 {"messages":["This API Key is revoked"],"error":"FORBIDDEN_EXCEPTION"}
  ```
- Citation: `core-modules/api-key/api-key.resolver.ts:76-133`; `core-modules/auth/auth.resolver.ts:1081-1095`; harness `src/adapters/twenty.adapter.ts:276-330`.
- Status: CONFIRMED.

### 5.3 Documenso
- Command: `doc-probe.mjs` (csrf, authorize, `apiToken.create`, v2 call with and without `Bearer`, `apiToken.delete`).
- Output:
  ```text
  teamId 3 | authorize 201 cookies [ 'csrfToken', 'sessionId' ] | apiToken.create 200 {"id":1,"token":"<redacted>"} token shape api_…len20
  GET /api/v2/envelope with token 200 | with Bearer prefix 200 | without token 401
  createWebhook with hostname but no x-team-id -> 404 "Team not found"
  apiToken.delete 200 | GET /api/v2/envelope after delete 401
  ```
- Citation: `packages/auth/server/routes/email-password.ts:39-95`; `packages/trpc/server/api-token-router/*`; `packages/trpc/server/context.ts:33`.
- Status: CONFIRMED.

### 5.4 Cal
- Command: `cal-probe.mjs` (login, `apiKeys/create`, DB read of `"ApiKey"`, `apiKeys/delete`, DB read, `curl http://127.0.0.1:5555/`).
- Output:
  ```text
  login 200 cookies [ 'next-auth.csrf-token', 'next-auth.callback-url', 'next-auth.session-token' ]
  apiKeys.create 200 [{"result":{"data":{"json":"cal_<redacted>"}}}] | ApiKey rows with note [{"id":...,"note":"<run id>-probe","never_expires":true}]
  apiKeys.delete 200 | ApiKey rows after delete 0 | api v2 5555 -> 000 (connection refused)
  ```
- Establishes: the key is minted and deleted through the web app; API v2, its only consumer, is not started by the harness.
- Citation: `packages/trpc/server/routers/viewer/apiKeys/create.handler.ts`; `apps/web/pages/api/trpc/apiKeys/`.
- Status: CONFIRMED for mint/delete; use of the key on `/v2` UNPROBED (no API v2; needs a harness release).

### 5.5 Playwright processes and traces
- Command: toy project with a setup, a main and a teardown project sharing a module variable; `npx playwright test -c toy.config.ts`.
- Output: `SETUP pid 8598 worker 0` / `MAIN pid 8609 worker 1 token in memory: undefined` / `TEARDOWN pid 8620 worker 2 token in memory: undefined`.
- Establishes: a setup project cannot hand a token to tests in memory. Playwright traces record request headers (documented behaviour, not run).
- Status: CONFIRMED (process split); trace content of an `Authorization` header UNPROBED (not run; `trace: "off"` chosen).

---

## P6 Database roles

### 6.1 Throwaway postgres:15 (non-superuser owner, then superuser owner)
- Command: `docker run -d --rm --name p2probe-pg -e POSTGRES_USER=appowner ... postgres:15` and `psql` scripts for provisioning, grants, writes, teardown.
- Output (trimmed):
  ```text
  owner without CREATEROLE: ERROR: permission denied to create role
  superuser owner: provisioned1 / provisioned2_idempotent / cols_ok
  qa_ro  select Task 1 | select table created later 0 rows ok | select ws_1.person (schema created later) 1 | insert ERROR: cannot execute INSERT in a read-only transaction
         BEGIN READ WRITE; INSERT -> ERROR: permission denied for table later
  qa_fixture update "scheduledAt" ok | update attempts / note / DELETE / INSERT / ws_1.person -> permission denied
  pg_read_all_data: reads schema created AFTER the grant -> 1 | teardown ok (DROP OWNED BY + DROP ROLE) | roles left 0
  ```
- Status: CONFIRMED.

### 6.2 Cal (PostgreSQL 18.6, user `postgres`, trust auth)
- Command: `node scripts/db-roles.ts provision cal` twice, rules and fixture-writer scripts from the scratch copy, `teardown cal`.
- Output: `db-roles provision: cal ok` (x2); fixture writer applied `Task.scheduledAt` and `WebhookScheduledTriggers.startAfter`, refused `attempts`, a wrong case id and a missing row; as `qa_fixture` raw SQL: `server refused 42501` for update attempts, delete, insert, select payload, update Booking; `db-roles teardown: cal ok`, roles left 0.
- Citation: `packages/prisma/docker-compose.yml:4` (postgres:18); `schema.prisma:1318, 1830`.
- Status: CONFIRMED.

### 6.3 Documenso (PostgreSQL 15), Medusa (15), Twenty (16.15)
- Command: same provisioning script per product; Twenty also `CREATE SCHEMA p2_probe_later` then read as `qa_ro`.
- Output: `db-roles provision: documenso ok`, `medusa ok`, `twenty ok`; Twenty: `server 16.15 ... super true`, `ro select ... 182`, `ro delete {"err":"25006 cannot execute DELETE in a read-only transaction"}`, `ro select schema created after provisioning [{"count":1}]`, `teardown owned ok roles ok`, `leftover roles 0`.
- Establishes: every harness database is owned by a superuser, so provisioning needs no harness change; the invariant rules ran without SQL error on Cal (7), Documenso (7), Medusa (5), and Twenty (3).
- Status: CONFIRMED.

### 6.4 Seed data is not clean (Documenso)
- Command: `select status, count(*), count("completedAt") from "Envelope" group by 1` and the unscoped envelope rule.
- Output: `DRAFT 354 / 0`, `PENDING 337 / 0`, `COMPLETED 333 / 0`; titles like `[MEDIUM] Document 2 - COMPLETED`.
- Citation: `packages/prisma/seed/documents.ts:65, 676`.
- Status: CONFIRMED (seed data, not a runtime defect).

---

### 6.5 Playwright auto-fixture teardown order (basis of the P2-X-DB-001 sweep)
- Date: 2026-11-01. No product. Playwright 1.64.0, toy project in the scratchpad.
- Command: `npx playwright test` on a spec with an `auto: true` fixture `sweep` and an explicit fixture `created`, one passing and one failing test, logging setup and teardown.
- Output:
  ```text
  ORDER t1 uses explicit fixture sweep:setup > created:setup > body > created:teardown(cleanup) > sweep:teardown(after use)
  ORDER t2 fails in body        sweep:setup > created:setup > body-fail > created:teardown(cleanup) > sweep:teardown(after use)
    1 failed
    1 passed
  ```
- Establishes: an auto fixture tears down after the test's own fixtures, also when the body fails, so the sweep sees the state after atomic cleanup.
- Status: CONFIRMED.

---

## P7 Base counts on `main`

- Command: `npm run check; echo $?`; `grep -c '^\s*test(' tests/db/read-only-server.db.test.ts`.
- Output: `# tests 102`, `# pass 102`, `# fail 0`, exit `0`; db-guard file has 8 tests.
- Status: CONFIRMED.

---

## S Code-read facts checked against the senior review (no run needed)

| Review item | Reading | Citation | Status |
|---|---|---|---|
| 1 Cal outgoing signature | HMAC-SHA256 hex over the body; `no-secret-provided` without a secret | Cal `sendPayload.ts:296-299, 316` | CONFIRMED |
| 1 scheduled triggers | job row deleted after the fetch starts; old rows purged | `handleWebhookScheduledTriggers.ts:9-12, 79-83` | CONFIRMED |
| 1 immediate retry | `sendPayload` returns `{ok:false}` without throwing, so the tasker task succeeds | `sendPayload.ts:324-327`, `tasker/tasks/sendWebook.ts:21-27` | CONTRADICTS REVIEW |
| 2 Daily | base64-decoded key, `${ts}.${JSON.stringify(body)}`, base64; headers `x-webhook-timestamp`, `x-webhook-signature` | `route.ts:40-45, 70-73` | CONFIRMED |
| 3 Documenso | `X-Documenso-Secret`, 10 000 ms, `redirect: manual`; billing flag | `execute-webhook-call.ts`, `packages/lib/constants/app.ts:54` | CONFIRMED |
| 4 Twenty | headers, ms timestamp, unsigned nonce, 5 000 ms, no effective retry | `call-webhook.job.ts`, `secure-http-client.service.ts:62-70` | CONFIRMED |
| 5 Stripe | SDK only; tolerance 300 from the SDK | stripe 23.0.1 `esm/Webhooks.js` (`DEFAULT_TOLERANCE`) | CONFIRMED |
| 8 time columns | `Task.scheduledAt`, `WebhookScheduledTriggers.startAfter` (master plan: `startTime`), `Recipient.expiresAt`, `Recipient.nextReminderAt` (master plan: `lastReminderAt`) | `schema.prisma` Cal 1318, 1830; Documenso 640, 645; sweep handlers line 13 | CONTRADICTS REVIEW (names) |
| master plan IDs | `P2-X-DB-001`, `P2-X-WH-001` | not present in `docs/master-plan.html` | CONTRADICTS REVIEW |

## Unprobed items carried forward

Documenso `DANGEROUS_BYPASS_RATE_LIMITS` (1.4); Twenty billing route and `host.docker.internal` after a harness release;
Cal key on `/v2`; `x-p2-run-id` on POST and login routes (only GET health routes answered 200 with it: Cal `/api/auth/csrf`,
Documenso `/api/auth/csrf`, Medusa `/health`, Twenty `/healthz`, in the readiness specs); HTML and JUnit reporter content;
Cursor cloud RAM and `sudo`; CI job durations; Medusa EB-001/002.
