import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { parsePdfsig } from "../../../../src/lanes/doc/pdfsig.ts";

const fixture = (name: string): string =>
  readFileSync(path.join("tests", "fixtures", "doc", name), "utf8");

describe("parsePdfsig (pdfsig 24.02 output, captured in tests/fixtures/doc)", () => {
  test("a valid sealed signature parses to 'Signature is Valid.'", () => {
    const verdict = parsePdfsig(fixture("pdfsig-valid.txt"));
    assert.ok(verdict.signed, "expected a signature block");
    assert.equal(verdict.validation, "Signature is Valid.");
  });

  test("a one-byte change inside the signed range parses to 'Digest Mismatch.'", () => {
    const verdict = parsePdfsig(fixture("pdfsig-digest-mismatch.txt"));
    assert.ok(verdict.signed, "expected a signature block");
    assert.equal(verdict.validation, "Digest Mismatch.");
  });

  test("an unsigned PDF gives signed: false", () => {
    assert.deepEqual(parsePdfsig(fixture("pdfsig-unsigned.txt")), { signed: false });
  });

  test("a signature block with no Signature Validation line is a TEST BUG, not a pass", () => {
    const text = "Signature #1:\n  - Signer Certificate Common Name: CN=Documenso\n";
    assert.throws(
      () => parsePdfsig(text),
      /TEST BUG: pdfsig output has no Signature Validation line/,
    );
  });
});
