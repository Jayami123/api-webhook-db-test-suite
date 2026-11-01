import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AuthError,
  type HttpPort,
  type HttpRequest,
  type HttpResponse,
} from "../../../src/auth/http.ts";
import {
  revokeCalKey,
  revokeDocumensoToken,
  revokeMedusaKey,
  revokeTwentyKey,
} from "../../../src/auth/reaper-revoke.ts";

const reply = (status: number, body: unknown, setCookies: string[] = []): HttpResponse => ({
  status,
  headers: {},
  setCookies,
  text: typeof body === "string" ? body : JSON.stringify(body),
});
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
const base = { baseUrl: "http://x", email: "e@x.y", password: "pw-pw-pw-pw", id: "k-1" };

describe("reaper revoke flows", () => {
  test("medusa: logs in, revokes, then deletes the leftover key", async () => {
    const { http, calls } = port((r) => {
      if (where(r) === "POST /auth/user/emailpass")
        return reply(200, { token: "jwt-value-123456" });
      return reply(200, {});
    });
    await revokeMedusaKey({ ...base, http });
    assert.deepEqual(calls.map(where), [
      "POST /auth/user/emailpass",
      "POST /admin/api-keys/k-1/revoke",
      "DELETE /admin/api-keys/k-1",
    ]);
    assert.equal(calls[1]?.headers?.["authorization"], "Bearer jwt-value-123456");
  });

  test("medusa: a refused revoke is an AuthError that names the step and not the password", async () => {
    const { http } = port((r) =>
      where(r) === "POST /auth/user/emailpass"
        ? reply(200, { token: "jwt-value-123456" })
        : reply(500, "boom"),
    );
    await assert.rejects(
      revokeMedusaKey({ ...base, http }),
      (e: unknown) =>
        e instanceof AuthError &&
        /medusa reaper revoke key/.test(e.message) &&
        !e.message.includes("pw-pw-pw-pw"),
    );
  });

  test("documenso: signs in with csrf and cookie, then deletes the token for its team", async () => {
    const { http, calls } = port((r) => {
      if (where(r) === "GET /api/auth/csrf")
        return reply(200, { csrfToken: "c1" }, ["csrfToken=c1; Path=/"]);
      if (where(r) === "POST /api/auth/email-password/authorize")
        return reply(201, {}, ["sessionId=s1; Path=/"]);
      return reply(200, { result: { data: { json: null } } });
    });
    await revokeDocumensoToken({ ...base, id: "7", teamId: 3, http });
    const del = calls[calls.length - 1];
    assert.equal(where(del ?? (calls[0] as HttpRequest)), "POST /api/trpc/apiToken.delete");
    assert.deepEqual(JSON.parse(del?.body ?? "{}"), { json: { id: 7, teamId: 3 } });
    assert.equal(del?.headers?.["x-team-id"], "3");
  });

  test("cal: signs in with the credentials form, then deletes the key by id", async () => {
    const { http, calls } = port((r) => {
      if (where(r) === "GET /api/auth/csrf")
        return reply(200, { csrfToken: "c1" }, ["next-auth.csrf-token=c; Path=/"]);
      if (where(r) === "POST /api/auth/callback/credentials")
        return reply(200, {}, ["next-auth.session-token=s1; Path=/"]);
      return reply(200, [{ result: { data: { json: { id: "k-1" } } } }]);
    });
    await revokeCalKey({ ...base, http });
    assert.equal(where(calls.at(-1) ?? (calls[0] as HttpRequest)), "POST /api/trpc/apiKeys/delete");
    assert.deepEqual(JSON.parse(calls.at(-1)?.body ?? "{}"), { 0: { json: { id: "k-1" } } });
  });

  test("twenty: exchanges the login token, then revokes the key with the access token", async () => {
    const { http, calls } = port((r) => {
      const query = (JSON.parse(r.body ?? "{}") as { query: string }).query;
      if (query.includes("signIn"))
        return reply(200, {
          data: {
            signIn: {
              availableWorkspaces: {
                availableWorkspacesForSignIn: [
                  { loginToken: "lt", workspaceUrls: { subdomainUrl: "http://t/" } },
                ],
              },
            },
          },
        });
      if (query.includes("getAuthTokensFromLoginToken"))
        return reply(200, {
          data: {
            getAuthTokensFromLoginToken: {
              tokens: { accessOrWorkspaceAgnosticToken: { token: "acc-value-123456" } },
            },
          },
        });
      return reply(200, { data: { revokeApiKey: { id: "k-1" } } });
    });
    await revokeTwentyKey({ ...base, http });
    assert.equal(calls.length, 3);
    const revoke = calls[2] as HttpRequest;
    assert.equal(revoke.headers?.["authorization"], "Bearer acc-value-123456");
    assert.match(revoke.body ?? "", /revokeApiKey/);
  });
});
