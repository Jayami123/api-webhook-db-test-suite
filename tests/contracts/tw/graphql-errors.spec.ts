import { test, expect } from "../../../src/fixtures/index.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import { twAuthHeaders } from "../../../src/lanes/tw/http.ts";

test("P2-TW-CON-002: an invalid GraphQL filter returns 200 with errors[]", async ({
  request,
  twAuth,
}) => {
  const res = await request.post(`${apiBaseUrl("twenty")}/graphql`, {
    headers: { ...twAuthHeaders(twAuth), "content-type": "application/json" },
    data: { query: "query { people(filter: { nope: { eq: 1 } }) { edges { node { id } } } }" },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as {
    data: { people: unknown };
    errors: { message: string; extensions: { code: string; subCode: string } }[];
  };
  expect(body.data).toEqual({ people: null });
  expect(body.errors).toHaveLength(1);
  expect(body.errors[0]).toMatchObject({
    message: 'Object person doesn\'t have any "nope" field.',
    extensions: { code: "BAD_USER_INPUT", subCode: "INVALID_ARGS_FILTER" },
  });
});
