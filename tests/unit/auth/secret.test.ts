import assert from "node:assert/strict";
import { inspect } from "node:util";
import { afterEach, describe, test } from "node:test";
import {
  addSecret,
  clearSecretsForTests,
  scrubSecrets,
  SecretString,
} from "../../../src/auth/secret.ts";
import { revokeAndVerify } from "../../../src/auth/lifecycle.ts";
import type { MintedAuth } from "../../../src/auth/http.ts";

afterEach(() => {
  clearSecretsForTests();
});

describe("SecretString", () => {
  const value = "tok_abcdef0123456789";

  test("never prints its value through String, template strings, JSON or inspect", () => {
    const secret = new SecretString(value);
    const printed = [
      String(secret),
      secret.toString(),
      JSON.stringify({ secret }),
      inspect(secret),
      inspect({ nested: { secret } }),
      JSON.stringify([secret]),
    ];
    for (const text of printed) assert.ok(!text.includes(value), text);
    assert.equal(String(secret), "<redacted:20>");
  });

  test("never prints through console.log", () => {
    const secret = new SecretString(value);
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map((a) => (typeof a === "string" ? a : inspect(a))).join(" "));
    };
    try {
      console.log(secret, { secret }, [secret]);
    } finally {
      console.log = original;
    }
    assert.ok(!lines.join("\n").includes(value));
  });

  test("reveal() returns the value for the HTTP layer and length is exposed", () => {
    const secret = new SecretString(value);
    assert.equal(secret.reveal(), value);
    assert.equal(secret.length, value.length);
  });

  test("an empty secret is refused", () => {
    assert.throws(() => new SecretString(""), /must not be empty/);
  });

  test("scrubSecrets replaces every wrapped or added secret and ignores short strings", () => {
    const secret = new SecretString(value);
    addSecret("hunter2-hunter2");
    addSecret("abc");
    const text = `a ${secret.reveal()} b hunter2-hunter2 c abc ${secret.reveal()}`;
    assert.equal(scrubSecrets(text), "a <redacted> b <redacted> c abc <redacted>");
  });
});

describe("revokeAndVerify", () => {
  const auth = (log: string[], fail = false): MintedAuth => ({
    product: "medusa",
    headerName: "authorization",
    headerValue: new SecretString("Basic dGVzdA=="),
    label: "p2-qa-x-admin-key",
    revoke: () => {
      log.push("revoke");
      return fail ? Promise.reject(new Error("boom")) : Promise.resolve();
    },
  });

  test("revokes, then checks that the product rejects the credential", async () => {
    const log: string[] = [];
    await revokeAndVerify(auth(log), () => {
      log.push("probe");
      return Promise.resolve(false);
    });
    assert.deepEqual(log, ["revoke", "probe"]);
  });

  test("a credential that is still accepted after revoke is a leak and fails", async () => {
    await assert.rejects(
      revokeAndVerify(auth([]), () => Promise.resolve(true)),
      /still accepted after revoke \(token leak\)/,
    );
  });

  test("a failing revoke is reported and the probe is not trusted", async () => {
    const log: string[] = [];
    await assert.rejects(
      revokeAndVerify(auth(log, true), () => Promise.resolve(false)),
      /boom/,
    );
    assert.deepEqual(log, ["revoke"]);
  });
});
