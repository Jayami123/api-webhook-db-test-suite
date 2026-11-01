import type { CalAuth } from "../auth/cal.ts";
import { createCaller, type ApiRequestLike, type CallResult } from "./base.ts";

/**
 * Cal (fork c2b7ac4), web app on 3000 (API v2 is not started by the harness). Webhook CRUD goes
 * through the web tRPC with the session cookie; the cron and Daily routes are plain HTTP.
 */
export interface CalClient {
  webhooks: {
    create(input: {
      subscriberUrl: string;
      eventTriggers: string[];
      secret: string;
    }): Promise<string>;
    remove(id: string): Promise<void>;
    /** Sends one signed test payload through the same sendPayload code path as a real trigger. */
    testTrigger(input: { url: string; secret: string; type: string }): Promise<void>;
  };
  /** POST /api/cron/webhookTriggers with Authorization: <CRON_API_KEY> (no Bearer). 401 on a wrong key. */
  cronWebhookTriggers(cronKey: string): Promise<CallResult<unknown>>;
  /** POST /api/recorded-daily-video; business and signature statuses are results, not errors. */
  dailyVideo(
    rawBody: string | Buffer,
    headers: Record<string, string>,
  ): Promise<CallResult<unknown>>;
}

export function calClient(input: {
  request: ApiRequestLike;
  baseUrl: string;
  runPrefix: string;
  auth: CalAuth;
}): CalClient {
  const { request, baseUrl, runPrefix, auth } = input;
  const session = createCaller({
    request,
    baseUrl,
    runPrefix,
    extraHeaders: () => ({ cookie: auth.sessionCookie.reveal() }),
  });
  const anonymous = createCaller({ request, baseUrl, runPrefix });
  const trpc = async <T>(path: string, body: unknown): Promise<T> => {
    const res = await session<{ result: { data: { json: T } } }[]>(
      "POST",
      `/api/trpc/${path}?batch=1`,
      { body: { 0: { json: body } } },
    );
    return res.body[0]?.result.data.json as T;
  };
  return {
    webhooks: {
      async create({ subscriberUrl, eventTriggers, secret }) {
        return (
          await trpc<{ id: string }>("webhook/create", {
            subscriberUrl,
            eventTriggers,
            active: true,
            payloadTemplate: null,
            secret,
          })
        ).id;
      },
      async remove(id) {
        await trpc("webhook/delete", { id });
      },
      async testTrigger({ url, secret, type }) {
        await trpc("webhook/testTrigger", { url, secret, type, payloadTemplate: null });
      },
    },
    cronWebhookTriggers: (cronKey) =>
      anonymous("POST", "/api/cron/webhookTriggers", {
        headers: { authorization: cronKey },
        expect: [200, 401],
      }),
    dailyVideo: (rawBody, headers) =>
      anonymous("POST", "/api/recorded-daily-video", {
        rawBody,
        headers: { "content-type": "application/json", ...headers },
        expect: [200, 400, 403, 404, 405],
      }),
  };
}
