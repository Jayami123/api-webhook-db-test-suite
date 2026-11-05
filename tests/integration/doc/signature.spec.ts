import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { productsRoot } from "../../../src/readiness/checks.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
import { offsetIsSigned, runPdfsig, signatureContents } from "../../../src/lanes/doc/pdfsig.ts";
import { completedEnvelope } from "../../fixtures/doc/completed-envelope.ts";

const run = promisify(execFile);
/** Sealing certificate the harness configures (harness src/adapters/documenso-env.ts:226-228), empty passphrase. */
const CERT_P12 = path.join(productsRoot(), "documenso", "apps", "remix", "example", "cert.p12");

/** SHA-256 fingerprint of the first certificate in a PEM file (openssl; "sha256 Fingerprint=AA:BB:...") */
async function sha256Of(pem: string): Promise<string> {
  const out = (await run("openssl", ["x509", "-noout", "-fingerprint", "-sha256", "-in", pem]))
    .stdout;
  return out.trim().replace(/^.*=/, "");
}

/** Offset inside the first signed range (pdfsig "Signed Ranges: [0 - 188925]" for the probed file). */
const FLIP_OFFSET = 1000;

test("P2-DOC-SIG-001 the sealed PDF signature is valid (pdfsig), with an unsigned control", async ({
  doc,
  request,
  docAuth,
}) => {
  const runPrefix = currentRunPrefix();
  const artefactDir = path.join("test-results", "doc-sig", runPrefix);
  const db = readOnlyDb("documenso");
  const done = await completedEnvelope({
    label: "sig-001",
    signers: 1,
    doc,
    request,
    authorization: () => docAuth.headerValue.reveal(),
    db,
    runPrefix,
  });
  try {
    mkdirSync(artefactDir, { recursive: true });
    const file = path.join(artefactDir, "sealed.pdf");
    writeFileSync(file, done.sealed);
    expect(await runPdfsig(file)).toMatchObject({
      signed: true,
      validation: "Signature is Valid.",
    });
    const control = path.join(productsRoot(), "documenso", "assets", "example.pdf");
    expect(await runPdfsig(control)).toEqual({ signed: false });
  } finally {
    await doc.envelopes.remove(done.envelopeId);
    rmSync(artefactDir, { recursive: true, force: true });
  }
});

test("P2-DOC-SIG-002 a flipped byte inside the signed range is reported as a digest mismatch", async ({
  doc,
  request,
  docAuth,
}) => {
  const runPrefix = currentRunPrefix();
  const artefactDir = path.join("test-results", "doc-sig", `${runPrefix}-002`);
  const db = readOnlyDb("documenso");
  const done = await completedEnvelope({
    label: "sig-002",
    signers: 1,
    doc,
    request,
    authorization: () => docAuth.headerValue.reveal(),
    db,
    runPrefix,
  });
  try {
    mkdirSync(artefactDir, { recursive: true });
    const original = path.join(artefactDir, "sealed.pdf");
    const flipped = path.join(artefactDir, "flipped.pdf");
    writeFileSync(original, done.sealed);
    const bytes = Buffer.from(done.sealed);
    // A8: the flipped byte must lie inside a signed range of the file's own /ByteRange, or the mismatch proves nothing.
    expect(offsetIsSigned(bytes, FLIP_OFFSET), "FLIP_OFFSET is not in a signed range").toBe(true);
    bytes[FLIP_OFFSET] = (bytes[FLIP_OFFSET] ?? 0) ^ 0x01;
    writeFileSync(flipped, bytes);
    // Control: the unmodified copy is still valid, so the flip is the only difference.
    expect(await runPdfsig(original)).toMatchObject({ validation: "Signature is Valid." });
    const verdict = await runPdfsig(flipped);
    expect(verdict.signed).toBe(true);
    expect(verdict.signed && verdict.validation).not.toBe("Signature is Valid.");
    expect(verdict.signed && verdict.validation).toMatch(/Digest Mismatch/);
  } finally {
    await doc.envelopes.remove(done.envelopeId);
    rmSync(artefactDir, { recursive: true, force: true });
  }
});

test("P2-DOC-SIG-003 the signer certificate CN equals the configured signing certificate", async ({
  doc,
  request,
  docAuth,
}) => {
  const runPrefix = currentRunPrefix();
  const artefactDir = path.join("test-results", "doc-sig", `${runPrefix}-003`);
  const db = readOnlyDb("documenso");
  const done = await completedEnvelope({
    label: "sig-003",
    signers: 1,
    doc,
    request,
    authorization: () => docAuth.headerValue.reveal(),
    db,
    runPrefix,
  });
  try {
    mkdirSync(artefactDir, { recursive: true });
    const file = path.join(artefactDir, "sealed.pdf");
    writeFileSync(file, done.sealed);
    const verdict = await runPdfsig(file);
    expect(verdict.signed).toBe(true);
    // The CN of the configured certificate file. The certificate is extracted to the artefact folder
    // (removed in finally) and read with openssl; the empty passphrase is the harness setting.
    const pemFile = path.join(artefactDir, "signing-cert.pem");
    await run("openssl", [
      "pkcs12",
      "-in",
      CERT_P12,
      "-nokeys",
      "-clcerts",
      "-passin",
      "pass:",
      "-out",
      pemFile,
    ]);
    const subject = (
      await run("openssl", ["x509", "-in", pemFile, "-noout", "-subject", "-nameopt", "RFC2253"])
    ).stdout;
    const cnOfFile = /CN=([^,\n]+)/.exec(subject)?.[1];
    expect(cnOfFile).toBeDefined();
    expect(verdict.signed && verdict.commonName).toBe(cnOfFile);
    // A8: the CN alone can match another certificate. Compare the SHA-256 fingerprint of the configured certificate
    // with the certificates inside the signature's own PKCS#7 blob (extracted with openssl).
    const blob = signatureContents(Buffer.from(done.sealed));
    expect(blob, "the PKCS#7 blob is found in the sealed PDF").toBeDefined();
    if (blob === undefined) throw new Error("TEST BUG: no signature blob");
    const derFile = path.join(artefactDir, "signature.der");
    const certsPem = path.join(artefactDir, "signature-certs.pem");
    writeFileSync(derFile, blob);
    await run("openssl", [
      "pkcs7",
      "-inform",
      "DER",
      "-in",
      derFile,
      "-print_certs",
      "-out",
      certsPem,
    ]);
    const blocks = readFileSync(certsPem, "utf8")
      .split("-----END CERTIFICATE-----")
      .filter((b) => b.includes("BEGIN CERTIFICATE"))
      .map((b) => `${b}-----END CERTIFICATE-----\n`);
    const signedFingerprints: string[] = [];
    for (const [i, block] of blocks.entries()) {
      const one = path.join(artefactDir, `signature-cert-${String(i)}.pem`);
      writeFileSync(one, block);
      signedFingerprints.push(await sha256Of(one));
    }
    expect(signedFingerprints.length).toBeGreaterThan(0);
    expect(signedFingerprints).toContain(await sha256Of(pemFile));
  } finally {
    await doc.envelopes.remove(done.envelopeId);
    rmSync(artefactDir, { recursive: true, force: true });
  }
});
