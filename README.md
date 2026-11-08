# P2: backend contract, webhook and database tests

P2 tests the backend of four open-source products: Twenty (CRM), Medusa (commerce), Cal.com (scheduling) and
Documenso (document signing). The risk it looks at is simple. A request can return success while the data, the
outgoing webhook or the background job behind it is wrong. A 200 response is where checking starts, not where it ends.

P2 compares responses with each product's published OpenAPI contract, verifies signed webhook deliveries, follows
asynchronous work to its end, and reads the result from the database through a read-only client. It does not drive a browser.

[![ci](https://github.com/Jayami123/api-webhook-db-test-suite/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Jayami123/api-webhook-db-test-suite/actions/workflows/ci.yml)

The badge shows the status of the `main` CI workflow. It is not a measure of coverage.

## Three examples

- **A failed delivery recorded as a success.** Cal.com's receiver answered with a 500 error. The delivery task was still
  marked as succeeded after one attempt, and the next run never tried again, so the event was not sent again.
  ([upstream draft B2](https://github.com/Jayami123/api-webhook-db-test-suite/blob/99a2fdebbb60aac196fcb0fce16911e36a0d5c0a/docs/upstream/b2.md))
- **A number changed without an error.** Twenty accepted an `amountMicros` value of `9007199254740993` and returned
  `9007199254740992`. The value changed quietly. This is a precision gap, not a measured loss of money.
  ([upstream draft P2-TW-BUG-001](https://github.com/Jayami123/api-webhook-db-test-suite/blob/99a2fdebbb60aac196fcb0fce16911e36a0d5c0a/docs/upstream/p2-tw-bug-001.md))
- **A deleted webhook still gets events.** Within Twenty's 10-second cache window, a deleted webhook kept
  receiving events, while the webhook created to replace it missed them.
  ([upstream draft P2-TW-BUG-003](https://github.com/Jayami123/api-webhook-db-test-suite/blob/99a2fdebbb60aac196fcb0fce16911e36a0d5c0a/docs/upstream/p2-tw-bug-003.md))

## Why the evidence is checkable

Responses are checked against the published contracts, webhook deliveries are captured, and outcomes are read back
from the database, so a finding rests on what the system returned and stored. Each finding cites the probe record or
register it rests on. Where a product does not match its own promise, the case is kept with a stated reason. Not every
proven finding has an automated expected-failure check: some are documented from probe records alone.

On pull requests, each product lane runs when its own paths change. The Documenso serial project runs on a schedule
and on manual dispatch, not on pull requests.

## Go deeper

- [Technical guide](docs/technical-guide.md): lanes, CI, running each product lane, cloud setup, and remaining work.
- [Known product findings](docs/technical-guide.md#known-product-findings): all 14 findings, with proof and disclosure
  status kept apart.
- [Disclosure index](docs/upstream/README.md): where each upstream item stands. No item is marked as filed.

## Next step

Open one of the sources above and read the probe record it cites. If you want to see how the checks are built, the
technical guide explains how to run each lane.
