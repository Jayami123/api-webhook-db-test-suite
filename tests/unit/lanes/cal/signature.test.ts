import assert from "node:assert/strict";
import { test } from "node:test";
import { signCal } from "../../../../src/webhooks/sign.ts";
import { verifyCal } from "../../../../src/webhooks/verify.ts";
import { expectCalSignature, tamperOneByte } from "../../../../src/lanes/cal/signature.ts";

const secret = "s".repeat(24);

test("tamperOneByte changes exactly one byte", () => {
  const raw = Buffer.from('{"a":1}');
  const t = tamperOneByte(raw, 2);
  assert.equal(t.length, raw.length);
  assert.equal([...raw].filter((b, i) => b !== t[i]).length, 1);
});

test("verifyCal fails on the tampered bytes (negative control)", () => {
  const { headers, body } = signCal({ secret, body: '{"a":1}' });
  assert.deepEqual(verifyCal({ secret, rawBody: tamperOneByte(body, 2), headers }), {
    ok: false,
    reason: "signature-mismatch",
  });
});

test("expectCalSignature with a null secret accepts only the placeholder header, never a real HMAC", () => {
  const delivery = (headers: Record<string, string>, body: string) => ({
    runId: "r",
    testId: "t",
    attempt: 1,
    seq: 1,
    receivedAt: "",
    method: "POST",
    path: "/r/r/t",
    headers,
    rawBody: Buffer.from(body),
    bodySha256: "",
    bodyBytes: body.length,
    remoteAddress: undefined,
    mode: "ok" as const,
  });
  const placeholder = signCal({ secret: null, body: '{"a":1}' });
  assert.deepEqual(expectCalSignature(delivery(placeholder.headers, '{"a":1}'), null), {
    ok: true,
  });
  const real = signCal({ secret, body: '{"a":1}' });
  assert.deepEqual(expectCalSignature(delivery(real.headers, '{"a":1}'), null), {
    ok: false,
    reason: "signature-mismatch",
  });
});
