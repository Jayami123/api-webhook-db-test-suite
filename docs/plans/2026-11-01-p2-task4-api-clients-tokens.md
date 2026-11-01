# P2 foundation Task 4: typed API clients and per-run credentials (plan only)

Builds on Task 3 (`docs/plans/2026-11-01-p2-task3-db-roles-invariants.md`). Index:
`docs/plans/2026-11-01-p2-foundation-index.md`. Implements roadmap decision D6 (dynamic tokens) with the
senior review's changes: tokens are minted through each product's HTTP API for this run, held in memory only,
revoked at the end and proven dead.

## 1. Header

- Plan branch `plan/2026-11-01-p2-foundation`. Base commit at plan time: `main` = `fd554c901e82a7a936fb0074af42de6b26f56ab1`.
- Build branch: `feat/<build-date>-p2-task4-api-clients-tokens`, `<build-date>` = `date -u +%F`. **Cut from the head
  of the Task 3 branch**, record that SHA. PR base: the Task 3 branch.
- Depends on Tasks 1 to 3 (uses `runScopedName`, `readOnlyDb`/`qa_ro`, the `retained` registry and the `test` of
  `src/invariants/fixture.ts`). Receiver and signers (Task 2) are not used here.
- Unit chain: Task 3 head **214** -> this task **250** (+36: 34 plus the 2 reaper tests). db-guard unchanged (22).
- Harness stays `v0.2.11` here; Task 5 moves it to `v0.2.18`. Nothing in this task starts a product.
- Probe date 2026-11-01. Each product was started with the harness (`v0.2.18` scripts from a scratch clone, same
  product refs as `scripts/bootstrap.sh`), probed, and ended with its `down`.
- Verification of this plan: the code below was built in a scratch copy (`npm run check` exit 0, 250/250) and the
  same modules then ran **live** against all four products inside the Task 5 readiness specs (section 2.6).

## 2. Probe findings (P5: how each product mints and revokes a credential for this run)

> Raw results live in `docs/probes/2026-11-01-p2-foundation-probes.md` (sections 5.1 to 5.5). The text below summarises and cites them.

### 2.1 Medusa 2.21.2 (starter `f677db4`)

```text
POST /auth/user/emailpass {email,password}            -> 200 {token}   JWT, claims actor_id,actor_type,...,iat,exp  ttl 86400 s
  the JWT cannot be revoked; it is used only to create API keys.
POST /admin/api-keys {title,type:"secret"}  (Bearer JWT) -> 200 {api_key:{id,token,redacted,title,type,...}}
GET  /admin/users/me with  Authorization: Basic base64(token + ":")  -> 404   (an API key has no user actor: use /admin/regions)
GET  .../admin/regions     with the same Basic header -> 200;  with "Bearer <secret key>" -> 401
     "A secret API key was passed as a Bearer token. Secret API keys must be sent using HTTP Basic authentication instead"
POST /admin/api-keys/{id}/revoke {}  -> 200 (revoked_at set);  the same Basic header now -> 401 {"message":"Unauthorized"}
DELETE /admin/api-keys/{id}          -> 200 {"deleted":true}
publishable key: DELETE before revoke -> 400;  revoke then DELETE -> 200
a NEW publishable key has no sales channel: GET /store/products -> 400 "Publishable key needs to have a sales channel configured"
  fix: POST /admin/api-keys/{id}/sales-channels {add:[<default channel id>]}
```

Sources: `@medusajs/framework` `http/middlewares/authenticate-middleware.js:6-8, 64-70` (api-key auth is Basic), the
payment hook `@medusajs/medusa/dist/api/hooks/payment/[provider]/route.js`. Admin credentials come from
`MEDUSA_ADMIN_EMAIL` / `MEDUSA_ADMIN_PASSWORD`, which the harness `seed()` turns into the admin user: there is no
public default, so CI generates both per job.

### 2.2 Twenty (image v2.44.0, fork `7cbdfec`)

```text
harness authenticate() returns a token of type WORKSPACE_AGNOSTIC (claims sub,userId,authProvider,type,iat,exp)
  -> POST /metadata  query { getRoles { id label } }  -> errors[0] FORBIDDEN "This endpoint is not available to this caller"
signIn(email,password){ availableWorkspaces{ availableWorkspacesForSignIn{ loginToken workspaceUrls{subdomainUrl customUrl} } } }
  -> getAuthTokensFromLoginToken(loginToken, origin) -> token type ACCESS (claims ...,workspaceId,workspaceMemberId,userWorkspaceId), ttl 1800 s
getRoles -> Admin, Guest, Object-restricted, Impersonate-only, Member
createApiKey(input:{name,expiresAt,roleId})  -> {id}       generateApiKeyToken(apiKeyId: UUID!, expiresAt: String!) -> {token}
GET /rest/people?limit=1 with "Bearer <token>" -> 200
revokeApiKey(input:{id})  -> {id,revokedAt};  the same key now -> 403 {"messages":["This API Key is revoked"],"error":"FORBIDDEN_EXCEPTION"}
```

Sources: `core-modules/api-key/api-key.resolver.ts` (`createApiKey`, `revokeApiKey`), `core-modules/auth/auth.resolver.ts:1081-1095`
(`generateApiKeyToken`). The harness `authenticate()` therefore cannot be used for workspace GraphQL or REST: the
module signs in itself. Default login = the harness's public dev-seeder values (`TWENTY_DEFAULT_ADMIN_EMAIL`
`jane.austen@apple.dev`, `TWENTY_DEV_SEED_PASSWORD`), overridable with `TWENTY_EMAIL` / `TWENTY_PASSWORD`.

### 2.3 Documenso (fork `f4105e4`)

```text
GET  /api/auth/csrf -> 200 {csrfToken} + cookie csrfToken
POST /api/auth/email-password/authorize {email,password,csrfToken} -> 201 + cookie sessionId
POST /api/trpc/apiToken.create  {"json":{teamId,tokenName,expirationDate:null}}  (cookie)  -> 200 {"result":{"data":{"json":{id,token}}}}
  token "api_" + 16 chars (len 20). Accepted as `Authorization: <token>` and as `Authorization: Bearer <token>`.
GET  /api/v2/envelope?page=1&perPage=1 with the token -> 200; without -> 401
POST /api/trpc/apiToken.delete {"json":{id,teamId}} -> 200;  the token now -> 401
tRPC needs the team: header x-team-id (webhook.createWebhook without it -> 404 "Team not found")
```

Sources: `packages/auth/server/routes/email-password.ts:39-95`, `packages/trpc/server/api-token-router/*`,
`packages/trpc/server/context.ts:33`. The user's personal team id comes from a read-only query as `qa_ro`
(`Team` joined to `Organisation.ownerUserId` and `User.email`). Default login = the fork's dev seed
(`example@documenso.com` / `password`, `packages/prisma/seed/initial-seed.ts:57`, `users.ts:28`).

### 2.4 Cal (fork `c2b7ac4`; web app on 3000 only)

```text
GET  /api/auth/csrf -> 200;  POST /api/auth/callback/credentials (form: csrfToken,email,password,callbackUrl,json=true) -> cookie next-auth.session-token
POST /api/trpc/apiKeys/create?batch=1 {"0":{"json":{note,neverExpires:true}}} -> [{"result":{"data":{"json":"cal_..."}}}]
  DB row "ApiKey" (note carries the run prefix);  POST /api/trpc/apiKeys/delete?batch=1 {id} -> 200 and the row is gone (hard delete)
port 5555 (API v2, the only consumer of the key): connection refused. Harness v0.2.18 starts Cal's web app and Postgres only.
```

Sources: `packages/trpc/server/routers/viewer/apiKeys/{create,delete}.handler.ts`, `apps/web/pages/api/trpc/apiKeys/`.
Default login = `pro@example.com` / `pro` (`scripts/seed.ts:678-681`). **What Task 4 can do for Cal without API v2:**
mint and delete the key through the web app, prove it exists and is gone through the read-only oracle, and use
the session cookie for everything else the web app serves (webhook CRUD, the cron and Daily routes). Using the key
against `/v2/*` is blocked until the harness starts API v2 (harness-release prerequisite HR-1, index).

### 2.5 Processes and traces (Playwright 1.64.0)

```text
setup project  pid 8598 worker 0   token in memory: set
test project   pid 8609 worker 1   token in memory: undefined
teardown       pid 8620 worker 2   token in memory: undefined
```

Setup, tests and teardown run in different processes, so a setup project cannot hand a token to the tests in
memory; handing it over through a file would put a secret into an artefact. Playwright traces record request
headers (including `Authorization`) for `APIRequestContext` calls.

### 2.6 Live confirmation (2026-11-01, Task 5 readiness specs on the real stacks)

Medusa 5/5, Documenso 5/5, Cal 5/5 (+1 explicit blocked), Twenty 5/5, each twice in a row. This confirmed the mint,
the use, the revoke and the post-revoke rejection for all four, and found three things now encoded in this task:
(a) a new Medusa publishable key needs its sales channel (2.1), (b) the worker's live credentials are rows the
leak rules must not flag, so the fixtures register them in the `retained` registry, (c) a Medusa cart created with
an email also creates a guest customer (cleanup in Task 5).

## 3. Resolved decisions

- **D1. Credentials are minted by a worker-scoped fixture, not by a setup project.** One credential per product
  per worker, minted on first use, revoked and verified dead when the worker ends. *Deviation from the brief
  ("minting in a setup project, revoking in teardown")*, forced by 2.5; recorded as OD-1. Because `workers: 1` and
  Playwright restarts a worker after a failure, a failed test costs one extra mint, each with its own revoke.
  Rejected: an encrypted hand-off file (a secret in an artefact), an environment variable set by the runner
  (inherited by workers but fixed before the products exist), minting per test (rate limits, slower).
- **D2. `SecretString` holds every credential.** It prints as `<redacted:N>` through `String`, templates,
  `JSON.stringify`, `console.log` and `util.inspect`; `reveal()` is called only where a header is built. A registry
  of every wrapped secret scrubs any error text (`scrubSecrets`).
- **D3. Auth modules call the product with Node `fetch` (`HttpPort`), the clients use `APIRequestContext`.** The
  auth traffic carries passwords and the freshly minted token; keeping it out of Playwright's recorder is the
  cheap, certain way to keep it out of traces. Unit tests inject a fake port.
- **D4. `playwright.config.ts` sets `trace: "off"`.** API projects have no browser; failures are diagnosed from
  scrubbed `ApiError` text, the receiver log and the fixture log. Unit test: `config.use.trace === "off"`, and no
  screenshot or video option. Rejected: post-processing `trace.zip` (fragile, easy to forget).
- **D5. Every request carries `x-p2-run-id: <run prefix>`; every created entity carries the prefix in its name**
  (`runScopedName`). The header is additive; the names are the isolation. Whether a product rejects the header on
  POST routes is probed in Task 5 (OD-2).
- **D6. Teardown is `revokeAndVerify`:** revoke, then ask the product whether the credential still works. A
  credential that still works is a leak and fails the run. Medusa: secret key -> 401; Documenso: token -> 401;
  Twenty: key -> 403; Cal: the `ApiKey` row is gone (no consumer is running).
- **D7. The harness env-token fallback of roadmap D6 is not used:** minting works for all four (2.1 to 2.4), so
  `DOCUMENSO_API_TOKEN`, `CAL_API_KEY` and `TWENTY_API_KEY` stay unused. The fallback would only apply to using the
  Cal key against API v2 (HR-1).
- **D8. Lookups that the HTTP API does not give cheaply use `qa_ro`** (Documenso team id, Cal key id by note). The
  oracle is read-only by construction (Task 3), so this adds no write path.
- **D9. Clients are thin and typed for the routes the lanes need first** (section 6.4); a lane adds methods next to
  the existing ones. `createCaller` never follows a redirect (`maxRedirects: 0`), never throws on status by itself
  (`failOnStatusCode: false`) and raises `ApiError` for an unexpected status with a truncated, scrubbed body.
- **D10. The review's Twenty key case is CUT** (index section 9): key minting is setup, covered by the readiness spec of Task 5.

## 4. Case mapping

No case is executed. The modules are prerequisites of: P2-CAL-CON-001..003 (this task is unit-only and needs no harness release;
the `/v2` check is Task 5, which needs HR-1), P2-DOC-CON-001, P2-MED-CON-001..003, P2-TW-CON-001/002, every webhook and chain case (the review's kept IDs, index section 4) (clients for webhook
CRUD, envelope, cart, person), and the review's Twenty key case (CUT, D10). Framework checks (not IDs): secret never printed by
any of six output paths, scrub of echoed credentials, mint order and names per product, double revoke is a no-op,
a failed second Medusa key revokes the first, a stale Twenty access token signs in again once, a still-valid
credential after revoke fails the run, the structural request type accepts a real `APIRequestContext`.

## 5. Architecture

| File | Change | Responsibility |
|---|---|---|
| `src/auth/secret.ts` | new | `SecretString`, `scrubSecrets`, `addSecret` |
| `src/auth/http.ts` | new | `HttpPort` (+ `fetchPort`), `AuthError`, `CookieJar`, `MintedAuth` |
| `src/auth/env.ts` | new | seeded account credentials and defaults, each with its source line |
| `src/auth/{medusa,twenty,documenso,cal}.ts` | new | mint and revoke per product |
| `src/auth/lifecycle.ts` | new | `revokeAndVerify` |
| `src/auth/lifetime.ts`, `src/auth/reaper.ts` | new | the 1 h credential lifetime; the reaper selector for run-prefix leftovers (wired in Task 5) |
| `src/clients/base.ts` | new | structural request type, `createCaller`, `ApiError`, run-id header |
| `src/clients/{medusa,twenty,documenso,cal}.ts` | new | typed methods for the first routes |
| `src/fixtures/auth.ts` | new | worker-scoped credentials and per-test clients, with leak-rule retention |
| `playwright.config.ts` | edit | `trace: "off"` (with the reason) |
| `.env.example` | edit | the account variables of `src/auth/env.ts` |
| `tests/unit/auth/{secret,flows}.test.ts`, `tests/unit/clients/clients.test.ts` | new | 34 tests |

## 6. Module contracts (exact code, built and tested in the scratch copy)

### 6.1 Secrets, HTTP port, environment, lifecycle

`src/auth/secret.ts`

```ts
import { inspect } from "node:util";

/**
 * A credential held in memory. It prints as "<redacted:N>" through String(), template strings,
 * JSON.stringify, console.log and util.inspect, so a stray log line cannot leak it. The only way to
 * the value is reveal(), which the HTTP layer calls when it builds a header.
 */
export class SecretString {
  readonly #value: string;
  constructor(value: string) {
    if (value === "") throw new Error("TEST BUG: a secret must not be empty");
    this.#value = value;
    knownSecrets.add(value);
  }
  reveal(): string {
    return this.#value;
  }
  get length(): number {
    return this.#value.length;
  }
  toString(): string {
    return `<redacted:${String(this.#value.length)}>`;
  }
  toJSON(): string {
    return this.toString();
  }
  [inspect.custom](): string {
    return this.toString();
  }
}

const knownSecrets = new Set<string>();

/** Replaces every secret ever wrapped in a SecretString (and anything passed to addSecret). */
export function scrubSecrets(text: string): string {
  let out = text;
  for (const secret of knownSecrets) {
    if (secret.length >= 6) out = out.split(secret).join("<redacted>");
  }
  return out;
}

/** For values that are secret but arrive as plain strings, e.g. a password read from env. */
export function addSecret(value: string | undefined): void {
  if (value !== undefined && value.length >= 6) knownSecrets.add(value);
}

/** Test hook: forget everything. Only tests call this. */
export function clearSecretsForTests(): void {
  knownSecrets.clear();
}
```

`src/auth/http.ts`

```ts
import { scrubSecrets, type SecretString } from "./secret.ts";

/**
 * Minimal HTTP port used by the auth modules. Production uses Node's fetch (outside Playwright, so
 * nothing is recorded in a trace); unit tests pass a fake. Cookies are kept by the caller.
 */
export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly setCookies: readonly string[];
  readonly text: string;
}
export interface HttpRequest {
  readonly method: "GET" | "POST" | "DELETE";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}
export type HttpPort = (request: HttpRequest) => Promise<HttpResponse>;

export const fetchPort: HttpPort = async (request) => {
  const init: RequestInit = {
    method: request.method,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  };
  if (request.headers !== undefined) init.headers = { ...request.headers };
  if (request.body !== undefined) init.body = request.body;
  const response = await fetch(request.url, init);
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    setCookies: response.headers.getSetCookie(),
    text: await response.text(),
  };
};

export class AuthError extends Error {
  override readonly name = "AuthError";
  readonly status: number | undefined;
  constructor(step: string, status: number | undefined, detail = "") {
    super(
      scrubSecrets(
        `TEST BUG: auth step "${step}" failed${status === undefined ? "" : ` (HTTP ${String(status)})`}${detail === "" ? "" : `: ${detail.slice(0, 160)}`}`,
      ),
    );
    this.status = status;
  }
}

export function parseJson(step: string, response: HttpResponse): unknown {
  try {
    return JSON.parse(response.text);
  } catch {
    throw new AuthError(step, response.status, "response is not JSON");
  }
}

/** Simple in-memory cookie jar for the session-based products (Documenso, Cal). */
export class CookieJar {
  readonly #cookies = new Map<string, string>();
  absorb(setCookies: readonly string[]): void {
    for (const line of setCookies) {
      const pair = line.split(";")[0] ?? "";
      const index = pair.indexOf("=");
      if (index > 0) this.#cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }
  header(): string {
    return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
  has(name: string): boolean {
    return this.#cookies.has(name);
  }
}

export interface Revocable {
  /** Idempotent. Throws AuthError if the product refuses. */
  revoke(): Promise<void>;
}

/** What a minted credential looks like to a client: one header, kept secret. */
export interface MintedAuth extends Revocable {
  readonly product: "cal" | "documenso" | "medusa" | "twenty";
  readonly headerName: string;
  readonly headerValue: SecretString;
  /** Name carrying the run prefix, for the leak check. */
  readonly label: string;
}
```

`src/auth/env.ts`

```ts
import * as z from "zod";

const blank = (v: unknown): unknown => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optional = z.preprocess(blank, z.string().trim().min(1).optional());

/**
 * Credentials of the accounts the harness seeds. Defaults are the forks' public dev-seed values
 * (cited per line); Medusa has none because the admin user is created from these variables by the
 * harness seed(), so CI generates them per job.
 */
const schema = z.object({
  MEDUSA_ADMIN_EMAIL: optional,
  MEDUSA_ADMIN_PASSWORD: optional,
  P2_DOC_USER_EMAIL: z.preprocess(blank, z.string().trim().default("example@documenso.com")), // packages/prisma/seed/initial-seed.ts:57
  P2_DOC_USER_PASSWORD: z.preprocess(blank, z.string().trim().default("password")), // packages/prisma/seed/users.ts:28
  P2_CAL_USER_EMAIL: z.preprocess(blank, z.string().trim().default("pro@example.com")), // scripts/seed.ts:678
  P2_CAL_USER_PASSWORD: z.preprocess(blank, z.string().trim().default("pro")), // scripts/seed.ts:680
  TWENTY_EMAIL: z.preprocess(blank, z.string().trim().default("jane.austen@apple.dev")), // harness TWENTY_DEFAULT_ADMIN_EMAIL
  TWENTY_PASSWORD: z.preprocess(blank, z.string().trim().default("tim@apple.dev")), // harness TWENTY_DEV_SEED_PASSWORD
});

export type AuthEnv = z.infer<typeof schema>;

export function loadAuthEnv(env: NodeJS.ProcessEnv = process.env): AuthEnv {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join("."));
    throw new Error(`TEST BUG: invalid auth environment: ${names.join(", ")}`);
  }
  return parsed.data;
}

export function requireVar(name: string, value: string | undefined): string {
  if (value === undefined)
    throw new Error(`TEST BUG: ${name} is required for this product (not shown)`);
  return value;
}
```

`src/auth/lifecycle.ts`

```ts
import type { MintedAuth } from "./http.ts";

export type AcceptanceProbe = () => Promise<boolean>;

/**
 * Teardown of a minted credential: revoke it, then PROVE the product no longer accepts it (the
 * leak check of plan Task 4). A credential that still works after revoke is a leak and fails the
 * run even if every test passed.
 */
export async function revokeAndVerify(
  auth: MintedAuth,
  stillAccepted: AcceptanceProbe,
): Promise<void> {
  await auth.revoke();
  if (await stillAccepted()) {
    throw new Error(
      `TEST BUG: ${auth.product} credential "${auth.label}" is still accepted after revoke (token leak)`,
    );
  }
}
```

### 6.2 Per-product mint and revoke

`src/auth/medusa.ts`

```ts
import { AuthError, fetchPort, parseJson, type HttpPort, type MintedAuth } from "./http.ts";
import { SecretString } from "./secret.ts";

/**
 * Medusa (2.21.2). The admin JWT (24 h, not revocable) is used only to create two API keys:
 *  - a SECRET key, sent as `Authorization: Basic base64(token + ":")`, which is revocable;
 *  - a PUBLISHABLE key, sent as `x-publishable-api-key` on /store calls.
 * Revocation: POST /admin/api-keys/{id}/revoke, then DELETE /admin/api-keys/{id} (a publishable key
 * refuses DELETE until revoked: probe 2026-11-01). A revoked secret key answers 401.
 * Routes: @medusajs/framework authenticate-middleware.js (api-key = Basic), api-key admin routes.
 */
export interface MedusaAuth extends MintedAuth {
  readonly product: "medusa";
  readonly publishableKey: SecretString;
  /** Titles of the live keys (secret, publishable); the invariant sweep must not call them leaks. */
  readonly titles: readonly string[];
  /** True while the secret key is accepted (GET /admin/regions?limit=1 returns 200). */
  isAccepted(): Promise<boolean>;
}

interface ApiKeyResponse {
  api_key?: { id?: string; token?: string };
}

export async function mintMedusa(input: {
  baseUrl: string;
  email: string;
  password: string;
  /** runScopedName(label): the run prefix goes into every key title. */
  name: (label: string) => string;
  http?: HttpPort;
}): Promise<MedusaAuth> {
  const http = input.http ?? fetchPort;
  const json = { "content-type": "application/json" };
  const login = await http({
    method: "POST",
    url: `${input.baseUrl}/auth/user/emailpass`,
    headers: json,
    body: JSON.stringify({ email: input.email, password: input.password }),
  });
  const jwtBody = parseJson("medusa login", login) as { token?: string };
  if (login.status !== 200 || typeof jwtBody.token !== "string")
    throw new AuthError("medusa login", login.status);
  const jwt = new SecretString(jwtBody.token);
  const bearer = (): Record<string, string> => ({
    ...json,
    authorization: `Bearer ${jwt.reveal()}`,
  });

  const createKey = async (
    type: "secret" | "publishable",
    label: string,
  ): Promise<{ id: string; token: SecretString }> => {
    const title = input.name(label);
    const res = await http({
      method: "POST",
      url: `${input.baseUrl}/admin/api-keys`,
      headers: bearer(),
      body: JSON.stringify({ title, type }),
    });
    const key = (parseJson(`medusa create ${type} key`, res) as ApiKeyResponse).api_key;
    if (res.status !== 200 || typeof key?.id !== "string" || typeof key.token !== "string") {
      throw new AuthError(`medusa create ${type} key`, res.status);
    }
    return { id: key.id, token: new SecretString(key.token) };
  };

  const secret = await createKey("secret", "admin-key");
  const created: string[] = [secret.id];
  let publishable: { id: string; token: SecretString };
  try {
    publishable = await createKey("publishable", "store-key");
    created.push(publishable.id);
    // A new publishable key has no sales channel and /store refuses it ("Publishable key needs to
    // have a sales channel configured", probe 2026-11-01): link the seed's default channel.
    const channels = await http({
      method: "GET",
      url: `${input.baseUrl}/admin/sales-channels?limit=100&fields=id,name`,
      headers: bearer(),
    });
    const list =
      (
        parseJson("medusa list sales channels", channels) as {
          sales_channels?: { id: string; name: string }[];
        }
      ).sales_channels ?? [];
    const channel = list.find((c) => c.name === "Default Sales Channel") ?? list[0];
    if (channels.status !== 200 || channel === undefined) {
      throw new AuthError("medusa list sales channels", channels.status);
    }
    const linked = await http({
      method: "POST",
      url: `${input.baseUrl}/admin/api-keys/${publishable.id}/sales-channels`,
      headers: bearer(),
      body: JSON.stringify({ add: [channel.id] }),
    });
    if (linked.status !== 200) throw new AuthError("medusa link sales channel", linked.status);
  } catch (error) {
    for (const id of created) await revokeKey(http, input.baseUrl, bearer(), id);
    throw error;
  }
  const basic = new SecretString(
    `Basic ${Buffer.from(`${secret.token.reveal()}:`).toString("base64")}`,
  );
  let revoked = false;

  return {
    product: "medusa",
    headerName: "authorization",
    headerValue: basic,
    label: input.name("admin-key"),
    publishableKey: publishable.token,
    titles: [input.name("admin-key"), input.name("store-key")],
    async isAccepted() {
      const res = await http({
        method: "GET",
        url: `${input.baseUrl}/admin/regions?limit=1`,
        headers: { authorization: basic.reveal() },
      });
      return res.status === 200;
    },
    async revoke() {
      if (revoked) return;
      await revokeKey(http, input.baseUrl, bearer(), secret.id);
      await revokeKey(http, input.baseUrl, bearer(), publishable.id);
      revoked = true;
    },
  };
}

async function revokeKey(
  http: HttpPort,
  baseUrl: string,
  headers: Record<string, string>,
  id: string,
): Promise<void> {
  const revoke = await http({
    method: "POST",
    url: `${baseUrl}/admin/api-keys/${id}/revoke`,
    headers,
    body: "{}",
  });
  if (revoke.status !== 200) throw new AuthError("medusa revoke key", revoke.status);
  const remove = await http({ method: "DELETE", url: `${baseUrl}/admin/api-keys/${id}`, headers });
  if (remove.status !== 200) throw new AuthError("medusa delete key", remove.status);
}
```

`src/auth/twenty.ts`

```ts
import { AuthError, fetchPort, parseJson, type HttpPort, type MintedAuth } from "./http.ts";
import { SecretString } from "./secret.ts";

/**
 * Twenty (image v2.44.0, fork 7cbdfec). The harness's authenticate() returns a WORKSPACE_AGNOSTIC
 * token that workspace endpoints refuse (probe 2026-11-01: getRoles -> FORBIDDEN), so this module
 * does signIn -> loginToken -> getAuthTokensFromLoginToken itself (type ACCESS, 30 minutes), then:
 * createApiKey -> generateApiKeyToken (bearer for /rest) and revokeApiKey for teardown.
 * A revoked key answers 403 "This API Key is revoked" (not 401).
 */
export interface TwentyAuth extends MintedAuth {
  readonly product: "twenty";
  /** True while the key is accepted by GET /rest/people?limit=1. */
  isAccepted(): Promise<boolean>;
}

interface GqlResult<T> {
  data?: T;
  errors?: { message?: string }[];
}

export async function mintTwenty(input: {
  baseUrl: string;
  email: string;
  password: string;
  name: (label: string) => string;
  /** The key expires on its own after this many ms even if teardown never runs. */
  ttlMs?: number;
  now?: () => Date;
  http?: HttpPort;
}): Promise<TwentyAuth> {
  const http = input.http ?? fetchPort;
  const now = input.now ?? ((): Date => new Date());
  const gql = async <T>(
    step: string,
    query: string,
    variables: Record<string, unknown>,
    accessToken?: SecretString,
  ): Promise<T> => {
    const res = await http({
      method: "POST",
      url: `${input.baseUrl}/metadata`,
      headers: {
        "content-type": "application/json",
        ...(accessToken ? { authorization: `Bearer ${accessToken.reveal()}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = parseJson(step, res) as GqlResult<T>;
    if (res.status !== 200 || body.errors?.length || body.data === undefined) {
      throw new AuthError(step, res.status, body.errors?.[0]?.message ?? "");
    }
    return body.data;
  };

  const login = async (): Promise<SecretString> => {
    const signIn = await gql<{
      signIn: {
        availableWorkspaces: {
          availableWorkspacesForSignIn: {
            loginToken?: string;
            workspaceUrls?: { subdomainUrl?: string | null; customUrl?: string | null };
          }[];
        };
      };
    }>(
      "twenty signIn",
      "mutation($e:String!,$p:String!){ signIn(email:$e,password:$p){ availableWorkspaces{ availableWorkspacesForSignIn{ loginToken workspaceUrls{ subdomainUrl customUrl } } } } }",
      { e: input.email, p: input.password },
    );
    const workspace = signIn.signIn.availableWorkspaces.availableWorkspacesForSignIn[0];
    if (workspace?.loginToken === undefined)
      throw new AuthError("twenty signIn", 200, "no workspace loginToken");
    const origin =
      workspace.workspaceUrls?.subdomainUrl ?? workspace.workspaceUrls?.customUrl ?? input.baseUrl;
    const exchanged = await gql<{
      getAuthTokensFromLoginToken: {
        tokens: { accessOrWorkspaceAgnosticToken: { token: string } };
      };
    }>(
      "twenty exchange loginToken",
      "mutation($t:String!,$o:String!){ getAuthTokensFromLoginToken(loginToken:$t, origin:$o){ tokens{ accessOrWorkspaceAgnosticToken{ token } } } }",
      { t: workspace.loginToken, o: origin },
    );
    return new SecretString(
      exchanged.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token,
    );
  };

  let access = await login();
  const roles = await gql<{ getRoles: { id: string; label: string }[] }>(
    "twenty getRoles",
    "query { getRoles { id label } }",
    {},
    access,
  );
  const admin = roles.getRoles.find((r) => r.label === "Admin");
  if (admin === undefined) throw new AuthError("twenty getRoles", 200, "no Admin role");

  const label = input.name("tw-key");
  const expiresAt = new Date(now().getTime() + (input.ttlMs ?? 3_600_000)).toISOString();
  const created = await gql<{ createApiKey: { id: string } }>(
    "twenty createApiKey",
    "mutation($i:CreateApiKeyInput!){ createApiKey(input:$i){ id } }",
    { i: { name: label, expiresAt, roleId: admin.id } },
    access,
  );
  const keyId = created.createApiKey.id;
  const minted = await gql<{ generateApiKeyToken: { token: string } }>(
    "twenty generateApiKeyToken",
    "mutation($id:UUID!,$e:String!){ generateApiKeyToken(apiKeyId:$id, expiresAt:$e){ token } }",
    { id: keyId, e: expiresAt },
    access,
  );
  const bearer = new SecretString(`Bearer ${minted.generateApiKeyToken.token}`);
  let revoked = false;

  return {
    product: "twenty",
    headerName: "authorization",
    headerValue: bearer,
    label,
    async isAccepted() {
      const res = await http({
        method: "GET",
        url: `${input.baseUrl}/rest/people?limit=1`,
        headers: { authorization: bearer.reveal() },
      });
      return res.status === 200;
    },
    async revoke() {
      if (revoked) return;
      try {
        await gql(
          "twenty revokeApiKey",
          "mutation($i:RevokeApiKeyInput!){ revokeApiKey(input:$i){ id } }",
          { i: { id: keyId } },
          access,
        );
      } catch (error) {
        // The access token lives 30 minutes; a long run needs a fresh one.
        if (!(error instanceof AuthError)) throw error;
        access = await login();
        await gql(
          "twenty revokeApiKey",
          "mutation($i:RevokeApiKeyInput!){ revokeApiKey(input:$i){ id } }",
          { i: { id: keyId } },
          access,
        );
      }
      revoked = true;
    },
  };
}
```

`src/auth/documenso.ts`

```ts
import {
  AuthError,
  CookieJar,
  fetchPort,
  parseJson,
  type HttpPort,
  type MintedAuth,
} from "./http.ts";
import { SecretString } from "./secret.ts";

/**
 * Documenso (fork f4105e4). Session: GET /api/auth/csrf, then POST /api/auth/email-password/
 * authorize with the csrfToken (201, cookie sessionId). Token: tRPC apiToken.create {teamId,
 * tokenName, expirationDate} -> {id, token} ("api_" + 16). Sent as `Authorization: <token>` (a
 * "Bearer " prefix is accepted too). apiToken.delete {id, teamId} revokes it: the token then
 * answers 401. tRPC uses superjson; a plain call is POST {"json": input} to /api/trpc/<proc>.
 * Routes: packages/auth/server/routes/email-password.ts:39-95, packages/trpc/server/api-token-router.
 */
export interface DocumensoAuth extends MintedAuth {
  readonly product: "documenso";
  readonly teamId: number;
  /** Cookie header of the signed-in session, for tRPC calls that need a session (webhooks). */
  readonly sessionCookie: SecretString;
  /** True while the token is accepted by GET /api/v2/envelope?page=1&perPage=1. */
  isAccepted(): Promise<boolean>;
}

export async function mintDocumenso(input: {
  baseUrl: string;
  email: string;
  password: string;
  /** Read-only lookup (qa_ro): the personal team of this user. */
  teamId: () => Promise<number>;
  name: (label: string) => string;
  http?: HttpPort;
}): Promise<DocumensoAuth> {
  const http = input.http ?? fetchPort;
  const jar = new CookieJar();
  const csrf = await http({ method: "GET", url: `${input.baseUrl}/api/auth/csrf` });
  jar.absorb(csrf.setCookies);
  const csrfToken = (parseJson("documenso csrf", csrf) as { csrfToken?: string }).csrfToken;
  if (csrf.status !== 200 || typeof csrfToken !== "string")
    throw new AuthError("documenso csrf", csrf.status);
  const authorize = await http({
    method: "POST",
    url: `${input.baseUrl}/api/auth/email-password/authorize`,
    headers: { "content-type": "application/json", cookie: jar.header() },
    body: JSON.stringify({ email: input.email, password: input.password, csrfToken }),
  });
  jar.absorb(authorize.setCookies);
  if (authorize.status !== 201 || !jar.has("sessionId"))
    throw new AuthError("documenso authorize", authorize.status);

  const teamId = await input.teamId();
  const trpc = async (
    procedure: string,
    body: unknown,
  ): Promise<{ status: number; data: unknown }> => {
    const res = await http({
      method: "POST",
      url: `${input.baseUrl}/api/trpc/${procedure}`,
      headers: {
        "content-type": "application/json",
        cookie: jar.header(),
        "x-team-id": String(teamId),
      },
      body: JSON.stringify({ json: body }),
    });
    return {
      status: res.status,
      data: (parseJson(`documenso ${procedure}`, res) as { result?: { data?: { json?: unknown } } })
        .result?.data?.json,
    };
  };
  const label = input.name("doc-token");
  // Short expiry (section 6.2b). `expirationDate` is a key of lib/constants/time.ts, not a date: "ONE_HOUR".
  // UNPROBED against the pinned Documenso SHA; the first live create confirms it, and a rejection is a STOP (section 14).
  const created = await trpc("apiToken.create", { teamId, tokenName: label, expirationDate: "ONE_HOUR" });
  const token = created.data as { id?: number; token?: string } | undefined;
  if (created.status !== 200 || typeof token?.id !== "number" || typeof token.token !== "string") {
    throw new AuthError("documenso apiToken.create", created.status);
  }
  const header = new SecretString(token.token);
  let revoked = false;

  return {
    product: "documenso",
    headerName: "authorization",
    headerValue: header,
    label,
    teamId,
    sessionCookie: new SecretString(jar.header()),
    async isAccepted() {
      const res = await http({
        method: "GET",
        url: `${input.baseUrl}/api/v2/envelope?page=1&perPage=1`,
        headers: { authorization: header.reveal() },
      });
      return res.status === 200;
    },
    async revoke() {
      if (revoked) return;
      const removed = await trpc("apiToken.delete", { id: token.id, teamId });
      if (removed.status !== 200) throw new AuthError("documenso apiToken.delete", removed.status);
      revoked = true;
    },
  };
}
```

`src/auth/cal.ts`

```ts
import {
  AuthError,
  CookieJar,
  fetchPort,
  parseJson,
  type HttpPort,
  type MintedAuth,
} from "./http.ts";
import { SecretString } from "./secret.ts";

/**
 * Cal (fork c2b7ac4). The harness starts only the web app (3000), so the key is minted through the
 * web tRPC like the settings page does: next-auth credentials login (GET /api/auth/csrf, POST
 * /api/auth/callback/credentials as a form with json=true -> cookie next-auth.session-token), then
 * POST /api/trpc/apiKeys/create?batch=1 -> "cal_..." and apiKeys/delete {id}. API v2 (5555), the
 * only consumer of the key, is not started by harness v0.2.18, so isPresent() reads the ApiKey row
 * with a read-only lookup instead of calling the API. The session cookie is also exposed because
 * webhook CRUD and bookings go through the web app.
 */
export interface CalAuth extends MintedAuth {
  readonly product: "cal";
  readonly sessionCookie: SecretString;
  /** Read-only: does the ApiKey row (note = label) still exist? */
  isPresent(): Promise<boolean>;
}

export async function mintCal(input: {
  /** Injected clock: the tests assert the exact expiry. */
  now?: () => Date;
  baseUrl: string;
  email: string;
  password: string;
  name: (label: string) => string;
  /** Read-only lookups (qa_ro) on "ApiKey". */
  keyId: (note: string) => Promise<string | undefined>;
  http?: HttpPort;
}): Promise<CalAuth> {
  const http = input.http ?? fetchPort;
  const jar = new CookieJar();
  const csrf = await http({ method: "GET", url: `${input.baseUrl}/api/auth/csrf` });
  jar.absorb(csrf.setCookies);
  const csrfToken = (parseJson("cal csrf", csrf) as { csrfToken?: string }).csrfToken;
  if (csrf.status !== 200 || typeof csrfToken !== "string")
    throw new AuthError("cal csrf", csrf.status);
  const login = await http({
    method: "POST",
    url: `${input.baseUrl}/api/auth/callback/credentials`,
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header() },
    body: new URLSearchParams({
      csrfToken,
      email: input.email,
      password: input.password,
      callbackUrl: input.baseUrl,
      json: "true",
    }).toString(),
  });
  jar.absorb(login.setCookies);
  if (!jar.has("next-auth.session-token")) throw new AuthError("cal login", login.status);

  const trpc = async (
    path: string,
    body: unknown,
    values?: Record<string, string[]>,
  ): Promise<{ status: number; data: unknown }> => {
    const res = await http({
      method: "POST",
      url: `${input.baseUrl}/api/trpc/${path}?batch=1`,
      headers: { "content-type": "application/json", cookie: jar.header() },
      // superjson: a Date travels as its ISO string with meta.values saying "Date".
      body: JSON.stringify({ 0: { json: body, ...(values === undefined ? {} : { meta: { values } }) } }),
    });
    const parsed = parseJson(`cal ${path}`, res) as { result?: { data?: { json?: unknown } } }[];
    return { status: res.status, data: parsed[0]?.result?.data?.json };
  };
  const label = input.name("cal-key");
  // Short expiry, never `neverExpires: true` (section 6.2b). `expiresAt` is z.date() behind superjson.
  // UNPROBED against the pinned Cal SHA; the first live create confirms it, and a rejection is a STOP (section 14).
  const now = input.now ?? ((): Date => new Date());
  const expiresAt = new Date(now().getTime() + CREDENTIAL_TTL_MS).toISOString();
  const created = await trpc("apiKeys/create", { note: label, neverExpires: false, expiresAt }, { expiresAt: ["Date"] });
  if (
    created.status !== 200 ||
    typeof created.data !== "string" ||
    !created.data.startsWith("cal_")
  ) {
    throw new AuthError("cal apiKeys/create", created.status);
  }
  const key = new SecretString(created.data);
  let revoked = false;

  return {
    product: "cal",
    headerName: "authorization",
    headerValue: new SecretString(`Bearer ${key.reveal()}`),
    label,
    sessionCookie: new SecretString(jar.header()),
    async isPresent() {
      return (await input.keyId(label)) !== undefined;
    },
    async revoke() {
      if (revoked) return;
      const id = await input.keyId(label);
      if (id !== undefined) {
        const removed = await trpc("apiKeys/delete", { id });
        if (removed.status !== 200) throw new AuthError("cal apiKeys/delete", removed.status);
      }
      revoked = true;
    },
  };
}
```

### 6.2b Credential lifetime and the worker-start reaper

Documenso and Cal keys used to be minted without expiry (`expirationDate: null`, `neverExpires: true`, section 2). They now
expire on their own after `CREDENTIAL_TTL_MS` (1 h, longer than the 30 min lane timeout of Task 6, D4). A worker killed hard
skips its teardown; the reaper removes what such a dead run left behind. Task 5 (section 8 step 5) runs it once per worker, at worker start, before the first mint; this task builds and
tests the pure selector only.

`src/auth/lifetime.ts`

```ts
/** P2 credentials expire on their own after this long: longer than the lane job timeout (Task 6 D4, 30 min). */
export const CREDENTIAL_TTL_MS = 60 * 60 * 1000;
```

`src/auth/reaper.ts`

```ts
/** Lane job timeout (Task 6 D4: `timeout-minutes: 30`). A run older than this is dead, not running. */
export const JOB_TIMEOUT_MS = 30 * 60 * 1000;

const PREFIX_IN_NAME = /^(p2-qa-(\d{4})(\d{2})(\d{2})t(\d{2})(\d{2})(\d{2})z-[0-9a-f]{8})(?:-|$)/;

/** The UTC start of a run, read from its name's prefix `p2-qa-<yyyymmddThhmmssZ>-<8 hex>` (Task 1 D9). */
export function runStartedAt(name: string): number | undefined {
  const m = PREFIX_IN_NAME.exec(name);
  if (m === null) return undefined;
  return Date.UTC(+m[2]!, +m[3]! - 1, +m[4]!, +m[5]!, +m[6]!, +m[7]!);
}

export interface Leftover {
  readonly id: string;
  readonly name: string;
}

/**
 * Pure. Selects only leftovers whose name carries a run prefix (the pattern of Task 1 D9), that do NOT belong to the
 * current run, and whose run started at least `jobTimeoutMs` ago. Anything else is never touched.
 */
export function selectStaleLeftovers(input: {
  readonly leftovers: readonly Leftover[];
  readonly currentPrefix: string;
  readonly nowMs: number;
  readonly jobTimeoutMs: number;
}): Leftover[] {
  return input.leftovers.filter((leftover) => {
    const m = PREFIX_IN_NAME.exec(leftover.name);
    if (m === null || m[1] === input.currentPrefix) return false;
    const started = runStartedAt(leftover.name);
    return started !== undefined && input.nowMs - started >= input.jobTimeoutMs;
  });
}
```

The list and revoke adapters per product (Documenso tokens, Cal keys, Medusa `GET /admin/api-keys`, Twenty `apiKeys`) and the
worker-start call are **not in this task**: Task 5 step 5 adds them, because the stacks are up there and the list calls can be
probed live (U16, UNPROBED until then). The reaper revokes each selected leftover through the product's own revoke and reports
every failure. Its two unit tests are in section 6.6.

### 6.3 Clients

`src/clients/base.ts`

```ts
import type { SecretString } from "../auth/secret.ts";
import { scrubSecrets } from "../auth/secret.ts";

/**
 * Structural subset of Playwright's APIRequestContext / APIResponse, so clients are unit-testable
 * with a fake and a real APIRequestContext still satisfies it (checked by the compiler in
 * tests/unit/clients/base.test.ts).
 */
export interface ApiResponseLike {
  status(): number;
  headers(): Record<string, string>;
  text(): Promise<string>;
}
export interface ApiRequestLike {
  fetch(
    url: string,
    options?: {
      method?: string;
      headers?: Record<string, string>;
      data?: string | Buffer;
      multipart?: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>;
      maxRedirects?: number;
      failOnStatusCode?: boolean;
      timeout?: number;
    },
  ): Promise<ApiResponseLike>;
}

/** Added to every request so a stray row in a product log or webhook can be tied to a run. */
export const RUN_ID_HEADER = "x-p2-run-id";

export class ApiError extends Error {
  override readonly name = "ApiError";
  readonly status: number;
  constructor(method: string, path: string, status: number, body: string) {
    super(scrubSecrets(`${method} ${path} -> HTTP ${String(status)}: ${body.slice(0, 200)}`));
    this.status = status;
  }
}

export interface CallOptions {
  readonly body?: unknown;
  readonly rawBody?: string | Buffer;
  readonly headers?: Record<string, string>;
  readonly multipart?: NonNullable<Parameters<ApiRequestLike["fetch"]>[1]>["multipart"];
  /** Statuses that are not an error. Default [200, 201]. */
  readonly expect?: readonly number[];
}
export interface CallResult<T> {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly text: string;
  readonly body: T;
}

export type Caller = <T = unknown>(
  method: string,
  path: string,
  options?: CallOptions,
) => Promise<CallResult<T>>;

export function createCaller(input: {
  request: ApiRequestLike;
  baseUrl: string;
  runPrefix: string;
  auth?: { headerName: string; headerValue: SecretString };
  extraHeaders?: () => Record<string, string>;
}): Caller {
  return async <T>(
    method: string,
    path: string,
    options: CallOptions = {},
  ): Promise<CallResult<T>> => {
    const headers: Record<string, string> = {
      accept: "application/json",
      [RUN_ID_HEADER]: input.runPrefix,
      ...(input.auth ? { [input.auth.headerName]: input.auth.headerValue.reveal() } : {}),
      ...input.extraHeaders?.(),
      ...options.headers,
    };
    const fetchOptions: NonNullable<Parameters<ApiRequestLike["fetch"]>[1]> = {
      method,
      headers,
      maxRedirects: 0,
      failOnStatusCode: false,
    };
    if (options.body !== undefined) {
      headers["content-type"] ??= "application/json";
      fetchOptions.data = JSON.stringify(options.body);
    }
    if (options.rawBody !== undefined) fetchOptions.data = options.rawBody;
    if (options.multipart !== undefined) fetchOptions.multipart = options.multipart;
    const response = await input.request.fetch(`${input.baseUrl}${path}`, fetchOptions);
    const text = await response.text();
    const status = response.status();
    if (!(options.expect ?? [200, 201]).includes(status))
      throw new ApiError(method, path, status, text);
    let body: unknown;
    try {
      body = text === "" ? undefined : JSON.parse(text);
    } catch {
      body = text;
    }
    return { status, headers: response.headers(), text, body: body as T };
  };
}
```

`src/clients/medusa.ts`

```ts
import type { MedusaAuth } from "../auth/medusa.ts";
import { createCaller, type ApiRequestLike, type CallResult } from "./base.ts";

/** Medusa 2.21.2. Routes the lanes need first (plan Task 4): regions, a store cart, the payment hook. */
export interface MedusaClient {
  admin: {
    regions(): Promise<
      CallResult<{ regions: { id: string; name: string; currency_code: string }[] }>
    >;
  };
  store: {
    createCart(regionId: string, email: string): Promise<string>;
    addLineItem(cartId: string, variantId: string): Promise<void>;
  };
  hooks: {
    /** POST /hooks/payment/{provider}: always 200; verification happens later in a subscriber. */
    payment(
      provider: string,
      rawBody: string | Buffer,
      headers: Record<string, string>,
    ): Promise<CallResult<unknown>>;
  };
}

export function medusaClient(input: {
  request: ApiRequestLike;
  baseUrl: string;
  runPrefix: string;
  auth: MedusaAuth;
}): MedusaClient {
  const { request, baseUrl, runPrefix, auth } = input;
  const admin = createCaller({ request, baseUrl, runPrefix, auth });
  const store = createCaller({
    request,
    baseUrl,
    runPrefix,
    extraHeaders: () => ({ "x-publishable-api-key": auth.publishableKey.reveal() }),
  });
  const anonymous = createCaller({ request, baseUrl, runPrefix });
  return {
    admin: { regions: () => admin("GET", "/admin/regions?limit=20&fields=id,name,currency_code") },
    store: {
      async createCart(regionId, email) {
        const res = await store<{ cart: { id: string } }>("POST", "/store/carts", {
          body: { region_id: regionId, email },
        });
        return res.body.cart.id;
      },
      async addLineItem(cartId, variantId) {
        await store("POST", `/store/carts/${cartId}/line-items`, {
          body: { variant_id: variantId, quantity: 1 },
        });
      },
    },
    hooks: {
      payment: (provider, rawBody, headers) =>
        anonymous("POST", `/hooks/payment/${provider}`, {
          rawBody,
          headers: { "content-type": "application/json", ...headers },
        }),
    },
  };
}
```

`src/clients/twenty.ts`

```ts
import type { TwentyAuth } from "../auth/twenty.ts";
import { createCaller, type ApiRequestLike, type CallResult } from "./base.ts";

/** Twenty v2.44.0. REST people and webhooks (Authorization: Bearer <api key>). */
export interface TwentyClient {
  people: {
    create(firstName: string): Promise<string>;
    remove(id: string): Promise<void>;
  };
  webhooks: {
    create(input: {
      targetUrl: string;
      operations: string[];
      secret: string;
      description: string;
    }): Promise<string>;
    remove(id: string): Promise<void>;
  };
  raw(method: string, path: string): Promise<CallResult<unknown>>;
}

export function twentyClient(input: {
  request: ApiRequestLike;
  baseUrl: string;
  runPrefix: string;
  auth: TwentyAuth;
}): TwentyClient {
  const call = createCaller({
    request: input.request,
    baseUrl: input.baseUrl,
    runPrefix: input.runPrefix,
    auth: input.auth,
  });
  return {
    people: {
      async create(firstName) {
        const res = await call<{ data: { createPerson: { id: string } } }>("POST", "/rest/people", {
          body: { name: { firstName, lastName: "Qa" } },
        });
        return res.body.data.createPerson.id;
      },
      async remove(id) {
        await call("DELETE", `/rest/people/${id}`, { expect: [200] });
      },
    },
    webhooks: {
      async create(body) {
        const res = await call<{ id: string }>("POST", "/rest/webhooks", { body });
        return res.body.id;
      },
      async remove(id) {
        await call("DELETE", `/rest/webhooks/${id}`, { expect: [200] });
      },
    },
    raw: (method, path) => call(method, path),
  };
}
```

`src/clients/documenso.ts`

```ts
import type { DocumensoAuth } from "../auth/documenso.ts";
import { createCaller, type ApiRequestLike, type CallResult } from "./base.ts";

/** Documenso (fork f4105e4). API v2 with the token; webhooks and the Stripe route as probed. */
export interface DocumensoClient {
  envelopes: {
    create(input: {
      title: string;
      pdf: Buffer;
      recipients: { email: string; name: string }[];
    }): Promise<string>;
    remove(envelopeId: string): Promise<void>;
  };
  webhooks: {
    /** tRPC webhook.createWebhook; needs a hostname the create-time check accepts (plan Task 5). */
    create(input: { webhookUrl: string; eventTriggers: string[]; secret: string }): Promise<string>;
    remove(id: string): Promise<void>;
  };
  stripe: {
    post(rawBody: string | Buffer, headers: Record<string, string>): Promise<CallResult<unknown>>;
  };
}

export function documensoClient(input: {
  request: ApiRequestLike;
  baseUrl: string;
  runPrefix: string;
  auth: DocumensoAuth;
}): DocumensoClient {
  const { request, baseUrl, runPrefix, auth } = input;
  const api = createCaller({ request, baseUrl, runPrefix, auth });
  const session = createCaller({
    request,
    baseUrl,
    runPrefix,
    extraHeaders: () => ({
      cookie: auth.sessionCookie.reveal(),
      "x-team-id": String(auth.teamId),
    }),
  });
  const anonymous = createCaller({ request, baseUrl, runPrefix });
  const trpc = async <T>(procedure: string, body: unknown): Promise<T> => {
    const res = await session<{ result: { data: { json: T } } }>("POST", `/api/trpc/${procedure}`, {
      body: { json: body },
    });
    return res.body.result.data.json;
  };
  return {
    envelopes: {
      async create({ title, pdf, recipients }) {
        const res = await api<{ id: string }>("POST", "/api/v2/envelope/create", {
          multipart: {
            payload: JSON.stringify({
              type: "DOCUMENT",
              title,
              recipients: recipients.map((r) => ({ ...r, role: "SIGNER" })),
            }),
            files: { name: "example.pdf", mimeType: "application/pdf", buffer: pdf },
          },
        });
        return res.body.id;
      },
      async remove(envelopeId) {
        await api("POST", "/api/v2/envelope/delete", { body: { envelopeId } });
      },
    },
    webhooks: {
      async create({ webhookUrl, eventTriggers, secret }) {
        return (
          await trpc<{ id: string }>("webhook.createWebhook", {
            webhookUrl,
            eventTriggers,
            secret,
            enabled: true,
          })
        ).id;
      },
      async remove(id) {
        await trpc("webhook.deleteWebhook", { id });
      },
    },
    stripe: {
      post: (rawBody, headers) =>
        anonymous("POST", "/api/stripe/webhook", {
          rawBody,
          headers: { "content-type": "application/json", ...headers },
          expect: [200, 400, 500],
        }),
    },
  };
}
```

`src/clients/cal.ts`

```ts
import type { CalAuth } from "../auth/cal.ts";
import { createCaller, type ApiRequestLike, type CallResult } from "./base.ts";

/**
 * Cal (fork c2b7ac4), web app on 3000 (API v2 is not started by the harness). Webhook CRUD goes
 * through the web tRPC with the session cookie; the cron and Daily routes are plain HTTP.
 */
export interface CalClient {
  webhooks: {
    create(input: {
      subscriberUrl: string;
      eventTriggers: string[];
      secret: string;
    }): Promise<string>;
    remove(id: string): Promise<void>;
    /** Sends one signed test payload through the same sendPayload code path as a real trigger. */
    testTrigger(input: { url: string; secret: string; type: string }): Promise<void>;
  };
  /** POST /api/cron/webhookTriggers with Authorization: <CRON_API_KEY> (no Bearer). 401 on a wrong key. */
  cronWebhookTriggers(cronKey: string): Promise<CallResult<unknown>>;
  /** POST /api/recorded-daily-video; business and signature statuses are results, not errors. */
  dailyVideo(
    rawBody: string | Buffer,
    headers: Record<string, string>,
  ): Promise<CallResult<unknown>>;
}

export function calClient(input: {
  request: ApiRequestLike;
  baseUrl: string;
  runPrefix: string;
  auth: CalAuth;
}): CalClient {
  const { request, baseUrl, runPrefix, auth } = input;
  const session = createCaller({
    request,
    baseUrl,
    runPrefix,
    extraHeaders: () => ({ cookie: auth.sessionCookie.reveal() }),
  });
  const anonymous = createCaller({ request, baseUrl, runPrefix });
  const trpc = async <T>(path: string, body: unknown): Promise<T> => {
    const res = await session<{ result: { data: { json: T } } }[]>(
      "POST",
      `/api/trpc/${path}?batch=1`,
      { body: { 0: { json: body } } },
    );
    return res.body[0]?.result.data.json as T;
  };
  return {
    webhooks: {
      async create({ subscriberUrl, eventTriggers, secret }) {
        return (
          await trpc<{ id: string }>("webhook/create", {
            subscriberUrl,
            eventTriggers,
            active: true,
            payloadTemplate: null,
            secret,
          })
        ).id;
      },
      async remove(id) {
        await trpc("webhook/delete", { id });
      },
      async testTrigger({ url, secret, type }) {
        await trpc("webhook/testTrigger", { url, secret, type, payloadTemplate: null });
      },
    },
    cronWebhookTriggers: (cronKey) =>
      anonymous("POST", "/api/cron/webhookTriggers", {
        headers: { authorization: cronKey },
        expect: [200, 401],
      }),
    dailyVideo: (rawBody, headers) =>
      anonymous("POST", "/api/recorded-daily-video", {
        rawBody,
        headers: { "content-type": "application/json", ...headers },
        expect: [200, 400, 403, 404, 405],
      }),
  };
}
```

### 6.4 Playwright fixtures

`src/fixtures/auth.ts`

```ts
import { loadAuthEnv, requireVar } from "../auth/env.ts";
import { mintCal, type CalAuth } from "../auth/cal.ts";
import { mintDocumenso, type DocumensoAuth } from "../auth/documenso.ts";
import { mintMedusa, type MedusaAuth } from "../auth/medusa.ts";
import { mintTwenty, type TwentyAuth } from "../auth/twenty.ts";
import { addSecret } from "../auth/secret.ts";
import { revokeAndVerify } from "../auth/lifecycle.ts";
import { calClient, type CalClient } from "../clients/cal.ts";
import { documensoClient, type DocumensoClient } from "../clients/documenso.ts";
import { medusaClient, type MedusaClient } from "../clients/medusa.ts";
import { twentyClient, type TwentyClient } from "../clients/twenty.ts";
import { readOnlyDb } from "../db/pg.ts";
import { apiBaseUrl, loadEnv } from "../env.ts";
import { currentRunPrefix, runScopedName } from "../run/prefix.ts";
import { retained, test as withInvariants } from "../invariants/fixture.ts";

/**
 * One credential per product per WORKER, minted on first use and revoked (and proven dead) when
 * the worker ends. A Playwright setup project cannot hand a token to the tests: setup, tests and
 * teardown run in different processes (probed on 1.64.0), and writing it to a file would put a
 * secret in an artefact. Tokens never leave memory: SecretString prints as <redacted:N>.
 */
interface Workers {
  calAuth: CalAuth;
  docAuth: DocumensoAuth;
  medAuth: MedusaAuth;
  twAuth: TwentyAuth;
}
interface Clients {
  cal: CalClient;
  doc: DocumensoClient;
  med: MedusaClient;
  tw: TwentyClient;
}

const name = (label: string): string => runScopedName(label);
/** Cal's web app (3000), where login, tRPC and the cron and Daily routes live; API v2 is 5555. */
const calWebUrl = (): string => loadEnv().CAL_BASE_URL.replace(/\/$/, "");

export const test = withInvariants.extend<Clients, Workers>({
  calAuth: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring pattern
    async ({}, use) => {
      const env = loadAuthEnv();
      addSecret(env.P2_CAL_USER_PASSWORD);
      const db = readOnlyDb("cal");
      const auth = await mintCal({
        baseUrl: calWebUrl(),
        email: env.P2_CAL_USER_EMAIL,
        password: env.P2_CAL_USER_PASSWORD,
        name,
        keyId: async (note) =>
          (
            await db.select<{ id: string }>(`SELECT "id" AS id FROM "ApiKey" WHERE "note" = $1`, [
              note,
            ])
          )[0]?.id,
      });
      const release = retained.retain("cal-leak-api-key-note", auth.label);
      await use(auth);
      await revokeAndVerify(auth, () => auth.isPresent());
      release();
    },
    { scope: "worker" },
  ],
  docAuth: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring pattern
    async ({}, use) => {
      const env = loadAuthEnv();
      addSecret(env.P2_DOC_USER_PASSWORD);
      const db = readOnlyDb("documenso");
      const auth = await mintDocumenso({
        baseUrl: apiBaseUrl("documenso"),
        email: env.P2_DOC_USER_EMAIL,
        password: env.P2_DOC_USER_PASSWORD,
        name,
        teamId: async () => {
          const rows = await db.select<{ id: number }>(
            `SELECT t."id" AS id FROM "Team" t JOIN "Organisation" o ON o."id" = t."organisationId" JOIN "User" u ON u."id" = o."ownerUserId" WHERE u."email" = $1 ORDER BY t."id" LIMIT 1`,
            [env.P2_DOC_USER_EMAIL],
          );
          const id = rows[0]?.id;
          if (id === undefined)
            throw new Error("TEST BUG: no personal team for the Documenso user");
          return id;
        },
      });
      const release = retained.retain("doc-leak-api-token-name", auth.label);
      await use(auth);
      await revokeAndVerify(auth, () => auth.isAccepted());
      release();
    },
    { scope: "worker" },
  ],
  medAuth: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring pattern
    async ({}, use) => {
      const env = loadAuthEnv();
      addSecret(env.MEDUSA_ADMIN_PASSWORD);
      const auth = await mintMedusa({
        baseUrl: apiBaseUrl("medusa"),
        email: requireVar("MEDUSA_ADMIN_EMAIL", env.MEDUSA_ADMIN_EMAIL),
        password: requireVar("MEDUSA_ADMIN_PASSWORD", env.MEDUSA_ADMIN_PASSWORD),
        name,
      });
      const releases = auth.titles.map((title) => retained.retain("med-leak-api-key-title", title));
      await use(auth);
      await revokeAndVerify(auth, () => auth.isAccepted());
      for (const release of releases) release();
    },
    { scope: "worker" },
  ],
  twAuth: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring pattern
    async ({}, use) => {
      const env = loadAuthEnv();
      addSecret(env.TWENTY_PASSWORD);
      const auth = await mintTwenty({
        baseUrl: apiBaseUrl("twenty"),
        email: env.TWENTY_EMAIL,
        password: env.TWENTY_PASSWORD,
        name,
      });
      const release = retained.retain("tw-leak-api-key-name", auth.label);
      await use(auth);
      await revokeAndVerify(auth, () => auth.isAccepted());
      release();
    },
    { scope: "worker" },
  ],
  cal: async ({ request, calAuth }, use) => {
    await use(
      calClient({
        request,
        baseUrl: calWebUrl(),
        runPrefix: currentRunPrefix(),
        auth: calAuth,
      }),
    );
  },
  doc: async ({ request, docAuth }, use) => {
    await use(
      documensoClient({
        request,
        baseUrl: apiBaseUrl("documenso"),
        runPrefix: currentRunPrefix(),
        auth: docAuth,
      }),
    );
  },
  med: async ({ request, medAuth }, use) => {
    await use(
      medusaClient({
        request,
        baseUrl: apiBaseUrl("medusa"),
        runPrefix: currentRunPrefix(),
        auth: medAuth,
      }),
    );
  },
  tw: async ({ request, twAuth }, use) => {
    await use(
      twentyClient({
        request,
        baseUrl: apiBaseUrl("twenty"),
        runPrefix: currentRunPrefix(),
        auth: twAuth,
      }),
    );
  },
});

export { expect } from "@playwright/test";
```

### 6.5 Config and environment

`playwright.config.ts` (diff)

```diff
--- a/playwright.config.ts
+++ b/playwright.config.ts
@@ -36,5 +36,7 @@ export default defineConfig({
     // No browserName and no page fixture: these projects use APIRequestContext only.
     extraHTTPHeaders: { accept: "application/json" },
-    trace: "retain-on-failure",
+    // Traces record request headers, including Authorization. API projects have no browser, so no
+    // trace: failures are diagnosed from the scrubbed ApiError text and the receiver/fixture logs.
+    trace: "off",
   },
   projects: [
```

`.env.example`: append (names only; leave a value empty to use the default of `src/auth/env.ts`):

```text
# Admin account the harness seeds for Medusa (seed() creates it from these). CI generates both per job.
MEDUSA_ADMIN_EMAIL=
MEDUSA_ADMIN_PASSWORD=
# Seeded accounts the credentials are minted from. Defaults are the forks' public dev-seed values.
P2_DOC_USER_EMAIL=
P2_DOC_USER_PASSWORD=
P2_CAL_USER_EMAIL=
P2_CAL_USER_PASSWORD=
TWENTY_EMAIL=
TWENTY_PASSWORD=
```

### 6.6 Tests (exact names are the contract)

`tests/unit/auth/reaper.test.ts` (new, 2 tests)

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { JOB_TIMEOUT_MS, runStartedAt, selectStaleLeftovers } from "../../../src/auth/reaper.ts";

const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
const OLD = "p2-qa-20261101t113000z-1a2b3c4d"; // started 30 min before NOW
const FRESH = "p2-qa-20261101t115500z-5e6f7a8b"; // started 5 min before NOW
const CURRENT = "p2-qa-20261101t100000z-9c0d1e2f"; // the run doing the sweep

describe("reaper", () => {
  test("removes only run-pattern leftovers older than the job timeout", () => {
    const picked = selectStaleLeftovers({
      leftovers: [
        { id: "1", name: `${OLD}-doc-token` },
        { id: "2", name: `${FRESH}-doc-token` },
        { id: "3", name: "manual-key" },
        { id: "4", name: `${CURRENT}-cal-key` },
      ],
      currentPrefix: CURRENT,
      nowMs: NOW,
      jobTimeoutMs: JOB_TIMEOUT_MS,
    });
    assert.deepEqual(
      picked.map((l) => l.id),
      ["1"],
    );
  });

  test("a name that only partly matches the pattern, or an impossible date, is never selected", () => {
    assert.equal(runStartedAt("xp2-qa-20261101t113000z-1a2b3c4d-tw"), undefined);
    const picked = selectStaleLeftovers({
      leftovers: [
        { id: "a", name: "xp2-qa-20261101t113000z-1a2b3c4d-tw" },
        { id: "b", name: "p2-qa-20261399t999999z-1a2b3c4d-tw" },
      ],
      currentPrefix: CURRENT,
      nowMs: NOW,
      jobTimeoutMs: JOB_TIMEOUT_MS,
    });
    assert.deepEqual(picked, []);
  });
});
```



`tests/unit/auth/secret.test.ts`

```ts
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { afterEach, describe, test } from "node:test";
import {
  addSecret,
  clearSecretsForTests,
  scrubSecrets,
  SecretString,
} from "../../../src/auth/secret.ts";
import { revokeAndVerify } from "../../../src/auth/lifecycle.ts";
import type { MintedAuth } from "../../../src/auth/http.ts";

afterEach(() => {
  clearSecretsForTests();
});

describe("SecretString", () => {
  const value = "tok_abcdef0123456789";

  test("never prints its value through String, template strings, JSON or inspect", () => {
    const secret = new SecretString(value);
    const printed = [
      String(secret),
      secret.toString(),
      JSON.stringify({ secret }),
      inspect(secret),
      inspect({ nested: { secret } }),
      JSON.stringify([secret]),
    ];
    for (const text of printed) assert.ok(!text.includes(value), text);
    assert.equal(String(secret), "<redacted:20>");
  });

  test("never prints through console.log", () => {
    const secret = new SecretString(value);
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map((a) => (typeof a === "string" ? a : inspect(a))).join(" "));
    };
    try {
      console.log(secret, { secret }, [secret]);
    } finally {
      console.log = original;
    }
    assert.ok(!lines.join("\n").includes(value));
  });

  test("reveal() returns the value for the HTTP layer and length is exposed", () => {
    const secret = new SecretString(value);
    assert.equal(secret.reveal(), value);
    assert.equal(secret.length, value.length);
  });

  test("an empty secret is refused", () => {
    assert.throws(() => new SecretString(""), /must not be empty/);
  });

  test("scrubSecrets replaces every wrapped or added secret and ignores short strings", () => {
    const secret = new SecretString(value);
    addSecret("hunter2-hunter2");
    addSecret("abc");
    const text = `a ${secret.reveal()} b hunter2-hunter2 c abc ${secret.reveal()}`;
    assert.equal(scrubSecrets(text), "a <redacted> b <redacted> c abc <redacted>");
  });
});

describe("revokeAndVerify", () => {
  const auth = (log: string[], fail = false): MintedAuth => ({
    product: "medusa",
    headerName: "authorization",
    headerValue: new SecretString("Basic dGVzdA=="),
    label: "p2-qa-x-admin-key",
    revoke: () => {
      log.push("revoke");
      return fail ? Promise.reject(new Error("boom")) : Promise.resolve();
    },
  });

  test("revokes, then checks that the product rejects the credential", async () => {
    const log: string[] = [];
    await revokeAndVerify(auth(log), () => {
      log.push("probe");
      return Promise.resolve(false);
    });
    assert.deepEqual(log, ["revoke", "probe"]);
  });

  test("a credential that is still accepted after revoke is a leak and fails", async () => {
    await assert.rejects(
      revokeAndVerify(auth([]), () => Promise.resolve(true)),
      /still accepted after revoke \(token leak\)/,
    );
  });

  test("a failing revoke is reported and the probe is not trusted", async () => {
    const log: string[] = [];
    await assert.rejects(
      revokeAndVerify(auth(log, true), () => Promise.resolve(false)),
      /boom/,
    );
    assert.deepEqual(log, ["revoke"]);
  });
});
```

`tests/unit/auth/flows.test.ts`

```ts
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { loadAuthEnv } from "../../../src/auth/env.ts";
import { mintCal } from "../../../src/auth/cal.ts";
import { mintDocumenso } from "../../../src/auth/documenso.ts";
import {
  AuthError,
  CookieJar,
  type HttpPort,
  type HttpRequest,
  type HttpResponse,
} from "../../../src/auth/http.ts";
import { mintMedusa } from "../../../src/auth/medusa.ts";
import { clearSecretsForTests } from "../../../src/auth/secret.ts";
import { mintTwenty } from "../../../src/auth/twenty.ts";

afterEach(() => {
  clearSecretsForTests();
});

const RUN = "p2-qa-20261101t090000z-0a1b2c3d";
const name = (label: string): string => `${RUN}-${label}`;
const reply = (status: number, body: unknown, setCookies: string[] = []): HttpResponse => ({
  status,
  headers: {},
  setCookies,
  text: typeof body === "string" ? body : JSON.stringify(body),
});

/** Records every request and answers from `route(request)` (first matching string key wins). */
function port(route: (r: HttpRequest) => HttpResponse): { http: HttpPort; calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];
  return {
    calls,
    http: (r) => {
      calls.push(r);
      return Promise.resolve(route(r));
    },
  };
}
const where = (r: HttpRequest): string => `${r.method} ${new URL(r.url).pathname}`;

describe("auth env", () => {
  test("defaults are the public seed accounts; Medusa admin has none", () => {
    const env = loadAuthEnv({});
    assert.deepEqual(
      [env.P2_DOC_USER_EMAIL, env.P2_CAL_USER_EMAIL, env.TWENTY_EMAIL],
      ["example@documenso.com", "pro@example.com", "jane.austen@apple.dev"],
    );
    assert.equal(env.MEDUSA_ADMIN_EMAIL, undefined);
    assert.equal(loadAuthEnv({ P2_CAL_USER_EMAIL: "  " }).P2_CAL_USER_EMAIL, "pro@example.com");
  });
});

describe("medusa mint and revoke", () => {
  const route =
    (revokedKeys: Set<string>) =>
    (r: HttpRequest): HttpResponse => {
      const key = where(r);
      if (key === "POST /auth/user/emailpass")
        return reply(200, { token: "jwt-token-value-123456" });
      if (key === "POST /admin/api-keys") {
        const body = JSON.parse(r.body ?? "{}") as { type: string };
        return reply(200, {
          api_key: { id: `apk_${body.type}`, token: `${body.type}-key-token-123456` },
        });
      }
      if (/^POST \/admin\/api-keys\/apk_\w+\/revoke$/.test(key)) {
        revokedKeys.add(key.split("/")[3] ?? "");
        return reply(200, { api_key: {} });
      }
      if (/^DELETE \/admin\/api-keys\/apk_\w+$/.test(key)) return reply(200, { deleted: true });
      if (key === "GET /admin/sales-channels") {
        return reply(200, {
          sales_channels: [
            { id: "sc_other", name: "Other" },
            { id: "sc_default", name: "Default Sales Channel" },
          ],
        });
      }
      if (key === "POST /admin/api-keys/apk_publishable/sales-channels")
        return reply(200, { api_key: {} });
      if (key === "GET /admin/regions") return reply(revokedKeys.has("apk_secret") ? 401 : 200, {});
      return reply(404, "no route");
    };

  test("logs in, creates a run-scoped secret and publishable key, uses Basic auth with the secret key", async () => {
    const { http, calls } = port(route(new Set()));
    const auth = await mintMedusa({
      baseUrl: "http://m",
      email: "a@b.c",
      password: "pw-pw-pw-pw",
      name,
      http,
    });
    assert.deepEqual(calls.map(where), [
      "POST /auth/user/emailpass",
      "POST /admin/api-keys",
      "POST /admin/api-keys",
      "GET /admin/sales-channels",
      "POST /admin/api-keys/apk_publishable/sales-channels",
    ]);
    assert.deepEqual(
      calls.slice(1, 3).map((c) => JSON.parse(c.body ?? "{}") as unknown),
      [
        { title: `${RUN}-admin-key`, type: "secret" },
        { title: `${RUN}-store-key`, type: "publishable" },
      ],
    );
    assert.deepEqual(JSON.parse(calls[4]?.body ?? "{}"), { add: ["sc_default"] });
    assert.deepEqual(auth.titles, [`${RUN}-admin-key`, `${RUN}-store-key`]);
    assert.equal(
      auth.headerValue.reveal(),
      `Basic ${Buffer.from("secret-key-token-123456:").toString("base64")}`,
    );
    assert.equal(auth.publishableKey.reveal(), "publishable-key-token-123456");
    assert.equal(auth.label, `${RUN}-admin-key`);
    assert.ok(await auth.isAccepted());
  });

  test("revoke revokes then deletes both keys, once, and the product then rejects the key", async () => {
    const { http, calls } = port(route(new Set()));
    const auth = await mintMedusa({
      baseUrl: "http://m",
      email: "a@b.c",
      password: "pw-pw-pw-pw",
      name,
      http,
    });
    calls.length = 0;
    await auth.revoke();
    await auth.revoke();
    assert.deepEqual(calls.map(where), [
      "POST /admin/api-keys/apk_secret/revoke",
      "DELETE /admin/api-keys/apk_secret",
      "POST /admin/api-keys/apk_publishable/revoke",
      "DELETE /admin/api-keys/apk_publishable",
    ]);
    assert.equal(await auth.isAccepted(), false);
  });

  test("a failed login throws an AuthError without the password", async () => {
    const { http } = port(() => reply(401, { message: "bad pw-pw-pw-pw" }));
    await assert.rejects(
      mintMedusa({ baseUrl: "http://m", email: "a@b.c", password: "pw-pw-pw-pw", name, http }),
      (e: unknown) =>
        e instanceof AuthError && e.status === 401 && !e.message.includes("pw-pw-pw-pw"),
    );
  });

  test("if the second key cannot be created the first one is revoked again", async () => {
    let created = 0;
    const revoked = new Set<string>();
    const base = route(revoked);
    const { http, calls } = port((r) => {
      if (where(r) === "POST /admin/api-keys" && (created += 1) === 2) return reply(500, "nope");
      return base(r);
    });
    await assert.rejects(
      mintMedusa({ baseUrl: "http://m", email: "a@b.c", password: "pw-pw-pw-pw", name, http }),
      /medusa create publishable key/,
    );
    assert.ok(calls.map(where).includes("DELETE /admin/api-keys/apk_secret"));
  });
});

describe("twenty mint and revoke", () => {
  function twentyRoute(state: { revoked: boolean; logins: number; failFirstRevoke?: boolean }) {
    return (r: HttpRequest): HttpResponse => {
      const key = where(r);
      if (key === "GET /rest/people")
        return state.revoked
          ? reply(403, { messages: ["This API Key is revoked"] })
          : reply(200, {});
      const query = (JSON.parse(r.body ?? "{}") as { query: string }).query;
      if (query.includes("signIn")) {
        state.logins += 1;
        return reply(200, {
          data: {
            signIn: {
              availableWorkspaces: {
                availableWorkspacesForSignIn: [
                  {
                    loginToken: "login-token-1",
                    workspaceUrls: { subdomainUrl: "http://127.0.0.1:3002/" },
                  },
                ],
              },
            },
          },
        });
      }
      if (query.includes("getAuthTokensFromLoginToken"))
        return reply(200, {
          data: {
            getAuthTokensFromLoginToken: {
              tokens: {
                accessOrWorkspaceAgnosticToken: {
                  token: `access-token-${String(state.logins)}-value`,
                },
              },
            },
          },
        });
      if (query.includes("getRoles"))
        return reply(200, {
          data: {
            getRoles: [
              { id: "r-member", label: "Member" },
              { id: "r-admin", label: "Admin" },
            ],
          },
        });
      if (query.includes("createApiKey"))
        return reply(200, { data: { createApiKey: { id: "key-1" } } });
      if (query.includes("generateApiKeyToken"))
        return reply(200, { data: { generateApiKeyToken: { token: "api-key-jwt-value-123" } } });
      if (query.includes("revokeApiKey")) {
        if (state.failFirstRevoke) {
          state.failFirstRevoke = false;
          return reply(200, { errors: [{ message: "token expired" }] });
        }
        state.revoked = true;
        return reply(200, { data: { revokeApiKey: { id: "key-1" } } });
      }
      return reply(404, "no route");
    };
  }
  const mint = (state: { revoked: boolean; logins: number; failFirstRevoke?: boolean }) => {
    const { http, calls } = port(twentyRoute(state));
    return {
      calls,
      promise: mintTwenty({
        baseUrl: "http://t",
        email: "jane@x.dev",
        password: "pw-pw-pw-pw",
        name,
        http,
        now: () => new Date("2026-11-01T09:00:00.000Z"),
        ttlMs: 3_600_000,
      }),
    };
  };

  test("signs in through the workspace loginToken, picks the Admin role and mints a bearer", async () => {
    const state = { revoked: false, logins: 0 };
    const { calls, promise } = mint(state);
    const auth = await promise;
    const bodies = calls
      .filter((c) => c.method === "POST")
      .map(
        (c) => JSON.parse(c.body ?? "{}") as { query: string; variables: Record<string, unknown> },
      );
    assert.deepEqual(
      bodies.map(
        (b) =>
          b.query.match(
            /(signIn|getAuthTokensFromLoginToken|getRoles|createApiKey|generateApiKeyToken)/,
          )?.[1],
      ),
      ["signIn", "getAuthTokensFromLoginToken", "getRoles", "createApiKey", "generateApiKeyToken"],
    );
    assert.deepEqual(bodies[3]?.variables, {
      i: { name: `${RUN}-tw-key`, expiresAt: "2026-11-01T10:00:00.000Z", roleId: "r-admin" },
    });
    assert.equal(calls[1]?.headers?.["authorization"], undefined, "signIn is anonymous");
    assert.equal(calls[3]?.headers?.["authorization"], "Bearer access-token-1-value");
    assert.equal(auth.headerValue.reveal(), "Bearer api-key-jwt-value-123");
    assert.ok(await auth.isAccepted());
  });

  test("revoke makes the key answer 403 and is idempotent", async () => {
    const state = { revoked: false, logins: 0 };
    const auth = await mint(state).promise;
    await auth.revoke();
    await auth.revoke();
    assert.equal(await auth.isAccepted(), false);
  });

  test("revoke signs in again once when the 30-minute access token has expired", async () => {
    const state = { revoked: false, logins: 0, failFirstRevoke: true };
    const auth = await mint(state).promise;
    await auth.revoke();
    assert.equal(state.logins, 2);
    assert.equal(state.revoked, true);
  });
});

describe("documenso mint and revoke", () => {
  function route(state: { deleted: boolean }) {
    return (r: HttpRequest): HttpResponse => {
      const key = where(r);
      if (key === "GET /api/auth/csrf")
        return reply(200, { csrfToken: "csrf-1" }, ["csrfToken=csrf-1; Path=/"]);
      if (key === "POST /api/auth/email-password/authorize")
        return reply(201, {}, ["sessionId=sess-1; Path=/; HttpOnly"]);
      if (key === "POST /api/trpc/apiToken.create")
        return reply(200, { result: { data: { json: { id: 7, token: "api_0123456789abcdef" } } } });
      if (key === "POST /api/trpc/apiToken.delete") {
        state.deleted = true;
        return reply(200, { result: { data: { json: null } } });
      }
      if (key === "GET /api/v2/envelope") return reply(state.deleted ? 401 : 200, {});
      return reply(404, "no route");
    };
  }

  test("logs in with the csrf token and cookie, creates a named token for the user's team", async () => {
    const state = { deleted: false };
    const { http, calls } = port(route(state));
    const auth = await mintDocumenso({
      baseUrl: "http://d",
      email: "e@x.y",
      password: "pw-pw-pw-pw",
      name,
      teamId: () => Promise.resolve(3),
      http,
    });
    assert.deepEqual(JSON.parse(calls[1]?.body ?? "{}"), {
      email: "e@x.y",
      password: "pw-pw-pw-pw",
      csrfToken: "csrf-1",
    });
    assert.equal(calls[1]?.headers?.["cookie"], "csrfToken=csrf-1");
    assert.deepEqual(JSON.parse(calls[2]?.body ?? "{}"), {
      json: { teamId: 3, tokenName: `${RUN}-doc-token`, expirationDate: "ONE_HOUR" },
    });
    assert.equal(calls[2]?.headers?.["x-team-id"], "3");
    assert.equal(auth.headerValue.reveal(), "api_0123456789abcdef");
    assert.equal(auth.teamId, 3);
    assert.equal(auth.sessionCookie.reveal(), "csrfToken=csrf-1; sessionId=sess-1");
    assert.ok(await auth.isAccepted());
  });

  test("revoke deletes the token by id and team, and the product then answers 401", async () => {
    const state = { deleted: false };
    const { http, calls } = port(route(state));
    const auth = await mintDocumenso({
      baseUrl: "http://d",
      email: "e@x.y",
      password: "pw-pw-pw-pw",
      name,
      teamId: () => Promise.resolve(3),
      http,
    });
    await auth.revoke();
    await auth.revoke();
    assert.deepEqual(JSON.parse(calls.at(-1)?.body ?? "{}"), { json: { id: 7, teamId: 3 } });
    assert.equal(calls.filter((c) => where(c) === "POST /api/trpc/apiToken.delete").length, 1);
    assert.equal(await auth.isAccepted(), false);
  });

  test("a login without a session cookie is a failure", async () => {
    const { http } = port((r) =>
      where(r) === "GET /api/auth/csrf" ? reply(200, { csrfToken: "c" }) : reply(201, {}),
    );
    await assert.rejects(
      mintDocumenso({
        baseUrl: "http://d",
        email: "e",
        password: "pw-pw-pw-pw",
        name,
        teamId: () => Promise.resolve(1),
        http,
      }),
      /documenso authorize/,
    );
  });
});

describe("cal mint and revoke", () => {
  function route() {
    return (r: HttpRequest): HttpResponse => {
      const key = where(r);
      if (key === "GET /api/auth/csrf")
        return reply(200, { csrfToken: "csrf-1" }, ["next-auth.csrf-token=c%7Ch; Path=/"]);
      if (key === "POST /api/auth/callback/credentials")
        return reply(200, {}, ["next-auth.session-token=sess-1; Path=/; HttpOnly"]);
      if (key === "POST /api/trpc/apiKeys/create")
        return reply(200, [{ result: { data: { json: "cal_0123456789abcdef0123" } } }]);
      if (key === "POST /api/trpc/apiKeys/delete")
        return reply(200, [{ result: { data: { json: { id: "k1" } } } }]);
      return reply(404, "no route");
    };
  }

  test("logs in with the credentials form and creates a key whose note carries the run prefix", async () => {
    const { http, calls } = port(route());
    const auth = await mintCal({
      baseUrl: "http://c",
      email: "pro@example.com",
      password: "pw-pw-pw-pw",
      name,
      keyId: () => Promise.resolve("k1"),
      now: () => new Date("2026-11-01T10:00:00.000Z"),
      http,
    });
    const form = new URLSearchParams(calls[1]?.body);
    assert.deepEqual(
      [form.get("email"), form.get("json"), form.get("csrfToken")],
      ["pro@example.com", "true", "csrf-1"],
    );
    assert.deepEqual(JSON.parse(calls[2]?.body ?? "{}"), {
      0: {
        json: { note: `${RUN}-cal-key`, neverExpires: false, expiresAt: "2026-11-01T11:00:00.000Z" },
        meta: { values: { expiresAt: ["Date"] } },
      },
    });
    assert.equal(auth.headerValue.reveal(), "Bearer cal_0123456789abcdef0123");
    assert.ok(auth.sessionCookie.reveal().includes("next-auth.session-token=sess-1"));
  });

  test("revoke deletes the row found by note; isPresent follows the read-only lookup", async () => {
    const { http, calls } = port(route());
    let present: string | undefined = "k1";
    const auth = await mintCal({
      baseUrl: "http://c",
      email: "e",
      password: "pw-pw-pw-pw",
      name,
      keyId: (note) => {
        assert.equal(note, `${RUN}-cal-key`);
        return Promise.resolve(present);
      },
      http,
    });
    assert.equal(await auth.isPresent(), true);
    await auth.revoke();
    present = undefined;
    assert.equal(await auth.isPresent(), false);
    assert.deepEqual(JSON.parse(calls.at(-1)?.body ?? "{}"), { 0: { json: { id: "k1" } } });
  });

  test("a key that does not look like cal_ is refused", async () => {
    const { http } = port((r) =>
      where(r).endsWith("apiKeys/create")
        ? reply(200, [{ result: { data: { json: "oops" } } }])
        : route()(r),
    );
    await assert.rejects(
      mintCal({
        baseUrl: "http://c",
        email: "e",
        password: "pw-pw-pw-pw",
        name,
        keyId: () => Promise.resolve(undefined),
        http,
      }),
      /cal apiKeys\/create/,
    );
  });
});

describe("cookie jar", () => {
  test("keeps the latest value per cookie and ignores attributes", () => {
    const jar = new CookieJar();
    jar.absorb(["a=1; Path=/; HttpOnly", "b=2; Secure"]);
    jar.absorb(["a=3; Path=/"]);
    assert.equal(jar.header(), "a=3; b=2");
    assert.ok(jar.has("b") && !jar.has("c"));
  });
});
```

`tests/unit/clients/clients.test.ts`

```ts
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import type { APIRequestContext } from "@playwright/test";
import { clearSecretsForTests, SecretString } from "../../../src/auth/secret.ts";
import type { CalAuth } from "../../../src/auth/cal.ts";
import type { DocumensoAuth } from "../../../src/auth/documenso.ts";
import type { MedusaAuth } from "../../../src/auth/medusa.ts";
import type { TwentyAuth } from "../../../src/auth/twenty.ts";
import {
  ApiError,
  createCaller,
  RUN_ID_HEADER,
  type ApiRequestLike,
} from "../../../src/clients/base.ts";
import { calClient } from "../../../src/clients/cal.ts";
import { documensoClient } from "../../../src/clients/documenso.ts";
import { medusaClient } from "../../../src/clients/medusa.ts";
import { twentyClient } from "../../../src/clients/twenty.ts";
import config from "../../../playwright.config.ts";

afterEach(() => {
  clearSecretsForTests();
});

const RUN = "p2-qa-20261101t090000z-0a1b2c3d";
type FetchOptions = NonNullable<Parameters<ApiRequestLike["fetch"]>[1]>;
interface Seen {
  url: string;
  options: FetchOptions;
}

function fake(status: number, body: unknown): { request: ApiRequestLike; seen: Seen[] } {
  const seen: Seen[] = [];
  return {
    seen,
    request: {
      fetch: (url, options = {}) => {
        seen.push({ url, options });
        return Promise.resolve({
          status: () => status,
          headers: () => ({ "content-type": "application/json" }),
          text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
        });
      },
    },
  };
}

// Compile-time: a real Playwright APIRequestContext is accepted wherever ApiRequestLike is.
const assignable = (context: APIRequestContext): ApiRequestLike => context;

function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  assert.ok(item !== undefined, `item ${String(index)} exists`);
  return item;
}

test("a real Playwright APIRequestContext satisfies the structural request type", () => {
  assert.equal(typeof assignable, "function");
});

describe("createCaller", () => {
  // Built per test: afterEach clears the secret registry, so a shared instance would be forgotten.
  const mkAuth = (): { headerName: string; headerValue: SecretString } => ({
    headerName: "authorization",
    headerValue: new SecretString("Bearer s3cr3t-token-value"),
  });

  test("adds the run id, accept and auth headers, never follows redirects and never throws on status by itself", async () => {
    const { request, seen } = fake(200, { ok: true });
    const call = createCaller({ request, baseUrl: "http://x", runPrefix: RUN, auth: mkAuth() });
    const res = await call("GET", "/p");
    assert.deepEqual(res.body, { ok: true });
    const options = nth(seen, 0).options;
    assert.equal(nth(seen, 0).url, "http://x/p");
    assert.deepEqual(options.headers, {
      accept: "application/json",
      [RUN_ID_HEADER]: RUN,
      authorization: "Bearer s3cr3t-token-value",
    });
    assert.equal(options.maxRedirects, 0);
    assert.equal(options.failOnStatusCode, false);
  });

  test("JSON bodies get a content type; raw bodies are sent byte for byte", async () => {
    const { request, seen } = fake(201, {});
    const call = createCaller({ request, baseUrl: "http://x", runPrefix: RUN });
    await call("POST", "/j", { body: { a: 1 } });
    await call("POST", "/r", { rawBody: Buffer.from([0x7b, 0xff]) });
    assert.equal(nth(seen, 0).options.headers?.["content-type"], "application/json");
    assert.equal(nth(seen, 0).options.data, '{"a":1}');
    assert.ok(
      Buffer.isBuffer(nth(seen, 1).options.data) &&
        (nth(seen, 1).options.data as Buffer).equals(Buffer.from([0x7b, 0xff])),
    );
  });

  test("an unexpected status is an ApiError whose text is truncated and scrubbed of the token", async () => {
    const { request } = fake(500, `boom ${"x".repeat(300)} s3cr3t-token-value`);
    const call = createCaller({ request, baseUrl: "http://x", runPrefix: RUN, auth: mkAuth() });
    await assert.rejects(
      call("GET", "/p"),
      (e: unknown) =>
        e instanceof ApiError &&
        e.status === 500 &&
        !e.message.includes("s3cr3t-token-value") &&
        e.message.length < 260,
    );
    const secretInBody = fake(401, "Bearer s3cr3t-token-value rejected");
    await assert.rejects(
      createCaller({
        request: secretInBody.request,
        baseUrl: "http://x",
        runPrefix: RUN,
        auth: mkAuth(),
      })("GET", "/p"),
      (e: unknown) =>
        e instanceof Error && e.message.includes("<redacted>") && !e.message.includes("s3cr3t"),
    );
  });

  test("expect widens the accepted statuses; a non-JSON body is returned as text", async () => {
    const { request } = fake(404, "plain text");
    const res = await createCaller({ request, baseUrl: "http://x", runPrefix: RUN })("GET", "/p", {
      expect: [404],
    });
    assert.equal(res.body, "plain text");
  });
});

describe("product clients", () => {
  const secret = (v: string): SecretString => new SecretString(v);

  test("medusa: store calls carry the publishable key, admin calls the Basic header, the hook is anonymous", async () => {
    const auth = {
      product: "medusa",
      headerName: "authorization",
      headerValue: secret("Basic abc123def456"),
      publishableKey: secret("pk_0123456789"),
      label: "l",
    } as unknown as MedusaAuth;
    const { request, seen } = fake(200, { cart: { id: "cart_1" }, regions: [] });
    const med = medusaClient({ request, baseUrl: "http://m", runPrefix: RUN, auth });
    await med.admin.regions();
    assert.equal(await med.store.createCart("reg_1", "e@x.y"), "cart_1");
    await med.hooks.payment("stripe_stripe", '{"a": 1}', { "stripe-signature": "t=1,v1=ab" });
    assert.equal(nth(seen, 0).options.headers?.["authorization"], "Basic abc123def456");
    assert.equal(nth(seen, 1).options.headers?.["x-publishable-api-key"], "pk_0123456789");
    assert.equal(nth(seen, 2).url, "http://m/hooks/payment/stripe_stripe");
    assert.equal(nth(seen, 2).options.headers?.["authorization"], undefined);
    assert.equal(nth(seen, 2).options.data, '{"a": 1}', "the signed bytes are not re-serialised");
  });

  test("twenty: REST calls use the bearer; people and webhooks round-trip ids", async () => {
    const auth = {
      product: "twenty",
      headerName: "authorization",
      headerValue: secret("Bearer jwt-0123456789"),
      label: "l",
    } as unknown as TwentyAuth;
    const { request, seen } = fake(201, { id: "wh-1", data: { createPerson: { id: "p-1" } } });
    const tw = twentyClient({ request, baseUrl: "http://t", runPrefix: RUN, auth });
    assert.equal(await tw.people.create(`${RUN}-a`), "p-1");
    assert.equal(
      await tw.webhooks.create({
        targetUrl: "http://g/r",
        operations: ["person.created"],
        secret: "s",
        description: "d",
      }),
      "wh-1",
    );
    assert.equal(nth(seen, 0).options.headers?.["authorization"], "Bearer jwt-0123456789");
    assert.deepEqual(JSON.parse(String(nth(seen, 0).options.data)), {
      name: { firstName: `${RUN}-a`, lastName: "Qa" },
    });
  });

  test("documenso: envelopes use the token, tRPC calls the session cookie and team header", async () => {
    const auth = {
      product: "documenso",
      headerName: "authorization",
      headerValue: secret("api_0123456789abcdef"),
      sessionCookie: secret("sessionId=abc"),
      teamId: 3,
      label: "l",
    } as unknown as DocumensoAuth;
    const { request, seen } = fake(200, {
      id: "envelope_1",
      result: { data: { json: { id: "wh_1" } } },
    });
    const doc = documensoClient({ request, baseUrl: "http://d", runPrefix: RUN, auth });
    assert.equal(
      await doc.envelopes.create({
        title: `${RUN}-e`,
        pdf: Buffer.from("%PDF"),
        recipients: [{ email: "a@b.c", name: "A" }],
      }),
      "envelope_1",
    );
    assert.equal(
      await doc.webhooks.create({
        webhookUrl: "http://h/r",
        eventTriggers: ["DOCUMENT_CREATED"],
        secret: "s",
      }),
      "wh_1",
    );
    assert.equal(nth(seen, 0).options.headers?.["authorization"], "api_0123456789abcdef");
    const multipart = nth(seen, 0).options.multipart;
    assert.ok(multipart !== undefined && "files" in multipart);
    assert.equal(nth(seen, 1).options.headers?.["cookie"], "sessionId=abc");
    assert.equal(nth(seen, 1).options.headers?.["x-team-id"], "3");
    assert.deepEqual(JSON.parse(String(nth(seen, 1).options.data)), {
      json: {
        webhookUrl: "http://h/r",
        eventTriggers: ["DOCUMENT_CREATED"],
        secret: "s",
        enabled: true,
      },
    });
  });

  test("cal: webhook CRUD uses the session cookie; the cron call sends the key without Bearer and accepts 401", async () => {
    const auth = {
      product: "cal",
      headerName: "authorization",
      headerValue: secret("Bearer cal_0123456789"),
      sessionCookie: secret("next-auth.session-token=s"),
      label: "l",
    } as unknown as CalAuth;
    const { request, seen } = fake(200, [{ result: { data: { json: { id: "w1" } } } }]);
    const cal = calClient({ request, baseUrl: "http://c", runPrefix: RUN, auth });
    assert.equal(
      await cal.webhooks.create({
        subscriberUrl: "http://r/r",
        eventTriggers: ["BOOKING_CREATED"],
        secret: "s",
      }),
      "w1",
    );
    await cal.cronWebhookTriggers("cron-key-value");
    assert.equal(nth(seen, 0).url, "http://c/api/trpc/webhook/create?batch=1");
    assert.equal(nth(seen, 0).options.headers?.["cookie"], "next-auth.session-token=s");
    assert.equal(nth(seen, 1).options.headers?.["authorization"], "cron-key-value");
    assert.equal(nth(seen, 1).options.method, "POST");
  });
});

describe("secrets never reach traces or reports", () => {
  test("the API projects run with tracing off, because a trace records request headers", () => {
    assert.equal(config.use?.trace, "off");
    assert.equal(config.use.screenshot, undefined);
    assert.equal(config.use.video, undefined);
  });

  test("every error a client can raise is scrubbed of the credential it sent", async () => {
    const auth = {
      headerName: "authorization",
      headerValue: new SecretString("Basic zzzz-secret-zzzz"),
    };
    const { request } = fake(403, '{"echo":"Basic zzzz-secret-zzzz"}');
    const call = createCaller({ request, baseUrl: "http://x", runPrefix: RUN, auth });
    await assert.rejects(
      call("GET", "/p"),
      (e: unknown) =>
        !JSON.stringify(e, Object.getOwnPropertyNames(e)).includes("zzzz-secret-zzzz"),
    );
  });
});
```

Counts: `secret.test.ts` 8, `flows.test.ts` 15, `clients.test.ts` 11 = **34**.

## 7. Data isolation, cleanup and leak check

- Names: every key, token, note and title is `runScopedName(...)`, so it starts with the run prefix.
- Cleanup: each credential is revoked and verified dead in the fixture teardown; Medusa also deletes both keys,
  Documenso deletes the token, Cal deletes the row, Twenty revokes (a revoked key stays as a row, which the Twenty
  leak rule allows because it filters on `revokedAt IS NULL`).
- Leak check: while the worker lives its credentials are rows with the run prefix; the fixture registers them with
  `retained.retain(<rule id>, <label>)` and releases them after the revoke, so the P2-X-DB-001 sweep still flags
  any other row. Medusa registers both titles (`admin-key`, `store-key`).
- No credential is written to disk, to `process.env`, to a log or to a trace (D2, D3, D4).

## 8. Build steps (repo root; `export PATH="/usr/local/bin:$PATH"`; on any differing output STOP and paste it)

0. Branch from the Task 3 head: `git checkout -b feat/$(date -u +%F)-p2-task4-api-clients-tokens <task3 branch>`;
   `git rev-parse HEAD` recorded as `BASE=$(git rev-parse HEAD)` (the trailer gate of section 9 uses it). `npm ci && npm run check` -> `# tests 214`.
1. `src/auth/secret.ts`, `src/auth/http.ts`, `src/auth/lifecycle.ts`, `tests/unit/auth/secret.test.ts` (it also
   tests `revokeAndVerify`). `node --test tests/unit/auth/secret.test.ts` -> `# tests 8`. Commit 1.
2. `src/auth/env.ts`, the four `src/auth/<product>.ts`, `tests/unit/auth/flows.test.ts` -> `# tests 15`. Commit 2.
3. `src/clients/*.ts`, `tests/unit/clients/clients.test.ts` -> `# tests 11`. Commit 3.
4. `src/fixtures/auth.ts`, the `playwright.config.ts` edit, `.env.example` lines. `npx tsc -p tsconfig.json` clean.
   Commit 4.
2b. `src/auth/lifetime.ts`, `src/auth/reaper.ts`, `tests/unit/auth/reaper.test.ts` -> `# tests 2`, `# pass 2`. The list and
   revoke adapters and the worker-start call are Task 5 step 5 (section 6.2b). Commit 2b.
5. `npm run check` -> exit 0, `# tests 250`. Run `node --test "tests/unit/**/*.test.ts"` three times: always 250/0.
6. Optional live proof when a stack is available (else write "UNPROBED in this session: Task 5 proves it"):
   Task 5's specs are the live proof; do not write another harness here.

## 9. Done criteria (machine-checkable)

```bash
npm run check                                   # exit 0; "# tests 250" "# pass 250" "# fail 0"
git rev-parse --verify "$BASE" >/dev/null || { echo "STOP: BASE not found"; exit 1; }
! git log --format=%B "$BASE"..HEAD | grep -iE 'co-?authored-?by|generated[ ]with|claude-?session'   # empty: no trailers, before any push
node --test tests/unit/auth/*.test.ts tests/unit/clients/*.test.ts 2>&1 | grep -E '^# (tests|pass|fail)'   # 34 / 34 / 0
grep -n 'trace:' playwright.config.ts           # one line: trace: "off",
grep -rnE 'console\.(log|error|warn|info|debug)\(' src/auth src/clients src/fixtures ; test $? -eq 1   # no console call in credential code
grep -rn 'process\.env\[' src/auth src/clients  ; test $? -eq 1                # only src/auth/env.ts reads env, via loadAuthEnv
npm run list:api                                # "Total: 0 tests in 0 files"
git status --porcelain                          # empty after the commits
git diff --name-only <task3-head>..HEAD | sort  # exactly the files of section 5
git diff <task3-head>..HEAD -- . ':(exclude)tests/unit' | grep -E '^\+' | grep -nE 'sk_live_|sk_test_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|Bearer [A-Za-z0-9._-]{20,}|cal_[A-Za-z0-9]{20,}|api_[A-Za-z0-9]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY' ; test $? -eq 1
git diff <task3-head>..HEAD | grep -niE 'j[a]yami|h[e]ttigoda' ; test $? -eq 1
```

Credential code reads the environment only through `loadAuthEnv`, `loadEnv` and `apiBaseUrl`, so the second
`grep` must stay empty. The unit fixtures in `tests/unit` use fake-shaped strings by design, which is why the
secret scan excludes that folder.

## 10. Self-verification

From a clean `npm ci`: `npm run check` and the commands above; paste the real output into the PR body. Mention
that the live proof is Task 5's, and quote its result if Task 5 has already run in the same session.

## 11. Commit plan (lowercase Conventional Commits, explicit paths, never `git add -A`)

1. `feat(auth): add secret wrapper, http port and revoke-and-verify` - `src/auth/secret.ts src/auth/http.ts src/auth/lifecycle.ts tests/unit/auth/secret.test.ts`
2. `feat(auth): mint and revoke per-run credentials for medusa, twenty, documenso and cal` - `src/auth/env.ts src/auth/medusa.ts src/auth/twenty.ts src/auth/documenso.ts src/auth/cal.ts tests/unit/auth/flows.test.ts`
3. `feat(clients): add typed api clients for the first lane routes` - `src/clients/base.ts src/clients/medusa.ts src/clients/twenty.ts src/clients/documenso.ts src/clients/cal.ts tests/unit/clients/clients.test.ts`
4. `feat(fixtures): add worker-scoped credentials and turn tracing off` - `src/fixtures/auth.ts playwright.config.ts .env.example`

PR title: `feat(auth): add per-run credentials and typed api clients`. No trailers.

## 12. Environment changes

- Automatic from the repo: `npm ci` (the harness pin comes from Task 5). The reaper and the lifetime are code, not settings.
- Pasted by hand: nothing. The credentials are minted per run and never stored in an environment.
- The idempotent `npm run qa:passwords` calls (Cursor `start`, Claude SessionStart hook) are added by Task 5 (its section 12);
  this task adds no environment step.
- Manual repository setting: none.

## 13. Will NOT do / Open decisions / Risks

Will NOT do: use the harness env tokens; write a token anywhere; mint by SQL (D6 of the roadmap); run a spec;
add a setup/teardown project (OD-1); start a product; add lane routes beyond the first set.

| ID | Question | Options | Evidence | Recommended default |
|---|---|---|---|---|
| OD-1 | Brief asks for setup-project minting and teardown revocation | (a) worker-scoped fixture (D1); (b) setup project + file hand-off | 2.5: different processes; a file is a secret in an artefact | (a). Not BLOCKING |
| OD-2 | `x-p2-run-id` on POST/auth routes is UNPROBED | (a) keep, Task 5 asserts a GET per product (done live: all four answer 200 with it); (b) drop the header, keep names | no product code reads unknown headers on the paths read | (a); a lane that finds a rejection removes the header for that route and records it |
| OD-3 | Documenso team id via `qa_ro` | (a) read-only query; (b) tRPC team list (UNPROBED) | 2.3 | (a) |
| OD-4 | Cal key cannot be exercised on `/v2` | (a) accept, presence and removal proven by DB; (b) HR-1 | 2.4 | (a) here; Task 5 needs HR-1 tagged for its `/v2` check |
| OD-5 | Keys expire after 1 h even if teardown never runs (Documenso and Cal too, section 6.2b) | (a) keep (`CREDENTIAL_TTL_MS` = 3 600 000, above the 30 min job timeout); (b) shorter | long runs must stay under it | (a) |
| OD-6 | Medusa publishable key links the channel named "Default Sales Channel", else the first | (a) keep; (b) link all | seed has one default channel | (a) |

Risks: a Playwright worker killed hard (SIGKILL) skips its teardown, leaving a credential behind. Documenso, Cal and Twenty
keys expire after 1 h (section 6.2b); Medusa keys have no expiry in this plan (UNPROBED). The sweep uses `currentRunPrefix()`,
so it never flags an earlier run's leftover; the reaper (`src/auth/reaper.ts`, wired in Task 5) revokes it; the `HttpPort` is a second HTTP stack next to `APIRequestContext` (small, unit-tested); Medusa `isAccepted`
uses `/admin/regions?limit=1`, which a future permission change could restrict.

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
