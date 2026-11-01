import { AuthError, CookieJar, fetchPort, parseJson, type HttpPort } from "./http.ts";

/**
 * Revoke-by-id flows for the worker-start reaper (plan Task 5 step 5b, Task 4 section 6.2b). Each one signs in
 * as the seeded account (the same flow as the mint modules) and removes one leftover credential by id. The
 * leftovers come from the read-only oracle (src/auth/reaper.ts selects them); nothing here lists products.
 * Every failure is an AuthError naming the step, with the HTTP status and no secret.
 */
export interface RevokeInput {
  readonly baseUrl: string;
  readonly email: string;
  readonly password: string;
  readonly id: string;
  readonly http?: HttpPort;
}

/** Medusa: the admin JWT creates nothing here; it revokes then deletes the leftover API key. */
export async function revokeMedusaKey(input: RevokeInput): Promise<void> {
  const http = input.http ?? fetchPort;
  const json = { "content-type": "application/json" };
  const login = await http({
    method: "POST",
    url: `${input.baseUrl}/auth/user/emailpass`,
    headers: json,
    body: JSON.stringify({ email: input.email, password: input.password }),
  });
  const jwt = (parseJson("medusa reaper login", login) as { token?: string }).token;
  if (login.status !== 200 || typeof jwt !== "string") {
    throw new AuthError("medusa reaper login", login.status);
  }
  const headers = { ...json, authorization: `Bearer ${jwt}` };
  const revoke = await http({
    method: "POST",
    url: `${input.baseUrl}/admin/api-keys/${input.id}/revoke`,
    headers,
    body: "{}",
  });
  if (revoke.status !== 200) throw new AuthError("medusa reaper revoke key", revoke.status);
  const remove = await http({
    method: "DELETE",
    url: `${input.baseUrl}/admin/api-keys/${input.id}`,
    headers,
  });
  if (remove.status !== 200) throw new AuthError("medusa reaper delete key", remove.status);
}

/** Documenso: session login, then tRPC apiToken.delete for the team that owns the token. */
export async function revokeDocumensoToken(
  input: RevokeInput & { readonly teamId: number },
): Promise<void> {
  const http = input.http ?? fetchPort;
  const jar = new CookieJar();
  const csrf = await http({ method: "GET", url: `${input.baseUrl}/api/auth/csrf` });
  jar.absorb(csrf.setCookies);
  const csrfToken = (parseJson("documenso reaper csrf", csrf) as { csrfToken?: string }).csrfToken;
  if (csrf.status !== 200 || typeof csrfToken !== "string") {
    throw new AuthError("documenso reaper csrf", csrf.status);
  }
  const authorize = await http({
    method: "POST",
    url: `${input.baseUrl}/api/auth/email-password/authorize`,
    headers: { "content-type": "application/json", cookie: jar.header() },
    body: JSON.stringify({ email: input.email, password: input.password, csrfToken }),
  });
  jar.absorb(authorize.setCookies);
  if (authorize.status !== 201 || !jar.has("sessionId")) {
    throw new AuthError("documenso reaper authorize", authorize.status);
  }
  const removed = await http({
    method: "POST",
    url: `${input.baseUrl}/api/trpc/apiToken.delete`,
    headers: {
      "content-type": "application/json",
      cookie: jar.header(),
      "x-team-id": String(input.teamId),
    },
    body: JSON.stringify({ json: { id: Number(input.id), teamId: input.teamId } }),
  });
  if (removed.status !== 200)
    throw new AuthError("documenso reaper apiToken.delete", removed.status);
}

/** Cal: next-auth session login, then the web tRPC apiKeys/delete for the key id (a hard delete). */
export async function revokeCalKey(input: RevokeInput): Promise<void> {
  const http = input.http ?? fetchPort;
  const jar = new CookieJar();
  const csrf = await http({ method: "GET", url: `${input.baseUrl}/api/auth/csrf` });
  jar.absorb(csrf.setCookies);
  const csrfToken = (parseJson("cal reaper csrf", csrf) as { csrfToken?: string }).csrfToken;
  if (csrf.status !== 200 || typeof csrfToken !== "string") {
    throw new AuthError("cal reaper csrf", csrf.status);
  }
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
  if (!jar.has("next-auth.session-token")) throw new AuthError("cal reaper login", login.status);
  const removed = await http({
    method: "POST",
    url: `${input.baseUrl}/api/trpc/apiKeys/delete?batch=1`,
    headers: { "content-type": "application/json", cookie: jar.header() },
    body: JSON.stringify({ 0: { json: { id: input.id } } }),
  });
  if (removed.status !== 200) throw new AuthError("cal reaper apiKeys/delete", removed.status);
}

/** Twenty: workspace sign-in exchange, then revokeApiKey for the key id (a revoked key stays as a row). */
export async function revokeTwentyKey(input: RevokeInput): Promise<void> {
  const http = input.http ?? fetchPort;
  const gql = async (
    step: string,
    query: string,
    variables: Record<string, unknown>,
    bearer?: string,
  ): Promise<Record<string, unknown>> => {
    const res = await http({
      method: "POST",
      url: `${input.baseUrl}/metadata`,
      headers: {
        "content-type": "application/json",
        ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = parseJson(step, res) as {
      data?: Record<string, unknown>;
      errors?: { message?: string }[];
    };
    if (res.status !== 200 || body.errors?.length || body.data === undefined) {
      throw new AuthError(step, res.status, body.errors?.[0]?.message ?? "");
    }
    return body.data;
  };
  const signIn = (await gql(
    "twenty reaper signIn",
    "mutation($e:String!,$p:String!){ signIn(email:$e,password:$p){ availableWorkspaces{ availableWorkspacesForSignIn{ loginToken workspaceUrls{ subdomainUrl customUrl } } } } }",
    { e: input.email, p: input.password },
  )) as {
    signIn: {
      availableWorkspaces: {
        availableWorkspacesForSignIn: {
          loginToken?: string;
          workspaceUrls?: { subdomainUrl?: string | null; customUrl?: string | null };
        }[];
      };
    };
  };
  const workspace = signIn.signIn.availableWorkspaces.availableWorkspacesForSignIn[0];
  if (workspace?.loginToken === undefined)
    throw new AuthError("twenty reaper signIn", 200, "no loginToken");
  const origin =
    workspace.workspaceUrls?.subdomainUrl ?? workspace.workspaceUrls?.customUrl ?? input.baseUrl;
  const exchanged = (await gql(
    "twenty reaper exchange",
    "mutation($t:String!,$o:String!){ getAuthTokensFromLoginToken(loginToken:$t, origin:$o){ tokens{ accessOrWorkspaceAgnosticToken{ token } } } }",
    { t: workspace.loginToken, o: origin },
  )) as {
    getAuthTokensFromLoginToken: { tokens: { accessOrWorkspaceAgnosticToken: { token: string } } };
  };
  const access = exchanged.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
  await gql(
    "twenty reaper revokeApiKey",
    "mutation($i:RevokeApiKeyInput!){ revokeApiKey(input:$i){ id } }",
    { i: { id: input.id } },
    access,
  );
}
