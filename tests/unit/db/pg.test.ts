import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type pg from "pg";
import {
  DbQueryError,
  createReadOnlyDb,
  readOnlySessionOptions,
  type ClientLike,
  type ExtendedQueryConfig,
  type PoolFactory,
} from "../../../src/db/pg.ts";
import { ReadOnlyGuardError } from "../../../src/db/select-guard.ts";

const SECRET_URL = "postgres://qa:s3cr3t-pw@127.0.0.1:5433/medusa";

interface FakeState {
  configs: pg.PoolConfig[];
  queries: (string | ExtendedQueryConfig)[];
  releases: (boolean | Error | undefined)[];
  connects: number;
  ends: number;
}

function fakePool(failOn?: (query: string | ExtendedQueryConfig) => Error | undefined): {
  factory: PoolFactory;
  state: FakeState;
} {
  const state: FakeState = { configs: [], queries: [], releases: [], connects: 0, ends: 0 };
  const factory: PoolFactory = (config) => {
    state.configs.push(config);
    return {
      connect: () => {
        state.connects += 1;
        const client: ClientLike = {
          query: (query) => {
            state.queries.push(query);
            const error = failOn?.(query);
            return error ? Promise.reject(error) : Promise.resolve({ rows: [{ n: 1 }] });
          },
          release: (destroy) => {
            state.releases.push(destroy);
          },
        };
        return Promise.resolve(client);
      },
      end: () => {
        state.ends += 1;
        return Promise.resolve();
      },
    };
  };
  return { factory, state };
}

describe("read-only pg oracle", () => {
  test("session options make every connection read-only with timeouts", () => {
    assert.equal(
      readOnlySessionOptions(5000),
      "-c default_transaction_read_only=on -c statement_timeout=5000 -c idle_in_transaction_session_timeout=10000",
    );
  });

  test("pool is built with the read-only options and a product application_name", () => {
    const { factory, state } = fakePool();
    createReadOnlyDb("medusa", {
      connectionString: SECRET_URL,
      statementTimeoutMs: 750,
      poolFactory: factory,
    });
    const config = state.configs[0];
    assert.ok(config);
    assert.equal(config.options, readOnlySessionOptions(750));
    assert.equal(config.application_name, "p2-qa-oracle-medusa");
    assert.equal(config.max, 2);
    assert.equal(config.allowExitOnIdle, true);
  });

  test("select runs BEGIN READ ONLY, one extended-protocol query, ROLLBACK, then releases", async () => {
    const { factory, state } = fakePool();
    const db = createReadOnlyDb("medusa", {
      connectionString: SECRET_URL,
      statementTimeoutMs: 5000,
      poolFactory: factory,
    });
    const rows = await db.select<{ n: number }>("SELECT $1::int AS n", [1]);
    assert.deepEqual(rows, [{ n: 1 }]);
    assert.deepEqual(state.queries, [
      "BEGIN TRANSACTION READ ONLY",
      { text: "SELECT $1::int AS n", values: [1], queryMode: "extended" },
      "ROLLBACK",
    ]);
    assert.deepEqual(state.releases, [false]);
  });

  test("guard rejection never touches the pool", async () => {
    const { factory, state } = fakePool();
    const db = createReadOnlyDb("cal", {
      connectionString: SECRET_URL,
      statementTimeoutMs: 5000,
      poolFactory: factory,
    });
    await assert.rejects(db.select("DELETE FROM t"), ReadOnlyGuardError);
    assert.equal(state.connects, 0);
  });

  test("a server error keeps SQLSTATE, drops the URL, rolls back and destroys the client", async () => {
    const serverError = Object.assign(
      new Error("cannot execute INSERT in a read-only transaction"),
      { code: "25006" },
    );
    const { factory, state } = fakePool((query) =>
      typeof query === "object" ? serverError : undefined,
    );
    const db = createReadOnlyDb("twenty", {
      connectionString: SECRET_URL,
      statementTimeoutMs: 5000,
      poolFactory: factory,
    });
    await assert.rejects(db.select("SELECT 1"), (error: unknown) => {
      assert.ok(error instanceof DbQueryError);
      assert.equal(error.sqlstate, "25006");
      assert.match(error.message, /twenty oracle query failed \(SQLSTATE 25006\)/);
      assert.ok(!error.message.includes("s3cr3t"));
      return true;
    });
    assert.equal(state.queries.at(-1), "ROLLBACK");
    assert.equal(state.releases[0], serverError);
  });

  test("close is idempotent and select after close is a TEST BUG", async () => {
    const { factory, state } = fakePool();
    const db = createReadOnlyDb("documenso", {
      connectionString: SECRET_URL,
      statementTimeoutMs: 5000,
      poolFactory: factory,
    });
    await db.close();
    await db.close();
    assert.equal(state.ends, 1);
    await assert.rejects(db.select("SELECT 1"), /used after close/);
  });
});
