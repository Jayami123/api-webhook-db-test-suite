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

  test("accepts each event name the pinned emitter sends (created, updated, deleted, destroyed)", () => {
    for (const eventName of [
      "person.created",
      "person.updated",
      "person.deleted",
      "person.destroyed",
    ]) {
      assert.deepEqual(bodyErrors({ ...FULL, eventName }), [], eventName);
    }
  });

  test("rejects a name the pinned emitter does not send", () => {
    assert.notDeepEqual(bodyErrors({ ...FULL, eventName: "person.removed" }), []);
  });
});
