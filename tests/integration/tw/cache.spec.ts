import { randomBytes } from "node:crypto";
import { test, expect } from "../../../src/fixtures/index.ts";
import type { APIRequestContext } from "@playwright/test";
import { apiBaseUrl } from "../../../src/env.ts";
import { twAuthHeaders } from "../../../src/lanes/tw/http.ts";
import { requireTwEnv } from "../../../src/lanes/tw/gates.ts";
import { POLL_INTERVALS } from "../../../src/slo.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { TW_STUDY_DELIVERY_MS } from "../../../src/lanes/tw/slo.ts";
import { REPLICA_B_URL, CACHE_VISIBLE_BUDGET_MS } from "../../../src/lanes/tw/replicas.ts";
import { runScopedName } from "../../../src/run/prefix.ts";
import type { TwentyAuth } from "../../../src/auth/twenty.ts";

async function metadata(request: APIRequestContext, base: string, auth: TwentyAuth, query: string) {
  const res = await request.post(`${base}/metadata`, {
    headers: { ...twAuthHeaders(auth), "content-type": "application/json" },
    data: { query },
  });
  return (await res.json()) as {
    data?: Record<string, unknown> | null;
    errors?: { message: string }[];
  };
}

test("P2-TW-CACHE-001 @replicas: a custom field added on replica A is visible on replica B within the measured budget", async ({
  request,
  twAuth,
}) => {
  // Locally a missing flag skips with the reason; in CI (the tw-cache job) it fails (review addendum A7).
  const gate = requireTwEnv("TWENTY_SERVER_REPLICAS", "2");
  test.skip(gate.skip, gate.reason);

  const a = apiBaseUrl("twenty");
  const name = `p2qa${randomBytes(5).toString("hex")}`;
  let fieldId: string | undefined;
  try {
    const objs = await metadata(
      request,
      a,
      twAuth,
      "{ objects(paging:{first:200}) { edges { node { id nameSingular } } } }",
    );
    const person = (
      objs.data as
        { objects: { edges: { node: { id: string; nameSingular: string } }[] } } | null | undefined
    )?.objects.edges.find((e) => e.node.nameSingular === "person")?.node.id;
    expect(person, "setup: the person object exists").toEqual(expect.any(String));

    const made = await metadata(
      request,
      a,
      twAuth,
      `mutation { createOneField(input:{ field:{ name:"${name}", label:"${runScopedName(`cache-${name}`)}", type:TEXT, objectMetadataId:"${person}" } }) { id } }`,
    );
    fieldId = (made.data as { createOneField?: { id: string } } | null | undefined)?.createOneField
      ?.id;
    expect(made.errors, "setup: create the field on A").toBeUndefined();
    expect(fieldId, "setup: field id").toEqual(expect.any(String));

    // Oracle: replica B answers with the field within the budget (poll step 100 ms, deadline = the budget).
    await expect
      .poll(
        async () => {
          const r = await metadata(
            request,
            REPLICA_B_URL,
            twAuth,
            `{ field(id:"${fieldId}") { id } }`,
          );
          return (
            (r.data as { field?: { id: string } | null } | null | undefined)?.field?.id === fieldId
          );
        },
        {
          timeout: CACHE_VISIBLE_BUDGET_MS,
          intervals: POLL_INTERVALS,
          message: "B returns the field within budget",
        },
      )
      .toBe(true);
  } finally {
    if (fieldId !== undefined) {
      const del = await metadata(
        request,
        a,
        twAuth,
        `mutation { deleteOneField(input:{ id:"${fieldId}" }) { id } }`,
      );
      expect(del.errors, "cleanup: delete the field on A").toBeUndefined();
      const deletedId: string = fieldId;
      // In-test leak assert (until the shared field rule lands): the field row is gone from the metadata table.
      await expect
        .poll(
          async () =>
            (
              await readOnlyDb("twenty").select<{ n: string }>(
                `SELECT COUNT(*)::text AS n FROM core."fieldMetadata" WHERE id = $1`,
                [deletedId],
              )
            )[0]?.n,
          {
            timeout: TW_STUDY_DELIVERY_MS,
            intervals: POLL_INTERVALS,
            message: "cleanup: no field row remains",
          },
        )
        .toBe("0");
    }
  }
});
