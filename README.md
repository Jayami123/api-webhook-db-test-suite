# P2: HTTP contract, webhook and database tests for four open-source products

P2 tests the backend behaviour of four open-source products (Twenty, Medusa, Cal.com and Documenso) through their
HTTP APIs. It checks responses against the published OpenAPI documents, verifies signed webhook deliveries,
follows asynchronous chains, and asserts the results in the database through a read-only client. It does not
drive a browser. Where a product does not match its published contract or its own promise, the case is kept
as an expected failure with a stated reason, and the finding is listed below.

[![ci](https://github.com/Jayami123/api-webhook-db-test-suite/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Jayami123/api-webhook-db-test-suite/actions/workflows/ci.yml)

## Lanes

| Lane             | Product                  | Workflow                                                 | Runs in PR CI           |
| ---------------- | ------------------------ | -------------------------------------------------------- | ----------------------- |
| Twenty           | Twenty CRM               | [p2-tw.yml](.github/workflows/p2-tw.yml)                 | yes, path-selected      |
| Medusa           | Medusa commerce          | [p2-med.yml](.github/workflows/p2-med.yml)               | yes, path-selected      |
| Cal.com          | Cal.com scheduling       | [p2-cal.yml](.github/workflows/p2-cal.yml)               | yes, path-selected      |
| Documenso        | Documenso signing        | [p2-doc.yml](.github/workflows/p2-doc.yml)               | yes, path-selected      |
| Documenso serial | Documenso serial project | [p2-doc-serial.yml](.github/workflows/p2-doc-serial.yml) | no (nightly and manual) |

## CI

- [`ci.yml`](.github/workflows/ci.yml) calls the path-selected lane workflows: [`api.yml`](.github/workflows/api.yml),
  [`env-check.yml`](.github/workflows/env-check.yml), [`p2-cal.yml`](.github/workflows/p2-cal.yml),
  [`p2-doc.yml`](.github/workflows/p2-doc.yml), [`p2-med.yml`](.github/workflows/p2-med.yml) and
  [`p2-tw.yml`](.github/workflows/p2-tw.yml).
- The `gate` job is the required check for pull requests.
- The Documenso serial project ([`p2-doc-serial.yml`](.github/workflows/p2-doc-serial.yml)) is outside PR CI. It
  runs nightly at 08:07 Asia/Colombo (cron `37 2 * * *` UTC) and on manual dispatch.
  Serial proof on `main` at `7bb6cd0`: [run 42172842345](https://github.com/Jayami123/api-webhook-db-test-suite/actions/runs/42172842345) (manual dispatch; concluded success).
- [`tw-study.yml`](.github/workflows/tw-study.yml) is separate. `ci.yml` does not call it, and it is not part of the required gate.
- The ruleset `protect-main` requires only the `gate` check (verified 2026-11-06). The older names `check`, `unit` and `db-guard` are not required.
- The caller jobs in `ci.yml` set no `timeout-minutes`; each lane workflow sets its own. See [docs/lane-ownership.md](docs/lane-ownership.md).

## Quick check (no products)

    npm ci
    npm run check      # static checks (format, lint, typecheck) and unit tests
    npm run list:api   # lists the Playwright API projects: cal-api, doc-api, med-api, tw-api

Expected: each command exits 0. `npm run list:api` prints the test listing. These commands do not start any product,
so they are not a live lane run. Node 22 is set in `.nvmrc`; in cloud sessions run `export PATH="/usr/local/bin:$PATH"` first.

## Cloud session setup

The repository automates the steps it can. The owner pastes the rest into each product's environment settings.
Secret values are never committed.

### Cursor cloud

Automatic from the repository (`.cursor/environment.json`):

- `install` runs `bash scripts/cloud-install.sh`. It installs `poppler-utils` when `pdfsig` or `pdftotext` is missing,
  runs `npm ci` when `package-lock.json` exists, then runs `scripts/bootstrap.sh` for the products
  (default `medusa twenty documenso cal`).
- `start` runs `sudo service docker start`, `scripts/ensure-receiver-hostname.sh` and `npm run qa:passwords`.

The owner sets these in the Cursor environment settings (not committed):

- `PRODUCTS_ROOT=/home/user/products`. `scripts/bootstrap.sh` reads it.
- Any product secret that a lane plan requires. The names are in [`.env.example`](.env.example) and the lane plans.

### Claude Code cloud

Automatic from the repository (the `SessionStart` hook in `.claude/settings.json`, cloud sessions only, running
`.claude/hooks/session-start.sh`):

- Puts `/usr/local/bin` (Node 22) first on `PATH`, and exports `NODE24` when `/opt/node24` exists (Documenso).
- Runs `npm run qa:passwords` and `scripts/ensure-receiver-hostname.sh`, and starts `dockerd` when it is installed.
- Does not run `npm ci` or `bootstrap.sh`.

The owner sets these in the Claude cloud environment:

- Setup script: `bash scripts/cloud-install.sh`, the same entry point as Cursor.
- `PRODUCTS_ROOT=/home/user/products`.
- The same product secrets as Cursor.

`.claude/settings.json` disables co-author trailers and sets empty commit and PR attribution.

## Running product lanes

Product runs need the harness (`node_modules/qa-portfolio-harness`) and the product forks.
`scripts/bootstrap.sh` prepares the forks and dependencies. By itself it does not start a running test environment.
The setup for each lane is in its plan:

- [Twenty](docs/plans/2026-11-02-p2-lane-twenty.md)
- [Medusa](docs/plans/2026-11-02-p2-lane-medusa.md)
- [Cal.com](docs/plans/2026-11-02-p2-lane-cal.md)
- [Documenso](docs/plans/2026-11-02-p2-lane-documenso.md)

## Known product findings

Columns: proof status and disclosure status are separate. "Private-first" is a disclosure status, not a proof class.
Findings marked "details withheld" are not described here. The expected-failure marker is the `expectedDefect`
helper in the named test. A case with no marker is a positive control or a measurement.

| Finding                  | Product   | Claim                                                                                                            | Proof status                                | Disclosure / upstream status      | Case ID                                                                     | Expected-failure marker                                           | Evidence                                                                                                                                   |
| ------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| P5-DOC-TOK-002           | Documenso | Webhook data issue. Details withheld.                                                                            | proven; details withheld                    | to be reported privately; no file | P2-DOC-WH-005                                                               | yes, `tests/webhooks/doc/payload.spec.ts`                         | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-documenso-probes.md#L521)      |
| P5-DOC-DEL-001           | Documenso | Deleting an envelope that completes at the same moment answers 500 and leaves it live.                           | proven                                      | draft; not filed                  | none (cleanup ordering in P2-DOC-EXP-001/003)                               | none                                                              | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-documenso-probes.md#L535-L539) |
| P5-DOC-CONV-001          | Documenso | A conversion-service outage is answered 400 Bad Request.                                                         | proven                                      | draft; not filed                  | P2-DOC-CONV-002                                                             | yes, `tests/serial/doc/conversion.spec.ts`                        | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-documenso-probes.md#L526-L530) |
| PB-DOC-001               | Documenso | Upload of an invalid PDF answers 500 instead of 4xx.                                                             | proven                                      | draft; not filed                  | P2-DOC-UP-001 (zero-byte case), P2-DOC-UP-002, P2-DOC-UP-003, P2-DOC-UP-005 | yes, `tests/contracts/doc/upload.spec.ts`                         | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-documenso-probes.md#L478-L492) |
| B2                       | Cal.com   | A receiver 500 is acknowledged as success and is never retried.                                                  | proven                                      | draft; not filed                  | P2-CAL-WH-003                                                               | yes, `tests/webhooks/cal/cal-wh.spec.ts`                          | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-cal-live-probes.md#L338-L344)  |
| B4                       | Cal.com   | Two concurrent tasker runs deliver each task twice.                                                              | proven                                      | draft; not filed                  | P2-CAL-TASK-003                                                             | yes, `tests/serial/cal/cal-task.spec.ts`                          | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-cal-live-probes.md#L346-L352)  |
| SCH-002                  | Cal.com   | Concurrent scheduled-trigger fires can deliver one due row twice.                                                | intermittent                                | held; deterministic repro open    | P2-CAL-SCH-002 (positive control)                                           | none, `tests/serial/cal/cal-sch.spec.ts`                          | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-cal-live-probes.md#L354-L361)  |
| PB-CAL-OAS-1             | Cal.com   | The committed OpenAPI does not describe the live 200 and 201 bodies.                                             | proven                                      | draft; not filed                  | P2-CAL-CON-001, P2-CAL-CON-002, P2-CAL-CON-005                              | yes, `tests/contracts/cal/cal-con.spec.ts`, `cal-con-005.spec.ts` | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-lane-cal-live-probes.md#L325-L336)  |
| P2-TW-BUG-001            | Twenty    | Opportunity amountMicros above Number.MAX_SAFE_INTEGER is accepted and rounded silently.                         | proven (REST and GraphQL)                   | draft; not filed                  | P2-TW-CUR-001 (REST and GraphQL over-range cases)                           | yes, `tests/integration/tw/currency.spec.ts`                      | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-03-p2-lane-tw-probes.md#L77-L93)          |
| P2-TW-BUG-002            | Twenty    | The published OpenAPI document does not allow null for fields the list endpoints return as null.                 | proven                                      | draft; not filed                  | P2-TW-CON-001                                                               | yes, `tests/contracts/tw/rest-oas.spec.ts`                        | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-03-p2-lane-tw-probes.md#L95-L110)         |
| P2-TW-BUG-003            | Twenty    | A deleted webhook can receive events within the memo window, and a webhook created in that window can miss them. | proven                                      | draft; not filed                  | P2-TW-WH-010                                                                | yes, `tests/webhooks/tw/b1-drop.spec.ts`                          | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-03-p2-lane-tw-probes.md#L112-L128)        |
| P2-TW-BUG-004            | Twenty    | Workspace deletion returns an internal error in one lifecycle state. Details withheld.                           | proven; generic claim only                  | to be reported privately; no file | none (off-plan)                                                             | none                                                              | [record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-03-p2-lane-tw-probes.md#L130-L141)        |
| P2-MED-CON-PRODUCT       | Medusa    | Store API responses omit properties required by the published OpenAPI schema.                                    | proven contract deviation (register-backed) | new public draft; not filed       | P2-MED-CON-PRODUCT                                                          | yes, `tests/contracts/med/product-contract.spec.ts`               | [register](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/src/lanes/med/deviation-register.json)                      |
| Medusa ack-before-verify | Medusa    | Design finding. Held for P5. No bug claim.                                                                       | design finding                              | held for P5; no file              | none                                                                        | none                                                              | [probe record](https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/docs/probes/2026-11-02-p2-medusa-l0-probes.md)          |

Upstream channels and drafts are in [docs/upstream/README.md](docs/upstream/README.md).

## Architecture and reports

- Roadmap: [docs/plans/2026-10-20-p2-phase1-roadmap.md](docs/plans/2026-10-20-p2-phase1-roadmap.md)
- Lane ownership: [docs/lane-ownership.md](docs/lane-ownership.md)
- Upstream index: [docs/upstream/README.md](docs/upstream/README.md)
- Architecture diagram: later
- Live report: later
- Video: later
