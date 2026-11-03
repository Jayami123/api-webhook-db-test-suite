import { randomBytes } from "node:crypto";
import { test, expect } from "../../../src/fixtures/index.ts";
import type { APIRequestContext } from "@playwright/test";
import { apiBaseUrl } from "../../../src/env.ts";
import { twAuthHeaders } from "../../../src/lanes/tw/http.ts";
import { liveGate } from "../../../src/lanes/tw/gates.ts";
import { POLL_INTERVALS } from "../../../src/slo.ts";
import { REPLICA_B_URL, CACHE_VISIBLE_BUDGET_MS } from "../../../src/lanes/tw/replicas.ts";
import type { TwentyAuth } from "../../../src/auth/twenty.ts";

const twoReplicas = (process.env["TWENTY_SERVER_REPLICAS"] ?? "").trim() === "2";

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
  const gate = liveGate(
    "P2-TW-CACHE-001",
    twoReplicas,
    "needs the two-replica stack: TWENTY_SERVER_REPLICAS=2 (server-2 on 127.0.0.1:3003)",
  );
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
      `mutation { createOneField(input:{ field:{ name:"${name}", label:"${name}", type:TEXT, objectMetadataId:"${person}" } }) { id } }`,
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
    }
  }
});
