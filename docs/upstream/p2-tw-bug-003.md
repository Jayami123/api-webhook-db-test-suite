# P2-TW-BUG-003: Twenty deleted webhook receives events in the memo window (public draft, not filed)

**Status:** draft; not filed. Filing is owner-only. See the [upstream index](README.md).

**Source:** verbatim copy of [docs/probes/2026-11-03-p2-lane-tw-probes.md#L126-L128](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-03-p2-lane-tw-probes.md#L126-L128) at the base commit. Evidence record: [docs/probes/2026-11-03-p2-lane-tw-probes.md#L112-L128](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-03-p2-lane-tw-probes.md#L112-L128).

---

- Upstream draft: title "Workspace webhook cache dispatches events to a deleted webhook and misses a webhook created within
  the memo window". Repro: create webhook A (`person.created`), delete A, create webhook B within 10 s, create a person.
  Result: the outbound request targets A's URL; B receives nothing. Expected: events go to the live webhooks only.
