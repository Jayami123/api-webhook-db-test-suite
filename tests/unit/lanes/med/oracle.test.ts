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
