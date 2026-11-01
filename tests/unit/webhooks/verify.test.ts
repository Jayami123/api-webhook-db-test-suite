import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  signCal,
  signDaily,
  signDocumenso,
  signStripe,
  signTwenty,
  STRIPE_DEFAULT_TOLERANCE_SECONDS,
} from "../../../src/webhooks/sign.ts";
import {
  constantTimeEqual,
  headerValue,
  verifyCal,
  verifyDaily,
  verifyDocumenso,
  verifyStripe,
  verifyTwenty,
} from "../../../src/webhooks/verify.ts";
import * as v from "./vectors.ts";

describe("headerValue / constantTimeEqual", () => {
  test("header lookup is case-insensitive and rejects repeated values", () => {
    assert.equal(headerValue({ "X-Cal-Signature-256": "a" }, "x-cal-signature-256"), "a");
    assert.equal(headerValue({ "x-a": ["1", "2"] }, "x-a"), undefined);
    assert.equal(headerValue({ "x-a": ["1"] }, "x-a"), "1");
    assert.equal(headerValue({}, "x-a"), undefined);
  });

  test("constantTimeEqual compares by content and length", () => {
    assert.ok(constantTimeEqual("abc", "abc"));
    assert.ok(!constantTimeEqual("abc", "abd"));
    assert.ok(!constantTimeEqual("abc", "abcd"));
  });
});

describe("verifyCal", () => {
  const signed = signCal({ secret: v.SECRET, body: v.CAL_BODY_UTF8 });

  test("accepts the vector over the raw bytes", () => {
    assert.deepEqual(
      verifyCal({ secret: v.SECRET, rawBody: signed.body, headers: signed.headers }),
      { ok: true },
    );
  });

  test("tamper: one changed byte fails", () => {
    const tampered = Buffer.from(signed.body);
    tampered[10] = (tampered[10] ?? 0) ^ 1;
    assert.deepEqual(verifyCal({ secret: v.SECRET, rawBody: tampered, headers: signed.headers }), {
      ok: false,
      reason: "signature-mismatch",
    });
  });

  test("re-serialised JSON is a different message: whitespace change fails", () => {
    const spaced = signed.body.toString("utf8").replace(",", ", ");
    assert.equal(
      verifyCal({ secret: v.SECRET, rawBody: spaced, headers: signed.headers }).ok,
      false,
    );
  });

  test("wrong secret fails; missing header is reported as such", () => {
    assert.deepEqual(
      verifyCal({ secret: "other", rawBody: signed.body, headers: signed.headers }),
      { ok: false, reason: "signature-mismatch" },
    );
    assert.deepEqual(verifyCal({ secret: v.SECRET, rawBody: signed.body, headers: {} }), {
      ok: false,
      reason: "missing-header",
    });
  });

  test("a webhook without a secret verifies against Cal's literal", () => {
    const noSecret = signCal({ secret: null, body: "{}" });
    assert.equal(verifyCal({ secret: null, rawBody: "{}", headers: noSecret.headers }).ok, true);
  });
});

describe("verifyDocumenso", () => {
  test("accepts the configured secret, rejects another, reports a missing header", () => {
    const { headers } = signDocumenso({ secret: "s1", body: "{}" });
    assert.equal(verifyDocumenso({ secret: "s1", headers }).ok, true);
    assert.deepEqual(verifyDocumenso({ secret: "s2", headers }), {
      ok: false,
      reason: "signature-mismatch",
    });
    assert.deepEqual(verifyDocumenso({ secret: "s1", headers: {} }), {
      ok: false,
      reason: "missing-header",
    });
  });
});

describe("verifyTwenty", () => {
  const signed = signTwenty({
    secret: v.SECRET,
    body: v.TW_BODY,
    timestampMs: v.TW_TS_MS,
    nonce: v.TW_NONCE,
  });
  const base = { secret: v.SECRET, rawBody: signed.body, headers: signed.headers };

  test("accepts the vector, with and without a tolerance", () => {
    assert.equal(verifyTwenty({ ...base, nowMs: v.TW_TS_MS, toleranceMs: null }).ok, true);
    assert.equal(verifyTwenty({ ...base, nowMs: v.TW_TS_MS + 1000, toleranceMs: 5000 }).ok, true);
  });

  test("stale timestamp: valid HMAC but outside the caller's tolerance", () => {
    assert.deepEqual(verifyTwenty({ ...base, nowMs: v.TW_TS_MS + 5001, toleranceMs: 5000 }), {
      ok: false,
      reason: "stale-timestamp",
    });
  });

  test("tamper, wrong secret and a re-stamped timestamp all fail the HMAC", () => {
    const flipped = Buffer.from(signed.body);
    flipped[3] = (flipped[3] ?? 0) ^ 1;
    const common = { nowMs: v.TW_TS_MS, toleranceMs: null };
    assert.equal(verifyTwenty({ ...base, ...common, rawBody: flipped }).ok, false);
    assert.equal(verifyTwenty({ ...base, ...common, secret: "other" }).ok, false);
    const restamped = { ...signed.headers, "X-Twenty-Webhook-Timestamp": String(v.TW_TS_MS + 1) };
    assert.deepEqual(verifyTwenty({ ...base, ...common, headers: restamped }), {
      ok: false,
      reason: "signature-mismatch",
    });
  });

  test("the nonce is not part of the signature: a different nonce still verifies", () => {
    const otherNonce = { ...signed.headers, "X-Twenty-Webhook-Nonce": "f".repeat(32) };
    assert.equal(
      verifyTwenty({ ...base, headers: otherNonce, nowMs: v.TW_TS_MS, toleranceMs: null }).ok,
      true,
    );
  });

  test("missing and malformed headers are reported separately", () => {
    const common = { nowMs: v.TW_TS_MS, toleranceMs: null };
    assert.deepEqual(verifyTwenty({ ...base, ...common, headers: {} }), {
      ok: false,
      reason: "missing-header",
    });
    const bad = { ...signed.headers, "X-Twenty-Webhook-Timestamp": "12ab" };
    assert.deepEqual(verifyTwenty({ ...base, ...common, headers: bad }), {
      ok: false,
      reason: "malformed-header",
    });
  });
});

describe("verifyDaily (server-equivalent)", () => {
  const common = {
    secretBase64: v.DAILY_SECRET_B64,
    nowSeconds: 1793519354,
    toleranceSeconds: null,
  };

  test("reserialised signature verifies for compact and for spaced bodies", () => {
    for (const body of [v.DAILY_BODY_COMPACT, v.DAILY_BODY_SPACED]) {
      const signed = signDaily({
        secretBase64: v.DAILY_SECRET_B64,
        body,
        timestamp: v.DAILY_TS,
        mode: "reserialised",
      });
      assert.equal(
        verifyDaily({ ...common, rawBody: signed.body, headers: signed.headers }).ok,
        true,
      );
    }
  });

  test("raw-mode signature over spaced bytes is rejected, because Cal re-serialises (route.ts:41)", () => {
    const signed = signDaily({
      secretBase64: v.DAILY_SECRET_B64,
      body: v.DAILY_BODY_SPACED,
      timestamp: v.DAILY_TS,
      mode: "raw",
    });
    assert.deepEqual(verifyDaily({ ...common, rawBody: signed.body, headers: signed.headers }), {
      ok: false,
      reason: "signature-mismatch",
    });
  });

  test("tamper (changed field value) and wrong secret fail", () => {
    const signed = signDaily({
      secretBase64: v.DAILY_SECRET_B64,
      body: v.DAILY_BODY_COMPACT,
      timestamp: v.DAILY_TS,
      mode: "reserialised",
    });
    const changed = signed.body.toString("utf8").replace("r1", "r2");
    assert.equal(verifyDaily({ ...common, rawBody: changed, headers: signed.headers }).ok, false);
    const otherKey = Buffer.from("another-key-bytes").toString("base64");
    assert.equal(
      verifyDaily({
        ...common,
        secretBase64: otherKey,
        rawBody: signed.body,
        headers: signed.headers,
      }).ok,
      false,
    );
  });

  test("missing timestamp header verifies against the text 'null'; stale needs a tolerance", () => {
    const noTs = signDaily({
      secretBase64: v.DAILY_SECRET_B64,
      body: v.DAILY_BODY_COMPACT,
      timestamp: null,
      mode: "raw",
    });
    assert.equal(verifyDaily({ ...common, rawBody: noTs.body, headers: noTs.headers }).ok, true);

    const old = signDaily({
      secretBase64: v.DAILY_SECRET_B64,
      body: v.DAILY_BODY_COMPACT,
      timestamp: v.DAILY_TS,
      mode: "raw",
    });
    const withTolerance = {
      ...common,
      nowSeconds: Number(v.DAILY_TS) + 601,
      toleranceSeconds: 600,
    };
    assert.deepEqual(verifyDaily({ ...withTolerance, rawBody: old.body, headers: old.headers }), {
      ok: false,
      reason: "stale-timestamp",
    });
    assert.equal(
      verifyDaily({
        ...common,
        nowSeconds: Number(v.DAILY_TS) + 601,
        rawBody: old.body,
        headers: old.headers,
      }).ok,
      true,
      "Cal itself accepts it: no tolerance check in the route",
    );
  });

  test("a body that is not JSON and a missing signature header are reported", () => {
    assert.deepEqual(
      verifyDaily({ ...common, rawBody: "nope", headers: { "x-webhook-signature": "x" } }),
      {
        ok: false,
        reason: "malformed-body",
      },
    );
    assert.deepEqual(verifyDaily({ ...common, rawBody: "{}", headers: {} }), {
      ok: false,
      reason: "missing-header",
    });
  });
});

describe("verifyStripe (SDK verifier, tolerance 300 s)", () => {
  const payload = JSON.stringify({ id: "evt_1", object: "event", type: "x.y" });
  const nowMs = 1793519354000;
  const nowS = nowMs / 1000;
  const sign = (timestampSeconds: number, secret = "whsec_unit") =>
    signStripe({ payload, secret, timestampSeconds });

  test("accepts a header signed at the receive time", () => {
    const s = sign(nowS);
    assert.equal(
      verifyStripe({ secret: "whsec_unit", rawBody: s.body, headers: s.headers, nowMs }).ok,
      true,
    );
  });

  test("boundary: exactly at the tolerance passes, one second beyond is stale", () => {
    const at = sign(nowS - STRIPE_DEFAULT_TOLERANCE_SECONDS);
    const beyond = sign(nowS - STRIPE_DEFAULT_TOLERANCE_SECONDS - 1);
    assert.equal(
      verifyStripe({ secret: "whsec_unit", rawBody: at.body, headers: at.headers, nowMs }).ok,
      true,
    );
    assert.deepEqual(
      verifyStripe({ secret: "whsec_unit", rawBody: beyond.body, headers: beyond.headers, nowMs }),
      { ok: false, reason: "stale-timestamp" },
    );
  });

  test("tamper, wrong secret, malformed and missing header", () => {
    const s = sign(nowS);
    assert.deepEqual(
      verifyStripe({ secret: "whsec_unit", rawBody: payload + " ", headers: s.headers, nowMs }),
      { ok: false, reason: "signature-mismatch" },
    );
    assert.deepEqual(
      verifyStripe({ secret: "whsec_other", rawBody: s.body, headers: s.headers, nowMs }),
      { ok: false, reason: "signature-mismatch" },
    );
    assert.deepEqual(
      verifyStripe({
        secret: "whsec_unit",
        rawBody: s.body,
        headers: { "stripe-signature": "garbage" },
        nowMs,
      }),
      { ok: false, reason: "malformed-header" },
    );
    assert.deepEqual(verifyStripe({ secret: "whsec_unit", rawBody: s.body, headers: {}, nowMs }), {
      ok: false,
      reason: "missing-header",
    });
  });
});
