import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { redactHeaders, SECRET_HEADER_NAMES } from "../../../src/webhooks/redact.ts";

describe("redactHeaders", () => {
  test("keeps only the length of every secret header, case-insensitively", () => {
    const out = redactHeaders({
      "X-Cal-Signature-256": "a".repeat(64),
      "X-Documenso-Secret": "s3cret",
      "Stripe-Signature": "t=1,v1=abc",
      Authorization: "Bearer xyz",
    });
    assert.equal(out["x-cal-signature-256"], "<redacted:64>");
    assert.equal(out["x-documenso-secret"], "<redacted:6>");
    assert.equal(out["stripe-signature"], "<redacted:10>");
    assert.equal(out["authorization"], "<redacted:10>");
  });

  test("leaves ordinary headers readable, lower-cases names and joins repeated values", () => {
    const out = redactHeaders({ "Content-Type": "application/json", "X-Multi": ["a", "b"] });
    assert.deepEqual(out, { "content-type": "application/json", "x-multi": "a, b" });
  });

  test("skips undefined values and never echoes a secret value", () => {
    const out = redactHeaders({ "x-webhook-signature": "topsecretvalue", missing: undefined });
    assert.ok(!("missing" in out));
    assert.ok(!JSON.stringify(out).includes("topsecretvalue"));
  });

  test("the secret list covers every signature or secret header named in the plan", () => {
    for (const name of [
      "x-cal-signature-256",
      "x-documenso-secret",
      "x-twenty-webhook-signature",
      "x-webhook-signature",
      "stripe-signature",
    ]) {
      assert.ok(SECRET_HEADER_NAMES.has(name), name);
    }
  });
});
