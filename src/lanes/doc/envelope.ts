import type { ApiRequestLike } from "../../clients/base.ts";
import type { ReadOnlyDb } from "../../db/pg.ts";

export interface LaneHttp {
  readonly request: ApiRequestLike;
  readonly baseUrl: string;
  /** Value of the Authorization header (the API token). Never logged. */
  readonly authorization: () => string;
}

export interface SignerRow {
  readonly recipientId: number;
  readonly email: string;
  readonly token: string;
  readonly fieldId: number | undefined;
}

export interface PreparedEnvelope {
  readonly envelopeId: string;
  readonly documentId: number;
  readonly signers: readonly SignerRow[];
}

export interface RawResponse {
  readonly status: number;
  readonly text: string;
}

/** POST to an API v2 route with the token. Redirects are not followed; non-2xx is returned, not thrown. */
export async function v2Post(http: LaneHttp, path: string, body: unknown): Promise<RawResponse> {
  const res = await http.request.fetch(`${http.baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: http.authorization(), "content-type": "application/json" },
    data: JSON.stringify(body),
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  return { status: res.status(), text: await res.text() };
}

/** tRPC call with the session cookie context already on the caller. Non-2xx is returned, not thrown. */
export async function trpcPost(
  http: LaneHttp,
  procedure: string,
  json: unknown,
): Promise<RawResponse> {
  const res = await http.request.fetch(`${http.baseUrl}/api/trpc/${procedure}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    data: JSON.stringify({ json }),
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  return { status: res.status(), text: await res.text() };
}

/** Parses "document_1025" into 1025. A value without the prefix is a TEST BUG. */
export function documentIdOf(secondaryId: string): number {
  const match = /^document_(\d+)$/.exec(secondaryId);
  if (match?.[1] === undefined)
    throw new Error("TEST BUG: envelope secondaryId has no document_ prefix");
  return Number(match[1]);
}

/**
 * Create, add one SIGNATURE field per signer (required, P-DOC-9), read rows. Does NOT distribute.
 * The field lookup joins through Recipient and Envelope, so it does not depend on whether Field has
 * its own envelopeId column.
 */
export async function createSignableEnvelope(input: {
  http: LaneHttp;
  db: ReadOnlyDb;
  envelopeId: string;
}): Promise<PreparedEnvelope> {
  const rows = await input.db.select<{ id: number; email: string; token: string }>(
    `SELECT r."id" AS id, r."email" AS email, r."token" AS token FROM "Recipient" r JOIN "Envelope" e ON e."id" = r."envelopeId" WHERE e."id" = $1 ORDER BY r."id"`,
    [input.envelopeId],
  );
  const created = await v2Post(input.http, "/api/v2/envelope/field/create-many", {
    envelopeId: input.envelopeId,
    data: rows.map((r) => ({
      recipientId: r.id,
      type: "SIGNATURE",
      page: 1,
      positionX: 10,
      positionY: 10,
      width: 20,
      height: 5,
    })),
  });
  if (created.status !== 200)
    throw new Error(
      `TEST BUG: field create-many ${String(created.status)}: ${created.text.slice(0, 120)}`,
    );
  const env = await input.db.select<{ secondaryId: string }>(
    `SELECT "secondaryId" AS "secondaryId" FROM "Envelope" WHERE "id" = $1`,
    [input.envelopeId],
  );
  const first = env[0];
  if (first === undefined) throw new Error("TEST BUG: envelope row not found after create");
  const fields = await input.db.select<{ id: number; recipientId: number; type: string }>(
    `SELECT f."id" AS id, f."recipientId" AS "recipientId", f."type" AS type FROM "Field" f JOIN "Recipient" r ON r."id" = f."recipientId" JOIN "Envelope" e ON e."id" = r."envelopeId" WHERE e."id" = $1`,
    [input.envelopeId],
  );
  return {
    envelopeId: input.envelopeId,
    documentId: documentIdOf(first.secondaryId),
    signers: rows.map((r) => ({
      recipientId: r.id,
      email: r.email,
      token: r.token,
      fieldId: fields.find((f) => f.recipientId === r.id && f.type === "SIGNATURE")?.id,
    })),
  };
}

/** Sends the distribute request. Returns the status only. */
export async function distribute(http: LaneHttp, envelopeId: string): Promise<number> {
  return (await v2Post(http, "/api/v2/envelope/distribute", { envelopeId })).status;
}

/** Signs one field with the recipient token (tRPC). Returns the status only. */
export async function signField(http: LaneHttp, signer: SignerRow): Promise<number> {
  const res = await trpcPost(http, "field.signFieldWithToken", {
    token: signer.token,
    fieldId: signer.fieldId,
    value: "probe",
  });
  return res.status;
}

/** Completes the recipient through the token procedure. Returns the status only. */
export async function completeRecipient(
  http: LaneHttp,
  env: PreparedEnvelope,
  signer: SignerRow,
): Promise<number> {
  const res = await trpcPost(http, "recipient.completeDocumentWithToken", {
    token: signer.token,
    documentId: env.documentId,
  });
  return res.status;
}
