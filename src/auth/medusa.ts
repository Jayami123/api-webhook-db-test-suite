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
