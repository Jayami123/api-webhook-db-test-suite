# PB-CAL-OAS-1: Cal.com committed OpenAPI does not match live bodies (public draft, not filed)

**Status:** draft; not filed. Filing is owner-only. See the [upstream index](README.md).

**Source:** verbatim copy of [docs/probes/2026-11-02-p2-lane-cal-live-probes.md#L325-L336](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-cal-live-probes.md#L325-L336) at the base commit. Evidence record: [docs/probes/2026-11-02-p2-lane-cal-live-probes.md#L325-L336](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-cal-live-probes.md#L325-L336).

---

### PB-CAL-OAS-1: committed OpenAPI does not describe the live 200 and 201 bodies (PRODUCT DOCUMENTATION BUG, proven)

- `GET /v2/slots` (200): the schema is the `data` map itself, while the response is `{status, data}` and the document's own example
  shows `{status, data}`. Validation of the live body fails at `/status` and `/data`.
- `POST /v2/bookings` (201): the schema requires `rescheduledByEmail` as a string and `rating` as a number; the live body returns
  `null` for both. Attendees require `seatUid` and `bookingFieldsResponses`, which the live body omits.
- CON-005 crawl: ten 200 bodies fail validation (`KNOWN_INVALID`, `src/lanes/cal/contract-pins.ts`): `GET /v2/bookings`,
  `GET /v2/bookings/{bookingUid}`, `GET /v2/bookings/{bookingUid}/calendar-links`, `GET /v2/bookings/{bookingUid}/references`,
  `GET /v2/calendars`, `GET /v2/event-types`, `GET /v2/event-types/{eventTypeId}`, `GET /v2/schedules/default`, `GET /v2/webhooks`,
  `GET /v2/webhooks/{webhookId}`.
- Evidence: `contracts/cal/openapi-v2.json` at `c2b7ac4` (sha256 in `contracts/cal/SOURCE.md`); the failing assertions are marked
  `test.fail` in `tests/contracts/cal/cal-con.spec.ts` and `cal-con-005.spec.ts`.
