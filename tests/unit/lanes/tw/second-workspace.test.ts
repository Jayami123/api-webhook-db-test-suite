import assert from "node:assert/strict";
import { afterEach, describe, mock, test } from "node:test";
import {
  mintKeyForWorkspace,
  runAllThenRethrow,
  type SecondWorkspace,
} from "../../../../src/lanes/tw/second-workspace.ts";

const WS: SecondWorkspace = { id: "ws-1", origin: "http://x.localhost:3002", loginToken: "login" };

function gql(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

/**
 * Stubs the metadata endpoint. The key is created; generateApiKeyToken answers with errors, so no token comes back.
 * `revoke` decides whether revokeApiKey succeeds. Returns the list of revoke calls seen.
 */
function stubMetadata(revoke: "ok" | "fail"): string[] {
  const revokes: string[] = [];
  mock.method(globalThis, "fetch", ((_url: string, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? init.body : "";
    const query = (JSON.parse(body) as { query: string }).query;
    if (query.includes("getAuthTokensFromLoginToken"))
      return gql({
        data: {
          getAuthTokensFromLoginToken: {
            tokens: { accessOrWorkspaceAgnosticToken: { token: "access" } },
          },
        },
      });
    if (query.includes("getRoles"))
      return gql({ data: { getRoles: [{ id: "role-admin", label: "Admin" }] } });
    if (query.includes("createApiKey(")) return gql({ data: { createApiKey: { id: "key-1" } } });
    if (query.includes("revokeApiKey")) {
      revokes.push("key-1");
      return revoke === "ok"
        ? gql({ data: { revokeApiKey: { id: "key-1" } } })
        : gql({ data: null, errors: [{ message: "revoke refused" }] });
    }
    if (query.includes("generateApiKeyToken"))
      return gql({ data: null, errors: [{ message: "token refused" }] });
    return Promise.reject(new Error(`unexpected query: ${query}`));
  }) as typeof fetch);
  return revokes;
}

afterEach(() => {
  mock.restoreAll();
});

describe("second workspace key minting", () => {
  test("generateApiKeyToken error: the key is revoked, and the thrown error is the token error", async () => {
    const revokes = stubMetadata("ok");
    await assert.rejects(
      mintKeyForWorkspace("http://127.0.0.1:3002", WS, "label"),
      (error: Error) => {
        assert.match(error.message, /generate api key token: .*token refused/);
        assert.equal(error.cause, undefined, "no revoke failure, so no cause");
        return true;
      },
    );
    assert.deepEqual(revokes, ["key-1"], "revokeApiKey was called for the created key");
  });

  test("generateApiKeyToken error, then the revoke fails: the revoke failure is the cause", async () => {
    const revokes = stubMetadata("fail");
    await assert.rejects(
      mintKeyForWorkspace("http://127.0.0.1:3002", WS, "label"),
      (error: Error) => {
        assert.match(error.message, /generate api key token/, "the setup error is the one thrown");
        const cause: unknown = error.cause;
        assert.ok(cause instanceof Error, "the revoke failure is attached as the cause");
        assert.match(cause.message, /revoke the workspace key: .*revoke refused/);
        return true;
      },
    );
    assert.deepEqual(revokes, ["key-1"], "revokeApiKey was still called");
  });
});

describe("runAllThenRethrow", () => {
  test("runs every step, rethrows the first error, and attaches a later error as its cause", async () => {
    const ran: string[] = [];
    await assert.rejects(
      runAllThenRethrow([
        () => {
          ran.push("a");
          return Promise.reject(new Error("first"));
        },
        () => {
          ran.push("b");
          return Promise.reject(new Error("second"));
        },
      ]),
      (error: Error) => {
        assert.equal(error.message, "first");
        const cause: unknown = error.cause;
        assert.ok(cause instanceof Error);
        assert.equal(cause.message, "second");
        return true;
      },
    );
    assert.deepEqual(ran, ["a", "b"], "the later step still ran");
  });

  test("with several later errors, the cause is an AggregateError of them", async () => {
    await assert.rejects(
      runAllThenRethrow([
        () => Promise.reject(new Error("first")),
        () => Promise.reject(new Error("second")),
        () => Promise.reject(new Error("third")),
      ]),
      (error: Error) => {
        assert.equal(error.message, "first");
        const cause: unknown = error.cause;
        assert.ok(cause instanceof AggregateError);
        assert.deepEqual(
          cause.errors.map((e: Error) => e.message),
          ["second", "third"],
        );
        return true;
      },
    );
  });

  test("resolves when every step succeeds", async () => {
    await runAllThenRethrow([() => Promise.resolve(), () => Promise.resolve()]);
  });
});
