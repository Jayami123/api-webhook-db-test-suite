import { test, expect } from "../../../src/fixtures/index.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import { loadAuthEnv } from "../../../src/auth/env.ts";
import { twentyClient, type TwentyClient } from "../../../src/clients/twenty.ts";
import type { TwentyAuth } from "../../../src/auth/twenty.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { requireTwEnv } from "../../../src/lanes/tw/gates.ts";
import { deliveriesOf } from "../../../src/lanes/tw/visible.ts";
import { awaitCanary } from "../../../src/lanes/tw/waits.ts";
import { quietState } from "../../../src/lanes/tw/quiet.ts";
import { createFreshWebhook, type FreshWebhook } from "../../../src/lanes/tw/webhook-factory.ts";
import {
  activateSecondWorkspace,
  createSecondWorkspace,
  mintKeyForWorkspace,
  softDeleteSecondWorkspace,
  type SecondWorkspace,
} from "../../../src/lanes/tw/second-workspace.ts";
import { metadataGql, exchangeToken } from "../../../src/lanes/tw/workspaces.ts";
import {
  POLL_INTERVALS,
  TW_QUIET_TIMEOUT_MS,
  TW_QUIET_WINDOW_MS,
} from "../../../src/lanes/tw/slo.ts";
import { runScopedName, currentRunPrefix } from "../../../src/run/prefix.ts";
import { runAllThenRethrow } from "../../../src/shared/cleanup.ts";
import { tenantCleanupSteps } from "../../../src/lanes/tw/cleanup-steps.ts";

/** Signs the test user in to the first workspace and returns a workspace token that can create workspaces. */
async function userToken(base: string): Promise<string> {
  const env = loadAuthEnv();
  const signIn = await metadataGql(
    base,
    "mutation($e:String!,$p:String!){ signIn(email:$e,password:$p){ availableWorkspaces{ availableWorkspacesForSignIn{ loginToken workspaceUrls{ subdomainUrl } } } } }",
    { e: env.TWENTY_EMAIL, p: env.TWENTY_PASSWORD },
  );
  if (signIn.body.errors !== undefined)
    throw new Error(`ENV or TEST BUG: sign in: ${JSON.stringify(signIn.body.errors)}`);
  const first = (
    signIn.body.data as {
      signIn: {
        availableWorkspaces: {
          availableWorkspacesForSignIn: {
            loginToken: string;
            workspaceUrls: { subdomainUrl: string };
          }[];
        };
      };
    }
  ).signIn.availableWorkspaces.availableWorkspacesForSignIn[0];
  if (first === undefined) throw new Error("ENV or TEST BUG: sign-in returned no workspace");
  return exchangeToken(base, first.loginToken, first.workspaceUrls.subdomainUrl);
}

test("P2-TW-WH-009 @multiws: a webhook delivers only inside its own workspace", async ({
  tw,
  request,
  receiverHandle,
}) => {
  // Locally a missing flag skips with the reason; in CI (the tw-multiws job) it fails (review addendum A7).
  const gate = requireTwEnv("IS_MULTIWORKSPACE_ENABLED", "true");
  test.skip(gate.skip, gate.reason);

  const base = apiBaseUrl("twenty");
  const receiver = receiverHandle.receiver;
  const keyA = receiverHandle.key("tw-tenant-a");
  const keyB = receiverHandle.key("tw-tenant-b");
  const createdInA: string[] = [];
  const createdInB: string[] = [];
  const hookA: FreshWebhook = await createFreshWebhook({
    tw,
    receiverHandle,
    testId: "tw-tenant-a",
    operations: ["person.created"],
  });
  let ws: SecondWorkspace | undefined;
  let keyBAuth: TwentyAuth | undefined;
  let twB: TwentyClient | undefined;
  let hookB: FreshWebhook | undefined;
  let deletedB = false;
  let activatedB = false;
  try {
    // Canary for A (A's own webhook, in A).
    createdInA.push(
      ...(await awaitCanary({ tw, receiver, key: keyA, createdAtMs: Date.now() })).personIds,
    );

    // Setup, asserted: the second workspace exists, is activated, and has its own key.
    ws = await createSecondWorkspace(base, await userToken(base));
    const token = await activateSecondWorkspace(base, ws);
    activatedB = true;
    expect(token, "setup: activation returned a workspace token").toEqual(expect.any(String));
    keyBAuth = await mintKeyForWorkspace(base, ws, runScopedName("tw-tenant-key-b"));
    expect(await keyBAuth.isAccepted(), "setup: B's key is accepted by B").toBe(true);
    twB = twentyClient({ request, baseUrl: base, runPrefix: currentRunPrefix(), auth: keyBAuth });

    // Canary for B (B's own webhook, in B): B's map is warm before the mutation in A.
    hookB = await createFreshWebhook({
      tw: twB,
      receiverHandle,
      testId: "tw-tenant-b",
      operations: ["person.created"],
    });
    createdInB.push(
      ...(await awaitCanary({ tw: twB, receiver, key: keyB, createdAtMs: Date.now() })).personIds,
    );

    // The mutation: one person in A.
    const eventInA = await tw.people.create(runScopedName("tw-tenant-evt"));
    createdInA.push(eventInA);

    // Oracle: A's receiver gets exactly one, and B's receiver gets none, over the quiet window.
    const startedA = Date.now();
    await expect
      .poll(
        () =>
          quietState({
            count: deliveriesOf(receiver, keyA, eventInA).length,
            expected: 1,
            startedMs: startedA,
            nowMs: Date.now(),
            windowMs: TW_QUIET_WINDOW_MS,
          }),
        {
          timeout: TW_QUIET_TIMEOUT_MS,
          intervals: POLL_INTERVALS,
          message: "A receives the event once",
        },
      )
      .toBe("quiet");
    const startedB = Date.now();
    await expect
      .poll(
        () =>
          quietState({
            count: deliveriesOf(receiver, keyB, eventInA).length,
            expected: 0,
            startedMs: startedB,
            nowMs: Date.now(),
            windowMs: TW_QUIET_WINDOW_MS,
          }),
        {
          timeout: TW_QUIET_TIMEOUT_MS,
          intervals: POLL_INTERVALS,
          message: "B receives nothing from A",
        },
      )
      .toBe("quiet");
  } finally {
    // One step per resource (src/shared/cleanup.ts): a failed hook removal or key revoke still deletes workspace B.
    const wsB = ws;
    const clientB = twB;
    await runAllThenRethrow(
      tenantCleanupSteps({
        createdInA,
        removeInA: (id) => tw.people.remove(id),
        createdInB,
        removeInB: clientB === undefined ? undefined : (id) => clientB.people.remove(id),
        hookA,
        hookB,
        keyB: keyBAuth,
        deleteWorkspaceB:
          wsB === undefined
            ? undefined
            : async () => {
                // A pending workspace cannot be deleted through the product (probe record, B-P16 and BUG-004). If
                // setup never activated it, activate it first, so a failure is reported as the setup cause and not
                // as a delete error.
                if (!activatedB) await activateSecondWorkspace(base, wsB);
                await softDeleteSecondWorkspace(base, wsB);
                deletedB = true;
              },
      }),
    );
    if (wsB !== undefined) {
      // Teardown, asserted after every cleanup step ran: B's row keeps deletedAt (soft delete), then the delete ran.
      const rows = await readOnlyDb("twenty").select<{ deletedAt: string | null }>(
        `SELECT "deletedAt"::text AS "deletedAt" FROM core.workspace WHERE id = $1`,
        [wsB.id],
      );
      expect(rows[0]?.deletedAt, "teardown: B is soft-deleted").not.toBeNull();
      expect(deletedB, "teardown: deleteCurrentWorkspace ran").toBe(true);
    }
  }
});
