import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  mintKeyForWorkspace,
  type SecondWorkspace,
} from "../../../../src/lanes/tw/second-workspace.ts";

const WS: SecondWorkspace = {
  id: "ws-1",
  origin: "https://qa.example.invalid",
  loginToken: "login-token",
};

interface Reply {
  readonly data?: unknown;
  readonly errors?: unknown;
}

/** Replaces fetch: each GraphQL operation (matched by name in the query) gets its canned reply. */
function stubMetadata(replies: Record<string, Reply>): { operations: string[] } {
  const operations: string[] = [];
  globalThis.fetch = (_url, init) => {
    const payload = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
      query: string;
    };
    const query = payload.query;
    const op = Object.keys(replies).find((name) => query.includes(name));
    if (op === undefined) throw new Error(`unexpected operation: ${query}`);
    operations.push(op);
    const body = replies[op];
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  };
  return { operations };
}

const SESSION: Record<string, Reply> = {
  getAuthTokensFromLoginToken: {
    data: {
      getAuthTokensFromLoginToken: {
        tokens: { accessOrWorkspaceAgnosticToken: { token: "access" } },
      },
    },
  },
  getRoles: { data: { getRoles: [{ id: "role-admin", label: "Admin" }] } },
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("mintKeyForWorkspace", () => {
  test("a clean create and generate returns the key for the workspace", async () => {
    const { operations } = stubMetadata({
      ...SESSION,
      createApiKey: { data: { createApiKey: { id: "key-1" } } },
      generateApiKeyToken: { data: { generateApiKeyToken: { token: "tok" } } },
    });
    const auth = await mintKeyForWorkspace("https://base.example.invalid", WS, "label-a");
    assert.equal(auth.label, "label-a");
    assert.deepEqual(operations, [
      "getAuthTokensFromLoginToken",
      "getRoles",
      "createApiKey",
      "generateApiKeyToken",
    ]);
  });

  test("a getRoles error fails with ENV or TEST BUG and no key is created", async () => {
    const { operations } = stubMetadata({
      ...SESSION,
      getRoles: { data: null, errors: [{ message: "forbidden" }] },
      createApiKey: { data: { createApiKey: { id: "key-0" } } },
    });
    await assert.rejects(
      mintKeyForWorkspace("https://base.example.invalid", WS, "label-r"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /^ENV or TEST BUG: get roles: .*forbidden/);
        return true;
      },
    );
    assert.ok(!operations.includes("createApiKey"), "no key is created after a failed getRoles");
  });

  test("a createApiKey error fails with ENV or TEST BUG before any data is read", async () => {
    const { operations } = stubMetadata({
      ...SESSION,
      createApiKey: { data: null, errors: [{ message: "role not found" }] },
      generateApiKeyToken: { data: { generateApiKeyToken: { token: "tok" } } },
    });
    await assert.rejects(
      mintKeyForWorkspace("https://base.example.invalid", WS, "label-b"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /^ENV or TEST BUG: create api key: .*role not found/);
        return true;
      },
    );
    assert.ok(
      !operations.includes("generateApiKeyToken"),
      "no token is generated after a failed create",
    );
  });

  test("a generateApiKeyToken error fails with ENV or TEST BUG, revokes the key, and never reads a token", async () => {
    const { operations } = stubMetadata({
      ...SESSION,
      createApiKey: { data: { createApiKey: { id: "key-2" } } },
      generateApiKeyToken: { data: null, errors: [{ message: "key expired" }] },
      revokeApiKey: { data: { revokeApiKey: { id: "key-2" } } },
    });
    await assert.rejects(
      mintKeyForWorkspace("https://base.example.invalid", WS, "label-c"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /^ENV or TEST BUG: generate api key token: .*key expired/);
        assert.doesNotMatch(
          err.message,
          /Cannot read/,
          "the error is the product's, not a TypeError",
        );
        assert.equal(err.cause, undefined, "the revoke succeeded, so there is no cause");
        return true;
      },
    );
    assert.ok(operations.includes("revokeApiKey"), "the created key is revoked");
  });

  test("a generateApiKeyToken error whose revoke also fails keeps the token error and attaches the revoke failure as its cause", async () => {
    stubMetadata({
      ...SESSION,
      createApiKey: { data: { createApiKey: { id: "key-3" } } },
      generateApiKeyToken: { data: null, errors: [{ message: "key expired" }] },
      revokeApiKey: { data: null, errors: [{ message: "revoke refused" }] },
    });
    await assert.rejects(
      mintKeyForWorkspace("https://base.example.invalid", WS, "label-d"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /^ENV or TEST BUG: generate api key token: .*key expired/);
        const cause: unknown = err.cause;
        assert.ok(cause instanceof Error, "the revoke failure is the cause");
        assert.match(cause.message, /revoke the workspace key: .*revoke refused/);
        return true;
      },
    );
  });
});
