import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";

/**
 * Body keys at the pinned ref: transform-event-batch-to-webhook-events.ts:45-57 builds targetUrl, eventName,
 * objectMetadata, workspaceId, webhookId, eventDate, record, plus userId / workspaceMemberId (optional) and
 * updatedFields (update events only). P-TW-1 and P-TW-4 CONFIRMED the observed keys (no event id).
 */
export const twentyBodySchema = {
  type: "object",
  required: [
    "targetUrl",
    "eventName",
    "objectMetadata",
    "workspaceId",
    "webhookId",
    "eventDate",
    "record",
  ],
  additionalProperties: true,
  properties: {
    targetUrl: { type: "string" },
    eventName: { type: "string", pattern: "^person\\.(created|updated|destroyed)$" },
    objectMetadata: {
      type: "object",
      required: ["id", "nameSingular"],
      properties: { id: { type: "string" }, nameSingular: { type: "string" } },
    },
    workspaceId: { type: "string" },
    webhookId: { type: "string" },
    eventDate: { type: "string" },
    record: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
  },
} as const;

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(twentyBodySchema);

export function bodyErrors(body: unknown): string[] {
  return validate(body)
    ? []
    : (validate.errors ?? []).map((e: ErrorObject) => `${e.instancePath} ${e.message}`);
}
