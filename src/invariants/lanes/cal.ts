import type { Rule } from "../engine.ts";
import { ESC, LEAK_LIKE_CONTAINS, LEAK_LIKE_PREFIX } from "../lane-kit.ts";

/** Owned by the cal lane. Appended to RULES.cal in ../rules.ts. */
export const calLaneRules: readonly Rule[] = [
  {
    id: "cal-leak-scheduled-trigger",
    kind: "leak",
    description:
      "No scheduled trigger of this run is left (its subscriber URL carries the run prefix)",
    cite: "packages/prisma/schema.prisma:1313-1327 (WebhookScheduledTriggers.subscriberUrl)",
    basis: "live",
    verified: "2026-11-02",
    param: LEAK_LIKE_CONTAINS,
    sql: `SELECT s."id"::text AS id, s."subscriberUrl" AS value FROM "WebhookScheduledTriggers" s WHERE s."subscriberUrl" LIKE $1 ${ESC}`,
  },
  {
    id: "cal-leak-booking-active",
    kind: "leak",
    description:
      "No ACCEPTED or PENDING booking of this run is left (attendee email carries the run prefix)",
    cite: "packages/prisma/schema.prisma:851-900 (Booking.status); Attendee.email",
    basis: "live",
    verified: "2026-11-02",
    param: LEAK_LIKE_PREFIX,
    sql: `SELECT b."uid" AS id, b."status"::text AS value FROM "Booking" b JOIN "Attendee" a ON a."bookingId" = b."id" WHERE a."email" LIKE $1 ${ESC} AND b."status"::text IN ('ACCEPTED', 'PENDING')`,
  },
];
