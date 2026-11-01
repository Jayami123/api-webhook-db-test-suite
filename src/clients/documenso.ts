import type { DocumensoAuth } from "../auth/documenso.ts";
import { createCaller, type ApiRequestLike, type CallResult } from "./base.ts";

/** Documenso (fork f4105e4). API v2 with the token; webhooks and the Stripe route as probed. */
export interface DocumensoClient {
  envelopes: {
    create(input: {
      title: string;
      pdf: Buffer;
      recipients: { email: string; name: string }[];
    }): Promise<string>;
    remove(envelopeId: string): Promise<void>;
  };
  webhooks: {
    /** tRPC webhook.createWebhook; needs a hostname the create-time check accepts (plan Task 5). */
    create(input: { webhookUrl: string; eventTriggers: string[]; secret: string }): Promise<string>;
    remove(id: string): Promise<void>;
  };
  stripe: {
    post(rawBody: string | Buffer, headers: Record<string, string>): Promise<CallResult<unknown>>;
  };
}

export function documensoClient(input: {
  request: ApiRequestLike;
  baseUrl: string;
  runPrefix: string;
  auth: DocumensoAuth;
}): DocumensoClient {
  const { request, baseUrl, runPrefix, auth } = input;
  const api = createCaller({ request, baseUrl, runPrefix, auth });
  const session = createCaller({
    request,
    baseUrl,
    runPrefix,
    extraHeaders: () => ({
      cookie: auth.sessionCookie.reveal(),
      "x-team-id": String(auth.teamId),
    }),
  });
  const anonymous = createCaller({ request, baseUrl, runPrefix });
  const trpc = async <T>(procedure: string, body: unknown): Promise<T> => {
    const res = await session<{ result: { data: { json: T } } }>("POST", `/api/trpc/${procedure}`, {
      body: { json: body },
    });
    return res.body.result.data.json;
  };
  return {
    envelopes: {
      async create({ title, pdf, recipients }) {
        const res = await api<{ id: string }>("POST", "/api/v2/envelope/create", {
          multipart: {
            payload: JSON.stringify({
              type: "DOCUMENT",
              title,
              recipients: recipients.map((r) => ({ ...r, role: "SIGNER" })),
            }),
            files: { name: "example.pdf", mimeType: "application/pdf", buffer: pdf },
          },
        });
        return res.body.id;
      },
      async remove(envelopeId) {
        await api("POST", "/api/v2/envelope/delete", { body: { envelopeId } });
      },
    },
    webhooks: {
      async create({ webhookUrl, eventTriggers, secret }) {
        return (
          await trpc<{ id: string }>("webhook.createWebhook", {
            webhookUrl,
            eventTriggers,
            secret,
            enabled: true,
          })
        ).id;
      },
      async remove(id) {
        await trpc("webhook.deleteWebhook", { id });
      },
    },
    stripe: {
      post: (rawBody, headers) =>
        anonymous("POST", "/api/stripe/webhook", {
          rawBody,
          headers: { "content-type": "application/json", ...headers },
          expect: [200, 400, 500],
        }),
    },
  };
}
