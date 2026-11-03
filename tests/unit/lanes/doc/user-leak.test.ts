import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { assertRuleShape } from "../../../../src/invariants/engine.ts";
import { documensoLaneRules } from "../../../../src/invariants/lanes/documenso.ts";
import { rulesFor } from "../../../../src/invariants/rules.ts";

const rule = documensoLaneRules.find((r) => r.id === "doc-leak-user-email");

describe("doc-leak-user-email (User has no deletedAt column)", () => {
  test("the rule is registered for the documenso product and passes the rule-shape check", () => {
    assert.ok(rule, "rule missing from documensoLaneRules");
    assert.ok(rulesFor("documenso").some((r) => r.id === "doc-leak-user-email"));
    assertRuleShape(rule);
  });

  test("the rule matches the run prefix on the user email and has no soft-delete filter", () => {
    assert.ok(rule);
    assert.match(rule.sql, /FROM "User" WHERE "email" LIKE \$1/);
    assert.equal(rule.sql.includes("deletedAt"), false);
    assert.equal(rule.param, "prefix-like");
  });
});
