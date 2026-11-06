import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { randomSecret } from "../../../src/readiness/checks.ts";
import {
  apiBase,
  PRO_EMAIL,
  PRO_SLUG_30,
  slotStartsAhead,
  webBase,
  must,
} from "../../../src/lanes/cal/cases.ts";
import {
  calBookingApi,
  attendeeEmailFor,
  apiHeaders,
  BOOKINGS_VERSION,
  cancelInCleanup,
} from "../../../src/lanes/cal/booking.ts";
import { eventTypeIdBySlug } from "../../../src/lanes/cal/event-types.ts";
import { runTaskerOnce } from "../../../src/lanes/cal/cron.ts";
import { taskRowsFor } from "../../../src/lanes/cal/tasks.ts";
import { expectCalSignature, tamperOneByte } from "../../../src/lanes/cal/signature.ts";
import { bookingWebhookErrors } from "../../../src/lanes/cal/webhook-schema.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";
import { runAllThenRethrow } from "../../../src/shared/cleanup.ts";
import { expectedDefect } from "../../../src/ci/known-defect.ts";

const db = (): ReturnType<typeof readOnlyDb> => readOnlyDb("cal");
const cronSecret = (): string => process.env["CRON_SECRET"] ?? "";

/** What a test has created so far: finally removes only what exists. */
interface Track {
  hookId?: string;
  uids: string[];
}

/** Cancels every tracked booking and removes the webhook when it was created; `cancelledByTest(i)` marks the uid at index i the test cancelled itself. */
async function cleanup(
  api: ReturnType<typeof calBookingApi>,
  cal: import("../../../src/clients/cal.ts").CalClient,
  track: Track,
  cancelledByTest: (index: number) => boolean = () => false,
): Promise<void> {
  const hookId = track.hookId;
  await runAllThenRethrow([
    ...track.uids.map(
      (uid, i) => () => cancelInCleanup(api, uid, { cancelledByTest: cancelledByTest(i) }),
    ),
    ...(hookId === undefined ? [] : [() => cal.webhooks.remove(hookId)]),
  ]);
}

test.describe("P2-CAL-WH webhook cases (tasker mode)", () => {
  test("P2-CAL-WH-001 BOOKING_CREATED is delivered once with a valid HMAC over the raw bytes", async ({
    request,
    calAuth,
    cal,
    receiverHandle,
  }) => {
    const testId = "cal-wh-001";
    const key = receiverHandle.key(testId);
    const secret = randomSecret();
    const api = calBookingApi({ request, apiBaseUrl: apiBase(), auth: calAuth });
    const track: Track = { uids: [] };
    try {
      track.hookId = await cal.webhooks.create({
        subscriberUrl: receiverHandle.urlFor(testId),
        eventTriggers: ["BOOKING_CREATED"],
        secret,
      });
      const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
      const starts = await slotStartsAhead(request, calAuth, eventTypeId);
      const booked = await api.create({
        eventTypeId,
        start: String(starts[0]),
        attendeeEmail: attendeeEmailFor(currentRunPrefix(), testId),
        attendeeName: "wh",
      });
      track.uids.push(...booked.uids);
      expect(booked.status).toBe(201);
      expect(await runTaskerOnce(request, webBase(), cronSecret())).toBe(200);
      await expect
        .poll(() => receiverHandle.receiver.deliveries(key).length, {
          timeout: SLO.calWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
          message: "Cal BOOKING_CREATED delivery",
        })
        .toBe(1);
      const delivery = receiverHandle.receiver.deliveries(key)[0];
      expect(delivery).toBeDefined();
      expect(expectCalSignature(must(delivery, "delivery"), secret)).toEqual({ ok: true });
      expect(must(delivery, "delivery").headers["x-cal-signature-256"]).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await cleanup(api, cal, track);
    }
  });

  test("P2-CAL-WH-001 negative control: one flipped byte fails verification", async ({
    request,
    calAuth,
    cal,
    receiverHandle,
  }) => {
    const testId = "cal-wh-001n";
    const key = receiverHandle.key(testId);
    const secret = randomSecret();
    const api = calBookingApi({ request, apiBaseUrl: apiBase(), auth: calAuth });
    const track: Track = { uids: [] };
    try {
      track.hookId = await cal.webhooks.create({
        subscriberUrl: receiverHandle.urlFor(testId),
        eventTriggers: ["BOOKING_CREATED"],
        secret,
      });
      const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
      const starts = await slotStartsAhead(request, calAuth, eventTypeId);
      const booked = await api.create({
        eventTypeId,
        start: String(starts[11]),
        attendeeEmail: attendeeEmailFor(currentRunPrefix(), testId),
        attendeeName: "wh1n",
      });
      track.uids.push(...booked.uids);
      expect(booked.status).toBe(201);
      expect(await runTaskerOnce(request, webBase(), cronSecret())).toBe(200);
      await expect
        .poll(() => receiverHandle.receiver.deliveries(key).length, {
          timeout: SLO.calWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
        })
        .toBe(1);
      const delivery = must(receiverHandle.receiver.deliveries(key)[0], "delivery");
      expect(expectCalSignature(delivery, secret)).toEqual({ ok: true });
      const tampered = tamperOneByte(delivery.rawBody, 2);
      expect(expectCalSignature({ ...delivery, rawBody: tampered }, secret)).toEqual({
        ok: false,
        reason: "signature-mismatch",
      });
    } finally {
      await cleanup(api, cal, track);
    }
  });

  test("P2-CAL-WH-002 BOOKING_CREATED payload matches the derived schema", async ({
    request,
    calAuth,
    cal,
    receiverHandle,
  }) => {
    const testId = "cal-wh-002c";
    const key = receiverHandle.key(testId);
    const api = calBookingApi({ request, apiBaseUrl: apiBase(), auth: calAuth });
    const track: Track = { uids: [] };
    try {
      track.hookId = await cal.webhooks.create({
        subscriberUrl: receiverHandle.urlFor(testId),
        eventTriggers: ["BOOKING_CREATED"],
        secret: randomSecret(),
      });
      const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
      const starts = await slotStartsAhead(request, calAuth, eventTypeId);
      const booked = await api.create({
        eventTypeId,
        start: String(starts[1]),
        attendeeEmail: attendeeEmailFor(currentRunPrefix(), testId),
        attendeeName: "wh2",
      });
      track.uids.push(...booked.uids);
      expect(booked.status).toBe(201);
      expect(await runTaskerOnce(request, webBase(), cronSecret())).toBe(200);
      await expect
        .poll(() => receiverHandle.receiver.deliveries(key).length, {
          timeout: SLO.calWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
        })
        .toBe(1);
      const body = JSON.parse(
        must(receiverHandle.receiver.deliveries(key)[0], "delivery").rawBody.toString("utf8"),
      ) as unknown;
      expect(bookingWebhookErrors(body)).toEqual([]);
      expect((body as { triggerEvent: string }).triggerEvent).toBe("BOOKING_CREATED");
    } finally {
      await cleanup(api, cal, track);
    }
  });

  test("P2-CAL-WH-002 BOOKING_RESCHEDULED payload matches the derived schema", async ({
    request,
    calAuth,
    cal,
    receiverHandle,
  }) => {
    const testId = "cal-wh-002r";
    const key = receiverHandle.key(testId);
    const api = calBookingApi({ request, apiBaseUrl: apiBase(), auth: calAuth });
    const track: Track = { uids: [] };
    let rescheduled = false;
    try {
      track.hookId = await cal.webhooks.create({
        subscriberUrl: receiverHandle.urlFor(testId),
        eventTriggers: ["BOOKING_RESCHEDULED"],
        secret: randomSecret(),
      });
      const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
      const starts = await slotStartsAhead(request, calAuth, eventTypeId);
      const booked = await api.create({
        eventTypeId,
        start: String(starts[2]),
        attendeeEmail: attendeeEmailFor(currentRunPrefix(), testId),
        attendeeName: "wh2r",
      });
      track.uids.push(...booked.uids);
      expect(booked.status).toBe(201);
      const res = await request.fetch(
        `${apiBase()}/v2/bookings/${booked.uids[0] ?? ""}/reschedule`,
        {
          method: "POST",
          headers: { ...apiHeaders(calAuth, BOOKINGS_VERSION), "content-type": "application/json" },
          data: JSON.stringify({ start: String(starts[3]) }),
          failOnStatusCode: false,
        },
      );
      expect(res.status()).toBe(201);
      // A reschedule cancels the original booking (probe record, L20): its cleanup cancel may answer already-cancelled.
      rescheduled = true;
      const newUid = (JSON.parse(await res.text()) as { data: { uid: string } }).data.uid;
      track.uids.push(newUid);
      expect(await runTaskerOnce(request, webBase(), cronSecret())).toBe(200);
      await expect
        .poll(() => receiverHandle.receiver.deliveries(key).length, {
          timeout: SLO.calWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
        })
        .toBe(1);
      const body = JSON.parse(
        must(receiverHandle.receiver.deliveries(key)[0], "delivery").rawBody.toString("utf8"),
      ) as unknown;
      expect(bookingWebhookErrors(body)).toEqual([]);
      expect((body as { triggerEvent: string }).triggerEvent).toBe("BOOKING_RESCHEDULED");
    } finally {
      await cleanup(api, cal, track, (i) => i === 0 && rescheduled);
    }
  });

  test("P2-CAL-WH-002 BOOKING_CANCELLED payload matches the derived schema", async ({
    request,
    calAuth,
    cal,
    receiverHandle,
  }) => {
    const testId = "cal-wh-002x";
    const key = receiverHandle.key(testId);
    const api = calBookingApi({ request, apiBaseUrl: apiBase(), auth: calAuth });
    const track: Track = { uids: [] };
    let cancelledByTest = false;
    try {
      track.hookId = await cal.webhooks.create({
        subscriberUrl: receiverHandle.urlFor(testId),
        eventTriggers: ["BOOKING_CANCELLED"],
        secret: randomSecret(),
      });
      const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
      const starts = await slotStartsAhead(request, calAuth, eventTypeId);
      const booked = await api.create({
        eventTypeId,
        start: String(starts[4]),
        attendeeEmail: attendeeEmailFor(currentRunPrefix(), testId),
        attendeeName: "wh2x",
      });
      track.uids.push(...booked.uids);
      expect(booked.status).toBe(201);
      expect(await api.cancel(booked.uids[0] ?? "", "P2 lane cancel")).toBe(200);
      cancelledByTest = true;
      expect(await runTaskerOnce(request, webBase(), cronSecret())).toBe(200);
      await expect
        .poll(() => receiverHandle.receiver.deliveries(key).length, {
          timeout: SLO.calWebhookDelivery.ms,
          intervals: POLL_INTERVALS,
        })
        .toBe(1);
      const body = JSON.parse(
        must(receiverHandle.receiver.deliveries(key)[0], "delivery").rawBody.toString("utf8"),
      ) as unknown;
      expect(bookingWebhookErrors(body)).toEqual([]);
      expect((body as { triggerEvent: string }).triggerEvent).toBe("BOOKING_CANCELLED");
    } finally {
      await cleanup(api, cal, track, (i) => i === 0 && cancelledByTest);
    }
  });

  /**
   * Setup shared by the WH-003 control and finding: a webhook, receiver 500, one booking. Records each
   * resource in `track` as it is created, so the caller's finally (which also restores the receiver
   * mode) removes what exists even when a step here throws.
   */
  async function wh003Setup(
    ctx: {
      request: import("../../../src/clients/base.ts").ApiRequestLike;
      calAuth: import("../../../src/auth/cal.ts").CalAuth;
      cal: import("../../../src/clients/cal.ts").CalClient;
      receiverHandle: import("../../../src/fixtures/index.ts").ReceiverHandle;
    },
    testId: string,
    startIndex: number,
    api: ReturnType<typeof calBookingApi>,
    track: Track,
  ): Promise<void> {
    const key = ctx.receiverHandle.key(testId);
    track.hookId = await ctx.cal.webhooks.create({
      subscriberUrl: ctx.receiverHandle.urlFor(testId),
      eventTriggers: ["BOOKING_CREATED"],
      secret: randomSecret(),
    });
    const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
    const starts = await slotStartsAhead(ctx.request, ctx.calAuth, eventTypeId);
    ctx.receiverHandle.receiver.setMode(key, { kind: "500" });
    const booked = await api.create({
      eventTypeId,
      start: String(starts[startIndex]),
      attendeeEmail: attendeeEmailFor(currentRunPrefix(), testId),
      attendeeName: "wh3",
    });
    track.uids.push(...booked.uids);
    expect(booked.status).toBe(201);
  }

  test("P2-CAL-WH-003 receiver 500: one attempt, the Task succeeded, no second delivery in the same run (positive control)", async ({
    request,
    calAuth,
    cal,
    receiverHandle,
  }) => {
    const testId = "cal-wh-003c";
    const ctx = { request, calAuth, cal, receiverHandle };
    const key = receiverHandle.key(testId);
    const api = calBookingApi({ request, apiBaseUrl: apiBase(), auth: calAuth });
    const track: Track = { uids: [] };
    try {
      await wh003Setup(ctx, testId, 12, api, track);
      expect(await runTaskerOnce(request, webBase(), cronSecret())).toBe(200);
      expect(receiverHandle.receiver.deliveries(key)).toHaveLength(1);
      expect(receiverHandle.receiver.deliveries(key)[0]?.mode, "receiver answered 500").toBe("500");
      const rows = await taskRowsFor(db(), currentRunPrefix(), testId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ attempts: 1, succeeded: true, lastError: null });
    } finally {
      receiverHandle.receiver.setMode(key, { kind: "ok" });
      await cleanup(api, cal, track);
    }
  });

  test("P2-CAL-WH-003 a 500 is retried on the next tasker run (promised; finding)", async ({
    request,
    calAuth,
    cal,
    receiverHandle,
  }) => {
    const testId = "cal-wh-003f";
    const ctx = { request, calAuth, cal, receiverHandle };
    const key = receiverHandle.key(testId);
    const api = calBookingApi({ request, apiBaseUrl: apiBase(), auth: calAuth });
    const track: Track = { uids: [] };
    let afterSecondRun: ReturnType<typeof receiverHandle.receiver.deliveries> | undefined;
    try {
      await wh003Setup(ctx, testId, 13, api, track);
      // Setup, asserted before the expected failure: the first run made exactly one attempt.
      expect(await runTaskerOnce(request, webBase(), cronSecret())).toBe(200);
      expect(receiverHandle.receiver.deliveries(key)).toHaveLength(1);
      expect(receiverHandle.receiver.deliveries(key)[0]?.mode, "receiver answered 500").toBe("500");
      expect(await runTaskerOnce(request, webBase(), cronSecret())).toBe(200);
      afterSecondRun = [...receiverHandle.receiver.deliveries(key)];
    } finally {
      receiverHandle.receiver.setMode(key, { kind: "ok" });
      await cleanup(api, cal, track);
    }
    // Finding B2 (proven: plan P4; probe record L5): the 500 is acknowledged as success and never retried. The marker
    // is called only after the setup asserts and the cleanup have finished, so a cleanup failure is a normal test
    // failure and never satisfies the expected failure.
    expectedDefect(
      "B2: a receiver 500 is acknowledged as success and never retried (docs/probes/2026-11-02-p2-lane-cal-live-probes.md:338)",
    );
    expect(afterSecondRun).toHaveLength(2);
  });
});
