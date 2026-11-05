import assert from "node:assert/strict";
import { test } from "node:test";
import { DAILY_TEST_BODY, signedDailyRequest } from "../../../../src/lanes/cal/daily.ts";
import { DAILY_SIGNATURE_HEADER, DAILY_TIMESTAMP_HEADER } from "../../../../src/webhooks/sign.ts";

test("DAILY_TEST_BODY parses to the test-request object Cal answers without a signature", () => {
  assert.deepEqual(JSON.parse(DAILY_TEST_BODY), { test: "test" });
});

test("signedDailyRequest sets the signature and the timestamp headers", () => {
  const signed = signedDailyRequest({
    secretBase64: Buffer.from("k".repeat(32)).toString("base64"),
    body: '{"a":1}',
    timestamp: "1700000000",
  });
  assert.equal(typeof signed.headers[DAILY_SIGNATURE_HEADER], "string");
  assert.equal(signed.headers[DAILY_TIMESTAMP_HEADER], "1700000000");
});
