import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ReadOnlyDb, SqlParam } from "../../../../src/db/pg.ts";
import { RetainRegistry, runSweep, type Rule } from "../../../../src/invariants/engine.ts";
import { RULES, productOfProject } from "../../../../src/invariants/rules.ts";
import { runUserEmail } from "../../../../src/lanes/doc/run-user.ts";

const LIVE = "p2-qa-20261105t090000z-0a1b2c3d";

/** A read-only User table: the leak SQL is answered with `email LIKE '<prefix>%'` on the sweep's parameter. */
function userTable(emails: readonly string[]): ReadOnlyDb {
  return {
    product: "documenso",
    select: <Row extends Record<string, unknown>>(
      sql: string,
      params: readonly SqlParam[] = [],
    ) => {
      assert.match(sql, /FROM "User" WHERE "email" LIKE \$1/);
      const prefix = String(params[0]).replace(/%$/, "");
      const rows: Record<string, unknown>[] = emails
        .filter((e) => e.startsWith(prefix))
        .map((e) => ({ id: e, value: e }));
      return Promise.resolve(rows as Row[]);
    },
    close: () => Promise.resolve(),
  };
}

function userRule(): Rule {
  const rule = RULES.documenso.find((r) => r.id === "doc-leak-user-email");
  assert.ok(rule, "doc-leak-user-email is in the documenso rules");
  return rule;
}

describe("the billing run user and the doc-leak-user-email sweep", () => {
  test("the run user's email carries the run prefix, so the leak rule matches it while it is alive", () => {
    const email = runUserEmail(LIVE);
    assert.equal(email, `${LIVE}-str@example.test`);
    assert.ok(email.startsWith(LIVE));
  });

  test("a live run user matches the rule when it is not retained (the case this fixes)", async () => {
    const violations = await runSweep(userTable([runUserEmail(LIVE)]), [userRule()], {
      runPrefix: LIVE,
      includeLeaks: true,
      retained: new RetainRegistry(),
    });
    assert.equal(violations.length, 1);
    assert.deepEqual(
      violations[0]?.rows.map((r) => r.value),
      [runUserEmail(LIVE)],
    );
  });

  test("a retained live run user does not match", async () => {
    const rule = userRule();
    const retained = new RetainRegistry();
    const release = retained.retain(rule.id, runUserEmail(LIVE));
    const violations = await runSweep(userTable([runUserEmail(LIVE)]), [rule], {
      runPrefix: LIVE,
      includeLeaks: true,
      retained,
    });
    assert.deepEqual(violations, []);
    release();
  });

  test("a leaked user of the same run still matches next to a retained live user", async () => {
    const rule = userRule();
    const retained = new RetainRegistry();
    const live = runUserEmail(LIVE);
    const leaked = `${LIVE}-probe@example.test`;
    retained.retain(rule.id, live);
    const violations = await runSweep(userTable([live, leaked]), [rule], {
      runPrefix: LIVE,
      includeLeaks: true,
      retained,
    });
    assert.equal(violations.length, 1);
    assert.deepEqual(
      violations[0]?.rows.map((r) => r.value),
      [leaked],
    );
  });

  test("after the release the run user matches again", async () => {
    const rule = userRule();
    const retained = new RetainRegistry();
    const release = retained.retain(rule.id, runUserEmail(LIVE));
    release();
    const violations = await runSweep(userTable([runUserEmail(LIVE)]), [rule], {
      runPrefix: LIVE,
      includeLeaks: true,
      retained,
    });
    assert.equal(violations.length, 1);
  });

  test("the run user email refuses a value that is not a run prefix", () => {
    assert.throws(() => runUserEmail("p2-run-user"), /TEST BUG/);
  });

  test("the billing project is swept (productOfProject must not skip it)", () => {
    assert.equal(productOfProject("doc-billing-api"), "documenso");
  });
});
