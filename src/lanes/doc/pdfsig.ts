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
