import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  offsetIsSigned,
  parseByteRange,
  signatureContents,
} from "../../../../src/lanes/doc/pdfsig.ts";

/** A toy PDF tail: signed [0,100) and [200,250); the gap [100,200) holds the /Contents. */
const toy = Buffer.from(
  "%PDF-1.7\n" + "x".repeat(40) + "/ByteRange [0 100 200 50]/Contents <00ff>" + "y".repeat(120),
  "latin1",
);

describe("parseByteRange and offsetIsSigned (A8: the flipped byte must be signed)", () => {
  test("the ByteRange is read from the file", () => {
    assert.deepEqual(parseByteRange(toy), [0, 100, 200, 50]);
  });

  test("an offset inside a signed range is signed; the gap and the tail are not", () => {
    assert.equal(offsetIsSigned(toy, 10), true);
    assert.equal(offsetIsSigned(toy, 220), true);
    assert.equal(offsetIsSigned(toy, 150), false, "inside the /Contents gap");
    assert.equal(offsetIsSigned(toy, 260), false, "after the second range");
  });

  test("a file without a ByteRange is not signed at any offset", () => {
    const plain = Buffer.from("%PDF-1.4 plain", "latin1");
    assert.equal(parseByteRange(plain), undefined);
    assert.equal(offsetIsSigned(plain, 3), false);
  });
});

describe("signatureContents (A8: the PKCS#7 blob, trimmed to its DER length)", () => {
  test("the hex in the gap is decoded and trimmed to the outer SEQUENCE length", () => {
    const der = Buffer.from([0x30, 0x03, 0x02, 0x01, 0x05]); // SEQUENCE { INTEGER 5 }
    const gapBody = Buffer.concat([der, Buffer.alloc(20)]).toString("hex"); // zero padding after the DER
    const gap = Buffer.from(`<${gapBody}>`, "latin1");
    const second = 60 + gap.length;
    const signedA = Buffer.from(`/ByteRange [0 60 ${second} 10]`.padEnd(60, " "), "latin1");
    const signedB = Buffer.from("B".repeat(10), "latin1");
    const pdf = Buffer.concat([signedA, gap, signedB]);
    assert.deepEqual(parseByteRange(pdf), [0, 60, second, 10]);
    assert.deepEqual(signatureContents(pdf), der);
  });
});
