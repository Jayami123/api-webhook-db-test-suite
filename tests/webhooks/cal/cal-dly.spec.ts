import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { DAILY_TEST_BODY, signedDailyRequest } from "../../../src/lanes/cal/daily.ts";
import { webBase } from "../../../src/lanes/cal/cases.ts";

const db = (): ReturnType<typeof readOnlyDb> => readOnlyDb("cal");

/** The Daily signing secret is a per-run value from the environment; the test refuses to run without it. */
function dailySecret(): string {
  const value = process.env["DAILY_WEBHOOK_SECRET"];
  if (value === undefined || value.trim() === "") {
    throw new Error("TEST BUG: DAILY_WEBHOOK_SECRET is not set in the up environment");
  }
  return value;
}

const route = (): string => `${webBase()}/api/recorded-daily-video`;
const json = { "content-type": "application/json" };
/** Daily-shaped: the route dispatches on `type` (route.ts:86); this payload fails recordingReadySchema. */
const RECORDING_BODY = '{"type":"recording.ready-to-download","payload":{"x":1}}';

test.describe("P2-CAL-DLY recorded-daily-video route", () => {
  test("P2-CAL-DLY-002 tampered body with the old signature is rejected with 403", async ({
    request,
  }) => {
    const ts = String(Math.floor(Date.now() / 1000));
    const signed = signedDailyRequest({
      secretBase64: dailySecret(),
      body: RECORDING_BODY,
      timestamp: ts,
    });
    const res = await request.fetch(route(), {
      method: "POST",
      headers: { ...json, ...signed.headers },
      data: RECORDING_BODY.replace("recording.ready-to-download", "recording.xxxx-xxxx-xxxx"),
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
    expect(JSON.parse(await res.text())).toEqual({ message: "Signature does not match" });
  });

  test("P2-CAL-DLY-002 a canonical signature is accepted (not 403): the Daily-shaped body fails the payload check", async ({
    request,
  }) => {
    const ts = String(Math.floor(Date.now() / 1000));
    const signed = signedDailyRequest({
      secretBase64: dailySecret(),
      body: RECORDING_BODY,
      timestamp: ts,
    });
    const res = await request.fetch(route(), {
      method: "POST",
      headers: { ...json, ...signed.headers },
      data: RECORDING_BODY,
      failOnStatusCode: false,
    });
    // Measured on the live stack (docs/probes/2026-11-02-p2-lane-cal-live-probes.md L2): 400 Invalid Payload.
    expect(res.status()).not.toBe(403);
    expect(res.status()).toBe(400);
    expect(JSON.parse(await res.text())).toEqual({ message: "Invalid Payload" });
  });

  test("P2-CAL-DLY-002 observed contract: an unknown type with a valid signature answers 200 Invalid type", async ({
    request,
  }) => {
    const body = '{"type":"unknown.event","payload":{}}';
    const ts = String(Math.floor(Date.now() / 1000));
    const signed = signedDailyRequest({ secretBase64: dailySecret(), body, timestamp: ts });
    const res = await request.fetch(route(), {
      method: "POST",
      headers: { ...json, ...signed.headers },
      data: body,
      failOnStatusCode: false,
    });
    // Observed (L2): the route's final branch answers 200 for a type it does not handle (route.ts:223-225).
    expect(res.status()).toBe(200);
    expect(JSON.parse(await res.text())).toEqual({
      message: "Invalid type in /recorded-daily-video",
    });
  });

  test("P2-CAL-DLY-002 a raw-signed non-canonical body is refused (observed canonicalisation)", async ({
    request,
  }) => {
    const ts = String(Math.floor(Date.now() / 1000));
    const spaced = '{"type":  "recording.ready-to-download", "payload":{"x":1}}';
    const signed = signedDailyRequest({
      secretBase64: dailySecret(),
      body: spaced,
      timestamp: ts,
      mode: "raw",
    });
    const res = await request.fetch(route(), {
      method: "POST",
      headers: { ...json, ...signed.headers },
      data: spaced,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
    expect(JSON.parse(await res.text())).toEqual({ message: "Signature does not match" });
  });

  test("P2-CAL-DLY-003 the test request is answered 200 and writes nothing", async ({
    request,
  }) => {
    const countsSql = `SELECT (SELECT count(*)::int FROM "Booking") AS bookings, (SELECT count(*)::int FROM "Task") AS tasks, (SELECT count(*)::int FROM "WebhookScheduledTriggers") AS scheduled`;
    const before = (await db().select<Record<string, number>>(countsSql))[0];
    const res = await request.fetch(route(), {
      method: "POST",
      headers: json,
      data: DAILY_TEST_BODY,
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(200);
    expect(JSON.parse(await res.text())).toEqual({ message: "Test request successful" });
    expect((await db().select<Record<string, number>>(countsSql))[0]).toEqual(before);
  });
});
