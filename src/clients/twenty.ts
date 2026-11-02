import type { TwentyAuth } from "../auth/twenty.ts";
import { createCaller, type ApiRequestLike, type CallResult } from "./base.ts";

/** Twenty v2.44.0. REST people and webhooks (Authorization: Bearer <api key>). */
export interface TwentyClient {
  people: {
    create(firstName: string): Promise<string>;
    update(id: string, firstName: string): Promise<void>;
    remove(id: string): Promise<void>;
  };
  webhooks: {
    create(input: {
      targetUrl: string;
      operations: string[];
      secret: string;
      description: string;
    }): Promise<string>;
    remove(id: string): Promise<void>;
  };
  raw(method: string, path: string): Promise<CallResult<unknown>>;
}

export function twentyClient(input: {
  request: ApiRequestLike;
  baseUrl: string;
  runPrefix: string;
  auth: TwentyAuth;
}): TwentyClient {
  const call = createCaller({
    request: input.request,
    baseUrl: input.baseUrl,
    runPrefix: input.runPrefix,
    auth: input.auth,
  });
  return {
    people: {
      async create(firstName) {
        const res = await call<{ data: { createPerson: { id: string } } }>("POST", "/rest/people", {
          body: { name: { firstName, lastName: "Qa" } },
        });
        return res.body.data.createPerson.id;
      },
      async update(id, firstName) {
        await call("PATCH", `/rest/people/${id}`, {
          body: { name: { firstName } },
          expect: [200],
        });
      },
      async remove(id) {
        await call("DELETE", `/rest/people/${id}`, { expect: [200] });
      },
    },
    webhooks: {
      async create(body) {
        const res = await call<{ id: string }>("POST", "/rest/webhooks", { body });
        return res.body.id;
      },
      async remove(id) {
        await call("DELETE", `/rest/webhooks/${id}`, { expect: [200] });
      },
    },
    raw: (method, path) => call(method, path),
  };
}
