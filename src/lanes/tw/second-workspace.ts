import { randomBytes } from "node:crypto";
import type { TwentyAuth } from "../../auth/twenty.ts";
import { SecretString } from "../../auth/secret.ts";
import { metadataGql, exchangeToken } from "./workspaces.ts";
import { runScopedName } from "../../run/prefix.ts";

/**
 * A second workspace for multi-workspace cases (moved from tests/integration/tw/workspace.spec.ts, STR-002 setup).
 * Created by the signed-in user (signUpInNewWorkspace), activated (activateWorkspace), given its own API key, and
 * soft-deleted at teardown (deleteCurrentWorkspace). Twenty v2.44.0 (fork 7cbdfec): the subdomain origin is the only one
 * that resolves the workspace on a multi-workspace stack (B-P13).
 */
export interface SecondWorkspace {
  readonly id: string;
  readonly origin: string;
  /** Login token from the sign-up; exchanged for a workspace token at each use. */
  readonly loginToken: string;
}

interface MadeWorkspace {
  loginToken: { token: string };
  workspace: { id: string; workspaceUrls: { subdomainUrl: string } };
}

/** Creates a workspace as the signed-in user. Returns the row id and the origin used for token exchange. */
export async function createSecondWorkspace(
  base: string,
  userToken: string,
): Promise<SecondWorkspace> {
  const subdomain = `qa${randomBytes(4).toString("hex")}`;
  const created = await metadataGql(
    base,
    "mutation($i:SignUpInNewWorkspaceInput){ signUpInNewWorkspace(input:$i){ loginToken { token } workspace{ id workspaceUrls{ subdomainUrl } } } }",
    { i: { displayName: runScopedName(`second-ws-${subdomain}`), subdomain } },
    userToken,
  );
  if (created.body.errors !== undefined)
    throw new Error(`ENV or TEST BUG: create workspace: ${JSON.stringify(created.body.errors)}`);
  const made = (created.body.data as { signUpInNewWorkspace: MadeWorkspace }).signUpInNewWorkspace;
  return {
    id: made.workspace.id,
    origin: made.workspace.workspaceUrls.subdomainUrl,
    loginToken: made.loginToken.token,
  };
}

/** Activates a just-created workspace (sets its default role). Returns the workspace-scoped token. */
export async function activateSecondWorkspace(base: string, ws: SecondWorkspace): Promise<string> {
  const token = await exchangeToken(base, ws.loginToken, ws.origin);
  const activated = await metadataGql(
    base,
    "mutation { activateWorkspace(data: {}) { id activationStatus } }",
    {},
    token,
  );
  if (activated.body.errors !== undefined)
    throw new Error(
      `ENV or TEST BUG: activate workspace: ${JSON.stringify(activated.body.errors)}`,
    );
  return token;
}

/**
 * An API key bound to the workspace of `loginToken` (Admin role), the same steps as mintTwenty (src/auth/twenty.ts).
 * The key is created and generated through the metadata endpoint; revoke() revokes it.
 */
export async function mintKeyForWorkspace(
  base: string,
  ws: SecondWorkspace,
  label: string,
): Promise<TwentyAuth> {
  const access = await exchangeToken(base, ws.loginToken, ws.origin);
  const roles = await metadataGql(base, "query { getRoles { id label } }", {}, access);
  const admin = (
    roles.body.data as { getRoles: { id: string; label: string }[] } | null | undefined
  )?.getRoles.find((r) => r.label === "Admin");
  if (admin === undefined) throw new Error("ENV or TEST BUG: no Admin role in the new workspace");
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  const created = await metadataGql(
    base,
    "mutation($i:CreateApiKeyInput!){ createApiKey(input:$i){ id } }",
    { i: { name: label, expiresAt, roleId: admin.id } },
    access,
  );
  const keyId = (created.body.data as { createApiKey: { id: string } }).createApiKey.id;
  const minted = await metadataGql(
    base,
    "mutation($id:UUID!,$e:String!){ generateApiKeyToken(apiKeyId:$id, expiresAt:$e){ token } }",
    { id: keyId, e: expiresAt },
    access,
  );
  const token = (minted.body.data as { generateApiKeyToken: { token: string } }).generateApiKeyToken
    .token;
  let revoked = false;
  return {
    product: "twenty",
    headerName: "authorization",
    headerValue: new SecretString(`Bearer ${token}`),
    label,
    async isAccepted() {
      const res = await fetch(`${base}/rest/people?limit=1`, {
        headers: { authorization: `Bearer ${token}` },
      });
      return res.status === 200;
    },
    async revoke() {
      if (revoked) return;
      revoked = true;
      const res = await metadataGql(
        base,
        "mutation($i:RevokeApiKeyInput!){ revokeApiKey(input:$i){ id } }",
        { i: { id: keyId } },
        access,
      );
      if (res.body.errors !== undefined)
        throw new Error(`cleanup: revoke the workspace key: ${JSON.stringify(res.body.errors)}`);
    },
  };
}

/** Soft-deletes the workspace through the product (deleteCurrentWorkspace). Throws on any error. */
export async function softDeleteSecondWorkspace(base: string, ws: SecondWorkspace): Promise<void> {
  const token = await exchangeToken(base, ws.loginToken, ws.origin);
  const removed = await metadataGql(base, "mutation { deleteCurrentWorkspace { id } }", {}, token);
  if (removed.body.errors !== undefined)
    throw new Error(`cleanup: delete the workspace: ${JSON.stringify(removed.body.errors)}`);
}
