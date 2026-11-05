import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import { FixtureRefusedError, createFixtureWriter } from "../../../../src/db/fixture.ts";
import { FIXTURE_ALLOWLIST } from "../../../../src/db/fixture-allowlist.ts";
import { setRecipientExpiresAt } from "../../../../src/lanes/doc/fixtures.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fakePool() {
  const texts: string[] = [];
  return {
    texts,
    pool: {
      connect: () =>
        Promise.resolve({
          query: (config: { text: string }) => {
            texts.push(config.text);
            return Promise.resolve({ rowCount: config.text.startsWith("UPDATE") ? 1 : null });
          },
          release: () => undefined,
        }),
      end: () => Promise.resolve(),
    },
  };
}

function writer() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "p2-doc-fixture-"));
  dirs.push(dir);
  const fake = fakePool();
  const w = createFixtureWriter({
    product: "documenso",
    logFile: path.join(dir, "fixture.jsonl"),
    pool: fake.pool,
    now: () => new Date("2026-11-02T10:00:00.000Z"),
  });
  return { w, texts: fake.texts };
}

describe("documenso fixture wrapper (qa_fixture allow-list)", () => {
  test("a caseId outside the allow-list is refused and nothing is written", async () => {
    const { w, texts } = writer();
    await assert.rejects(
      setRecipientExpiresAt(w, 1, new Date("2026-11-02T10:01:00.000Z"), "P2-DOC-NOT-LISTED"),
      FixtureRefusedError,
    );
    assert.deepEqual(texts, []);
  });

  test("an allow-listed case updates Recipient.expiresAt by primary key", async () => {
    assert.ok(
      FIXTURE_ALLOWLIST.documenso.some(
        (e) =>
          e.table === "Recipient" && e.column === "expiresAt" && e.cases.includes("P2-DOC-EXP-001"),
      ),
    );
    const { w, texts } = writer();
    await setRecipientExpiresAt(w, 42, new Date("2026-11-02T10:01:00.000Z"), "P2-DOC-EXP-001");
    assert.ok(
      texts.some((t) => t === `UPDATE "Recipient" SET "expiresAt" = $1 WHERE "id" = $2`),
      `no UPDATE on Recipient.expiresAt in: ${JSON.stringify(texts)}`,
    );
  });
});
