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
