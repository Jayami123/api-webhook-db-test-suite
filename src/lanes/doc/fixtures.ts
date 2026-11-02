import {
  createFixtureWriter,
  defaultFixtureLogFile,
  type FixtureWriter,
} from "../../db/fixture.ts";

/** Time travel only through qa_fixture, on allow-listed columns, with the caseId checked by the writer. */
export function documensoFixtureWriter(runPrefix: string): FixtureWriter {
  return createFixtureWriter({ product: "documenso", logFile: defaultFixtureLogFile(runPrefix) });
}

/** caseId must be one of the allow-list entry's cases (fixture-allowlist.ts); the writer refuses otherwise. */
export async function setRecipientExpiresAt(
  w: FixtureWriter,
  recipientId: number,
  at: Date,
  caseId: string,
): Promise<void> {
  await w.update({ table: "Recipient", column: "expiresAt", pk: recipientId, value: at, caseId });
}

export async function setRecipientNextReminderAt(
  w: FixtureWriter,
  recipientId: number,
  at: Date,
  caseId: string,
): Promise<void> {
  await w.update({
    table: "Recipient",
    column: "nextReminderAt",
    pk: recipientId,
    value: at,
    caseId,
  });
}
