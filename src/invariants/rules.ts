import type { ProductId } from "../env.ts";
import type { Rule } from "./engine.ts";

/**
 * One rule list per product. Every rule cites the schema line it relies on at the pinned ref
 * (scripts/bootstrap.sh). `basis: "live"` rules were run against the real schema on `verified`;
 * `basis: "live"` rules are checked against the running product by the Task 5 readiness spec,
 * which fails on an unknown table or column (SQLSTATE 42P01/42703).
 */
const LEAK_LIKE_PREFIX = "prefix-like" as const;
const LEAK_LIKE_CONTAINS = "contains-like" as const;
const RUN_START = "run-start" as const;
const ESC = String.raw`ESCAPE '\'`;

export const RULES: Readonly<Record<ProductId, readonly Rule[]>> = {
  cal: [
    {
      id: "cal-task-succeeded-has-attempt",
      kind: "consistency",
      description: "A succeeded task has at least one attempt (succeed() increments attempts)",
      cite: "packages/features/tasker/repository.ts:136-146; packages/prisma/schema.prisma:1832,1838",
      basis: "live",
      verified: "2026-11-01",
      param: RUN_START,
      sql: `SELECT "id"::text AS id, "attempts"::text AS value FROM "Task" WHERE "succeededAt" IS NOT NULL AND "attempts" < 1 AND "createdAt" >= $1::timestamptz`,
    },
    {
      id: "cal-task-attempts-bounded",
      kind: "consistency",
      description:
        "attempts never exceeds maxAttempts (tasks run only while attempts < maxAttempts)",
      cite: "packages/features/tasker/repository.ts:10-35; packages/prisma/schema.prisma:1838-1840",
      basis: "live",
      verified: "2026-11-01",
      param: RUN_START,
      sql: `SELECT "id"::text AS id, ("attempts"::text || '/' || "maxAttempts"::text) AS value FROM "Task" WHERE "attempts" > "maxAttempts" AND "createdAt" >= $1::timestamptz`,
    },
    {
      id: "cal-booking-end-after-start",
      kind: "consistency",
      description: "Every booking ends after it starts",
      cite: "packages/prisma/schema.prisma:869-870",
      basis: "live",
      verified: "2026-11-01",
      param: RUN_START,
      sql: `SELECT "id"::text AS id, "uid" AS value FROM "Booking" WHERE "endTime" <= "startTime" AND "createdAt" >= $1::timestamptz`,
    },
    {
      id: "cal-leak-webhook-url",
      kind: "leak",
      description: "No webhook of this run keeps a receiver URL (/r/<run id>/...)",
      cite: "packages/prisma/schema.prisma:1149 (Webhook.subscriberUrl)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_CONTAINS,
      sql: `SELECT "id"::text AS id, "subscriberUrl" AS value FROM "Webhook" WHERE "subscriberUrl" LIKE $1 ${ESC}`,
    },
    {
      id: "cal-leak-api-key-note",
      kind: "leak",
      description: "No API key of this run is left (ApiKey.note carries the run prefix)",
      cite: "packages/prisma/schema.prisma:1172-1176 (ApiKey.note)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id"::text AS id, "note" AS value FROM "ApiKey" WHERE "note" LIKE $1 ${ESC}`,
    },
    {
      id: "cal-leak-event-type-slug",
      kind: "leak",
      description: "No event type of this run is left",
      cite: "packages/prisma/schema.prisma:159-161 (EventType.title, slug)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id"::text AS id, "slug" AS value FROM "EventType" WHERE "slug" LIKE $1 ${ESC}`,
    },
    {
      id: "cal-leak-user-email",
      kind: "leak",
      description: "No user of this run is left (model User is mapped to users)",
      cite: 'packages/prisma/schema.prisma:138 (email); @@map(name: "users")',
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id"::text AS id, "email" AS value FROM "users" WHERE "email" LIKE $1 ${ESC}`,
    },
  ],
  documenso: [
    {
      id: "doc-envelope-completed-has-completedAt",
      kind: "consistency",
      description: "A COMPLETED envelope has completedAt",
      cite: "packages/prisma/schema.prisma:381-387 (DocumentStatus), 444 (Envelope.completedAt)",
      basis: "live",
      verified: "2026-11-01",
      param: RUN_START,
      sql: `SELECT "id" AS id, "status"::text AS value FROM "Envelope" WHERE "status" = 'COMPLETED' AND "completedAt" IS NULL AND "createdAt" >= $1::timestamptz`,
    },
    {
      id: "doc-recipient-signed-has-signedAt",
      kind: "consistency",
      description: "A SIGNED recipient has signedAt",
      cite: "packages/prisma/schema.prisma:617-621 (SigningStatus), 643 (Recipient.signedAt)",
      basis: "live",
      verified: "2026-11-01",
      param: RUN_START,
      sql: `SELECT r."id"::text AS id, r."email" AS value FROM "Recipient" r JOIN "Envelope" e ON e."id" = r."envelopeId" WHERE r."signingStatus" = 'SIGNED' AND r."signedAt" IS NULL AND e."createdAt" >= $1::timestamptz`,
    },
    {
      id: "doc-job-completed-has-completedAt",
      kind: "consistency",
      description: "A COMPLETED background job has completedAt",
      cite: "packages/prisma/schema.prisma:1117-1138 (BackgroundJobStatus, completedAt)",
      basis: "live",
      verified: "2026-11-01",
      param: RUN_START,
      sql: `SELECT "id" AS id, "name" AS value FROM "BackgroundJob" WHERE "status" = 'COMPLETED' AND "completedAt" IS NULL AND "submittedAt" >= $1::timestamptz`,
    },
    {
      id: "doc-leak-webhook-url",
      kind: "leak",
      description: "No webhook of this run keeps a receiver URL (/r/<run id>/...)",
      cite: "packages/prisma/schema.prisma:184-190 (Webhook.webhookUrl)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_CONTAINS,
      sql: `SELECT "id" AS id, "webhookUrl" AS value FROM "Webhook" WHERE "webhookUrl" LIKE $1 ${ESC}`,
    },
    {
      id: "doc-leak-api-token-name",
      kind: "leak",
      description: "No API token of this run is left (ApiToken.name carries the run prefix)",
      cite: "packages/prisma/schema.prisma:222-224 (ApiToken.name)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id"::text AS id, "name" AS value FROM "ApiToken" WHERE "name" LIKE $1 ${ESC}`,
    },
    {
      id: "doc-leak-envelope-title",
      kind: "leak",
      description: "No live envelope of this run is left",
      cite: "packages/prisma/schema.prisma:435-445 (Envelope.title, deletedAt)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id" AS id, "title" AS value FROM "Envelope" WHERE "title" LIKE $1 ${ESC} AND "deletedAt" IS NULL`,
    },
    {
      id: "doc-leak-recipient-email",
      kind: "leak",
      description: "No recipient of this run is left",
      cite: "packages/prisma/schema.prisma:632-635 (Recipient.email)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id"::text AS id, "email" AS value FROM "Recipient" WHERE "email" LIKE $1 ${ESC}`,
    },
  ],
  medusa: [
    {
      id: "med-payment-session-authorized-has-authorized-at",
      kind: "consistency",
      description: "An authorized payment session has authorized_at",
      cite: "@medusajs/payment 2.21.2 payment_session.authorized_at (observed 2026-11-01: authorized sessions carry it)",
      basis: "live",
      verified: "2026-11-01",
      param: RUN_START,
      sql: `SELECT "id" AS id, "status" AS value FROM "payment_session" WHERE "status" = 'authorized' AND "authorized_at" IS NULL AND "deleted_at" IS NULL AND "created_at" >= $1::timestamptz`,
    },
    {
      id: "med-link-cart-payment-collection-orphan",
      kind: "orphan",
      description:
        "A cart-payment_collection link row points at an existing cart (modules have no cross-module FK)",
      cite: "@medusajs/medusa 2.21.2 link table cart_payment_collection (core-flows createPaymentCollectionForCartWorkflow)",
      basis: "live",
      verified: "2026-11-01",
      param: RUN_START,
      sql: `SELECT l."id" AS id, l."cart_id" AS value FROM "cart_payment_collection" l LEFT JOIN "cart" c ON c."id" = l."cart_id" WHERE l."deleted_at" IS NULL AND c."id" IS NULL AND l."created_at" >= $1::timestamptz`,
    },
    {
      id: "med-leak-product-title",
      kind: "leak",
      description: "No live product of this run is left",
      cite: "@medusajs/product 2.21.2 product.title, deleted_at",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id" AS id, "title" AS value FROM "product" WHERE "title" LIKE $1 ${ESC} AND "deleted_at" IS NULL`,
    },
    {
      id: "med-leak-customer-email",
      kind: "leak",
      description: "No live customer of this run is left",
      cite: "@medusajs/customer 2.21.2 customer.email, deleted_at",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id" AS id, "email" AS value FROM "customer" WHERE "email" LIKE $1 ${ESC} AND "deleted_at" IS NULL`,
    },
    {
      id: "med-leak-api-key-title",
      kind: "leak",
      description: "No live (unrevoked) API key of this run is left",
      cite: "@medusajs/api-key 2.21.2 api_key.title, revoked_at (probe 2026-11-01: revoke then delete)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id" AS id, "title" AS value FROM "api_key" WHERE "title" LIKE $1 ${ESC} AND "revoked_at" IS NULL AND "deleted_at" IS NULL`,
    },
  ],
  twenty: [
    {
      id: "tw-leak-api-key-name",
      kind: "leak",
      description: "No unrevoked API key of this run is left (a revoked key stays as a row)",
      cite: "core.apiKey columns id, name, revokedAt (live 2026-11-01); api-key.resolver.ts revokeApiKey",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      sql: `SELECT "id"::text AS id, "name" AS value FROM "core"."apiKey" WHERE "name" LIKE $1 ${ESC} AND "revokedAt" IS NULL`,
    },
    {
      id: "tw-leak-webhook-url",
      kind: "leak",
      description: "No live webhook of this run keeps a receiver URL (/r/<run id>/...)",
      cite: "core.webhook columns id, targetUrl, deletedAt (live 2026-11-01)",
      basis: "live",
      verified: "2026-11-01",
      param: LEAK_LIKE_CONTAINS,
      sql: `SELECT "id"::text AS id, "targetUrl" AS value FROM "core"."webhook" WHERE "targetUrl" LIKE $1 ${ESC} AND "deletedAt" IS NULL`,
    },
    {
      id: "tw-leak-person-first-name",
      kind: "leak",
      description: "No live person of this run is left in any workspace schema",
      cite: "packages/twenty-server person.workspace-entity.ts (name composite -> nameFirstName); schemas workspace_* (live 2026-11-01: table person exists)",
      basis: "source",
      verified: "2026-11-01",
      param: LEAK_LIKE_PREFIX,
      perSchemaQuery: String.raw`SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'workspace\_%' ESCAPE '\' ORDER BY schema_name`,
      sql: `SELECT "id"::text AS id, "nameFirstName" AS value FROM {schema}."person" WHERE "nameFirstName" LIKE $1 ${ESC} AND "deletedAt" IS NULL`,
    },
  ],
};

export function rulesFor(product: ProductId): readonly Rule[] {
  return RULES[product];
}

/** Playwright project name -> product (playwright.config.ts: the four -api and the four -serial projects). */
const PROJECT_PRODUCT: Readonly<Record<string, ProductId>> = {
  "cal-api": "cal",
  "doc-api": "documenso",
  "med-api": "medusa",
  "tw-api": "twenty",
  "cal-serial": "cal",
  "doc-serial": "documenso",
  "med-serial": "medusa",
  "tw-serial": "twenty",
};

export function productOfProject(projectName: string): ProductId | undefined {
  return PROJECT_PRODUCT[projectName];
}
