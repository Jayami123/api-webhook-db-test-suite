# PB-DOC-001: Documenso invalid PDF upload answered 500 (public draft, not filed)

**Status:** draft; not filed. Filing is owner-only. See the [upstream index](README.md).

**Source:** verbatim copy of [docs/probes/2026-11-02-p2-lane-documenso-probes.md#L484-L492](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-documenso-probes.md#L484-L492) at the base commit. Evidence record: [docs/probes/2026-11-02-p2-lane-documenso-probes.md#L478-L492](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-documenso-probes.md#L478-L492).

---

#### Upstream draft (for the fork team; not posted)

Title: `Upload of an invalid PDF answers 500 instead of 4xx`

1. Steps: sign in, `POST /api/files/upload-pdf` with multipart `file` set to (a) an empty buffer, (b) bytes starting `MZ` named `x.pdf`, (c) the first 1 000 bytes of a valid PDF, (d) a password-protected PDF.
2. Observed: HTTP 500, body `{"error":"Upload failed"}` for all four. A valid PDF returns 200.
3. Expected: a 4xx (400 or 415 or 422) for input that is not a PDF. A 500 means a server fault and it should not be the answer to a client error.
4. Cause in code: `apps/remix/server/api/files/files.ts:56-57` (single `catch` answers 500 for every error).
5. Environment: fork `f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c`, harness 0.3.1, Linux, Node 24.
