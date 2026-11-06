# Upstream status index

Product findings from the P2 suite, and where each one stands upstream. The findings themselves are proven
in the lane probe records and the tests linked from the [README](../../README.md). This index tracks disclosure
only.

## Channel rules

- **Public**: a draft file in this folder, with its source span. Filing an issue is owner-only, and the status
  moves to "filed" only when the owner supplies the issue URL.
- **Private-first**: a status row only. No body and no new mechanism detail in this repository.
  Status reads "to be reported privately" until the owner confirms that a private report was filed.
- **Held**: a status row only. Held items are not drafted, and the status reads as shown in the table.
- This index never claims a report or a filing that has not happened.

## Status table (14 rows)

| Finding ID | Product | Channel | Status | Draft file | Evidence |
|---|---|---|---|---|---|
| P5-DOC-TOK-002 | Documenso | private-first | to be reported privately | none | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-documenso-probes.md#L521) |
| P5-DOC-DEL-001 | Documenso | public | draft; not filed | [p5-doc-del-001.md](p5-doc-del-001.md) | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-documenso-probes.md#L535-L539) |
| P5-DOC-CONV-001 | Documenso | public | draft; not filed | [p5-doc-conv-001.md](p5-doc-conv-001.md) | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-documenso-probes.md#L526-L530) |
| PB-DOC-001 | Documenso | public | draft; not filed | [pb-doc-001.md](pb-doc-001.md) | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-documenso-probes.md#L478-L492) |
| B2 | Cal.com | public | draft; not filed | [b2.md](b2.md) | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-cal-live-probes.md#L338-L344) |
| B4 | Cal.com | public | draft; not filed | [b4.md](b4.md) | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-cal-live-probes.md#L346-L352) |
| SCH-002 | Cal.com | held | held; deterministic repro open | none | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-cal-live-probes.md#L354-L361) |
| PB-CAL-OAS-1 | Cal.com | public | draft; not filed | [pb-cal-oas-1.md](pb-cal-oas-1.md) | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-cal-live-probes.md#L325-L336) |
| P2-TW-BUG-001 | Twenty | public | draft; not filed | [p2-tw-bug-001.md](p2-tw-bug-001.md) | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-03-p2-lane-tw-probes.md#L77-L93) |
| P2-TW-BUG-002 | Twenty | public | draft; not filed | [p2-tw-bug-002.md](p2-tw-bug-002.md) | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-03-p2-lane-tw-probes.md#L95-L110) |
| P2-TW-BUG-003 | Twenty | public | draft; not filed | [p2-tw-bug-003.md](p2-tw-bug-003.md) | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-03-p2-lane-tw-probes.md#L112-L128) |
| P2-TW-BUG-004 | Twenty | private-first | to be reported privately | none | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-03-p2-lane-tw-probes.md#L130-L141) |
| P2-MED-CON-PRODUCT | Medusa | public | draft; not filed | [p2-med-con-product.md](p2-med-con-product.md) | [register](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/src/lanes/med/deviation-register.json) |
| Medusa ack-before-verify | Medusa | held | held for P5 | none | [probe record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-medusa-l0-probes.md) |

Ten public draft files are in this folder: the ten rows with a draft file above. The four rows with "none" have no file.
