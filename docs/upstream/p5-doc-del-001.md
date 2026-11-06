# P5-DOC-DEL-001: Documenso delete racing the last signature (public draft, not filed)

**Status:** draft; not filed. Filing is owner-only. See the [upstream index](README.md).

**Source:** verbatim copy of [docs/probes/2026-11-02-p2-lane-documenso-probes.md#L537-L539](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-documenso-probes.md#L537-L539) at the base commit. Evidence record: [docs/probes/2026-11-02-p2-lane-documenso-probes.md#L535-L539](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-documenso-probes.md#L535-L539).

---

**Draft upstream issue for P5-DOC-DEL-001 (not filed).**
Title: Deleting an envelope that completes at the same moment answers 500 and leaves it live.
Body: The owner delete handler reads the envelope's status, then chooses either a soft delete (completed) or a hard delete guarded by `status: { not: COMPLETED }` (`packages/lib/server-only/document/delete-document.ts:42`, `:146-167`, `:185-191`). If the last recipient completes between the read and the hard delete, the guard matches no row, Prisma raises P2025, the API answers 500, and the envelope remains with `deletedAt` NULL. Repro: one signer, distribute, then sign and complete while the owner calls `POST /api/v2/envelope/delete`. Expected: a soft delete (200) or a conflict (409), never a 500 with the envelope live. Fix suggestion: re-read the status inside the transaction, or turn the P2025 into the soft-delete path.
