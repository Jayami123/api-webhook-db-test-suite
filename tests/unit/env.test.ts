import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { apiBaseUrl, dbStatementTimeoutMs, dbUrl, loadEnv, receiverConfig } from "../../src/env.ts";

describe("env", () => {
  test("defaults are the harness loopback defaults", () => {
    assert.equal(apiBaseUrl("medusa", {}), "http://127.0.0.1:9000");
    assert.equal(apiBaseUrl("cal", {}), "http://127.0.0.1:5555");
    assert.equal(apiBaseUrl("documenso", {}), "http://127.0.0.1:3001");
    assert.equal(apiBaseUrl("twenty", {}), "http://127.0.0.1:3002");
    assert.equal(dbUrl("medusa", {}), "postgres://medusa:medusa@127.0.0.1:5433/medusa");
    assert.equal(dbStatementTimeoutMs({}), 5000);
  });

  test("blank values fall back to defaults", () => {
    assert.equal(apiBaseUrl("medusa", { MEDUSA_BASE_URL: "  " }), "http://127.0.0.1:9000");
    assert.equal(dbStatementTimeoutMs({ P2_DB_STATEMENT_TIMEOUT_MS: "" }), 5000);
  });

  test("overrides are used and the trailing slash is dropped", () => {
    assert.equal(
      apiBaseUrl("medusa", { MEDUSA_BASE_URL: "http://localhost:9100/" }),
      "http://localhost:9100",
    );
    assert.equal(dbStatementTimeoutMs({ P2_DB_STATEMENT_TIMEOUT_MS: "250" }), 250);
  });

  test("non-loopback hosts are rejected", () => {
    assert.throws(
      () => apiBaseUrl("medusa", { MEDUSA_BASE_URL: "https://shop.example.com" }),
      /MEDUSA_BASE_URL/,
    );
    assert.throws(
      () => dbUrl("twenty", { TWENTY_DB_URL: "postgres://u:p@10.0.0.5:5432/db" }),
      /TWENTY_DB_URL/,
    );
    assert.throws(() => dbUrl("cal", { CAL_DB_URL: "mysql://127.0.0.1/x" }), /CAL_DB_URL/);
  });

  test("statement timeout must be an integer in range", () => {
    for (const bad of ["abc", "0", "99", "600001", "1.5"]) {
      assert.throws(
        () => loadEnv({ P2_DB_STATEMENT_TIMEOUT_MS: bad }),
        /P2_DB_STATEMENT_TIMEOUT_MS/,
      );
    }
  });

  test("errors name the variable but never echo its value", () => {
    const secret = "postgres://user:s3cr3t-value@db.example.com:5432/x";
    assert.throws(
      () => loadEnv({ MEDUSA_DB_URL: secret }),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes("MEDUSA_DB_URL") &&
        !error.message.includes("s3cr3t"),
    );
  });

  test("a malformed postgres URL is a validation error, not a TypeError", () => {
    for (const bad of ["postgres://", "postgres://[bad", "postgres://u:s3cr3t@[bad/db"]) {
      assert.throws(
        () => dbUrl("cal", { CAL_DB_URL: bad }),
        (error: unknown) =>
          error instanceof Error &&
          !(error instanceof TypeError) &&
          error.message.includes("CAL_DB_URL") &&
          error.message.includes("must be a postgres:// URL") &&
          !error.message.includes("[bad") &&
          !error.message.includes("s3cr3t"),
      );
    }
  });

  test("receiver defaults to 127.0.0.1:4317 and blank values fall back", () => {
    assert.deepEqual(receiverConfig({}), { hosts: ["127.0.0.1"], port: 4317 });
    assert.deepEqual(receiverConfig({ P2_RECEIVER_HOSTS: "  ", P2_RECEIVER_PORT: "" }), {
      hosts: ["127.0.0.1"],
      port: 4317,
    });
  });

  test("receiver accepts a list of explicit IP literals and a port", () => {
    assert.deepEqual(
      receiverConfig({ P2_RECEIVER_HOSTS: "127.0.0.1, 172.17.0.1,::1", P2_RECEIVER_PORT: "4400" }),
      { hosts: ["127.0.0.1", "172.17.0.1", "::1"], port: 4400 },
    );
  });

  test("receiver refuses wildcards, names and out-of-range ports", () => {
    for (const bad of ["0.0.0.0", "::", "localhost", "127.0.0.1,0.0.0.0", "example.com"]) {
      assert.throws(() => receiverConfig({ P2_RECEIVER_HOSTS: bad }), /P2_RECEIVER_HOSTS/, bad);
    }
    for (const bad of ["80", "1023", "65536", "abc", "4317.5"]) {
      assert.throws(() => receiverConfig({ P2_RECEIVER_PORT: bad }), /P2_RECEIVER_PORT/, bad);
    }
  });
});
