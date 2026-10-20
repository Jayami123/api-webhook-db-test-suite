import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { apiBaseUrl, dbStatementTimeoutMs, dbUrl, loadEnv } from "../../src/env.ts";

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
});
