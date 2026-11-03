import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../../../src/fixtures/index.ts";
import { productsRoot, randomSecret } from "../../../src/readiness/checks.ts";
import { runScopedName } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";
import { verifyDocumenso } from "../../../src/webhooks/verify.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { trpcPost, v2Post } from "../../../src/lanes/doc/envelope.ts";
import { completedEnvelope } from "../../fixtures/doc/completed-envelope.ts";
import { distributedEnvelope } from "../../fixtures/doc/distributed-envelope.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
import { holdQuiet } from "../../fixtures/doc/quiet-window.ts";

const examplePdf = (): Buffer =>
  readFileSync(path.join(productsRoot(), "documenso", "assets", "example.pdf"));

interface Body {
  readonly createdAt: string;
  readonly payload: { readonly id: unknown };
}
const bodyOf = (raw: Buffer): Body => JSON.parse(raw.toString("utf8")) as Body;

test("P2-DOC-WH-001 the secret header equals the configured secret; a loopback webhook URL is refused at create", async ({
  doc,
  receiverHandle,
}) => {
  const key = receiverHandle.key("p2-wh-001");
  const secret = randomSecret();
  const id = await doc.webhooks.create({
    webhookUrl: receiverHandle.urlFor("p2-wh-001"),
    eventTriggers: ["DOCUMENT_CREATED"],
    secret,
  });
  let envelopeId: string | undefined;
  try {
    envelopeId = await doc.envelopes.create({
      title: runScopedName("wh-001"),
      pdf: examplePdf(),
      recipients: [],
    });
    await expect
      .poll(() => receiverHandle.receiver.deliveries(key).length, {
        timeout: SLO.docWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "one delivery",
      })
      .toBe(1);
    await holdQuiet(
      () => receiverHandle.receiver.deliveries(key).length,
      1,
      SLO.docWebhookQuiet.ms,
      "no second delivery",
    );
    const [delivery] = receiverHandle.receiver.deliveries(key);
    if (delivery === undefined) throw new Error("TEST BUG: no delivery recorded");
    expect(verifyDocumenso({ secret, headers: delivery.headers })).toEqual({ ok: true });
    expect(verifyDocumenso({ secret: `${secret}-other`, headers: delivery.headers })).toEqual(
      expect.objectContaining({ ok: false }),
    );
  } finally {
    if (envelopeId) await doc.envelopes.remove(envelopeId);
    await doc.webhooks.remove(id);
  }
  // SSRF path: a loopback address is refused at create time (400), so no webhook row is made.
  await expect(
    doc.webhooks.create({
      webhookUrl: `http://127.0.0.1:${String(receiverHandle.receiver.port)}/r/${key.runId}/refused`,
      eventTriggers: ["DOCUMENT_CREATED"],
      secret,
    }),
  ).rejects.toMatchObject({ status: 400 });
});

test("P2-DOC-WH-002 one event makes 1 + 3 attempts with no back-off, and createdAt differs per attempt", async ({
  doc,
  receiverHandle,
}) => {
  const key = receiverHandle.key("p2-wh-002");
  receiverHandle.receiver.setMode(key, { kind: "500" });
  const secret = randomSecret();
  const id = await doc.webhooks.create({
    webhookUrl: receiverHandle.urlFor("p2-wh-002"),
    eventTriggers: ["DOCUMENT_CREATED"],
    secret,
  });
  let envelopeId: string | undefined;
  try {
    envelopeId = await doc.envelopes.create({
      title: runScopedName("wh-002"),
      pdf: examplePdf(),
      recipients: [],
    });
    await expect
      .poll(() => receiverHandle.receiver.deliveries(key).length, {
        timeout: SLO.docWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "four attempts",
      })
      .toBe(4);
    await holdQuiet(
      () => receiverHandle.receiver.deliveries(key).length,
      4,
      SLO.docWebhookQuiet.ms,
      "no fifth attempt",
    );
    const ds = receiverHandle.receiver.deliveries(key);
    expect(ds.every((d) => d.mode === "500")).toBe(true); // the receiver answered every attempt 500
    // No back-off (local.ts:386): each attempt follows the previous one within the cited bound.
    for (let i = 1; i < ds.length; i += 1) {
      const cur = ds[i];
      const prev = ds[i - 1];
      if (cur === undefined || prev === undefined) throw new Error("TEST BUG: missing delivery");
      expect(Date.parse(cur.receivedAt) - Date.parse(prev.receivedAt)).toBeLessThan(
        SLO.docWebhookRetryGap.ms,
      );
    }
    expect(new Set(ds.map((d) => bodyOf(d.rawBody).createdAt)).size).toBe(4); // P-DOC-2
    expect(new Set(ds.map((d) => JSON.stringify(bodyOf(d.rawBody).payload.id))).size).toBe(1);
    for (const d of ds)
      expect(verifyDocumenso({ secret, headers: d.headers })).toEqual({ ok: true });
  } finally {
    if (envelopeId) await doc.envelopes.remove(envelopeId);
    await doc.webhooks.remove(id);
  }
});

test("P2-DOC-WH-003 a 9 s receiver is delivered once", async ({ doc, receiverHandle }) => {
  const key = receiverHandle.key("p2-wh-003-9s");
  receiverHandle.receiver.setMode(key, { kind: "slow", delayMs: 9_000 });
  const id = await doc.webhooks.create({
    webhookUrl: receiverHandle.urlFor("p2-wh-003-9s"),
    eventTriggers: ["DOCUMENT_CREATED"],
    secret: randomSecret(),
  });
  let envelopeId: string | undefined;
  try {
    envelopeId = await doc.envelopes.create({
      title: runScopedName("wh-003-9s"),
      pdf: examplePdf(),
      recipients: [],
    });
    await expect
      .poll(() => receiverHandle.receiver.deliveries(key).length, {
        timeout: SLO.docWebhookTimeoutChain.ms,
        intervals: POLL_INTERVALS,
        message: "one delivery at 9 s",
      })
      .toBe(1);
    await holdQuiet(
      () => receiverHandle.receiver.deliveries(key).length,
      1,
      SLO.docWebhookQuiet.ms,
      "no retry after a 9 s answer",
    );
    expect(receiverHandle.receiver.deliveries(key)).toHaveLength(1); // no retry after a 9 s answer
  } finally {
    if (envelopeId) await doc.envelopes.remove(envelopeId);
    await doc.webhooks.remove(id);
  }
});

test("P2-DOC-WH-003 an 11 s receiver is aborted at the 10 s timeout and retried three times", async ({
  doc,
  receiverHandle,
}) => {
  const key = receiverHandle.key("p2-wh-003-11s");
  receiverHandle.receiver.setMode(key, { kind: "slow", delayMs: 11_000 });
  const id = await doc.webhooks.create({
    webhookUrl: receiverHandle.urlFor("p2-wh-003-11s"),
    eventTriggers: ["DOCUMENT_CREATED"],
    secret: randomSecret(),
  });
  let envelopeId: string | undefined;
  try {
    envelopeId = await doc.envelopes.create({
      title: runScopedName("wh-003-11s"),
      pdf: examplePdf(),
      recipients: [],
    });
    await expect
      .poll(() => receiverHandle.receiver.deliveries(key).length, {
        timeout: SLO.docWebhookTimeoutChain.ms,
        intervals: POLL_INTERVALS,
        message: "four attempts at 11 s",
      })
      .toBe(4);
    await holdQuiet(
      () => receiverHandle.receiver.deliveries(key).length,
      4,
      SLO.docWebhookQuiet.ms,
      "no fifth attempt at 11 s",
    );
    const ds = receiverHandle.receiver.deliveries(key);
    // Each attempt is aborted at WEBHOOK_TIMEOUT_MS (10 000 ms), so consecutive arrivals are at least 9.5 s apart.
    for (let i = 1; i < ds.length; i += 1) {
      const cur = ds[i];
      const prev = ds[i - 1];
      if (cur === undefined || prev === undefined) throw new Error("TEST BUG: missing delivery");
      const gap = Date.parse(cur.receivedAt) - Date.parse(prev.receivedAt);
      expect(gap).toBeGreaterThanOrEqual(9_500);
    }
  } finally {
    if (envelopeId) await doc.envelopes.remove(envelopeId);
    await doc.webhooks.remove(id);
  }
});

test("P2-DOC-WH-006 no per-delivery identifier exists (only payload.id is stable across attempts)", async ({
  doc,
  receiverHandle,
}) => {
  const key = receiverHandle.key("p2-wh-006");
  receiverHandle.receiver.setMode(key, { kind: "500" });
  const id = await doc.webhooks.create({
    webhookUrl: receiverHandle.urlFor("p2-wh-006"),
    eventTriggers: ["DOCUMENT_CREATED"],
    secret: randomSecret(),
  });
  let envelopeId: string | undefined;
  try {
    envelopeId = await doc.envelopes.create({
      title: runScopedName("wh-006"),
      pdf: examplePdf(),
      recipients: [],
    });
    await expect
      .poll(() => receiverHandle.receiver.deliveries(key).length, {
        timeout: SLO.docWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "four attempts",
      })
      .toBe(4);
    await holdQuiet(
      () => receiverHandle.receiver.deliveries(key).length,
      4,
      SLO.docWebhookQuiet.ms,
      "no fifth attempt",
    );
    const ds = receiverHandle.receiver.deliveries(key);
    expect(ds.every((d) => d.mode === "500")).toBe(true);
    const headerNames = new Set(ds.flatMap((d) => Object.keys(d.headers)));
    expect([...headerNames].filter((h) => /delivery|event-id|idempotenc/i.test(h))).toEqual([]);
    // Body fields other than createdAt are identical across the four attempts.
    const stripCreatedAt = (raw: Buffer): string => {
      const parsed = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
      delete parsed["createdAt"];
      return JSON.stringify(parsed);
    };
    expect(new Set(ds.map((d) => stripCreatedAt(d.rawBody))).size).toBe(1);
  } finally {
    if (envelopeId) await doc.envelopes.remove(envelopeId);
    await doc.webhooks.remove(id);
  }
});

test("P2-DOC-WH-007 a 302 receiver is not followed (no delivery on /redirected)", async ({
  doc,
  receiverHandle,
}) => {
  const key = receiverHandle.key("p2-wh-007");
  receiverHandle.receiver.setMode(key, { kind: "redirect" });
  const id = await doc.webhooks.create({
    webhookUrl: receiverHandle.urlFor("p2-wh-007"),
    eventTriggers: ["DOCUMENT_CREATED"],
    secret: randomSecret(),
  });
  let envelopeId: string | undefined;
  try {
    envelopeId = await doc.envelopes.create({
      title: runScopedName("wh-007"),
      pdf: examplePdf(),
      recipients: [],
    });
    await expect
      .poll(() => receiverHandle.receiver.deliveries(key).length, {
        timeout: SLO.docWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "four attempts on the original path",
      })
      .toBe(4);
    await holdQuiet(
      () => receiverHandle.receiver.deliveries(key).length,
      4,
      SLO.docWebhookQuiet.ms,
      "no fifth attempt",
    );
    const ds = receiverHandle.receiver.deliveries(key);
    expect(ds.every((d) => d.mode === "redirect")).toBe(true); // every attempt was answered with the 302
    expect(ds.every((d) => !d.path.endsWith("/redirected"))).toBe(true);
  } finally {
    if (envelopeId) await doc.envelopes.remove(envelopeId);
    await doc.webhooks.remove(id);
  }
});

test("P2-DOC-WH-004 each event of the trigger matrix is delivered exactly once per action", async ({
  doc,
  receiverHandle,
  request,
  docAuth,
}) => {
  const key = receiverHandle.key("p2-wh-004");
  const secret = randomSecret();
  const triggers = [
    "DOCUMENT_CREATED",
    "DOCUMENT_SENT",
    "DOCUMENT_COMPLETED",
    "DOCUMENT_CANCELLED",
    "DOCUMENT_REJECTED",
  ];
  const id = await doc.webhooks.create({
    webhookUrl: receiverHandle.urlFor("p2-wh-004"),
    eventTriggers: triggers,
    secret,
  });
  const db = readOnlyDb("documenso");
  const runPrefix = currentRunPrefix();
  const authorization = () => docAuth.headerValue.reveal();
  const cleanup: string[] = [];
  try {
    // Action 1 (CREATED, SENT): a distributed envelope (one SENT, one CREATED).
    const sent = await distributedEnvelope({
      label: "wh-004-sent",
      signers: 1,
      doc,
      request,
      authorization,
      db,
      runPrefix,
    });
    cleanup.push(sent.envelopeId);
    // Action 2 (CREATED, SENT, COMPLETED): an envelope signed and completed through the product.
    const completed = await completedEnvelope({
      label: "wh-004-done",
      signers: 1,
      doc,
      request,
      authorization,
      db,
      runPrefix,
    });
    cleanup.push(completed.envelopeId);
    // Action 3 (CREATED, SENT, CANCELLED): distributed, then cancelled through the API.
    const cancelled = await distributedEnvelope({
      label: "wh-004-cancel",
      signers: 1,
      doc,
      request,
      authorization,
      db,
      runPrefix,
    });
    cleanup.push(cancelled.envelopeId);
    const cancelStatus = await v2Post(cancelled.http, "/api/v2/envelope/cancel", {
      envelopeId: cancelled.envelopeId,
      reason: "p2 matrix",
    });
    expect(cancelStatus.status).toBe(200);
    // Action 4 (CREATED, SENT, REJECTED): distributed, then rejected by the recipient with its token.
    const rejected = await distributedEnvelope({
      label: "wh-004-reject",
      signers: 1,
      doc,
      request,
      authorization,
      db,
      runPrefix,
    });
    cleanup.push(rejected.envelopeId);
    const rejector = rejected.prepared.signers[0];
    if (rejector === undefined) throw new Error("TEST BUG: no recipient to reject");
    const rejectStatus = await trpcPost(rejected.http, "recipient.rejectDocumentWithToken", {
      token: rejector.token,
      documentId: rejected.prepared.documentId,
      reason: "p2 matrix",
    });
    expect(rejectStatus.status).toBe(200);
    // Expected per action: CREATED x4 (four envelopes), SENT x4, COMPLETED x1, CANCELLED x1, REJECTED x1.
    const expected = {
      DOCUMENT_CREATED: 4,
      DOCUMENT_SENT: 4,
      DOCUMENT_COMPLETED: 1,
      DOCUMENT_CANCELLED: 1,
      DOCUMENT_REJECTED: 1,
    };
    const total = Object.values(expected).reduce((a, b) => a + b, 0);
    await expect
      .poll(() => receiverHandle.receiver.deliveries(key).length, {
        timeout: SLO.docWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "all matrix events delivered",
      })
      .toBe(total);
    await holdQuiet(
      () => receiverHandle.receiver.deliveries(key).length,
      total,
      SLO.docWebhookQuiet.ms,
      "no extra matrix delivery",
    );
    const counts: Record<string, number> = {};
    for (const d of receiverHandle.receiver.deliveries(key)) {
      const event = (JSON.parse(d.rawBody.toString("utf8")) as { event: string }).event;
      counts[event] = (counts[event] ?? 0) + 1;
    }
    expect(counts).toEqual(expected);
  } finally {
    for (const envelopeId of cleanup) await doc.envelopes.remove(envelopeId);
    await doc.webhooks.remove(id);
  }
});
