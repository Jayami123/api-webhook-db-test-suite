# P2-TW-BUG-001: Twenty amountMicros above 2^53-1 rounded silently (public draft, not filed)

**Status:** draft; not filed. Filing is owner-only. See the [upstream index](README.md).

**Source:** verbatim copy of [docs/probes/2026-11-03-p2-lane-tw-probes.md#L91-L93](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-03-p2-lane-tw-probes.md#L91-L93) at the base commit. Evidence record: [docs/probes/2026-11-03-p2-lane-tw-probes.md#L77-L93](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-03-p2-lane-tw-probes.md#L77-L93).

---

- Upstream draft: title "Opportunity amountMicros above Number.MAX_SAFE_INTEGER is accepted and rounded silently". Steps:
  `POST /rest/opportunities` with `{"amount":{"amountMicros":9007199254740993,"currencyCode":"USD"}}` (raw JSON digits). Result:
  201; stored and returned as `9007199254740992`. Expected: a 400 validation error, or exact storage. Environment: v2.44.0 image.
