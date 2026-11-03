import { z } from "zod";

/**
 * WH-005 payload contract. A copy of the fork's document webhook schema at f4105e4
 * (packages/lib/types/webhook-payload.ts), with the enum values from packages/prisma/schema.prisma.
 * Copied, not imported: the fork is read-only and this lane must not depend on its build.
 */
const enumOf = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

/** schema.prisma:167 (WebhookTriggerEvents). */
export const WEBHOOK_TRIGGER_EVENTS = [
  "DOCUMENT_CREATED",
  "DOCUMENT_SENT",
  "DOCUMENT_OPENED",
  "DOCUMENT_SIGNED",
  "DOCUMENT_COMPLETED",
  "DOCUMENT_REJECTED",
  "DOCUMENT_CANCELLED",
  "RECIPIENT_EXPIRED",
  "DOCUMENT_RECIPIENT_COMPLETED",
  "DOCUMENT_REMINDER_SENT",
  "TEMPLATE_CREATED",
  "TEMPLATE_UPDATED",
  "TEMPLATE_DELETED",
  "TEMPLATE_USED",
] as const;

/** Recipient (packages/lib/types/webhook-payload.ts:22-41). */
export const ZWebhookRecipientSchema = z.object({
  id: z.number(),
  envelopeId: z.string(),
  documentId: z.number().nullable(),
  templateId: z.number().nullable(),
  email: z.string(),
  name: z.string(),
  token: z.string(),
  documentDeletedAt: z.coerce.date().nullable(),
  expiresAt: z.coerce.date().nullable(),
  expirationNotifiedAt: z.coerce.date().nullable(),
  signedAt: z.coerce.date().nullable(),
  authOptions: z.any().nullable(),
  signingOrder: z.number().nullable(),
  rejectionReason: z.string().nullable(),
  role: enumOf(["CC", "SIGNER", "VIEWER", "APPROVER", "ASSISTANT"]), // schema.prisma:623
  readStatus: enumOf(["NOT_OPENED", "OPENED"]), // schema.prisma:607
  signingStatus: enumOf(["NOT_SIGNED", "SIGNED", "REJECTED"]), // schema.prisma:617
  sendStatus: enumOf(["NOT_SENT", "SENT"]), // schema.prisma:612
});

/** Document meta (packages/lib/types/webhook-payload.ts:46-61). */
export const ZWebhookDocumentMetaSchema = z.object({
  id: z.string(),
  subject: z.string().nullable(),
  message: z.string().nullable(),
  timezone: z.string(),
  dateFormat: z.string(),
  redirectUrl: z.string().nullable(),
  signingOrder: enumOf(["PARALLEL", "SEQUENTIAL"]), // schema.prisma:542
  allowDictateNextSigner: z.boolean(),
  typedSignatureEnabled: z.boolean(),
  uploadSignatureEnabled: z.boolean(),
  drawSignatureEnabled: z.boolean(),
  language: z.string(),
  distributionMethod: enumOf(["EMAIL", "NONE"]), // schema.prisma:555
  emailSettings: z.any().nullable(),
});

/** Document (packages/lib/types/webhook-payload.ts:66-90). */
export const ZWebhookDocumentSchema = z.object({
  id: z.number(),
  envelopeId: z.string(),
  externalId: z.string().nullable(),
  userId: z.number(),
  authOptions: z.any().nullable(),
  formValues: z.any().nullable(),
  visibility: enumOf(["EVERYONE", "MANAGER_AND_ABOVE", "ADMIN"]), // schema.prisma:395
  title: z.string(),
  status: enumOf(["DRAFT", "PENDING", "COMPLETED", "REJECTED", "CANCELLED"]), // schema.prisma:381
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
  deletedAt: z.coerce.date().nullable(),
  teamId: z.number().nullable(),
  templateId: z.number().nullable(),
  source: enumOf(["DOCUMENT", "TEMPLATE", "TEMPLATE_DIRECT_LINK"]), // schema.prisma:389
  documentMeta: ZWebhookDocumentMetaSchema.nullable(),
  recipients: z.array(ZWebhookRecipientSchema),
  Recipient: z.array(ZWebhookRecipientSchema), // legacy alias (webhook-payload.ts:89)
});

/** Wire envelope (packages/lib/types/webhook-payload.ts:96-101). */
export const ZWebhookPayloadSchema = z.object({
  event: enumOf(WEBHOOK_TRIGGER_EVENTS),
  payload: ZWebhookDocumentSchema,
  createdAt: z.string(),
  webhookEndpoint: z.string(),
});
