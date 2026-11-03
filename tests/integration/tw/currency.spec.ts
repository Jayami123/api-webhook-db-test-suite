import { test, expect } from "../../../src/fixtures/index.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import { twAuthHeaders } from "../../../src/lanes/tw/http.ts";
import { rowsById } from "../../../src/lanes/tw/rows.ts";
import { runScopedName } from "../../../src/run/prefix.ts";
import type { TwentyAuth } from "../../../src/auth/twenty.ts";
import type { APIRequestContext } from "@playwright/test";

const OPPORTUNITIES = `${apiBaseUrl("twenty")}/rest/opportunities`;

/**
 * The amount is sent as JSON text. A JavaScript number cannot carry 2^53+1: `9007199254740993` written as a number is
 * already 9007199254740992 before it leaves the test (measured in the probe record), so the digits are written verbatim.
 */
function createOpportunity(
  request: APIRequestContext,
  auth: TwentyAuth,
  label: string,
  digits: string,
) {
  return request.post(OPPORTUNITIES, {
    headers: { ...twAuthHeaders(auth), "content-type": "application/json" },
    data: `{"name":"${runScopedName(label)}","amount":{"amountMicros":${digits},"currencyCode":"USD"}}`,
  });
}

async function deleteOpportunity(
  request: APIRequestContext,
  auth: TwentyAuth,
  id: string,
): Promise<void> {
  const res = await request.delete(`${OPPORTUNITIES}/${id}`, { headers: twAuthHeaders(auth) });
  expect(res.status(), "opportunity cleanup").toBe(200);
  // In-test leak assert (until the shared opportunity rule lands): no opportunity row of this id remains.
  const left = await rowsById(readOnlyDb("twenty"), "opportunity", id, `"id"`);
  expect(left, "opportunity cleanup: no row remains").toHaveLength(0);
}

test("P2-TW-CUR-001: amountMicros 9007199254740991 round-trips exactly", async ({
  request,
  twAuth,
}) => {
  const res = await createOpportunity(request, twAuth, "cur-max", "9007199254740991");
  const text = await res.text();
  expect(res.status(), text.slice(0, 200)).toBe(201);
  const id = (JSON.parse(text) as { data: { createOpportunity: { id: string } } }).data
    .createOpportunity.id;
  try {
    expect(text).toContain('"amountMicros":9007199254740991');
    const rows = await rowsById(
      readOnlyDb("twenty"),
      "opportunity",
      id,
      `"amountAmountMicros"::text AS micros`,
    );
    expect(rows.map((r) => r["micros"])).toEqual(["9007199254740991"]);
    const get = await request.get(`${OPPORTUNITIES}/${id}`, { headers: twAuthHeaders(twAuth) });
    expect(await get.text()).toContain('"amountMicros":9007199254740991');
  } finally {
    await deleteOpportunity(request, twAuth, id);
  }
});

test("P2-TW-CUR-001: amountMicros 9007199254740993 is rejected or round-trips exactly", async ({
  request,
  twAuth,
}) => {
  const res = await createOpportunity(request, twAuth, "cur-over", "9007199254740993");
  const text = await res.text();
  // Setup, asserted before the known-bug marker: the request reached the server and got an answer that is not a 5xx.
  expect(res.status(), text.slice(0, 200)).toBeLessThan(500);
  const id =
    res.status() === 201
      ? (JSON.parse(text) as { data: { createOpportunity: { id: string } } }).data.createOpportunity
          .id
      : undefined;
  try {
    if (id !== undefined) {
      const rows = await rowsById(
        readOnlyDb("twenty"),
        "opportunity",
        id,
        `"amountAmountMicros"::text AS micros`,
      );
      expect(rows, "setup: exactly one stored row for the created id").toHaveLength(1);
    }
    // Known product bug P2-TW-BUG-001 (silent rounding of an amount above 2^53-1). The marker sits right before the
    // product assertion, so the setup above still fails as a normal test failure. Evidence and draft:
    // docs/probes/2026-11-03-p2-lane-tw-probes.md, section P2-TW-BUG-001.
    test.fail(
      true,
      "P2-TW-BUG-001: 9007199254740993 is accepted (201) and stored as 9007199254740992",
    );
    if (id === undefined) {
      expect(res.status(), "rejected with a client error").toBeGreaterThanOrEqual(400);
    } else {
      const rows = await rowsById(
        readOnlyDb("twenty"),
        "opportunity",
        id,
        `"amountAmountMicros"::text AS micros`,
      );
      expect(rows.map((r) => r["micros"])).toEqual(["9007199254740993"]);
    }
  } finally {
    if (id !== undefined) await deleteOpportunity(request, twAuth, id);
  }
});

/** GraphQL createOpportunity with the amount digits written verbatim (BUG-001: GraphQL rounds the same way as REST). */
async function createOpportunityGql(
  request: APIRequestContext,
  auth: TwentyAuth,
  label: string,
  digits: string,
) {
  const res = await request.post(`${apiBaseUrl("twenty")}/graphql`, {
    headers: { ...twAuthHeaders(auth), "content-type": "application/json" },
    data: {
      query: `mutation { createOpportunity(data: { name: "${runScopedName(label)}", amount: { amountMicros: ${digits}, currencyCode: "USD" } }) { id } }`,
    },
  });
  const text = await res.text();
  const body = JSON.parse(text) as {
    data?: { createOpportunity?: { id: string } } | null;
    errors?: unknown;
  };
  return { status: res.status(), body, id: body.data?.createOpportunity?.id };
}

test("P2-TW-CUR-001 (graphql): amountMicros 9007199254740991 round-trips exactly", async ({
  request,
  twAuth,
}) => {
  const made = await createOpportunityGql(request, twAuth, "gql-cur-max", "9007199254740991");
  expect(made.status, "create answered 200").toBe(200);
  expect(made.body.errors, "create: no errors").toBeUndefined();
  const id = made.id;
  expect(id, "create returned an id").toEqual(expect.any(String));
  try {
    const rows = await rowsById(
      readOnlyDb("twenty"),
      "opportunity",
      id as string,
      `"amountAmountMicros"::text AS micros`,
    );
    expect(rows.map((r) => r["micros"])).toEqual(["9007199254740991"]);
  } finally {
    await deleteOpportunity(request, twAuth, id as string);
  }
});

test("P2-TW-CUR-001 (graphql): amountMicros 9007199254740993 is rejected or round-trips exactly", async ({
  request,
  twAuth,
}) => {
  const made = await createOpportunityGql(request, twAuth, "gql-cur-over", "9007199254740993");
  // Setup, asserted before the known-bug marker: the request got a server answer, and an accepted create stored one row.
  expect(made.status, "setup: the request reached the server").toBeLessThan(500);
  const id = made.id;
  try {
    if (id !== undefined) {
      const rows = await rowsById(
        readOnlyDb("twenty"),
        "opportunity",
        id,
        `"amountAmountMicros"::text AS micros`,
      );
      expect(rows, "setup: exactly one stored row for the created id").toHaveLength(1);
    }
    // Known product bug P2-TW-BUG-001, GraphQL half (probe record, section 4). GraphQL stores 9007199254740992 for this
    // input, the same as REST. The marker sits after the setup asserts.
    test.fail(
      true,
      "P2-TW-BUG-001 (GraphQL): 9007199254740993 is accepted and stored as 9007199254740992",
    );
    if (id === undefined) {
      expect(made.body.errors, "rejected with a GraphQL error").toBeDefined();
    } else {
      const rows = await rowsById(
        readOnlyDb("twenty"),
        "opportunity",
        id,
        `"amountAmountMicros"::text AS micros`,
      );
      expect(rows.map((r) => r["micros"])).toEqual(["9007199254740993"]);
    }
  } finally {
    if (id !== undefined) await deleteOpportunity(request, twAuth, id);
  }
});
