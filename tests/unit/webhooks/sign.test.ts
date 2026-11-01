import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Stripe from "stripe";
import {
  CAL_NO_SECRET_SIGNATURE,
  CAL_SIGNATURE_HEADER,
  DAILY_SIGNATURE_HEADER,
  DAILY_TIMESTAMP_HEADER,
  DOCUMENSO_SECRET_HEADER,
  signCal,
  signDaily,
  signDocumenso,
  signStripe,
  signTwenty,
  STRIPE_DEFAULT_TOLERANCE_SECONDS,
  STRIPE_SIGNATURE_HEADER,
  TWENTY_NONCE_HEADER,
  TWENTY_SIGNATURE_HEADER,
  TWENTY_TIMESTAMP_HEADER,
} from "../../../src/webhooks/sign.ts";
import * as v from "./vectors.ts";

describe("signCal (sendPayload.ts:296-299)", () => {
  test("matches the independent vector for a body with a real é", () => {
    const out = signCal({ secret: v.SECRET, body: v.CAL_BODY_UTF8 });
    assert.equal(out.headers[CAL_SIGNATURE_HEADER], v.CAL_SIG_UTF8);
  });

  test("the escaped and the literal spelling of é are different bytes with different signatures", () => {
    const escaped = signCal({ secret: v.SECRET, body: v.CAL_BODY_ESCAPED });
    assert.equal(escaped.headers[CAL_SIGNATURE_HEADER], v.CAL_SIG_ESCAPED);
    assert.notEqual(v.CAL_SIG_ESCAPED, v.CAL_SIG_UTF8);
  });

  test("returns the exact bytes that were signed, for string and Uint8Array input", () => {
    const fromString = signCal({ secret: v.SECRET, body: v.CAL_BODY_UTF8 });
    const fromBytes = signCal({ secret: v.SECRET, body: Buffer.from(v.CAL_BODY_UTF8, "utf8") });
    assert.deepEqual(fromString.body, fromBytes.body);
    assert.deepEqual(fromString.headers, fromBytes.headers);
  });

  test("a null secret yields Cal's literal 'no-secret-provided'", () => {
    assert.equal(
      signCal({ secret: null, body: "{}" }).headers[CAL_SIGNATURE_HEADER],
      CAL_NO_SECRET_SIGNATURE,
    );
  });

  test("a different secret changes the signature", () => {
    const other = signCal({ secret: "another-secret", body: v.CAL_BODY_UTF8 });
    assert.notEqual(other.headers[CAL_SIGNATURE_HEADER], v.CAL_SIG_UTF8);
  });
});

describe("signDocumenso (execute-webhook-call.ts: X-Documenso-Secret)", () => {
  test("sends the secret as-is, with no HMAC and no timestamp header", () => {
    const out = signDocumenso({ secret: "doc-secret", body: "{}" });
    assert.deepEqual(out.headers, { [DOCUMENSO_SECRET_HEADER]: "doc-secret" });
  });

  test("a null secret sends an empty string (secret ?? '')", () => {
    assert.equal(signDocumenso({ secret: null, body: "{}" }).headers[DOCUMENSO_SECRET_HEADER], "");
  });
});

describe("signTwenty (call-webhook.job.ts)", () => {
  test("matches the independent vector and emits all three headers", () => {
    const out = signTwenty({
      secret: v.SECRET,
      body: v.TW_BODY,
      timestampMs: v.TW_TS_MS,
      nonce: v.TW_NONCE,
    });
    assert.deepEqual(out.headers, {
      [TWENTY_TIMESTAMP_HEADER]: String(v.TW_TS_MS),
      [TWENTY_SIGNATURE_HEADER]: v.TW_SIG,
      [TWENTY_NONCE_HEADER]: v.TW_NONCE,
    });
  });

  test("the nonce is not signed: changing it keeps the signature", () => {
    const base = { secret: v.SECRET, body: v.TW_BODY, timestampMs: v.TW_TS_MS };
    const a = signTwenty({ ...base, nonce: "a".repeat(32) });
    const b = signTwenty({ ...base, nonce: "b".repeat(32) });
    assert.equal(a.headers[TWENTY_SIGNATURE_HEADER], b.headers[TWENTY_SIGNATURE_HEADER]);
  });

  test("the timestamp is signed: changing it changes the signature", () => {
    const a = signTwenty({ secret: v.SECRET, body: v.TW_BODY, timestampMs: 1, nonce: v.TW_NONCE });
    assert.notEqual(a.headers[TWENTY_SIGNATURE_HEADER], v.TW_SIG);
  });
});

describe("signDaily (recorded-daily-video/route.ts:40-45)", () => {
  const base = { secretBase64: v.DAILY_SECRET_B64, timestamp: v.DAILY_TS };

  test("compact body: raw and reserialised modes agree with the vector", () => {
    for (const mode of ["raw", "reserialised"] as const) {
      const out = signDaily({ ...base, body: v.DAILY_BODY_COMPACT, mode });
      assert.equal(out.headers[DAILY_SIGNATURE_HEADER], v.DAILY_SIG_COMPACT, mode);
      assert.equal(out.headers[DAILY_TIMESTAMP_HEADER], v.DAILY_TS);
    }
  });

  test("spaced body: raw mode signs the sent bytes, reserialised mode signs what Cal recomputes", () => {
    const raw = signDaily({ ...base, body: v.DAILY_BODY_SPACED, mode: "raw" });
    const re = signDaily({ ...base, body: v.DAILY_BODY_SPACED, mode: "reserialised" });
    assert.equal(raw.headers[DAILY_SIGNATURE_HEADER], v.DAILY_SIG_OVER_SPACED_RAW);
    assert.equal(re.headers[DAILY_SIGNATURE_HEADER], v.DAILY_SIG_COMPACT);
    assert.equal(re.body.toString("utf8"), v.DAILY_BODY_SPACED, "bytes sent stay as given");
  });

  test("a null timestamp omits the header and signs the text 'null' (route.ts:41)", () => {
    const out = signDaily({ ...base, timestamp: null, body: v.DAILY_BODY_COMPACT, mode: "raw" });
    assert.equal(out.headers[DAILY_SIGNATURE_HEADER], v.DAILY_SIG_NULL_TS);
    assert.ok(!(DAILY_TIMESTAMP_HEADER in out.headers));
  });

  test("the key is the base64-DECODED secret, not the base64 text", () => {
    const wrongKeyText = signDaily({
      secretBase64: Buffer.from(v.DAILY_SECRET_B64, "utf8").toString("base64"),
      timestamp: v.DAILY_TS,
      body: v.DAILY_BODY_COMPACT,
      mode: "raw",
    });
    assert.notEqual(wrongKeyText.headers[DAILY_SIGNATURE_HEADER], v.DAILY_SIG_COMPACT);
  });

  test("reserialised mode rejects a body that is not JSON", () => {
    assert.throws(
      () => signDaily({ ...base, body: "not json", mode: "reserialised" }),
      SyntaxError,
    );
  });
});

describe("signStripe (official SDK)", () => {
  test("header has the t=<seconds>,v1=<64 hex> shape and the SDK verifier accepts it", () => {
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "x.y" });
    const now = Math.floor(Date.now() / 1000);
    const out = signStripe({ payload, secret: "whsec_unit", timestampSeconds: now });
    const header = out.headers[STRIPE_SIGNATURE_HEADER] ?? "";
    assert.match(header, new RegExp(`^t=${String(now)},v1=[0-9a-f]{64}$`));
    assert.equal(Stripe.webhooks.constructEvent(payload, header, "whsec_unit").type, "x.y");
  });

  test("the tolerance comes from the SDK and is 300 seconds at the pinned version", () => {
    assert.equal(STRIPE_DEFAULT_TOLERANCE_SECONDS, 300);
  });
});
