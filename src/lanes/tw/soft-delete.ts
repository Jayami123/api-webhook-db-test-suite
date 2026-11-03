import type { TwentyClient } from "../../clients/twenty.ts";

/**
 * Soft delete of a person: `DELETE /rest/people/{id}?soft_delete=true` sets `deletedAt` and keeps the row. Twenty
 * v2.44.0 (fork 7cbdfec): rest-api-core.service.ts:80-98 routes on parseSoftDeleteRestRequest, which is true only
 * for soft_delete=true (parse-soft-delete-rest-request.util.ts:8-12). Without the parameter the row is removed.
 */
export function softRemovePerson(tw: TwentyClient, id: string): ReturnType<TwentyClient["raw"]> {
  return tw.raw("DELETE", `/rest/people/${id}?soft_delete=true`);
}
