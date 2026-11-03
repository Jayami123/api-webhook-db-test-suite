import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { assertSelectOnly } from "../../../../src/db/select-guard.ts";
import { ORACLE_QUERIES } from "../../../../src/lanes/med/oracle.ts";

describe("medusa oracle SQL (medusa lane)", () => {
  test("every oracle SQL string passes assertSelectOnly (src/db/select-guard.ts:115)", () => {
    for (const [name, sql] of Object.entries(ORACLE_QUERIES)) {
      assert.doesNotThrow(() => {
        assertSelectOnly(sql);
      }, name);
    }
  });

  test("oracle SQL contains no string interpolation (only $n parameters)", () => {
    for (const [name, sql] of Object.entries(ORACLE_QUERIES)) {
      assert.ok(!sql.includes("${"), `${name} has a template placeholder`);
      const numbers = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
      const max = numbers.length === 0 ? 0 : Math.max(...numbers);
      for (let n = 1; n <= max; n++) {
        assert.ok(numbers.includes(n), `${name} skips parameter $${n}`);
      }
    }
  });
});

describe("capture oracle (medusa lane)", () => {
  test("the capture queries read captured_at from the payment and count live capture rows joined to it", () => {
    assert.match(ORACLE_QUERIES.paymentCapturedAt, /"captured_at"/);
    assert.match(ORACLE_QUERIES.paymentCapturedAt, /"payment_session_id" = \$1/);
    assert.match(
      ORACLE_QUERIES.captureRowCount,
      /FROM "capture" c JOIN "payment" p ON p\."id" = c\."payment_id"/,
    );
    assert.match(ORACLE_QUERIES.captureRowCount, /c\."deleted_at" IS NULL/);
    assert.doesNotThrow(() => {
      assertSelectOnly(ORACLE_QUERIES.captureRowCount);
    });
  });
});
