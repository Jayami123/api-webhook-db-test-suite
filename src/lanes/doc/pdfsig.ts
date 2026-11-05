import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export type PdfsigVerdict =
  | { readonly signed: false }
  | {
      readonly signed: true;
      /** The text after "Signature Validation:" (pdfsig 24.02 prints "Signature is Valid." or "Digest Mismatch."). */
      readonly validation: string;
      readonly commonName: string | undefined;
      readonly signedRanges: string | undefined;
    };

/** Parses `pdfsig` stdout. Pure, so the unit tests use captured output (tests/fixtures/doc/pdfsig-*.txt). */
export function parsePdfsig(stdout: string): PdfsigVerdict {
  if (!/^Signature #1:/m.test(stdout)) return { signed: false };
  const validation = /Signature Validation:\s*(.+)$/m.exec(stdout)?.[1]?.trim();
  if (validation === undefined)
    throw new Error("TEST BUG: pdfsig output has no Signature Validation line");
  const commonName = /Signer Certificate Common Name:\s*(.+)$/m.exec(stdout)?.[1]?.trim();
  const signedRanges = /Signed Ranges:\s*(.+)$/m.exec(stdout)?.[1]?.trim();
  return { signed: true, validation, commonName, signedRanges };
}

/**
 * Runs pdfsig on a file. A non-zero exit with output is still parsed: pdfsig exits non-zero for some
 * unsigned files. A missing binary is an ENV error, not an unsigned file.
 */
export async function runPdfsig(file: string): Promise<PdfsigVerdict> {
  const out = await run("pdfsig", [file]).then(
    (r) => r.stdout,
    (e: unknown) => {
      if (e instanceof Error && "code" in e && e.code === "ENOENT")
        throw new Error("ENV: pdfsig is not installed (poppler-utils)");
      return e instanceof Error && "stdout" in e && typeof e.stdout === "string" ? e.stdout : "";
    },
  );
  return parsePdfsig(out);
}

/**
 * A8: the /ByteRange of the first signature: [o1 l1 o2 l2]. The signed bytes are [o1, o1+l1) and [o2, o2+l2);
 * the gap between them holds the /Contents signature. Pure: the caller passes the file bytes.
 */
export function parseByteRange(pdf: Buffer): [number, number, number, number] | undefined {
  const m = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(pdf.toString("latin1"));
  if (m === null) return undefined;
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

/** True when a byte offset lies inside one of the two signed ranges (not in the signature gap). */
export function offsetIsSigned(pdf: Buffer, offset: number): boolean {
  const range = parseByteRange(pdf);
  if (range === undefined) return false;
  const [o1, l1, o2, l2] = range;
  return (offset >= o1 && offset < o1 + l1) || (offset >= o2 && offset < o2 + l2);
}

/** The DER length of the outermost SEQUENCE at the start of `der` (the /Contents is padded with zero bytes). */
export function derSequenceLength(der: Buffer): number | undefined {
  if (der[0] !== 0x30) return undefined;
  const first = der[1];
  if (first === undefined) return undefined;
  if (first < 0x80) return 2 + first;
  const n = first & 0x7f;
  let len = 0;
  for (let i = 0; i < n; i += 1) len = len * 256 + (der[2 + i] ?? 0);
  return 2 + n + len;
}

/**
 * The PKCS#7 blob of the first signature, trimmed to its DER length (A8: the signer certificate source).
 * The hex sits in the gap between the two signed ranges (/ByteRange), inside `<` and `>`.
 */
export function signatureContents(pdf: Buffer): Buffer | undefined {
  const range = parseByteRange(pdf);
  if (range === undefined) return undefined;
  const [, l1, o2] = range;
  const gap = pdf.subarray(l1, o2).toString("latin1");
  const hex = /<([0-9A-Fa-f]+)>/.exec(gap)?.[1];
  if (hex === undefined) return undefined;
  const raw = Buffer.from(hex, "hex");
  const length = derSequenceLength(raw);
  return length === undefined ? undefined : raw.subarray(0, length);
}
