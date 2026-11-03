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

describe("live order oracle (medusa lane)", () => {
  test("liveOrderIdsForCart counts only live links to live orders", () => {
    const sql = ORACLE_QUERIES.liveOrderIdsForCart;
    assert.match(sql, /oc\."deleted_at" IS NULL/);
    assert.match(sql, /o\."deleted_at" IS NULL/);
    assert.match(sql, /JOIN "order" o ON o\."id" = oc\."order_id"/);
  });
});

describe("order-through-link oracle (medusa lane)", () => {
  test("liveOrdersLinkedToCart counts live orders through any link; the soft-deleted variant counts only deleted links", () => {
    assert.match(ORACLE_QUERIES.liveOrdersLinkedToCart, /o\."deleted_at" IS NULL/);
    assert.doesNotMatch(ORACLE_QUERIES.liveOrdersLinkedToCart, /oc\."deleted_at"/);
    assert.match(ORACLE_QUERIES.liveOrdersViaSoftDeletedLinks, /oc\."deleted_at" IS NOT NULL/);
  });
});
