/** Inbucket REST base, exported by the harness (v0.3.1, `documensoMailApiUrl`; config.ts:14). */
export const INBUCKET_REST = "http://127.0.0.1:9003/api/v1/mailbox";

export interface MailSummary {
  readonly id: string;
}

/** Inbucket mailbox name: the lower-cased local part of the address (P-DOC-10). */
export function mailboxOf(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) throw new Error(`TEST BUG: not an address: ${email.length} chars`);
  return email.slice(0, at).toLowerCase();
}

/** The signing token is the /sign/<token> segment of the mail body (P-DOC-10). */
export function signingTokenIn(text: string): string | undefined {
  return /\/sign\/([A-Za-z0-9_-]+)/.exec(text)?.[1];
}

export async function listMail(
  mailbox: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MailSummary[]> {
  const res = await fetchImpl(`${INBUCKET_REST}/${encodeURIComponent(mailbox)}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Inbucket list ${res.status}`);
  return ((await res.json()) as { id: string }[]).map((m) => ({ id: m.id }));
}

export async function bodyOf(
  mailbox: string,
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(
    `${INBUCKET_REST}/${encodeURIComponent(mailbox)}/${encodeURIComponent(id)}`,
  );
  const json = (await res.json()) as { body?: { text?: string; html?: string } };
  return `${json.body?.text ?? ""}${json.body?.html ?? ""}`;
}
