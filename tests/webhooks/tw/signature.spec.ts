import { test, expect } from "../../../src/fixtures/index.ts";
import { deliveriesOf } from "../../../src/lanes/tw/visible.ts";
import { awaitCanary } from "../../../src/lanes/tw/waits.ts";
import { createFreshWebhook } from "../../../src/lanes/tw/webhook-factory.ts";
import {
  flipOneBodyByte,
  verifyDelivery,
  withNonce,
  TWENTY_TIMESTAMP_HEADER,
} from "../../../src/lanes/tw/oracle.ts";
import { TWENTY_NONCE_HEADER } from "../../../src/webhooks/sign.ts";
import { POLL_INTERVALS, SLO } from "../../../src/lanes/tw/slo.ts";
import { runScopedName } from "../../../src/run/prefix.ts";
import { runAllThenRethrow } from "../../../src/shared/cleanup.ts";
import { removeEach } from "../../../src/lanes/tw/cleanup-steps.ts";

test('P2-TW-WH-001: a person.created delivery verifies over "${timestamp}:${body}" with the timestamp within 5 s of receipt', async ({
  tw,
  receiverHandle,
}) => {
  const testId = "tw-sign";
  const key = receiverHandle.key(testId);
  const createdAtMs = Date.now();
  const hook = await createFreshWebhook({
    tw,
    receiverHandle,
    testId,
    operations: ["person.created"],
  });
  const created: string[] = [];
  try {
    created.push(
      ...(await awaitCanary({ tw, receiver: receiverHandle.receiver, key, createdAtMs })).personIds,
    );
    const realId = await tw.people.create(runScopedName("tw-sign-real"));
    created.push(realId);
    await expect
      .poll(() => deliveriesOf(receiverHandle.receiver, key, realId).length, {
        timeout: SLO.twWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "P2-TW-WH-001 delivery",
      })
      .toBe(1);
    const delivery = deliveriesOf(receiverHandle.receiver, key, realId)[0];
    if (delivery === undefined) throw new Error("TEST BUG: delivery vanished after the poll");
    expect(verifyDelivery(delivery, hook.secret)).toEqual({ ok: true });
    // Negative control: the oracle must fail on a changed byte, or the line above proves nothing.
    expect(
      verifyDelivery({ ...delivery, rawBody: flipOneBodyByte(delivery.rawBody) }, hook.secret),
    ).toEqual({
      ok: false,
      reason: "signature-mismatch",
    });
  } finally {
    await runAllThenRethrow([
      ...removeEach(created, (id) => tw.people.remove(id)),
      () => hook.remove(),
    ]);
  }
});

test("P2-TW-WH-007: the nonce header is not signed, so the same delivery with a fresh nonce still verifies", async ({
  tw,
  receiverHandle,
}) => {
  const testId = "tw-nonce";
  const key = receiverHandle.key(testId);
  const createdAtMs = Date.now();
  const hook = await createFreshWebhook({
    tw,
    receiverHandle,
    testId,
    operations: ["person.created"],
  });
  const created: string[] = [];
  try {
    created.push(
      ...(await awaitCanary({ tw, receiver: receiverHandle.receiver, key, createdAtMs })).personIds,
    );
    const realId = await tw.people.create(runScopedName("tw-nonce-real"));
    created.push(realId);
    await expect
      .poll(() => deliveriesOf(receiverHandle.receiver, key, realId).length, {
        timeout: SLO.twWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "P2-TW-WH-007 delivery",
      })
      .toBe(1);
    const delivery = deliveriesOf(receiverHandle.receiver, key, realId)[0];
    if (delivery === undefined) throw new Error("TEST BUG: delivery vanished after the poll");
    // Setup, asserted: the original delivery carries a nonce header of 32 hex characters, so there is a nonce to replace.
    const nonceName = TWENTY_NONCE_HEADER.toLowerCase();
    const original = delivery.headers[nonceName];
    expect(typeof original, "setup: the delivery carries the nonce header").toBe("string");
    expect(
      original,
      "setup: the nonce is 32 hex characters (call-webhook.job.ts:98, randomBytes(16))",
    ).toMatch(/^[0-9a-f]{32}$/);
    // The replacement is derived from the original (each hex digit rotated by one), so it always differs from it.
    const replacement = String(original).replace(/[0-9a-f]/g, (c) =>
      ((parseInt(c, 16) + 1) % 16).toString(16),
    );
    expect(replacement, "setup: the replacement differs from the original").not.toBe(original);

    // The nonce is not signed: the same delivery with the rotated nonce still verifies.
    expect(
      verifyDelivery(
        { ...delivery, headers: withNonce(delivery.headers, replacement) },
        hook.secret,
      ),
    ).toEqual({ ok: true });

    // Control: the timestamp IS signed, so a changed timestamp must fail (the signed text is `${timestamp}:${body}`).
    const ts = Number(delivery.headers[TWENTY_TIMESTAMP_HEADER.toLowerCase()]);
    expect(Number.isFinite(ts), "setup: the delivery carries a numeric timestamp").toBe(true);
    const shifted = {
      ...delivery.headers,
      [TWENTY_TIMESTAMP_HEADER.toLowerCase()]: String(ts + 1),
    };
    expect(verifyDelivery({ ...delivery, headers: shifted }, hook.secret).ok).toBe(false);
  } finally {
    await runAllThenRethrow([
      ...removeEach(created, (id) => tw.people.remove(id)),
      () => hook.remove(),
    ]);
  }
});
