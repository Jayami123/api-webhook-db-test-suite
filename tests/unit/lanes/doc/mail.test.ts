import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { listMail, mailboxOf, signingTokenIn } from "../../../../src/lanes/doc/mail.ts";

describe("mail helpers (P-DOC-10)", () => {
  test("mailboxOf lower-cases the local part and keeps no domain", () => {
    assert.equal(mailboxOf("A.B@x.test"), "a.b");
  });

  test("signingTokenIn finds the /sign/<token> segment and is undefined without it", () => {
    assert.equal(signingTokenIn("open https://app.test/sign/tok_AB-12 now"), "tok_AB-12");
    assert.equal(signingTokenIn("no link in this body"), undefined);
  });

  test("listMail returns no mail for a mailbox that does not exist (404)", async () => {
    const fake = (() => Promise.resolve(new Response("", { status: 404 }))) as typeof fetch;
    assert.deepEqual(await listMail("nobody", fake), []);
  });

  test("listMail maps the Inbucket ids", async () => {
    const body = JSON.stringify([{ id: "m1" }, { id: "m2" }]);
    const fake = (() => Promise.resolve(new Response(body, { status: 200 }))) as typeof fetch;
    assert.deepEqual(await listMail("alice", fake), [{ id: "m1" }, { id: "m2" }]);
  });
});
