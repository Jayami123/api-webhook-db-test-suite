import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ApiRequestLike } from "../../../../src/clients/base.ts";
import type { ReadOnlyDb } from "../../../../src/db/pg.ts";
import {
  createSignableEnvelope,
  documentIdOf,
  v2Post,
  type LaneHttp,
} from "../../../../src/lanes/doc/envelope.ts";

interface Sent {
  url: string;
  headers: Record<string, string> | undefined;
}

function fakeHttp(status: number, sent: Sent[]): LaneHttp {
  const request: ApiRequestLike = {
    fetch: (url, options) => {
      sent.push({ url, headers: options?.headers });
      return Promise.resolve({
        status: () => status,
        headers: () => ({}),
        text: () => Promise.resolve(status === 200 ? "{}" : "refused"),
      });
    },
  };
  return { request, baseUrl: "http://127.0.0.1:3001", authorization: () => "Bearer unit-fake" };
}

/** Returns recipient rows for the first query, the envelope row for the second, fields for the third. */
function fakeDb(): ReadOnlyDb {
  const answers: unknown[][] = [
    [{ id: 7, email: "a@x.test", token: "t1" }],
    [{ secondaryId: "document_1025" }],
    [
      { id: 3, recipientId: 7, type: "DATE" },
      { id: 4, recipientId: 7, type: "SIGNATURE" },
    ],
  ];
  return {
    product: "documenso",
    select: () => Promise.resolve((answers.shift() ?? []) as never),
    close: () => Promise.resolve(),
  };
}

describe("envelope helpers (P-DOC-9)", () => {
  test("v2Post sends the Authorization header from the caller", async () => {
    const sent: Sent[] = [];
    const out = await v2Post(fakeHttp(200, sent), "/api/v2/envelope/distribute", {
      envelopeId: "e",
    });
    assert.equal(out.status, 200);
    assert.equal(sent[0]?.headers?.authorization, "Bearer unit-fake");
  });

  test("createSignableEnvelope is a TEST BUG when field create-many is not 200", async () => {
    await assert.rejects(
      createSignableEnvelope({ http: fakeHttp(400, []), db: fakeDb(), envelopeId: "envelope_1" }),
      /TEST BUG: field create-many 400/,
    );
  });

  test("documentIdOf parses document_1025 to 1025 and rejects a value without the prefix", () => {
    assert.equal(documentIdOf("document_1025"), 1025);
    assert.throws(
      () => documentIdOf("1025"),
      /TEST BUG: envelope secondaryId has no document_ prefix/,
    );
  });
});
