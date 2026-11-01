import { loadAuthEnv, requireVar } from "../auth/env.ts";
import { mintCal, type CalAuth } from "../auth/cal.ts";
import { mintDocumenso, type DocumensoAuth } from "../auth/documenso.ts";
import { mintMedusa, type MedusaAuth } from "../auth/medusa.ts";
import { mintTwenty, type TwentyAuth } from "../auth/twenty.ts";
import { addSecret } from "../auth/secret.ts";
import { revokeAndVerify } from "../auth/lifecycle.ts";
import { calClient, type CalClient } from "../clients/cal.ts";
import { documensoClient, type DocumensoClient } from "../clients/documenso.ts";
import { medusaClient, type MedusaClient } from "../clients/medusa.ts";
import { twentyClient, type TwentyClient } from "../clients/twenty.ts";
import { readOnlyDb } from "../db/pg.ts";
import { apiBaseUrl, loadEnv } from "../env.ts";
import { currentRunPrefix, runScopedName } from "../run/prefix.ts";
import { retained, test as withInvariants } from "../invariants/fixture.ts";

/**
 * One credential per product per WORKER, minted on first use and revoked (and proven dead) when
 * the worker ends. A Playwright setup project cannot hand a token to the tests: setup, tests and
 * teardown run in different processes (probed on 1.64.0), and writing it to a file would put a
 * secret in an artefact. Tokens never leave memory: SecretString prints as <redacted:N>.
 */
interface Workers {
  calAuth: CalAuth;
  docAuth: DocumensoAuth;
  medAuth: MedusaAuth;
  twAuth: TwentyAuth;
}
interface Clients {
  cal: CalClient;
  doc: DocumensoClient;
  med: MedusaClient;
  tw: TwentyClient;
}

const name = (label: string): string => runScopedName(label);
/** Cal's web app (3000), where login, tRPC and the cron and Daily routes live; API v2 is 5555. */
const calWebUrl = (): string => loadEnv().CAL_BASE_URL.replace(/\/$/, "");

export const test = withInvariants.extend<Clients, Workers>({
  calAuth: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring pattern
    async ({}, use) => {
      const env = loadAuthEnv();
      addSecret(env.P2_CAL_USER_PASSWORD);
      const db = readOnlyDb("cal");
      const auth = await mintCal({
        baseUrl: calWebUrl(),
        email: env.P2_CAL_USER_EMAIL,
        password: env.P2_CAL_USER_PASSWORD,
        name,
        keyId: async (note) =>
          (
            await db.select<{ id: string }>(`SELECT "id" AS id FROM "ApiKey" WHERE "note" = $1`, [
              note,
            ])
          )[0]?.id,
      });
      const release = retained.retain("cal-leak-api-key-note", auth.label);
      await use(auth);
      await revokeAndVerify(auth, () => auth.isPresent());
      release();
    },
    { scope: "worker" },
  ],
  docAuth: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring pattern
    async ({}, use) => {
      const env = loadAuthEnv();
      addSecret(env.P2_DOC_USER_PASSWORD);
      const db = readOnlyDb("documenso");
      const auth = await mintDocumenso({
        baseUrl: apiBaseUrl("documenso"),
        email: env.P2_DOC_USER_EMAIL,
        password: env.P2_DOC_USER_PASSWORD,
        name,
        teamId: async () => {
          const rows = await db.select<{ id: number }>(
            `SELECT t."id" AS id FROM "Team" t JOIN "Organisation" o ON o."id" = t."organisationId" JOIN "User" u ON u."id" = o."ownerUserId" WHERE u."email" = $1 ORDER BY t."id" LIMIT 1`,
            [env.P2_DOC_USER_EMAIL],
          );
          const id = rows[0]?.id;
          if (id === undefined)
            throw new Error("TEST BUG: no personal team for the Documenso user");
          return id;
        },
      });
      const release = retained.retain("doc-leak-api-token-name", auth.label);
      await use(auth);
      await revokeAndVerify(auth, () => auth.isAccepted());
      release();
    },
    { scope: "worker" },
  ],
  medAuth: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring pattern
    async ({}, use) => {
      const env = loadAuthEnv();
      addSecret(env.MEDUSA_ADMIN_PASSWORD);
      const auth = await mintMedusa({
        baseUrl: apiBaseUrl("medusa"),
        email: requireVar("MEDUSA_ADMIN_EMAIL", env.MEDUSA_ADMIN_EMAIL),
        password: requireVar("MEDUSA_ADMIN_PASSWORD", env.MEDUSA_ADMIN_PASSWORD),
        name,
      });
      const releases = auth.titles.map((title) => retained.retain("med-leak-api-key-title", title));
      await use(auth);
      await revokeAndVerify(auth, () => auth.isAccepted());
      for (const release of releases) release();
    },
    { scope: "worker" },
  ],
  twAuth: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring pattern
    async ({}, use) => {
      const env = loadAuthEnv();
      addSecret(env.TWENTY_PASSWORD);
      const auth = await mintTwenty({
        baseUrl: apiBaseUrl("twenty"),
        email: env.TWENTY_EMAIL,
        password: env.TWENTY_PASSWORD,
        name,
      });
      const release = retained.retain("tw-leak-api-key-name", auth.label);
      await use(auth);
      await revokeAndVerify(auth, () => auth.isAccepted());
      release();
    },
    { scope: "worker" },
  ],
  cal: async ({ request, calAuth }, use) => {
    await use(
      calClient({
        request,
        baseUrl: calWebUrl(),
        runPrefix: currentRunPrefix(),
        auth: calAuth,
      }),
    );
  },
  doc: async ({ request, docAuth }, use) => {
    await use(
      documensoClient({
        request,
        baseUrl: apiBaseUrl("documenso"),
        runPrefix: currentRunPrefix(),
        auth: docAuth,
      }),
    );
  },
  med: async ({ request, medAuth }, use) => {
    await use(
      medusaClient({
        request,
        baseUrl: apiBaseUrl("medusa"),
        runPrefix: currentRunPrefix(),
        auth: medAuth,
      }),
    );
  },
  tw: async ({ request, twAuth }, use) => {
    await use(
      twentyClient({
        request,
        baseUrl: apiBaseUrl("twenty"),
        runPrefix: currentRunPrefix(),
        auth: twAuth,
      }),
    );
  },
});

export { expect } from "@playwright/test";
