import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  flipOneBodyByte,
  lowerCaseHeaders,
  verifyDelivery,
  withNonce,
} from "../../../../src/lanes/tw/oracle.ts";
import { signTwenty } from "../../../../src/webhooks/sign.ts";

const SECRET = "00112233445566778899aabbccddeeff";
const T0 = Date.parse("2026-11-02T10:00:00.000Z");
const BODY = Buffer.from(
  JSON.stringify({ eventName: "person.created", record: { id: "p-1" } }),
  "utf8",
);

/** A recorded delivery as the receiver stores it: lower-cased headers, raw bytes, receipt time. */
function recorded(input: {
  body?: Buffer;
  timestampMs?: number;
  receivedMs: number;
  nonce?: string;
}) {
  const signed = signTwenty({
    secret: SECRET,
    body: BODY,
    timestampMs: input.timestampMs ?? T0,
    nonce: input.nonce ?? "a".repeat(32),
  });
  return {
    rawBody: input.body ?? BODY,
    headers: lowerCaseHeaders(signed.headers),
    receivedAt: new Date(input.receivedMs).toISOString(),
  };
}

describe("oracle: verifyDelivery", () => {
  test("verifies a body signed by signTwenty when received 1 s after signing", () => {
    assert.deepEqual(verifyDelivery(recorded({ receivedMs: T0 + 1_000 }), SECRET), { ok: true });
  });

  test("fails with signature-mismatch when one body byte changes", () => {
    const delivery = recorded({ receivedMs: T0 + 1_000 });
    const flipped = { ...delivery, rawBody: flipOneBodyByte(delivery.rawBody) };
    assert.deepEqual(verifyDelivery(flipped, SECRET), { ok: false, reason: "signature-mismatch" });
  });

  test("still verifies when only the nonce header changes (nonce is unsigned)", () => {
    const delivery = recorded({ receivedMs: T0 + 1_000 });
    const renonced = { ...delivery, headers: withNonce(delivery.headers, "f".repeat(32)) };
    assert.deepEqual(verifyDelivery(renonced, SECRET), { ok: true });
  });

  test("fails with stale-timestamp when received 6 s after signing", () => {
    assert.deepEqual(verifyDelivery(recorded({ receivedMs: T0 + 6_000 }), SECRET), {
      ok: false,
      reason: "stale-timestamp",
    });
  });

  test("fails when the body bytes differ only in whitespace (the signature covers JSON.stringify output)", () => {
    const spaced = Buffer.from(
      JSON.stringify({ eventName: "person.created", record: { id: "p-1" } }, null, 1),
    );
    const delivery = recorded({ receivedMs: T0 + 1_000 });
    assert.deepEqual(verifyDelivery({ ...delivery, rawBody: spaced }, SECRET), {
      ok: false,
      reason: "signature-mismatch",
    });
  });
});
