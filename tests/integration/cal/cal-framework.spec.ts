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
import { attendeeEmailFor, utcIso } from "../../../src/lanes/cal/booking.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";

/** FC-003's refused booking starts this far ahead of the run (two weeks), so the instant is in the future on any date. */
const FC3_LEAD_MS = 14 * 864e5;

/** An ISO instant `leadMs` from now, truncated to the hour (UTC). */
function futureOnTheHour(leadMs: number): string {
  const at = new Date(Date.now() + leadMs);
  at.setUTCMinutes(0, 0, 0);
  return utcIso(at);
}

const db = (): ReturnType<typeof readOnlyDb> => readOnlyDb("cal");

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

  test("FC-3 a 429 on a booking request creates no Booking row (limit read from the response headers)", async ({
    request,
  }) => {
    const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
    const before = await bookingCountForEventType(db(), eventTypeId);
    const env = loadAuthEnv();
    const key = await mintCal({
      baseUrl: webBase(),
      email: env.P2_CAL_USER_EMAIL,
      password: env.P2_CAL_USER_PASSWORD,
      name: (label) => runScopedName(`fc3-${label}`),
      keyId: async (note) =>
        (
          await db().select<{ id: string }>(`SELECT "id" AS id FROM "ApiKey" WHERE "note" = $1`, [
            note,
          ])
        )[0]?.id,
    });
    const H = { "cal-api-version": "2024-08-13", authorization: key.headerValue.reveal() };
    try {
      // The fresh key starts its window with its first call; the limit and remaining count come from the headers
      // (observed at the pin, probe L14: x-ratelimit-limit-default, x-ratelimit-remaining-default, x-ratelimit-reset-default).
      const first = await request.fetch(`${apiBase()}/v2/me`, {
        headers: H,
        failOnStatusCode: false,
      });
      expect(first.status()).toBe(200);
      const limit = Number(first.headers()["x-ratelimit-limit-default"]);
      expect(limit).toBe(120);
      let remaining = Number(first.headers()["x-ratelimit-remaining-default"]);
      expect(remaining).toBe(limit - 1);
      // Drive until the header says zero. Bounded by the limit: if the window reset meanwhile, the bound fails the test (no retry).
      for (let i = 0; i < limit && remaining > 0; i += 1) {
        const res = await request.fetch(`${apiBase()}/v2/me`, {
          headers: H,
          failOnStatusCode: false,
        });
        expect(res.status()).toBe(200);
        remaining = Number(res.headers()["x-ratelimit-remaining-default"]);
      }
      expect(remaining, "remaining reached zero within the limit").toBe(0);
      // The next request is refused. It is a booking request, so the refusal must not create a row.
      const booking = await request.fetch(`${apiBase()}/v2/bookings`, {
        method: "POST",
        headers: { ...H, "content-type": "application/json" },
        data: JSON.stringify({
          // Two weeks ahead of now, on the hour: always a future instant, never a date that goes stale. The request is
          // refused by the rate limit before any slot check, so the instant only needs to be a valid future start.
          start: futureOnTheHour(FC3_LEAD_MS),
          eventTypeId,
          attendee: {
            name: "fc3",
            email: attendeeEmailFor(currentRunPrefix(), "fc3"),
            timeZone: "Europe/London",
          },
        }),
        failOnStatusCode: false,
      });
      expect(booking.status()).toBe(429);
      expect(JSON.parse(await booking.text())).toMatchObject({
        error: { code: "ThrottlerException" },
      });
      expect(await bookingCountForEventType(db(), eventTypeId)).toBe(before);
    } finally {
      await revokeAndVerify(key, () => key.isPresent());
    }
  });
});
