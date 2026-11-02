import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { completeRecipient } from "../../../src/lanes/doc/envelope.ts";
import { bodyOf, listMail, mailboxOf } from "../../../src/lanes/doc/mail.ts";
import {
  documensoFixtureWriter,
  setRecipientNextReminderAt,
} from "../../../src/lanes/doc/fixtures.ts";
import { tickDeadlineMs } from "../../../src/lanes/doc/cron.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
import { distributedEnvelope } from "../../fixtures/doc/distributed-envelope.ts";

/** Poll interval for the cron wait: a 15-minute sweep needs a coarse poll, not a fixed sleep. */
const TICK_POLL_MS = 5_000;

test.describe.configure({ timeout: 25 * 60_000 });

test("P2-DOC-REM-001 one reminder per interval (one cron tick)", async ({
  doc,
  request,
  docAuth,
}) => {
  const runPrefix = currentRunPrefix();
  const db = readOnlyDb("documenso");
  const w = documensoFixtureWriter(runPrefix);
  const env = await distributedEnvelope({
    label: "rem-001",
    signers: 2,
    doc,
    request,
    authorization: () => docAuth.headerValue.reveal(),
    db,
    runPrefix,
  });
  try {
    const target = env.prepared.signers[0];
    if (target === undefined) throw new Error("TEST BUG: no signer");
    const mailbox = mailboxOf(target.email);
    const before = (await listMail(mailbox)).length;
    expect(before).toBe(1); // the signing mail from distribute
    const due = new Date(Date.now() - 60_000);
    await setRecipientNextReminderAt(w, target.recipientId, due, "P2-DOC-REM-001");
    // Wait for the real condition: the sweep sends one reminder (one quarter-hour tick).
    await expect
      .poll(async () => (await listMail(mailbox)).length, {
        timeout: tickDeadlineMs(Date.now()) + 60_000,
        intervals: [TICK_POLL_MS],
        message: "one reminder after one tick",
      })
      .toBe(before + 1);
    const next = await db.select<{ nextReminderAt: Date | null }>(
      `SELECT "nextReminderAt" AS "nextReminderAt" FROM "Recipient" WHERE "id" = $1`,
      [target.recipientId],
    );
    expect(next[0]?.nextReminderAt).not.toBeNull();
    expect((next[0]?.nextReminderAt?.getTime() ?? 0) > due.getTime()).toBe(true);
    const mails = await listMail(mailbox);
    const latest = mails[0];
    if (latest === undefined) throw new Error("TEST BUG: no mail listed");
    expect(await bodyOf(mailbox, latest.id)).toContain(target.token);
  } finally {
    await w.close();
    await doc.envelopes.remove(env.envelopeId);
  }
});

test("P2-DOC-REM-002 a recipient who signed gets no reminder (one cron tick)", async ({
  doc,
  request,
  docAuth,
}) => {
  const runPrefix = currentRunPrefix();
  const db = readOnlyDb("documenso");
  const w = documensoFixtureWriter(runPrefix);
  const env = await distributedEnvelope({
    label: "rem-002",
    signers: 2,
    doc,
    request,
    authorization: () => docAuth.headerValue.reveal(),
    db,
    runPrefix,
  });
  try {
    const [signed, pending] = env.prepared.signers;
    if (signed === undefined || pending === undefined)
      throw new Error("TEST BUG: need two signers");
    // The first recipient completes (signed); the second stays pending and is due for a reminder.
    expect(await completeRecipient(env.http, env.prepared, signed)).toBe(200);
    const signedMailbox = mailboxOf(signed.email);
    const pendingMailbox = mailboxOf(pending.email);
    const signedBefore = (await listMail(signedMailbox)).length;
    const pendingBefore = (await listMail(pendingMailbox)).length;
    await setRecipientNextReminderAt(
      w,
      signed.recipientId,
      new Date(Date.now() - 60_000),
      "P2-DOC-REM-002",
    );
    await setRecipientNextReminderAt(
      w,
      pending.recipientId,
      new Date(Date.now() - 60_000),
      "P2-DOC-REM-002",
    );
    // The sweep has run when the pending recipient gets its reminder; only then is the signed count checked.
    await expect
      .poll(async () => (await listMail(pendingMailbox)).length, {
        timeout: tickDeadlineMs(Date.now()) + 60_000,
        intervals: [TICK_POLL_MS],
        message: "pending recipient reminded",
      })
      .toBe(pendingBefore + 1);
    expect((await listMail(signedMailbox)).length).toBe(signedBefore);
  } finally {
    await w.close();
    await doc.envelopes.remove(env.envelopeId);
  }
});
