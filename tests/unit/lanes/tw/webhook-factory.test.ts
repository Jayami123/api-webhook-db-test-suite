import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import type { TwentyClient } from "../../../../src/clients/twenty.ts";
import type { ReceiverHandle } from "../../../../src/fixtures/index.ts";
import {
  createFreshWebhook,
  primeWorkspaceCache,
} from "../../../../src/lanes/tw/webhook-factory.ts";
import { runScopedName } from "../../../../src/run/prefix.ts";

const RUN = "p2-qa-20261102t000000z-deadbeef";

interface Calls {
  readonly created: {
    targetUrl: string;
    operations: string[];
    secret: string;
    description: string;
  }[];
  readonly removed: string[];
  readonly people: string[];
}

function fakes(): { tw: TwentyClient; handle: ReceiverHandle; calls: Calls } {
  const calls: Calls = { created: [], removed: [], people: [] };
  const tw = {
    people: {
      create: (firstName: string) => {
        calls.people.push(firstName);
        return Promise.resolve("person-1");
      },
      update: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    },
    webhooks: {
      create: (body: Calls["created"][number]) => {
        calls.created.push(body);
        return Promise.resolve("wh-1");
      },
      remove: (id: string) => {
        calls.removed.push(id);
        return Promise.resolve();
      },
    },
    raw: () => Promise.reject(new Error("unused")),
  } as unknown as TwentyClient;
  const handle = {
    urlFor: (testId: string) => `http://127.0.0.1:4317/r/${RUN}/${testId}`,
  } as unknown as ReceiverHandle;
  return { tw, handle, calls };
}

describe("webhook factory", () => {
  before(() => {
    process.env["P2_RUN_ID"] = RUN;
  });

  test("creates with the receiver URL, a per-run secret and the run-scoped description", async () => {
    const { tw, handle, calls } = fakes();
    const hook = await createFreshWebhook({
      tw,
      receiverHandle: handle,
      testId: "tw-sign",
      operations: ["person.created"],
    });
    assert.equal(hook.id, "wh-1");
    assert.equal(hook.url, `http://127.0.0.1:4317/r/${RUN}/tw-sign`);
    assert.match(hook.secret, /^[0-9a-f]{32}$/);
    assert.deepEqual(calls.created, [
      {
        targetUrl: hook.url,
        operations: ["person.created"],
        secret: hook.secret,
        description: runScopedName("tw-sign"),
      },
    ]);
  });

  test("remove deletes the webhook by its id", async () => {
    const { tw, handle, calls } = fakes();
    const hook = await createFreshWebhook({
      tw,
      receiverHandle: handle,
      testId: "tw-rm",
      operations: ["person.deleted"],
    });
    await hook.remove();
    assert.deepEqual(calls.removed, ["wh-1"]);
  });

  test("primeWorkspaceCache creates one person with the run-scoped name", async () => {
    const { tw, calls } = fakes();
    assert.equal(await primeWorkspaceCache(tw), "person-1");
    assert.deepEqual(calls.people, [runScopedName("tw-prime")]);
  });
});
