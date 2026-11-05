import { readFileSync } from "node:fs";
import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import type { DocumensoClient } from "../../../src/clients/documenso.ts";
import type { ReadOnlyDb } from "../../../src/db/pg.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import {
  completeRecipient,
  createSignableEnvelope,
  distribute,
  signField,
  type LaneHttp,
  type PreparedEnvelope,
} from "../../../src/lanes/doc/envelope.ts";
import { productsRoot } from "../../../src/readiness/checks.ts";
import { withEnvelopeRemovedOnFailure } from "../../../src/lanes/doc/setup-failure.ts";
import { runScopedName } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";
import { expect } from "../../../src/fixtures/index.ts";

export interface CompletedEnvelope {
  readonly envelopeId: string;
  readonly prepared: PreparedEnvelope;
  /** The sealed download, as the product served it (GET /api/v2/envelope/item/{id}/download). */
  readonly sealed: Buffer;
}

/**
 * Creates an envelope with `signers` recipients, one signature each, distributes it, signs and
 * completes every recipient through the token procedures, waits for COMPLETED (poll, SLO budget), and
 * downloads the sealed item. The caller deletes the envelope in `finally`.
 */
export async function completedEnvelope(input: {
  label: string;
  signers: number;
  doc: DocumensoClient;
  request: APIRequestContext;
  authorization: () => string;
  db: ReadOnlyDb;
  runPrefix: string;
}): Promise<CompletedEnvelope> {
  const pdf = readFileSync(path.join(productsRoot(), "documenso", "assets", "example.pdf"));
  const envelopeId = await input.doc.envelopes.create({
    title: runScopedName(input.label),
    pdf,
    recipients: Array.from({ length: input.signers }, (_, i) => ({
      email: `${input.runPrefix}-${input.label}-s${String(i + 1)}@example.test`,
      name: `Signer ${String(i + 1)}`,
    })),
  });
  return withEnvelopeRemovedOnFailure(
    envelopeId,
    (id) => input.doc.envelopes.remove(id),
    async () => {
      const http: LaneHttp = {
        request: input.request,
        baseUrl: apiBaseUrl("documenso"),
        authorization: input.authorization,
      };
      const prepared = await createSignableEnvelope({ http, db: input.db, envelopeId });
      expect(prepared.signers).toHaveLength(input.signers);
      expect(await distribute(http, envelopeId)).toBe(200);
      for (const signer of prepared.signers) {
        expect(signer.fieldId).toBeDefined();
        expect(await signField(http, signer)).toBe(200);
        expect(await completeRecipient(http, prepared, signer)).toBe(200);
      }
      await expect
        .poll(
          async () =>
            (
              await input.db.select<{ status: string }>(
                `SELECT "status" AS status FROM "Envelope" WHERE "id" = $1`,
                [envelopeId],
              )
            )[0]?.status,
          { timeout: SLO.docWebhookDelivery.ms, intervals: POLL_INTERVALS, message: "COMPLETED" },
        )
        .toBe("COMPLETED");
      const items = await input.db.select<{ id: string }>(
        `SELECT "id" AS id FROM "EnvelopeItem" WHERE "envelopeId" = $1`,
        [envelopeId],
      );
      const item = items[0];
      if (item === undefined) throw new Error("TEST BUG: completed envelope has no item");
      const res = await input.request.fetch(
        `${http.baseUrl}/api/v2/envelope/item/${item.id}/download`,
        {
          headers: { authorization: input.authorization() },
          maxRedirects: 0,
          failOnStatusCode: false,
        },
      );
      expect(res.status()).toBe(200);
      return { envelopeId, prepared, sealed: Buffer.from(await res.body()) };
    },
  );
}
