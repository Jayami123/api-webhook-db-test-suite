import { test, expect } from "../../../src/fixtures/index.ts";
import { deliveriesOf } from "../../../src/lanes/tw/visible.ts";
import { awaitCanary } from "../../../src/lanes/tw/waits.ts";
import { createFreshWebhook } from "../../../src/lanes/tw/webhook-factory.ts";
import { flipOneBodyByte, verifyDelivery, withNonce } from "../../../src/lanes/tw/oracle.ts";
import { POLL_INTERVALS, SLO } from "../../../src/lanes/tw/slo.ts";
import { runScopedName } from "../../../src/run/prefix.ts";

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
    try {
      for (const id of created) await tw.people.remove(id);
    } finally {
      await hook.remove();
    }
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
    expect(
      verifyDelivery(
        { ...delivery, headers: withNonce(delivery.headers, "ff".repeat(16)) },
        hook.secret,
      ),
    ).toEqual({
      ok: true,
    });
  } finally {
    try {
      for (const id of created) await tw.people.remove(id);
    } finally {
      await hook.remove();
    }
  }
});
