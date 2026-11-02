import type { ApiRequestLike } from "../../clients/base.ts";

/** Authorization for the tasker route: apps/web/app/api/tasks/cron/route.ts -> packages/features/tasker/api/cron.ts:8. */
export function tasksAuthHeader(cronSecret: string | undefined): string {
  if (cronSecret === undefined || cronSecret.trim() === "") {
    throw new Error(
      "TEST BUG: CRON_SECRET is not set in the up environment; refusing to send `Bearer undefined`",
    );
  }
  return `Bearer ${cronSecret}`;
}

/**
 * One tasker pass. The route returns after processQueue has settled (api/cron.ts:12,
 * task-processor.ts:37), so the deliveries are complete when this resolves.
 */
export async function runTaskerOnce(
  request: ApiRequestLike,
  webBaseUrl: string,
  cronSecret: string | undefined,
): Promise<number> {
  const res = await request.fetch(`${webBaseUrl}/api/tasks/cron`, {
    method: "GET",
    headers: { authorization: tasksAuthHeader(cronSecret) },
    failOnStatusCode: false,
    timeout: 60_000,
  });
  return res.status();
}

/**
 * Scheduled-trigger pass: POST with the raw key and no Bearer (webhookTriggers/route.ts:7-12).
 * Its deliveries are not awaited by the product, so callers wait with expect.poll.
 */
export async function fireScheduledTriggersOnce(
  request: ApiRequestLike,
  webBaseUrl: string,
  cronApiKey: string | undefined,
): Promise<number> {
  if (cronApiKey === undefined || cronApiKey.trim() === "") {
    throw new Error("TEST BUG: CRON_API_KEY is not set in the up environment");
  }
  const res = await request.fetch(`${webBaseUrl}/api/cron/webhookTriggers`, {
    method: "POST",
    headers: { authorization: cronApiKey },
    failOnStatusCode: false,
    timeout: 60_000,
  });
  return res.status();
}
