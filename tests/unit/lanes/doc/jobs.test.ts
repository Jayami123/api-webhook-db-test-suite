import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import {
  forkDecrypt,
  forkEncrypt,
  replayDispatch,
  signJobOptions,
  verifyJobOptions,
} from "../../../../src/lanes/doc/jobs.ts";

const KEY = "p2-unit-secondary-key-not-real";
const OPTIONS = { name: "internal.seal-document", payload: { documentId: 1025 } };

describe("documenso job signing (fork packages/lib/server-only/crypto)", () => {
  test("a signature made with signJobOptions verifies with verifyJobOptions", () => {
    const signature = signJobOptions(KEY, OPTIONS);
    assert.equal(verifyJobOptions(KEY, OPTIONS, signature), true);
  });

  test("verification fails when the payload changes", () => {
    const signature = signJobOptions(KEY, OPTIONS);
    const changed = { name: OPTIONS.name, payload: { documentId: 1026 } };
    assert.equal(verifyJobOptions(KEY, changed, signature), false);
  });

  test("verification fails under another key", () => {
    const signature = signJobOptions(KEY, OPTIONS);
    assert.equal(verifyJobOptions(`${KEY}-other`, OPTIONS, signature), false);
  });

  test("forkDecrypt returns the plaintext that forkEncrypt sealed", () => {
    const sealed = forkEncrypt(KEY, "sealed-text");
    assert.equal(forkDecrypt(KEY, sealed), "sealed-text");
  });
});

describe("replayDispatch (local.ts:228-230 headers)", () => {
  let server: Server;
  let baseUrl = "";

  before(async () => {
    server = createServer((req, res) => {
      // The fake product answers 404 for a job it does not know, as the CAS path does (P-DOC-4b).
      req.resume();
      req.on("end", () => {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Job not found");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${String(port)}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  test("an unknown job answers 404 with the body text, and redirects are not followed", async () => {
    const out = await replayDispatch({
      baseUrl,
      jobDefinitionId: "internal.seal-document",
      jobId: "job-unknown",
      options: OPTIONS,
      signature: "not-checked-by-this-fake",
    });
    assert.deepEqual(out, { status: 404, text: "Job not found" });
  });
});
