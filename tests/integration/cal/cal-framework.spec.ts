import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { mintCal } from "../../../src/auth/cal.ts";
import { loadAuthEnv } from "../../../src/auth/env.ts";
import { revokeAndVerify } from "../../../src/auth/lifecycle.ts";
import { fireScheduledTriggersOnce, runTaskerOnce } from "../../../src/lanes/cal/cron.ts";
import {
  apiBase,
  bookingCountForEventType,
  PRO_EMAIL,
  PRO_SLUG_30,
  webBase,
} from "../../../src/lanes/cal/cases.ts";
import { eventTypeIdBySlug } from "../../../src/lanes/cal/event-types.ts";
import { runScopedName } from "../../../src/run/prefix.ts";

const db = readOnlyDb("cal");

test.describe("P2-CAL framework checks", () => {
  test("FC-1 cron routes refuse a wrong key (401) and accept the right one (200)", async ({
    request,
  }) => {
    const tasksKey = process.env["CRON_SECRET"] ?? "";
    const scheduledKey = process.env["CRON_API_KEY"] ?? "";
    expect(await runTaskerOnce(request, webBase(), "not-the-secret")).toBe(401);
    expect(await runTaskerOnce(request, webBase(), tasksKey)).toBe(200);
    expect(await fireScheduledTriggersOnce(request, webBase(), "not-the-key")).toBe(401);
    expect(await fireScheduledTriggersOnce(request, webBase(), scheduledKey)).toBe(200);
  });

  test("FC-2 a DB-backed API v2 call works before any lane case (HR-4, harness v0.3.1)", async ({
    request,
    calAuth,
  }) => {
    const res = await request.fetch(`${apiBase()}/v2/me`, {
      headers: { authorization: calAuth.headerValue.reveal() },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(200);
    const body = JSON.parse(await res.text()) as { data: { email: string } };
    expect(body.data.email).toBe(PRO_EMAIL);
  });

  test("FC-3 a 429 creates no Booking row (dedicated key, 121 GET /v2/me)", async ({ request }) => {
    const eventTypeId = await eventTypeIdBySlug(db, PRO_EMAIL, PRO_SLUG_30);
    const before = await bookingCountForEventType(db, eventTypeId);
    const env = loadAuthEnv();
    const key = await mintCal({
      baseUrl: webBase(),
      email: env.P2_CAL_USER_EMAIL,
      password: env.P2_CAL_USER_PASSWORD,
      name: (label) => runScopedName(`fc3-${label}`),
      keyId: async (note) =>
        (
          await db.select<{ id: string }>(`SELECT "id" AS id FROM "ApiKey" WHERE "note" = $1`, [
            note,
          ])
        )[0]?.id,
    });
    try {
      const codes: Record<string, number> = {};
      for (let i = 0; i < 121; i += 1) {
        const res = await request.fetch(`${apiBase()}/v2/me`, {
          headers: { authorization: key.headerValue.reveal() },
          failOnStatusCode: false,
        });
        const code = String(res.status());
        codes[code] = (codes[code] ?? 0) + 1;
      }
      expect(codes["429"] ?? 0).toBeGreaterThanOrEqual(1);
      expect(await bookingCountForEventType(db, eventTypeId)).toBe(before);
    } finally {
      await revokeAndVerify(key, () => key.isPresent());
    }
  });
});
