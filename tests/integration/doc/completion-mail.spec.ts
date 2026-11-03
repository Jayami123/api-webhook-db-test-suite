import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { loadAuthEnv } from "../../../src/auth/env.ts";
import { bodyOf, listMail, mailboxOf } from "../../../src/lanes/doc/mail.ts";
import { completeRecipient, signField } from "../../../src/lanes/doc/envelope.ts";
import { currentRunPrefix, runScopedName } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";
import { holdQuiet } from "../../fixtures/doc/quiet-window.ts";
import { distributedEnvelope } from "../../fixtures/doc/distributed-envelope.ts";

/**
 * MAIL-002 (master plan): "Completed email after the last signature", priority P2. Both sign; then exactly one
 * completion mail reaches the owner, and exactly one reaches each recipient, under the fork's default email
 * settings (DEFAULT_DOCUMENT_EMAIL_SETTINGS: documentCompleted and ownerDocumentCompleted true,
 * packages/lib/types/document-email.ts:83-93).
 *
 * The completion mail is the one whose body says the document "was signed by all signers" (observed in the probe
 * 2026-11-03). Per-signer "has signed" notices to the owner are not counted. The owner's mailbox is shared
 * across tests, so only mails that carry this run's envelope title are counted.
 */
test("P2-DOC-MAIL-002 one completed email to the owner and one to each recipient after the last signature", async ({
  doc,
  request,
  docAuth,
}) => {
  const runPrefix = currentRunPrefix();
  const db = readOnlyDb("documenso");
  const env = await distributedEnvelope({
    label: "mail-002",
    signers: 2,
    doc,
    request,
    authorization: () => docAuth.headerValue.reveal(),
    db,
    runPrefix,
  });
  try {
    for (const signer of env.prepared.signers) {
      expect(await signField(env.http, signer)).toBe(200);
      expect(await completeRecipient(env.http, env.prepared, signer)).toBe(200);
    }
    await expect
      .poll(
        async () =>
          (
            await db.select<{ s: string }>(`SELECT "status" AS s FROM "Envelope" WHERE "id" = $1`, [
              env.envelopeId,
            ])
          )[0]?.s,
        { timeout: SLO.docWebhookDelivery.ms, intervals: POLL_INTERVALS, message: "COMPLETED" },
      )
      .toBe("COMPLETED");

    const title = runScopedName("mail-002");
    const completedCount = async (address: string): Promise<number> => {
      let n = 0;
      const box = mailboxOf(address);
      for (const m of await listMail(box)) {
        const text = await bodyOf(box, m.id);
        if (text.includes(title) && text.includes("was signed by all signers")) n += 1;
      }
      return n;
    };
    const owner = loadAuthEnv().P2_DOC_USER_EMAIL;
    // Exactly one per mailbox, held after a quiet window so a late second completion mail is seen.
    await expect
      .poll(() => completedCount(owner), {
        timeout: SLO.docWebhookDelivery.ms,
        intervals: POLL_INTERVALS,
        message: "owner completion mail",
      })
      .toBe(1);
    await holdQuiet(
      () => completedCount(owner),
      1,
      SLO.docJobQuiet.ms,
      "no second owner completion mail",
    );
    for (const signer of env.prepared.signers) {
      await expect
        .poll(() => completedCount(signer.email), {
          timeout: SLO.docWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
          message: "recipient completion mail",
        })
        .toBe(1);
      await holdQuiet(
        () => completedCount(signer.email),
        1,
        SLO.docJobQuiet.ms,
        "no second recipient completion mail",
      );
    }
  } finally {
    await doc.envelopes.remove(env.envelopeId);
  }
});
