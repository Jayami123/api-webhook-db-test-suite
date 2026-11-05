/**
 * GraphQL over the metadata endpoint (signIn, token exchange, workspace creation and deletion live there). Plain fetch,
 * like the auth module: a request context would keep the sign-in cookie, and the server then treats the bearer calls
 * as cookie-authenticated and applies its origin check (CSRF_ORIGIN_MISMATCH, measured). Bearer tokens stay in memory.
 */
export interface GqlBody {
  readonly data?: Record<string, unknown> | null;
  readonly errors?: readonly {
    readonly message: string;
    readonly extensions?: { readonly subCode?: string };
  }[];
}

export async function metadataGql(
  baseUrl: string,
  query: string,
  variables: Record<string, unknown> = {},
  bearer?: string,
): Promise<{ readonly status: number; readonly body: GqlBody }> {
  const res = await fetch(`${baseUrl}/metadata`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
    },
    body: JSON.stringify({ query, variables }),
  });
  return { status: res.status, body: (await res.json()) as GqlBody };
}

/** Workspace-scoped token for `origin` (the workspace's subdomain URL, which the sign-in returns). */
export async function exchangeToken(
  baseUrl: string,
  loginToken: string,
  origin: string,
): Promise<string> {
  const res = await metadataGql(
    baseUrl,
    "mutation($t:String!,$o:String!){ getAuthTokensFromLoginToken(loginToken:$t, origin:$o){ tokens{ accessOrWorkspaceAgnosticToken{ token } } } }",
    { t: loginToken, o: origin },
  );
  const token = (
    res.body.data as
      | {
          getAuthTokensFromLoginToken?: {
            tokens: { accessOrWorkspaceAgnosticToken: { token: string } };
          };
        }
      | null
      | undefined
  )?.getAuthTokensFromLoginToken?.tokens.accessOrWorkspaceAgnosticToken.token;
  if (token === undefined) {
    throw new Error(
      `TEST BUG or ENV: token exchange failed: ${JSON.stringify(res.body.errors ?? res.body)}`,
    );
  }
  return token;
}
