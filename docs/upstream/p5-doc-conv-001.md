# P5-DOC-CONV-001: Documenso conversion outage answered 400 (public draft, not filed)

**Status:** draft; not filed. Filing is owner-only. See the [upstream index](README.md).

**Source:** verbatim copy of [docs/probes/2026-11-02-p2-lane-documenso-probes.md#L528-L530](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-documenso-probes.md#L528-L530) at the base commit. Evidence record: [docs/probes/2026-11-02-p2-lane-documenso-probes.md#L526-L530](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-documenso-probes.md#L526-L530).

---

**Draft upstream issue (for the owner to file; not filed).**
Title: A conversion-service outage is answered 400 Bad Request.
Body: When the DOCX conversion service is unreachable, `POST /api/v2/envelope/create` returns HTTP 400. The response body reports `"code":"CONVERSION_SERVICE_UNAVAILABLE"` with an inner `httpStatus` of 503 (`"message":"Conversion service request failed: fetch failed"`). The status mapping in `apps/remix/server/trpc/hono-trpc-open-api.ts:27` looks up `genericErrorCodeToTrpcErrorCodeMap` and falls back to 400 when the code is absent; `CONVERSION_SERVICE_UNAVAILABLE` is not in that map (`packages/lib/errors/app-error.ts`). Expected: a dependency outage is a 5xx (the AppError is already 503, `packages/lib/server-only/document-conversion/docx-to-pdf.ts:31-43`). Impact: clients and monitors treat an outage as a bad request, and do not retry. Reproduce: stop the Gotenberg service and create an envelope from a DOCX.
