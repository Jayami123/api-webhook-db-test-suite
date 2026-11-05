import { readFileSync } from "node:fs";
import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import type { DocumensoClient } from "../../../src/clients/documenso.ts";
import type { ReadOnlyDb } from "../../../src/db/pg.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import {
  createSignableEnvelope,
  distribute,
  type LaneHttp,
  type PreparedEnvelope,
} from "../../../src/lanes/doc/envelope.ts";
import { expect } from "../../../src/fixtures/index.ts";
import { productsRoot } from "../../../src/readiness/checks.ts";
import { withEnvelopeRemovedOnFailure } from "../../../src/lanes/doc/setup-failure.ts";
import { runScopedName } from "../../../src/run/prefix.ts";

export interface DistributedEnvelope {
  readonly envelopeId: string;
  readonly prepared: PreparedEnvelope;
  readonly http: LaneHttp;
}

/**
 * Creates an envelope with `signers` recipients (run-tagged addresses), one SIGNATURE field each,
 * and distributes it (status 200 is asserted). Nothing is signed. The caller deletes it.
 */
export async function distributedEnvelope(input: {
  label: string;
  signers: number;
  doc: DocumensoClient;
  request: APIRequestContext;
  authorization: () => string;
  db: ReadOnlyDb;
  runPrefix: string;
}): Promise<DistributedEnvelope> {
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
      // Only a distributed (PENDING) envelope accepts signatures: signing a DRAFT is refused (P-DOC-11).
      expect(await distribute(http, envelopeId)).toBe(200);
      return { envelopeId, prepared, http };
    },
  );
}
