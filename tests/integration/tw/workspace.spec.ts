import { randomBytes } from "node:crypto";
import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import { loadAuthEnv } from "../../../src/auth/env.ts";
import { liveGate } from "../../../src/lanes/tw/gates.ts";
import { exchangeToken, metadataGql } from "../../../src/lanes/tw/workspaces.ts";
import { runScopedName } from "../../../src/run/prefix.ts";

/**
 * P2-TW-STR-002: workspace create and delete. It needs the multi-workspace stack (IS_MULTIWORKSPACE_ENABLED=true with
 * TWENTY_BASE_URL on a hostname, see docs/probes/2026-11-03-p2-lane-tw-probes.md, section STR-002). The default lane
 * excludes it by its @multiws tag. Outside that stack it is a gated skip with the blocker named.
 */
const multiWorkspace = (process.env["IS_MULTIWORKSPACE_ENABLED"] ?? "").trim() === "true";

test("P2-TW-STR-002: a new workspace is created, activated and soft-deleted, and its row keeps deletedAt @multiws", async () => {
  const gate = liveGate(
    "P2-TW-STR-002",
    multiWorkspace,
    "needs the multi-workspace stack: IS_MULTIWORKSPACE_ENABLED=true and TWENTY_BASE_URL on a hostname",
  );
  test.skip(gate.skip, gate.reason);

  const base = apiBaseUrl("twenty");
  const db = readOnlyDb("twenty");
  const countActive = async (): Promise<number> =>
    Number(
      (
        await db.select<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM core.workspace WHERE "deletedAt" IS NULL`,
        )
      )[0]?.n,
    );
  const rowOf = async (id: string) =>
    (
      await db.select<{
        activationStatus: string;
        defaultRoleId: string | null;
        deletedAt: string | null;
      }>(
        `SELECT "activationStatus", "defaultRoleId", "deletedAt"::text AS "deletedAt" FROM core.workspace WHERE id = $1`,
        [id],
      )
    )[0];

  // Setup, asserted: the 5-workspace limit without an enterprise key leaves room for one more (fresh DB: 2 seeded).
  expect(await countActive(), "setup: below the 5-workspace limit").toBeLessThan(5);

  const env = loadAuthEnv();
  const signIn = await metadataGql(
    base,
    "mutation($e:String!,$p:String!){ signIn(email:$e,password:$p){ availableWorkspaces{ availableWorkspacesForSignIn{ loginToken workspaceUrls{ subdomainUrl } } } } }",
    { e: env.TWENTY_EMAIL, p: env.TWENTY_PASSWORD },
  );
  const seeded = (
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
  if (seeded === undefined) throw new Error("TEST BUG: sign-in returned no workspace");
  // The origin is the workspace's subdomain URL: an IP origin resolves no workspace (WORKSPACE_NOT_FOUND).
  const userToken = await exchangeToken(base, seeded.loginToken, seeded.workspaceUrls.subdomainUrl);

  const subdomain = `qa${randomBytes(4).toString("hex")}`;
  const created = await metadataGql(
    base,
    "mutation($i:SignUpInNewWorkspaceInput){ signUpInNewWorkspace(input:$i){ loginToken { token } workspace{ id workspaceUrls{ subdomainUrl } } } }",
    { i: { displayName: runScopedName("str002"), subdomain } },
    userToken,
  );
  expect(created.body.errors, "create: no errors").toBeUndefined();
  const made = (
    created.body.data as {
      signUpInNewWorkspace: {
        loginToken: { token: string };
        workspace: { id: string; workspaceUrls: { subdomainUrl: string } };
      };
    }
  ).signUpInNewWorkspace;
  const workspaceId = made.workspace.id;
  let deleted = false;
  try {
    // Created: the row is stored, live, and still provisioning (PENDING_CREATION has no default role yet).
    expect(await rowOf(workspaceId), "create: the row is stored and live").toMatchObject({
      activationStatus: "PENDING_CREATION",
      deletedAt: null,
    });

    // Activation (the onboarding step): sets the default role, which the delete's suspend step needs.
    const newToken = await exchangeToken(
      base,
      made.loginToken.token,
      made.workspace.workspaceUrls.subdomainUrl,
    );
    const activated = await metadataGql(
      base,
      "mutation { activateWorkspace(data: {}) { id activationStatus } }",
      {},
      newToken,
    );
    expect(activated.body.errors, "activate: no errors").toBeUndefined();
    expect(await rowOf(workspaceId), "activate: ACTIVE with a default role").toMatchObject({
      activationStatus: "ACTIVE",
      defaultRoleId: expect.any(String),
    });

    // Delete: a soft delete. The row stays, with deletedAt set.
    const removed = await metadataGql(
      base,
      "mutation { deleteCurrentWorkspace { id } }",
      {},
      newToken,
    );
    expect(removed.body.errors, "delete: no errors").toBeUndefined();
    deleted = true;
    const after = await rowOf(workspaceId);
    expect(after?.deletedAt, "delete: deletedAt is set (soft delete)").not.toBeNull();
    expect(after?.activationStatus, "delete: suspended").toBe("SUSPENDED");
  } finally {
    if (!deleted) {
      // Cleanup for a failed run: a live workspace of this run is removed through the same mutation.
      const cleanupToken = await exchangeToken(
        base,
        made.loginToken.token,
        made.workspace.workspaceUrls.subdomainUrl,
      );
      const removed = await metadataGql(
        base,
        "mutation { deleteCurrentWorkspace { id } }",
        {},
        cleanupToken,
      );
      expect(removed.body.errors, "cleanup: the workspace is deleted").toBeUndefined();
    }
  }
});
