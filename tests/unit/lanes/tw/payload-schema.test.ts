import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bodyErrors } from "../../../../src/lanes/tw/payload-schema.ts";

const FULL = {
  targetUrl: "http://127.0.0.1:4317/r/run/tw-sign",
  eventName: "person.created",
  objectMetadata: { id: "obj-1", nameSingular: "person" },
  workspaceId: "ws-1",
  webhookId: "wh-1",
  eventDate: "2026-11-02T10:00:00.000Z",
  record: { id: "p-1" },
};

describe("twenty body schema", () => {
  test("accepts a body with every required key", () => {
    assert.deepEqual(bodyErrors(FULL), []);
  });

  test("reports the missing record id", () => {
    assert.deepEqual(bodyErrors({ ...FULL, record: {} }), [
      "/record must have required property 'id'",
    ]);
  });
});
