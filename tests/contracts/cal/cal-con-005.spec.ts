import { test, expect } from "../../../src/fixtures/index.ts";
import { loadSpec } from "../../../src/contracts/oas.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { mintCal } from "../../../src/auth/cal.ts";
import { loadAuthEnv } from "../../../src/auth/env.ts";
import { revokeAndVerify } from "../../../src/auth/lifecycle.ts";
import {
  attendeeEmailFor,
  calBookingApi,
  cancelInCleanup,
} from "../../../src/lanes/cal/booking.ts";
import { runAllThenRethrow } from "../../../src/shared/cleanup.ts";
import {
  apiVersionFor,
  API_VERSION_HEADER,
  fillPath,
  listGetOperations,
  type GetOperation,
} from "../../../src/lanes/cal/oas-walk.ts";
import { eventTypeIdBySlug } from "../../../src/lanes/cal/event-types.ts";
import {
  CRAWLED_OPERATIONS,
  KNOWN_INVALID,
  KNOWN_UNDOCUMENTED,
  NO_VALUE_OPERATIONS,
  type UncrawledReason,
} from "../../../src/lanes/cal/contract-pins.ts";
import {
  apiBase,
  PRO_EMAIL,
  PRO_SLUG_30,
  slotStartsAhead,
  webBase,
} from "../../../src/lanes/cal/cases.ts";
import { currentRunPrefix, runScopedName } from "../../../src/run/prefix.ts";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const CONTRACT = "contracts/cal/openapi-v2.json";
const db = (): ReturnType<typeof readOnlyDb> => readOnlyDb("cal");

interface Crawl {
  readonly op: GetOperation;
  readonly status: number | undefined;
  readonly documented: boolean;
  readonly validBody: boolean | undefined;
  readonly uncrawledReason: UncrawledReason | undefined;
  /** The first validation errors of a 200 body (empty when valid or not a 200). */
  readonly validationErrors: readonly string[];
}

const identity = (r: Crawl): string => `${r.op.method.toUpperCase()} ${r.op.path}`;
const sorted = (xs: readonly string[]): string[] => [...xs].sort();

test("P2-CAL-CON-005 the crawl pins every operation, undocumented status and invalid 200 by identity", async ({
  request,
  calAuth,
  cal,
}) => {
  const doc = JSON.parse(readFileSync(CONTRACT, "utf8")) as {
    paths: Record<string, Record<string, { responses?: Record<string, unknown> }>>;
  };
  const spec = await loadSpec("cal-v2", CONTRACT);
  const ops = listGetOperations(doc);
  // Structural: the committed document has 55 GET operations (not a seed value).
  expect(ops).toHaveLength(55);

  // Own key for the crawl (the budget of 120 per minute per key is not shared with other cases).
  const env = loadAuthEnv();
  const key = await mintCal({
    baseUrl: webBase(),
    email: env.P2_CAL_USER_EMAIL,
    password: env.P2_CAL_USER_PASSWORD,
    name: (label) => runScopedName(`con005-${label}`),
    keyId: async (note) =>
      (
        await db().select<{ id: string }>(`SELECT "id" AS id FROM "ApiKey" WHERE "note" = $1`, [
          note,
        ])
      )[0]?.id,
  });
  // The crawl seeds its own data so that every identity is measured against the same state:
  // one booking (for {bookingUid}) and one webhook (for {webhookId}). The try opens right after the
  // mint, so a throw in any setup step still revokes the key; finally removes only what was created.
  const api = calBookingApi({ request, apiBaseUrl: apiBase(), auth: calAuth });
  const results: Crawl[] = [];
  const track: { hookId?: string; uids: string[] } = { uids: [] };
  try {
    const eventTypeId = await eventTypeIdBySlug(db(), PRO_EMAIL, PRO_SLUG_30);
    const starts = await slotStartsAhead(request, calAuth, eventTypeId);
    const booked = await api.create({
      eventTypeId,
      start: String(starts[15]),
      attendeeEmail: attendeeEmailFor(currentRunPrefix(), "con-005"),
      attendeeName: "crawl",
    });
    track.uids.push(...booked.uids);
    expect(booked.status).toBe(201);
    track.hookId = await cal.webhooks.create({
      subscriberUrl: `http://127.0.0.1:9/r/${currentRunPrefix()}/con-005`,
      eventTriggers: ["BOOKING_CREATED"],
      secret: `con005-${currentRunPrefix()}`,
    });
    const values: Record<string, string> = {
      bookingUid: booked.uids[0] ?? "",
      eventTypeId: String(eventTypeId),
      webhookId: track.hookId,
    };
    for (const op of ops) {
      if (op.params.some((p) => values[p] === undefined)) {
        results.push({
          op,
          status: undefined,
          documented: false,
          validBody: undefined,
          uncrawledReason: "no-path-value",
          validationErrors: [],
        });
        continue;
      }
      // Each operation gets the version its own OAS header parameter declares; none where the OAS declares none.
      const version = apiVersionFor(doc, op.path);
      const headers: Record<string, string> = { authorization: key.headerValue.reveal() };
      if (version !== undefined) headers[API_VERSION_HEADER] = version;
      const res = await request.fetch(`${apiBase()}${fillPath(op.path, values)}`, {
        headers,
        failOnStatusCode: false,
      });
      const status = res.status();
      const responses = doc.paths[op.path]?.["get"]?.responses ?? {};
      const documented = Object.keys(responses).includes(String(status));
      let validBody: boolean | undefined;
      let validationErrors: string[] = [];
      if (status === 200) {
        const body = JSON.parse(await res.text()) as unknown;
        const check = spec.validate({ method: "get", path: op.path }, { status: 200 }, body);
        validBody = check.valid;
        validationErrors = check.errors.slice(0, 3);
      }
      results.push({
        op,
        status,
        documented,
        validBody,
        uncrawledReason: undefined,
        validationErrors,
      });
    }
  } finally {
    const hookId = track.hookId;
    await runAllThenRethrow([
      ...track.uids.map((uid) => () => cancelInCleanup(api, uid, { cancelledByTest: false })),
      ...(hookId === undefined ? [] : [() => cal.webhooks.remove(hookId)]),
      () => revokeAndVerify(key, () => key.isPresent()),
    ]);
  }

  // Measurement record: one entry per crawled operation, with the status, the body check and the version that was sent.
  // The probe record cites this file (results/ is not committed).
  mkdirSync("results", { recursive: true });
  writeFileSync(
    "results/cal-con-005-crawl.json",
    JSON.stringify(
      results.map((r) => ({
        operation: identity(r),
        status: r.status ?? null,
        documented: r.documented,
        validBody: r.validBody ?? null,
        uncrawledReason: r.uncrawledReason ?? null,
        apiVersionSent: apiVersionFor(doc, r.op.path) ?? null,
        validationErrors: r.validationErrors,
      })),
      null,
      2,
    ),
  );

  // Identity asserts. No counts: a seed change moves no identity here.
  const crawled = results.filter((r) => r.status !== undefined);
  const noValue = results.filter((r) => r.status === undefined);
  expect(sorted(crawled.map(identity))).toEqual(sorted(CRAWLED_OPERATIONS));
  expect(sorted(noValue.map(identity))).toEqual(sorted(NO_VALUE_OPERATIONS));
  for (const r of noValue) expect(r.uncrawledReason, identity(r)).toBe("no-path-value");

  // Every non-200 answer the committed spec does not list is a pinned finding (SPEC-CAL-UNDOC); none is filtered.
  const undocumented = crawled
    .filter((r) => r.status !== 200 && !r.documented)
    .map((r) => `${identity(r)} ${String(r.status)}`);
  expect(sorted(undocumented)).toEqual(
    sorted(KNOWN_UNDOCUMENTED.map((u) => `${u.operation} ${String(u.status)}`)),
  );

  // Invalid 200 bodies: the set must equal the pin before the known-bug marker, so a new invalid route turns red here.
  const invalid = crawled.filter((r) => r.validBody === false).map(identity);
  expect(sorted(invalid)).toEqual(sorted(KNOWN_INVALID));

  // PB-CAL-OAS-1 (product documentation, proven): the 200 bodies of the listed routes do not validate against the committed spec.
  test.fail();
  expect(invalid, "every 200 body validates against the committed spec").toEqual([]);
});
