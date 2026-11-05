import { test, expect } from "../../../src/fixtures/index.ts";
import { loadSpec } from "../../../src/contracts/oas.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import {
  apiHeaders,
  BOOKINGS_VERSION,
  calBookingApi,
  cancelInCleanup,
} from "../../../src/lanes/cal/booking.ts";
import { eventTypeIdBySlug } from "../../../src/lanes/cal/event-types.ts";
import {
  apiBase,
  bookingCountForEventType,
  bookingRowsForEmail,
  PRO_EMAIL,
  PRO_SLUG_30,
  slotStartsAhead,
} from "../../../src/lanes/cal/cases.ts";
import { attendeeEmailFor } from "../../../src/lanes/cal/booking.ts";
import { currentRunPrefix } from "../../../src/run/prefix.ts";
import { runAllThenRethrow } from "../../../src/shared/cleanup.ts";

const CONTRACT = "contracts/cal/openapi-v2.json";
const db = (): ReturnType<typeof readOnlyDb> => readOnlyDb("cal");

test.describe("P2-CAL-CON contract cases", () => {
  test("P2-CAL-CON-001 GET /v2/slots matches the OAS schema", async ({ request, calAuth }) => {
    const spec = await loadSpec("cal-v2", CONTRACT);
    const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
    const starts = await slotStartsAhead(request, calAuth, eventTypeId);
    expect(starts.length).toBeGreaterThan(0);
    const res = await request.fetch(
      `${apiBase()}/v2/slots?eventTypeId=${String(eventTypeId)}&start=${new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)}&end=${new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10)}&timeZone=Europe%2FLondon`,
      { headers: apiHeaders(calAuth, "2024-09-04"), failOnStatusCode: false },
    );
    expect(res.status()).toBe(200);
    // PB-CAL-OAS-1 (product documentation, proven): the committed 200 schema describes the inner `data` map as the
    // whole body, while the live body and the document own example are {status, data}. Evidence: docs/probes/2026-11-02-p2-lane-cal-live-probes.md L12.
    test.fail();
    spec.assertValid(
      { method: "get", path: "/v2/slots" },
      { status: 200 },
      JSON.parse(await res.text()),
    );
  });

  test("P2-CAL-CON-001 the version header is a parameter: the same /v2/slots URL is 200 with it and 404 without it", async ({
    request,
    calAuth,
  }) => {
    const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
    const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    // The lane's real event type and a window inside its availability (the same days as slotStartsAhead).
    const url = `${apiBase()}/v2/slots?eventTypeId=${String(eventTypeId)}&start=${day(3)}&end=${day(12)}&timeZone=Europe%2FLondon`;
    // Positive control: with the header the route answers and returns slots, so a 404 below can only be the missing header.
    const withHeader = await request.fetch(url, {
      headers: apiHeaders(calAuth, "2024-09-04"),
      failOnStatusCode: false,
    });
    expect(withHeader.status()).toBe(200);
    const body = JSON.parse(await withHeader.text()) as { data?: Record<string, unknown> };
    expect(Object.keys(body.data ?? {}).length).toBeGreaterThan(0);
    // Without the header the same URL is refused, and the refusal names the route it refused.
    const withoutHeader = await request.fetch(url, {
      headers: { authorization: calAuth.headerValue.reveal() },
      failOnStatusCode: false,
    });
    expect(withoutHeader.status()).toBe(404);
    // The envelope names the refused request exactly: path plus query.
    expect(JSON.parse(await withoutHeader.text())).toMatchObject({
      status: "error",
      path: url.replace(apiBase(), ""),
    });
  });

  test("P2-CAL-CON-002 POST /v2/bookings matches the OAS schema and the Booking row has that uid", async ({
    request,
    calAuth,
  }) => {
    const spec = await loadSpec("cal-v2", CONTRACT);
    const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
    const starts = await slotStartsAhead(request, calAuth, eventTypeId);
    const email = attendeeEmailFor(currentRunPrefix(), "con-002");
    const api = calBookingApi({ request, apiBaseUrl: apiBase(), auth: calAuth });
    const res = await request.fetch(`${apiBase()}/v2/bookings`, {
      method: "POST",
      headers: {
        "cal-api-version": BOOKINGS_VERSION,
        authorization: calAuth.headerValue.reveal(),
        "content-type": "application/json",
      },
      data: JSON.stringify({
        start: String(starts[0]),
        eventTypeId,
        attendee: { name: "P2 lane", email, timeZone: "Europe/London" },
      }),
      failOnStatusCode: false,
    });
    const text = await res.text();
    const uid = (JSON.parse(text) as { data?: { uid?: string } }).data?.uid ?? "";
    let created: unknown;
    try {
      expect(res.status()).toBe(201);
      const rows = await bookingRowsForEmail(db(), email);
      expect(rows.map((r) => r.uid)).toEqual([uid]);
      created = JSON.parse(text);
    } finally {
      await runAllThenRethrow(
        uid === "" ? [] : [() => cancelInCleanup(api, uid, { cancelledByTest: false })],
      );
    }
    // PB-CAL-OAS-1 (product documentation, proven): the committed 201 schema requires strings and numbers
    // where the live body has null (rescheduledByEmail, rating) and requires attendee seatUid and
    // bookingFieldsResponses that the live body omits. Evidence: docs/probes/2026-11-02-p2-lane-cal-live-probes.md L12.
    // The marker is called only after the setup asserts and the cleanup have finished, so a cleanup failure is a
    // normal test failure and never satisfies the expected failure.
    test.fail();
    spec.assertValid({ method: "post", path: "/v2/bookings" }, { status: 201 }, created);
  });

  test("P2-CAL-CON-003 missing attendee email: 400 error envelope and no Booking row", async ({
    request,
    calAuth,
  }) => {
    const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
    const starts = await slotStartsAhead(request, calAuth, eventTypeId);
    const before = await bookingCountForEventType(db(), eventTypeId);
    const res = await request.fetch(`${apiBase()}/v2/bookings`, {
      method: "POST",
      headers: {
        "cal-api-version": BOOKINGS_VERSION,
        authorization: calAuth.headerValue.reveal(),
        "content-type": "application/json",
      },
      data: JSON.stringify({
        start: String(starts[0]),
        eventTypeId,
        attendee: { name: "no email", timeZone: "Europe/London" },
      }),
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = JSON.parse(await res.text()) as Record<string, unknown>;
    // The committed OAS documents only 201 for this operation, so the envelope keys are the contract (probe P12).
    expect(Object.keys(body).sort()).toEqual(["error", "path", "status", "timestamp"]);
    expect(body["status"]).toBe("error");
    expect(body["path"]).toBe("/v2/bookings");
    expect(await bookingCountForEventType(db(), eventTypeId)).toBe(before);
  });

  test("P2-CAL-CON-003 unauthenticated GET /v2/bookings: 403 and no Booking row", async ({
    request,
  }) => {
    const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
    const before = await bookingCountForEventType(db(), eventTypeId);
    const res = await request.fetch(`${apiBase()}/v2/bookings`, {
      headers: { "cal-api-version": BOOKINGS_VERSION },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("ForbiddenException");
    expect(await bookingCountForEventType(db(), eventTypeId)).toBe(before);
  });

  test("P2-CAL-CON-003 unknown booking uid: 404 and no Booking row", async ({
    request,
    calAuth,
  }) => {
    const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
    const before = await bookingCountForEventType(db(), eventTypeId);
    const res = await request.fetch(`${apiBase()}/v2/bookings/${currentRunPrefix()}-missing`, {
      headers: apiHeaders(calAuth, BOOKINGS_VERSION),
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(404);
    const body = JSON.parse(await res.text()) as { error: { code: string } };
    expect(body.error.code).toBe("NotFoundException");
    expect(await bookingCountForEventType(db(), eventTypeId)).toBe(before);
  });
});
