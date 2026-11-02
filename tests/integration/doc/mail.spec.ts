import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { bodyOf, listMail, mailboxOf, signingTokenIn } from "../../../src/lanes/doc/mail.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";
import { distributedEnvelope } from "../../fixtures/doc/distributed-envelope.ts";

test("P2-DOC-MAIL-001 each recipient gets exactly one signing mail carrying its own token", async ({
  doc,
  request,
  docAuth,
}) => {
  const runPrefix = currentRunPrefix();
  const db = readOnlyDb("documenso");
  const env = await distributedEnvelope({
    label: "mail-001",
    signers: 2,
    doc,
    request,
    authorization: () => docAuth.headerValue.reveal(),
    db,
    runPrefix,
  });
  try {
    for (const signer of env.prepared.signers) {
      const mailbox = mailboxOf(signer.email);
      // Wait on the real condition: the signing mail has arrived (Inbucket REST, P-DOC-10).
      await expect
        .poll(async () => (await listMail(mailbox)).length, {
          timeout: SLO.docWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
          message: "one signing mail",
        })
        .toBe(1);
      const [mail] = await listMail(mailbox);
      if (mail === undefined) throw new Error("TEST BUG: mail listed then missing");
      const text = await bodyOf(mailbox, mail.id);
      expect(signingTokenIn(text)).toBe(signer.token);
    }
  } finally {
    await doc.envelopes.remove(env.envelopeId);
  }
});
