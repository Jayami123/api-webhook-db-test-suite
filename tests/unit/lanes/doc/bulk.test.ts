import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bulkJobProblems } from "../../../../src/lanes/doc/bulk.ts";

describe("bulkJobProblems (P2-DOC-BULK-002: one mail per recipient per job)", () => {
  test("two jobs, one mail per job per address, tokens equal the envelope tokens: no problem", () => {
    const rows = [
      { mailTokens: ["t1", "t2"], envelopeTokens: ["t2", "t1"] },
      { mailTokens: ["t3", "t4"], envelopeTokens: ["t3", "t4"] },
    ];
    assert.deepEqual(bulkJobProblems(rows, 2), []);
  });

  test("a repeated signing token (the same mail counted twice) is reported", () => {
    const rows = [{ mailTokens: ["t1", "t1"], envelopeTokens: ["t1", "t2"] }];
    const problems = bulkJobProblems(rows, 2);
    assert.ok(problems.some((p) => p.includes("mailed more than once")));
  });

  test("a missing mail for the second job is reported", () => {
    const rows = [{ mailTokens: ["t1"], envelopeTokens: ["t1", "t2"] }];
    assert.ok(bulkJobProblems(rows, 2).some((p) => p.includes("1 mails, expected 2")));
  });

  test("a mail whose token belongs to no envelope of the address is reported", () => {
    const rows = [{ mailTokens: ["t1", "tX"], envelopeTokens: ["t1", "t2"] }];
    assert.ok(bulkJobProblems(rows, 2).some((p) => p.includes("do not match")));
  });
});
