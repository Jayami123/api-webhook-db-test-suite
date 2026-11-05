/**
 * Evidence for one CSV address after N bulk jobs: the signing tokens of its mails and the tokens of the
 * envelopes (Recipient.token) created for it. The mail token is the /sign/<token> segment (mail.ts).
 */
export interface AddressEvidence {
  readonly mailTokens: readonly string[];
  readonly envelopeTokens: readonly string[];
}

/**
 * Master plan P2-DOC-BULK-002: "no duplicate emails to the same recipient for the same job id".
 * One mail per recipient per job: for each address there is exactly one mail per job, the mail tokens are
 * distinct, and the set of mail tokens equals the set of that address's envelope tokens.
 * Returns the problems found (empty = pass). Problems name the address index, never a token or address.
 */
export function bulkJobProblems(rows: readonly AddressEvidence[], jobs: number): string[] {
  const problems: string[] = [];
  rows.forEach((row, index) => {
    const label = `address ${String(index + 1)}`;
    if (row.envelopeTokens.length !== jobs) {
      problems.push(
        `${label}: ${String(row.envelopeTokens.length)} envelopes, expected ${String(jobs)}`,
      );
    }
    if (row.mailTokens.length !== jobs) {
      problems.push(`${label}: ${String(row.mailTokens.length)} mails, expected ${String(jobs)}`);
    }
    if (new Set(row.mailTokens).size !== row.mailTokens.length) {
      problems.push(`${label}: a signing token was mailed more than once`);
    }
    const mailSet = [...new Set(row.mailTokens)].sort();
    const envSet = [...new Set(row.envelopeTokens)].sort();
    if (mailSet.length !== envSet.length || mailSet.some((t, i) => t !== envSet[i])) {
      problems.push(`${label}: mail tokens do not match the envelope tokens`);
    }
  });
  return problems;
}
