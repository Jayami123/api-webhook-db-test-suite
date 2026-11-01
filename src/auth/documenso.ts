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
  const created = await trpc("apiToken.create", {
    teamId,
    tokenName: label,
    expirationDate: "ONE_HOUR",
  });
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
