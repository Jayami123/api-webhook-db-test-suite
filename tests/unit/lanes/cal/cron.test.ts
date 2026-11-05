import assert from "node:assert/strict";
import { test } from "node:test";
import type { ApiRequestLike } from "../../../../src/clients/base.ts";
import { fireScheduledTriggersOnce, tasksAuthHeader } from "../../../../src/lanes/cal/cron.ts";

function recorder(status = 200): {
  request: ApiRequestLike;
  calls: { url: string; headers: Record<string, string> }[];
} {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const request: ApiRequestLike = {
    fetch: (url, options) => {
      calls.push({ url, headers: options?.headers ?? {} });
      return Promise.resolve({
        status: () => status,
        headers: () => ({}),
        text: () => Promise.resolve(""),
      });
    },
  };
  return { request, calls };
}

test("tasksAuthHeader returns Bearer followed by the secret", () => {
  assert.equal(tasksAuthHeader("abc123"), "Bearer abc123");
});

test("tasksAuthHeader refuses an empty or missing secret (TEST BUG, never Bearer undefined)", () => {
  assert.throws(() => tasksAuthHeader(undefined), /TEST BUG: CRON_SECRET is not set/);
  assert.throws(() => tasksAuthHeader("   "), /TEST BUG: CRON_SECRET is not set/);
});

test("the scheduled-trigger key is sent raw, with no Bearer prefix", async () => {
  const { request, calls } = recorder();
  const status = await fireScheduledTriggersOnce(request, "http://127.0.0.1:3000", "rawkey");
  assert.equal(status, 200);
  assert.equal(calls.at(0)?.url, "http://127.0.0.1:3000/api/cron/webhookTriggers");
  assert.equal(calls.at(0)?.headers["authorization"], "rawkey");
});
