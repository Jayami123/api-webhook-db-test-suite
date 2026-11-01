/**
 * Header redaction shared by the receiver log and (later) trace/report redaction.
 * Values of these headers are credentials or signatures. They are replaced by a fixed marker that
 * keeps only the length, so a log still shows "a 64-char value was present".
 */
export const SECRET_HEADER_NAMES: ReadonlySet<string> = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-cal-signature-256", // sendPayload.ts:316
  "x-documenso-secret", // execute-webhook-call.ts: headers block
  "x-twenty-webhook-signature", // call-webhook.job.ts: headers[...Signature]
  "x-webhook-signature", // recorded-daily-video/route.ts:73
  "stripe-signature",
]);

export function redactHeaderValue(value: string): string {
  return `<redacted:${String(value.length)}>`;
}

/** Lower-cases names, joins repeated values with ", ", redacts secret headers. Pure. */
export function redactHeaders(
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(headers)) {
    if (rawValue === undefined) continue;
    const name = rawName.toLowerCase();
    const value = typeof rawValue === "string" ? rawValue : rawValue.join(", ");
    out[name] = SECRET_HEADER_NAMES.has(name) ? redactHeaderValue(value) : value;
  }
  return out;
}
