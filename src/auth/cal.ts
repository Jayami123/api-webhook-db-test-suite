import {
  AuthError,
  CookieJar,
  fetchPort,
  parseJson,
  type HttpPort,
  type MintedAuth,
} from "./http.ts";
import { CREDENTIAL_TTL_MS } from "./lifetime.ts";
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
      body: JSON.stringify({
        0: { json: body, ...(values === undefined ? {} : { meta: { values } }) },
      }),
    });
    const parsed = parseJson(`cal ${path}`, res) as { result?: { data?: { json?: unknown } } }[];
    return { status: res.status, data: parsed[0]?.result?.data?.json };
  };
  const label = input.name("cal-key");
  // Short expiry, never `neverExpires: true` (section 6.2b). `expiresAt` is z.date() behind superjson.
  // UNPROBED against the pinned Cal SHA; the first live create confirms it, and a rejection is a STOP (section 14).
  const now = input.now ?? ((): Date => new Date());
  const expiresAt = new Date(now().getTime() + CREDENTIAL_TTL_MS).toISOString();
  const created = await trpc(
    "apiKeys/create",
    { note: label, neverExpires: false, expiresAt },
    { expiresAt: ["Date"] },
  );
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
