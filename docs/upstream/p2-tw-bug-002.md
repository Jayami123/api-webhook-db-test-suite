# P2-TW-BUG-002: Twenty published OAS disagrees with live list responses (public draft, not filed)

**Status:** draft; not filed. Filing is owner-only. See the [upstream index](README.md).

**Source:** verbatim copy of [docs/probes/2026-11-03-p2-lane-tw-probes.md#L108-L110](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-03-p2-lane-tw-probes.md#L108-L110) at the base commit. Evidence record: [docs/probes/2026-11-03-p2-lane-tw-probes.md#L95-L110](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-03-p2-lane-tw-probes.md#L95-L110).

---

- Upstream draft: title "OpenAPI 3.1.1 document does not allow null for fields the list endpoints return as null". Steps:
  load `GET /rest/open-api/core` (authenticated) and validate one `GET /rest/people?limit=1` response. Result: the listed
  violations. Expected: `nullable` (or `type: [..., "null"]`) on those fields, or no null values.
