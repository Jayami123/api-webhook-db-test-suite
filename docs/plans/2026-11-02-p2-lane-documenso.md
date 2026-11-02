# P2 Documenso lane: plan (nothing built)

Date 2026-11-02 (UTC). Plan branch `plan/2026-11-02-p2-lane-documenso`. Base `origin/main` = `aa10ec1` (verified:
`git merge-base --is-ancestor aa10ec1 origin/main` and `git rev-parse origin/main` before any work). This plan is
written for a junior engineer or a smaller build model: every helper and spec has a code skeleton, every command is
exact, every task has a STOP list. Industry approach first, then the project rules (section 14).

Evidence: `docs/probes/2026-11-02-p2-lane-documenso-probes.md` (P-DOC-1 to P-DOC-18, cited as `P-DOC-n`). Nothing in
this plan states product behaviour without a probe entry or a `file:line` at the pinned ref. Where neither exists, the
item is marked **UNPROBED** with the probe that settles it.

ID form. The brief writes IDs as `DOC-WH-002`; the repository index and master plan write `P2-DOC-WH-002`. This plan
uses the `P2-DOC-…` form everywhere, including test titles. The IDs are the same cases.

---

## 1. Header

- **Base:** `origin/main` = `aa10ec1` (merged foundation PRs #5 to #9). Measured unit count at this base: **285** (`npm run unit`
  on a clean `git archive` of `aa10ec1` with the exact pins, 285 pass / 0 fail). The foundation index said 277; the
  measured number wins (CONTRADICTS index section 1, Task 6 row). Every task states "base + N" and the builder measures
  the base at task start.
- **Pinned product:** Documenso `f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c` (`scripts/bootstrap.sh:11`). Checked clean before every probe.
- **Harness:** `qa-portfolio-harness` tag `v0.3.0` = `be86e0e` (`package.json` pin, `package-lock.json` resolved entry). Installed in the repo's `node_modules` on 2026-11-02 by `bash scripts/cloud-install.sh` (`0.3.0` verified). Unit on that install: 285 pass, 0 fail.
- **Plan branch:** `plan/2026-11-02-p2-lane-documenso` (no PR, no merge, no tag).
- **Build branches** (one per task, stacked, each a PR whose base is the previous build branch until that PR merges, then `main`):
  - L0 `feat/2026-11-02-p2-documenso-l0-probes-helpers` (cut from `origin/main`)
  - L1 `feat/2026-11-02-p2-documenso-l1-contracts` (cut from the L0 head)
  - L2 `feat/2026-11-02-p2-documenso-l2-webhooks` (cut from the L1 head)
  - L3 `feat/2026-11-02-p2-documenso-l3-integration` (cut from the L2 head)
  - L4 `feat/2026-11-02-p2-documenso-l4-serial` (cut from the L3 head)
  - L5 `feat/2026-11-02-p2-documenso-l5-ci` (cut from the L4 head)
  - The builder uses the UTC date of its own start day in the branch name if that differs from 2026-11-02.
- **If the previous PR is not merged yet:** the builder cuts from the previous build branch head anyway (linear history), opens the PR with base = the previous build branch, and writes that in the report. It never merges. When the owner merges the previous PR, GitHub retargets the next PR to `main`.
- **Gate between tasks:** the builder starts task Ln only when the L(n-1) branch is pushed and its checks pass locally (section 8, step 0).

---

## 2. Probe findings

Full records in the probe file. Status column uses the vocabulary from that file.

| Probe | Question | Status | One-line proof |
|---|---|---|---|
| P-DOC-1 | One event reaches the receiver with the secret header | CONFIRMED | 1 delivery, `X-Documenso-Secret` equal to the configured value (length 32), `WebhookCall` SUCCESS 200 |
| P-DOC-2 | Receiver 500: attempts, gaps, rows, `createdAt` | CONFIRMED | 4 deliveries (1+3), gaps 15 to 54 ms, body `createdAt` differs per attempt, job FAILED retried 3 |
| P-DOC-3a | Receiver 9 s | CONFIRMED | 1 delivery, SUCCESS 200, job COMPLETED |
| P-DOC-3b | Receiver 11 s | CONFIRMED | 4 deliveries about 10 s apart (gaps 10009, 10017, 10016), `responseCode 0` x4, job FAILED retried 3 |
| P-DOC-3c | Receiver 302 | CONFIRMED | 4 deliveries on the original path only; `302` recorded x4 |
| P-DOC-4a | BackgroundJob states | CONFIRMED | PROCESSING observed; COMPLETED retried 0; FAILED retried 3 = maxRetries |
| P-DOC-4b | Re-dispatch of a terminal job (CAS) | CONFIRMED on terminal rows | wrong signature 401; correct signature 404 x3, row unchanged. Concurrent race UNPROBED |
| P-DOC-4c | Seal-sweep window edges, cron tick | tick timing CONFIRMED (RR-TICK); window edges UNPROBED | two quarter-hour batches observed (10:15:34 and 10:45:10); window edges need OD-4 (deferred); code: `seal-document-sweep.handler.ts:12-13, 25-76`, cron `*/15` (`seal-document-sweep.ts:18`) |
| P-DOC-5 | B3 recount | CONFIRMED (seed) | COMPLETED 333, completedAt 0, all 333 seeded (no run prefix) |
| P-DOC-5b | B3 runtime oracle | CONFIRMED | API-completed envelope: COMPLETED with `completedAt` set (`seal-document.handler.ts:310-316`) |
| P-DOC-6 | Expiry live refusal, guard call sites | CONFIRMED (one entry point) | sign after `expiresAt` in the past: 400 `RECIPIENT_EXPIRED`, row unchanged. Six files, not five (C-DOC-1) |
| P-DOC-7 | Stripe rows without a Stripe call | CONFIRMED (six rows; real-key re-run RR-STRIPE) | unsigned 400; bad 500; stale 500; unsynced 200; synced without customer 200; synced with customer: 500 with the placeholder key, 200 with the real key (Stripe rejected the placeholder) |
| P-DOC-8 | `pdfsig` and the sealed signature | CONFIRMED | `pdfsig 24.02.0`; sealed PDF `Signature is Valid.`; one flipped byte `Digest Mismatch.` |
| P-DOC-9 | API-only completion | CONFIRMED | create, field create-many SIGNATURE 200, distribute 200, sign 200, complete 200, COMPLETED |
| P-DOC-10 | Signing mail | CONFIRMED | 1 mail per recipient in Inbucket (REST 9003), token matches the recipient |
| P-DOC-11 | Refused transitions and their status codes | CONFIRMED | distribute on COMPLETED 500; field create on COMPLETED 400; sign on DRAFT 500; expired 400; rows unchanged |
| P-DOC-12 | Zero-byte upload | CONFIRMED | session 500 `Upload failed`; API token 401 (upload is session-only) |
| P-DOC-13 | `qa_fixture` grants | CONFIRMED | `expiresAt` update allowed; `signingStatus` update refused `42501` |
| P-DOC-14 | Login rate limit | CONFIRMED (429), row count UNPROBED | 10 logins per 15-minute bucket; the 11th returned 429 |
| P-DOC-15 | Audit rows | CONFIRMED (types) | DOCUMENT_CREATED, DOCUMENT_SENT, DOCUMENT_FIELD_INSERTED, DOCUMENT_RECIPIENT_COMPLETED, DOCUMENT_COMPLETED and more |
| P-DOC-16 | Stack and harness facts | CONFIRMED | cold `up` 396 s; warm `up` 26 s; `down` rc 0; port 5451 is the Documenso DB |
| P-DOC-17 | `api.stripe.com` reachability | CONFIRMED (CONTRADICTS foundation U14) | HTTP 401 now |
| P-DOC-18 | Recurring sweeps run in the stack | CONFIRMED (names and tick timing, RR-TICK) | `internal.expire-recipients-sweep`, `internal.send-signing-reminders-sweep`, `internal.cleanup-rate-limits`, `internal.seal-document-sweep` COMPLETED; ticks at 10:15:34 and 10:45:10 |

Not probed in this planning session (each has a settling probe in its task): the concurrent CAS race, the seal-sweep
edges, UP-002/003/004/005 content and limits, CON-001 contract, I18N-001/002 settings, BULK-001/002, SM-002,
AUD-002 certificate, EXP-001/002 timing and the other five entry points, WH-004 matrix, and the per-run Stripe fixture (its Stripe write calls and the organisation link are UNPROBED; the L2 step 0 probe settles them).

---

## 3. Resolved decisions (with evidence)

| # | Decision | Evidence |
|---|---|---|
| R1 | The webhook secret is a plain header, not an HMAC. The receiver check is shared-secret equality. | P-DOC-1; `execute-webhook-call.ts:38-41` |
| R2 | The request timeout is 10 000 ms (`WEBHOOK_TIMEOUT_MS`). A receiver at 9 s is accepted, at 11 s aborted. | P-DOC-3a/3b; `execute-webhook-call.ts:6, 33-37`; `timeout.ts:17-33` |
| R3 | Redirects are not followed (`redirect: 'manual'`). A 302 is a failure and is retried. | P-DOC-3c; `execute-webhook-call.ts:36` |
| R4 | One event makes 1 + 3 attempts with no back-off; body `createdAt` differs per attempt; `payload.id` is stable. | P-DOC-2; `local.ts:318` (`retried >= maxRetries`) |
| R5 | B3 is seed data, not a runtime defect. The product sets `completedAt` when an envelope completes. | P-DOC-5 (seed rows), P-DOC-5b (runtime oracle), `seal-document.handler.ts:310-316` |
| R6 | The sweep already excludes seed rows: the consistency rule filters `createdAt >= run start`. No change needed for B3. | `src/invariants/rules.ts:91-97` (`param: RUN_START`, `"createdAt" >= $1`) |
| R7 | A full signer flow runs through the public API and the token procedures. No UI is needed for SM, SIG, AUD, MAIL or the B3 oracle. | P-DOC-9; `recipient-router/router.ts:589-631`; `field-router/router.ts:616-626` |
| R8 | Expiry is enforced at signing. Time travel with `expiresAt` through `qa_fixture` is allowed by the allow-list. | P-DOC-6, P-DOC-13; `src/db/fixture-allowlist.ts` (the documenso `Recipient.expiresAt` entry) |
| R9 | The Stripe bad-signature 500 is the blanket catch (`handler.ts:113-118`), not a proven bug. The lane asserts non-2xx and no row change; no `test.fail`. | P-DOC-7; OD-5 |
| R10 | A sealed PDF is verifiable with `pdfsig`; a one-byte change is detected. | P-DOC-8 |
| R11 | Signing mail is captured by Inbucket (SMTP 2525, REST 9003); one mail per recipient. | P-DOC-10; `documenso.compose.yml:30-32` (harness v0.3.0) |
| R12 | STR-002/003 use a per-run Stripe test-mode fixture (customer, subscription, product, tagged `run_id`), created in setup and deleted in teardown even when the test fails (owner decision OD-15, 2026-11-02, override). The lane refuses any key that is not `sk_test_`. | P-DOC-7, RR-STRIPE; `sync-stripe-customer-subscription.ts:25` (convergent), `:31` (never creates organisations), `:55-68` (needs an organisation with that customer id); OD-15, OD-16 |
| R13 | `api.stripe.com` answers and accepts the test-mode key (`/v1/balance` 200; no auth 401). | P-DOC-17, RR-STRIPE (CONTRADICTS foundation U14) |
| R14 | CAS: a correctly signed re-dispatch of a non-PENDING job returns 404 and changes nothing. | P-DOC-4b; `local.ts:277-295` |
| R15 | The login limiter is 10 per 15-minute fixed bucket per user and IP. The lane mints one session per worker, and never sets `DANGEROUS_BYPASS_RATE_LIMITS`. | P-DOC-14; `rate-limits.ts:34-39`; `rate-limit.ts:48-53, 73, 84-93` |
| R16 | Billing on breaks document creation (`LIMIT_EXCEEDED`, foundation P1.3). Stripe rows therefore run in their own billing stack. | foundation `2026-11-01-p2-foundation-probes.md` 1.3; P-DOC-7 ran billing-on only for webhook rows |
| R17 | Every sweep and cron is `*/15 * * * *`. Observed: one batch of the four sweeps per quarter hour (10:15:34 and 10:45:10), dispatched while the web process is up. Reminder and expiry cases wait for one tick; the tick budget is 15 min + 2 min. | `seal-document-sweep.ts:18`; RR-TICK; P-DOC-18 |
| R18 | DOC-JOB-003/005 need writes to `Envelope.status`, `Recipient.signingStatus` or `BackgroundJob.status`. None is allow-listed (timestamps only), and the database refuses the column write. Deferred (OD-4). | P-DOC-13; `src/db/fixture-allowlist.ts:8-18` (`kind: 'timestamp'` only); `src/db/roles.ts:58-89` |
| R19 | The zero-byte upload returns 500 with a session. Confirmed against the case's own expectation (4xx). Candidate `test.fail` after a positive control. | P-DOC-12; `files.ts:56-57` |
| R20 | Precondition refusals use a plain `Error` in two routes (500) and `AppError` in others (400). Recorded, not `test.fail` (no stated contract). | P-DOC-11; `sign-field-with-token.ts:100`; `send-document.ts:125`; OD-6 |
| R21 | The sealed PDF's signature is by `CN=Documenso` (self-signed, issuer unknown). Integrity is checked; trust is not. | P-DOC-8 |
| R22 | Mailbox names are the lower-cased local part of the recipient address; the signing token is the `/sign/<token>` segment of the body. | P-DOC-10 (`tokenMatchesRecipient 1 of 1`) |
| R23 | Download of the sealed item is `GET /api/v2/envelope/item/{id}/download` (the download router is mounted under `/api/v2`). | P-DOC-8/P-DOC-9 (200, `%PDF-`); `apps/remix/server/router.ts:128-129` |
| R24 | Documenso's Postgres is host port 5451. The brief's port list (3000, 3001, 5555, 5433, 5434, 6380, 6381) omitted it. | P-DOC-16; `docker/documenso.compose.yml:19` |
| R25 | The local job dispatch is compare-and-set on `status = 'PENDING'`; there is no lease column or lease check. | `local.ts:277-295`; P-DOC-4b |
| R26 | `pdfsig` 24.02 prints `Signature Validation: Signature is Valid.` and `Digest Mismatch.`. Assertions read that line; the master-plan phrase "Signature is invalid" is not used. | P-DOC-8 (CONTRADICTS master plan DOC-SIG-002 text) |
| R27 | Upload is session-only (`resolveFileUploadUserId`). The API token gets 401. | P-DOC-12; `files.ts:29-34` |
| R28 | The recipient leak rule has no `deletedAt` filter, so a soft-deleted envelope's recipients are still flagged. The lane scopes the rule to live envelopes (L1), with unit tests. | `src/invariants/rules.ts:151-159` (read); `schema.prisma:445` (`Envelope.deletedAt`) |
| R29 | Harness `up` needs `PRODUCTS_ROOT` in every invocation (`up` and `down`) when the harness is not inside `products/`. | P-DOC-16 (`down` error, fixed by the variable) |
| R30 | Cold `up` on this VM was 396 s with layers still extracting; the foundation measured about 11 min. CI budgets use 11 min. | P-DOC-16; foundation section 8 |

---

## 4. Case mapping

### 4.1 IDs, decisions and tasks

Decision: K = keep as written, U = upgrade as noted, NEW = new ID (scope from the 2026-10-29 review or derived as noted),
CUT = cut. Test titles begin with the ID. "BUILT" = the task writes it; "DEFERRED" = an owner decision (section 14.2; HR-4 and HR-5 move to harness v0.3.1); "BLOCKED" = a missing prerequisite (none in this plan).

| ID | Dec. | Task | Spec file | Test title (exact) | Oracle | Fails when | Status |
|---|---|---|---|---|---|---|---|
| P2-DOC-UP-001 | K | L1 | `tests/contracts/doc/upload.spec.ts` | `P2-DOC-UP-001 a valid PDF upload with the session is accepted (positive control)` | status 200 and body `id` | the control fails: test stops (no `test.fail`) | BUILT |
| P2-DOC-UP-001 | K | L1 | same | `P2-DOC-UP-001 a zero-byte PDF is refused with 4xx, not 500 (KNOWN PRODUCT BUG: P-DOC-12)` | `test.fail` on `expect([400,415,422]).toContain(status)` | product returns 500 (current) → test.fail passes | BUILT (test.fail, after the control) |
| P2-DOC-UP-002 | K | L1 | same | `P2-DOC-UP-002 <row text from master plan, read at L1 start>` | 4xx | a 2xx for the invalid input | BUILT once the row text is read (STOP if absent) |
| P2-DOC-UP-003 | K | L1 | same | `P2-DOC-UP-003 <row text, read at L1 start>` | per row | per row | BUILT once the row text is read |
| P2-DOC-UP-004 | U | L1 | same | `P2-DOC-UP-004 a file one byte over 50 MB is refused with 400 and stores nothing` | status 400; no `DocumentData` row of this run | a 2xx; a stored row | BUILT after probe (UNPROBED size) |
| P2-DOC-UP-005 | K | L1 | same | `P2-DOC-UP-005 an encrypted PDF is refused with 4xx and stores nothing` | 4xx; no row | a 2xx | BUILT after probe (UNPROBED fixture) |
| P2-DOC-CON-001 | K | L1 | `tests/contracts/doc/envelope-contract.spec.ts` | `P2-DOC-CON-001 GET /api/v2/envelope/{id} matches the served OpenAPI document` | AJV validation against the committed OAS | a field violates the schema | BUILT after the OAS path is probed (UNPROBED) |
| P2-DOC-CONV-002 | U | — | — | — | — | — | DEFERRED (owner decision 2026-11-02): harness v0.3.1, HR-5 (no Gotenberg in the Documenso stack; `document-conversion.ts:15-17`) |
| P2-DOC-CONV-003 | K | — | — | — | — | — | DEFERRED (owner decision 2026-11-02): harness v0.3.1, HR-5 |
| P2-DOC-I18N-001 | K | L1 | `tests/contracts/doc/i18n.spec.ts` | `P2-DOC-I18N-001 the sealed PDF shows the German date format dd.MM.yyyy` | `pdftotext` contains the expected date string | date absent or another format | BUILT after the meta field names are probed (UNPROBED) |
| P2-DOC-I18N-002 | K | L1 | same | `P2-DOC-I18N-002 the sealed PDF renders the Asia/Kathmandu time as UTC+05:45` | rendered time = UTC + 5:45 | another offset | BUILT after probe (UNPROBED) |
| P2-DOC-WH-001 | U | L2 | `tests/webhooks/doc/delivery.spec.ts` | `P2-DOC-WH-001 the secret header equals the configured secret; a loopback webhook URL is refused at create` | `verifyDocumenso` ok; create 400 | a different secret; a create that succeeds | BUILT |
| P2-DOC-WH-002 | U | L2 | same | `P2-DOC-WH-002 one event makes 1 + 3 attempts with no back-off, and createdAt differs per attempt` | 4 deliveries, 4 distinct body `createdAt`, 1 `payload.id` | count != 4; equal `createdAt` | BUILT |
| P2-DOC-WH-003 | U | L2 | same | `P2-DOC-WH-003 a 9 s receiver is delivered once` | 1 delivery, SUCCESS 200 | 0 or 2 deliveries; not SUCCESS | BUILT |
| P2-DOC-WH-003 | U | L2 | same | `P2-DOC-WH-003 an 11 s receiver is aborted at the 10 s timeout and retried three times` | 4 deliveries, gaps >= 9500 ms, WebhookCall responseCode 0 x4 | gap < 9500 ms or a 200 | BUILT |
| P2-DOC-WH-004 | K | L2 | same | `P2-DOC-WH-004 each event of the trigger matrix is delivered exactly once per action` | per event count 1 | 0 or 2 | BUILT for the events the API can trigger (CREATED, SENT, COMPLETED, CANCELLED, REJECTED); OPENED UNPROBED |
| P2-DOC-WH-005 | K | — | — | — | — | — | DEFERRED (OD-11): row text not in the master plan |
| P2-DOC-WH-006 | NEW | L2 | same | `P2-DOC-WH-006 no per-delivery identifier exists (only payload.id is stable across attempts)` | no header or body field, other than `createdAt`, differs per attempt; `payload.id` equal | a header matching /delivery\|event-id\|idempotenc/i appears; a body field besides `createdAt` changes | BUILT (fact pinning, scope from the brief) |
| P2-DOC-WH-007 | NEW | L2 | same | `P2-DOC-WH-007 a 302 receiver is not followed (no delivery on /redirected)` | 4 deliveries on the original path; WebhookCall 302 x4 | a delivery path ending `/redirected` | BUILT |
| P2-DOC-STR-001 | U | L2 | `tests/billing/doc/stripe.spec.ts` (billing project) | `P2-DOC-STR-001 an unsigned Stripe event is refused with 400` | 400 `No signature found in request` | any 2xx | BUILT (billing stack) |
| P2-DOC-STR-001 | U | L2 | same | `P2-DOC-STR-001 a bad or stale signature is refused with a non-2xx and changes no rows` | non-2xx; `Subscription` and `Organisation` row counts unchanged | a 2xx; a changed row | BUILT (OD-5) |
| P2-DOC-STR-001 | U | L2 | same | `P2-DOC-STR-001 a correctly signed event that is not synced is accepted (200) and changes no rows` | 200 `Webhook received`; counts unchanged | non-200 | BUILT |
| P2-DOC-STR-002 | U | L2 | `tests/billing/doc/stripe.spec.ts` (billing project) | `P2-DOC-STR-002 a validly signed synced event is processed once against the run's subscription` | Subscription rows for the run customer: exactly 1 after the first delivery; identical after an identical second delivery | 0 or 2 rows; any change on the repeat | BUILT after L2 step 0b, with the per-run fixture (section 6.7b); skipped when `STRIPE_API_KEY` is absent (named condition); refused when the key is not `sk_test_` |
| P2-DOC-STR-003 | U | L2 | same | `P2-DOC-STR-003 out-of-order subscription events end in the live Stripe state` | `updated` (t2) then `created` (t1, payload status `canceled`): the final Subscription status equals the status read live from Stripe | the final status equals the stale payload status | BUILT after L2 step 0b, with the per-run fixture; same skip and refusal rules |
| P2-DOC-SM-001 | K | L3 | `tests/integration/doc/lifecycle.spec.ts` | `P2-DOC-SM-001 completing an envelope through the product sets completedAt (B3 oracle)` | status COMPLETED and `completedAt` not NULL | completedAt NULL after COMPLETED | BUILT |
| P2-DOC-SM-001 | K | L3 | same | `P2-DOC-SM-001 refused transitions on a COMPLETED envelope change no rows` | distribute: non-2xx; field create: 400; row snapshot equal | a 2xx; a changed row | BUILT (OD-6) |
| P2-DOC-SM-002 | K | L3 | same | `P2-DOC-SM-002 distributing a PENDING envelope a second time changes no rows` | status and recipient rows unchanged; non-2xx or 2xx with unchanged rows | a changed row | BUILT after probe (UNPROBED) |
| P2-DOC-SIG-001 | K | L3 | `tests/integration/doc/signature.spec.ts` | `P2-DOC-SIG-001 the sealed PDF signature is valid (pdfsig), with an unsigned control` | `Signature Validation: Signature is Valid.`; control: no signature | any other validation text | BUILT |
| P2-DOC-SIG-002 | K | L3 | same | `P2-DOC-SIG-002 a flipped byte inside the signed range is reported as a digest mismatch` | validation line is not "Signature is Valid." and contains "Digest Mismatch" | still valid after the flip | BUILT |
| P2-DOC-SIG-003 | K | L3 | same | `P2-DOC-SIG-003 the signer certificate CN equals the configured signing certificate` | CN equals the CN of the cert file (openssl) | a different CN | BUILT after the cert path is probed (UNPROBED path) |
| P2-DOC-AUD-001 | K | L3 | `tests/integration/doc/lifecycle.spec.ts` | `P2-DOC-AUD-001 a full lifecycle writes exactly one audit row per action type` | the types of P-DOC-15 with count 1 each | a missing or duplicated type | BUILT |
| P2-DOC-AUD-002 | K | L3 | same | `P2-DOC-AUD-002 the certificate PDF names each signer` | `pdftotext` of `GET /api/v2/envelope/{id}/certificate/download` contains each signer email | an email missing | BUILT after probe (UNPROBED) |
| P2-DOC-EXP-001 | U | L3 | `tests/integration/doc/expiry.spec.ts` | `P2-DOC-EXP-001 signing 1 s before expiry succeeds` | `expiresAt = now+2 s` via fixture; sign now: 200; status SIGNED | 4xx | BUILT |
| P2-DOC-EXP-002 | U | L3 | same | `P2-DOC-EXP-002 signing 1 s after expiry is refused and the recipient is unchanged` | `expiresAt = now-1 s`: 400 `RECIPIENT_EXPIRED`; row unchanged | a 2xx; a changed row | BUILT |
| P2-DOC-EXP-003 | NEW | L3 | same | `P2-DOC-EXP-003 a recipient moved back into its window signs again` | `expiresAt` moved from past to future: 200 | still refused | BUILT (scope OD-10) |
| P2-DOC-BULK-001 | U | L3 | `tests/integration/doc/bulk.spec.ts` | `P2-DOC-BULK-001 a CSV with one bad row mid-file: behaviour recorded and pinned` | pinned observed outcome (UNPROBED) | outcome differs from the pin | BUILT after probe (UNPROBED) |
| P2-DOC-BULK-002 | U | L3 | same | `P2-DOC-BULK-002 re-submitting the same CSV sends no duplicate mail` | count per recipient 1 | 2 | BUILT after probe (UNPROBED) |
| P2-DOC-MAIL-001 | K | L3 | `tests/integration/doc/mail.spec.ts` | `P2-DOC-MAIL-001 each recipient gets exactly one signing mail carrying its own token` | counts 1 and 1; token match | 0, 2, or a foreign token | BUILT (P-DOC-10) |
| P2-DOC-MAIL-002 | K | — | — | — | — | — | DEFERRED (OD-12): row text not in the master plan |
| P2-DOC-REM-001 | K | L4 | `tests/serial/doc/reminders.spec.ts` | `P2-DOC-REM-001 one reminder per interval (one cron tick)` | one new reminder mail; `nextReminderAt` advanced past now | 0 or 2 new mails | BUILT (tick budget) |
| P2-DOC-REM-002 | K | L4 | same | `P2-DOC-REM-002 a recipient who signed gets no reminder (one cron tick)` | 0 new mails to that recipient | any new mail | BUILT (tick budget) |
| P2-DOC-JOB-001 | K | L4 | `tests/serial/doc/jobs.spec.ts` | `P2-DOC-JOB-001 a completed envelope has exactly one seal job` | `BackgroundJob` rows with jobId `internal.seal-document` naming the envelope's document id: count 1 | 0 or 2 | BUILT |
| P2-DOC-JOB-002 | U | — | — | — | — | — | DEFERRED (OD-4): needs a fault in the signing path (restart with a broken cert path) |
| P2-DOC-JOB-003 | U | — | — | — | — | — | DEFERRED (OD-4): needs writes to `BackgroundJob.status` |
| P2-DOC-JOB-004 | NEW | L4 | same | `P2-DOC-JOB-004 three signed re-dispatches of a terminal job are refused by compare-and-set` | 404 x3; row unchanged | 2xx; changed row | BUILT (race part OD-7) |
| P2-DOC-JOB-005 | NEW | — | — | — | — | — | DEFERRED (OD-4): needs PENDING envelopes with signed recipients, not reachable through the API |

Count of reviewed IDs covered: 22 K + 14 U + 3 CUT = 39. NEW: 5 (JOB-004, JOB-005, WH-006, WH-007, EXP-003).
BUILT rows: L1 9 tests (incl. 1 `test.fail`), L2 12 (7 in `doc-api`, 5 in `doc-billing-api`, of which 2 skip without a key), L3 14, L4 4: 39 new test definitions in total. DEFERRED: CONV-002, CONV-003 (harness v0.3.1, HR-5), WH-005, MAIL-002, JOB-002, JOB-003, JOB-005.

### 4.2 CUT list (not built; never in a task, spec title or file name)

P2-DOC-CONV-001, P2-DOC-I18N-003, P2-DOC-CON-002. Listed here only.

### 4.3 Framework checks (no ID; listed separately)

| Name | What | Task | Fails when |
|---|---|---|---|
| FC-1 login 429 leaves no run token | after a refused login (429), the count of `ApiToken` rows whose name carries the run prefix is unchanged | L0 probe, L1 test | a token row appears for a refused request |
| FC-2 lane never sets the rate-limit bypass | unit test over `.github/workflows/api.yml` and `src/lanes/doc/**`: the text `DANGEROUS_BYPASS_RATE_LIMITS` does not appear | L5 | the flag appears |
| FC-3 cron tick budget | `tickDeadlineMs` returns the next quarter hour plus 120 s, using `CRON_PERIOD_MS` | L0 unit, used L4 | off by a period |
| FC-4 pdfsig on the runner | `command -v pdfsig pdftotext` exits 0 in the lane job before tests | L5 | a missing binary fails the job before tests |
| FC-5 receiver hostname | `p2-receiver.test` resolves to 127.0.0.1 (foundation check; reused) | existing | the hosts line is absent |
| FC-6 test-mode guard | `assertTestModeKey` refuses every key that is not `sk_test_`; unit tests, and no output or log contains the key | L2 | a live key is accepted, or its value appears in a message |
| FC-7 Stripe reaper | subscriptions, customers and organisations tagged `run_id` (organisation name carries the run prefix) older than 2 h are deleted, using the section 7 rules; counts only in the output | L2 (job step after the run) | any residue remains after the job |

### 4.4 Upstream-coverage gate (fork `f4105e47…` test files, searched with `rg -l` and `rg -n`)

| ID | Upstream file:line | Verdict |
|---|---|---|
| WH-001 (secret header, SSRF bypass) | none found for `X-Documenso-Secret` in tests. CRUD only: `packages/app-tests/e2e/webhooks/webhooks-crud.spec.ts:42,92,126,173`, `webhook-secret-access.spec.ts`. URL check unit: `packages/lib/server-only/webhooks/assert-webhook-url.test.ts` | KEEP (delivery header and SSRF path not covered) |
| WH-002, WH-003, WH-006, WH-007 | none (`executeWebhookCall`, `execute-webhook`, retry, timeout, redirect: no test) | KEEP |
| WH-004 | none | KEEP |
| WH-005 | row text not located | DEFERRED (OD-11) |
| STR-001/002/003 | none for `stripe/webhook` (`rg -n "stripeWebhookHandler|stripe/webhook"`: no match) | KEEP |
| SM-001 | `packages/app-tests/e2e/api/v2/unauthorized-api-access/api-access-envelope-cancel.spec.ts:190` (rejects cancelling a completed document) | KEEP as P2 (DB end state and status class; upstream asserts the refusal only) |
| SM-002 | none found | KEEP |
| SIG-001/002/003 | none (`pdfsig` absent from tests) | KEEP |
| AUD-001 | `packages/app-tests/e2e/envelope-editor-v2/envelope-actions.spec.ts:261-262`, `envelope-items.spec.ts:362` (single actions) | KEEP (full lifecycle, DB) |
| AUD-002 | none | KEEP |
| EXP-001 / EXP-002 | `packages/app-tests/e2e/api/trpc/envelope/expired-recipient-field-signing.spec.ts:57` (rejects insertion for expired recipient, UI page), `envelopes/envelope-expiration-signing.spec.ts:14` (UI redirect) | KEEP as P2 (time travel to 1 s boundaries, DB no-change; upstream is UI) |
| EXP-003 | none | KEEP |
| REM-001 / REM-002 | `packages/app-tests/e2e/envelopes/envelope-expiration-settings.spec.ts` (settings UI only) | KEEP (sweep untested upstream) |
| JOB-001..005 | none for the sweeps or CAS | KEEP |
| BULK-001 / BULK-002 | `packages/lib/server-only/template/validate-bulk-send-csv.test.ts:19,39,47` (CSV parsing); `packages/app-tests/e2e/templates/template-bulk-send.spec.ts` | KEEP (DB outcome of a bad row; upstream parsing only) |
| MAIL-001 | none (no mailbox count test; `report-sender.spec.ts:7-27` counts reports, not signing mail) | KEEP |
| UP-001 | none for a zero-byte upload (`api-access-file-upload.spec.ts` covers unauthorised access) | KEEP |
| UP-002..005, CON-001 | none found | KEEP |
| I18N-001 / I18N-002 | `packages/app-tests/e2e/envelope-editor-v2/envelope-settings.spec.ts:107,268` (the Date Format control in the UI, not the sealed PDF) | KEEP |
| CONV-002/003 | none; conversion service is not in the harness (HR-5) | DEFERRED (harness v0.3.1) |

No PROPOSE CUT is made by this plan. The owner decides in OD-13.

---

## 5. Architecture

Each case is a chain: trigger (API call or time travel) → product (job runner, cron, route) → oracle (receiver rows,
`qa_ro` reads, Inbucket REST, `pdfsig`, HTTP status). Foundation modules used at each step are named.

| Group | Trigger | Product path | Oracle | Foundation module |
|---|---|---|---|---|
| Webhook delivery (WH-001..003, 006, 007) | `doc.webhooks.create` (tRPC) then `doc.envelopes.create` (DOCUMENT_CREATED) | `execute-webhook.handler` via `local.ts` job; `execute-webhook-call.ts` | receiver `deliveries`; `WebhookCall`, `BackgroundJob` (qa_ro) | `src/webhooks/receiver.ts`, `src/webhooks/verify.ts` (`verifyDocumenso`), `src/clients/documenso.ts`, `src/db/pg.ts` (`readOnlyDb`) |
| Trigger matrix (WH-004) | the API calls per event (create, distribute, complete, cancel, reject-with-token) | `execute-webhook` per event | receiver counts per event | as above |
| Stripe rows (STR-001..003) | signed POST to `/api/stripe/webhook` (billing stack); STR-002/003 also create a per-run Stripe fixture through the product and the Stripe API (section 6.7b) | `ee/server-only/stripe/webhook/handler.ts`; `sync-stripe-customer-subscription.ts` | HTTP status; Subscription rows and status (qa_ro); live Stripe status | `src/webhooks/sign.ts`, `src/env.ts`, `src/lanes/doc/stripe-fixture.ts` (new) |
| Completion and seal (SM-001, JOB-001, SIG-001..003, AUD-001..002) | field create, distribute, `field.signFieldWithToken`, `recipient.completeDocumentWithToken` | `seal-document.handler.ts`; `download.ts` | `Envelope.completedAt`; `BackgroundJob`; `pdfsig` on the download; `DocumentAuditLog` | `src/lanes/doc/envelope.ts` (new), `src/lanes/doc/pdfsig.ts` (new) |
| Expiry (EXP-001..003) | fixture `Recipient.expiresAt` (qa_fixture) then signing | `sign-field-with-token.ts`, `recipients.ts:297` | HTTP status; `Recipient.signingStatus` (qa_ro) | `src/db/fixture.ts` (`createFixtureWriter`), `src/lanes/doc/fixtures.ts` (new) |
| Reminders (REM-001/002) | fixture `Recipient.nextReminderAt`, then one cron tick | `send-signing-reminders-sweep.handler.ts` | Inbucket counts; `nextReminderAt` (qa_ro) | `src/lanes/doc/mail.ts` (new), `src/lanes/doc/cron.ts` (new) |
| Mail (MAIL-001) | distribute | `send-signing-email` jobs | Inbucket REST | `src/lanes/doc/mail.ts` |
| CAS (JOB-004) | signed POST `/api/jobs/internal.execute-webhook/<id>` | `local.ts:228-295` | 404 x3; row unchanged | `src/lanes/doc/jobs.ts` (new) |
| Uploads and i18n (UP-*, I18N-*, CON-001) | multipart upload; envelope create with meta; GET envelope | `files.ts`; envelope routes | status; `pdftotext`; AJV via `src/contracts/oas.ts` | `src/contracts/oas.ts` (`loadSpec`), `src/clients/base.ts` |
| Invariant sweep (every test) | automatic (`src/invariants/fixture.ts`) | none | `runSweep` on Documenso rules | `src/invariants/rules.ts`, `engine.ts`, `after-test.ts` |

---

## 6. Module contracts

Everything new lives under `src/lanes/doc/` (helpers) and `tests/**/doc/` (specs). TypeScript, real imports from this
repo's paths. Each helper has unit tests under `tests/unit/lanes/doc/`. Skeletons below are the exact content to write
(the builder may add comments, not change names or behaviour).

### 6.1 `src/lanes/doc/jobs.ts` (L0)

Mirrors the fork's job-signing scheme exactly (cited). Needs `@noble/ciphers` and `@noble/hashes` (OD-1; the repo adds them in L4 as devDependencies with the exact pins read from the fork's lock).

```ts
import { createHash } from "node:crypto";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { managedNonce } from "@noble/ciphers/webcrypto";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/ciphers/utils";
import { sha256 } from "@noble/hashes/sha2";

/** Same as packages/lib/universal/crypto.ts:11-32 (fork f4105e4). Random nonce per call: compare by round trip, never by bytes. */
export function forkEncrypt(key: string, data: string): string {
  return bytesToHex(managedNonce(xchacha20poly1305)(sha256(key)).encrypt(utf8ToBytes(data)));
}
export function forkDecrypt(key: string, hex: string): string {
  return new TextDecoder().decode(managedNonce(xchacha20poly1305)(sha256(key)).decrypt(hexToBytes(hex)));
}

/** Same as packages/lib/server-only/crypto/sign.ts: sha512 of JSON.stringify(options), wrapped as {data}. */
export function signJobOptions(secondaryKey: string, options: { name: string; payload: unknown }): string {
  const hashed = createHash("sha512").update(JSON.stringify(options)).digest("hex");
  return forkEncrypt(secondaryKey, JSON.stringify({ data: hashed }));
}

/** Same as packages/lib/server-only/crypto/verify.ts:4-12. */
export function verifyJobOptions(secondaryKey: string, options: unknown, signature: string): boolean {
  const hashed = createHash("sha512").update(JSON.stringify(options)).digest("hex");
  const { data } = JSON.parse(forkDecrypt(secondaryKey, signature)) as { data: string };
  return data === hashed;
}

export interface ReplayResult { readonly status: number; readonly text: string }

/** Re-dispatch a job exactly as the product does (local.ts:228-230 headers). Redirects are not followed. */
export async function replayDispatch(input: {
  baseUrl: string;
  jobDefinitionId: string;
  jobId: string;
  options: { name: string; payload: unknown };
  signature: string;
}): Promise<ReplayResult> {
  const res = await fetch(`${input.baseUrl}/api/jobs/${input.jobDefinitionId}/${input.jobId}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-job-id": input.jobId, "x-job-signature": input.signature },
    body: JSON.stringify(input.options),
    redirect: "manual",
  });
  return { status: res.status, text: (await res.text()).slice(0, 80) };
}

/** Secondary key from the fork's .env, read in memory only (never printed, never returned to a log). */
export function readSecondaryKey(env: NodeJS.ProcessEnv, readEnvFile: (path: string) => void): string {
  readEnvFile(`${env.DOCUMENSO_PRODUCT_DIR ?? "/home/user/products/documenso"}/.env`);
  const key = process.env.NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY;
  if (!key) throw new Error("ENV: NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY not in the fork .env");
  return key;
}
```

Note on `readSecondaryKey`: it loads the fork's `.env` into `process.env` of the test runner. Use `process.loadEnvFile` from `node:process` as the caller. The builder must check the variable exists before any test (STOP if absent).

Unit tests (`tests/unit/lanes/doc/jobs.test.ts`, +5):
1. `signJobOptions` then `verifyJobOptions` with the same options: true. (fails when sign and verify disagree on key order)
2. `verifyJobOptions` with a changed payload: false. (fails when verify ignores the payload)
3. `verifyJobOptions` with another key: false. (fails when the key is ignored)
4. `forkDecrypt(forkEncrypt(k, s), ...)` returns `s`. (fails when the cipher is wrong)
5. `replayDispatch` against a local `http.createServer` that returns 404 for a job it does not know: status 404 and the body text. (fails when the helper follows redirects or mangles the body)

### 6.2 `src/lanes/doc/pdfsig.ts` (L0)

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export type PdfsigVerdict =
  | { readonly signed: false }
  | {
      readonly signed: true;
      /** The text after "Signature Validation:" (pdfsig 24.02 prints "Signature is Valid." or "Digest Mismatch."). */
      readonly validation: string;
      readonly commonName: string | undefined;
      readonly signedRanges: string | undefined;
    };

/** Parses `pdfsig` stdout. Pure, so the unit tests use captured output (tests/fixtures/doc/pdfsig-*.txt). */
export function parsePdfsig(stdout: string): PdfsigVerdict {
  if (!/^Signature #1:/m.test(stdout)) return { signed: false };
  const validation = /Signature Validation:\s*(.+)$/m.exec(stdout)?.[1]?.trim();
  if (validation === undefined) throw new Error("TEST BUG: pdfsig output has no Signature Validation line");
  const commonName = /Signer Certificate Common Name:\s*(.+)$/m.exec(stdout)?.[1]?.trim();
  const signedRanges = /Signed Ranges:\s*(.+)$/m.exec(stdout)?.[1]?.trim();
  return { signed: true, validation, commonName, signedRanges };
}

/** Runs pdfsig on a file. A non-zero exit with output is still parsed; pdfsig exits non-zero for some unsigned files. */
export async function runPdfsig(file: string): Promise<PdfsigVerdict> {
  const out = await run("pdfsig", [file]).then((r) => r.stdout, (e: { stdout?: string }) => e.stdout ?? "");
  return parsePdfsig(out);
}
```

Fixtures (captured from P-DOC-8, trimmed, no key material): `tests/fixtures/doc/pdfsig-valid.txt`, `tests/fixtures/doc/pdfsig-digest-mismatch.txt`, `tests/fixtures/doc/pdfsig-unsigned.txt` (the last one: the L0 builder runs `pdfsig` on `example.pdf` and saves the stdout).

Unit tests (`pdfsig.test.ts`, +4): valid parses to `validation: "Signature is Valid."`; digest mismatch parses to `"Digest Mismatch."`; unsigned gives `signed: false`; a text with a signature but no Validation line throws `TEST BUG` (fails when the parser silently passes).

### 6.3 `src/lanes/doc/mail.ts` (L0)

```ts
export const INBUCKET_REST = "http://127.0.0.1:9003/api/v1/mailbox"; // documenso.compose.yml:31-32 (harness v0.3.0); HR-4 asks for export

export interface MailSummary { readonly id: string }

/** Inbucket mailbox name: the lower-cased local part of the address (P-DOC-10). */
export function mailboxOf(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) throw new Error(`TEST BUG: not an address: ${email.length} chars`);
  return email.slice(0, at).toLowerCase();
}

/** The signing token is the /sign/<token> segment of the mail body (P-DOC-10). */
export function signingTokenIn(text: string): string | undefined {
  return /\/sign\/([A-Za-z0-9_-]+)/.exec(text)?.[1];
}

export async function listMail(mailbox: string, fetchImpl: typeof fetch = fetch): Promise<MailSummary[]> {
  const res = await fetchImpl(`${INBUCKET_REST}/${encodeURIComponent(mailbox)}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Inbucket list ${res.status}`);
  return ((await res.json()) as { id: string }[]).map((m) => ({ id: m.id }));
}

export async function bodyOf(mailbox: string, id: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(`${INBUCKET_REST}/${encodeURIComponent(mailbox)}/${encodeURIComponent(id)}`);
  const json = (await res.json()) as { body?: { text?: string; html?: string } };
  return `${json.body?.text ?? ""}${json.body?.html ?? ""}`;
}
```

Unit tests (`mail.test.ts`, +4): `mailboxOf("A.B@x.test")` is `"a.b"` (fails when case is kept); `signingTokenIn` finds the token and returns undefined without `/sign/` (fails when it matches anything); `listMail` returns `[]` on 404 (fails when 404 throws); `listMail` maps ids from a fake `fetch`.

### 6.4 `src/lanes/doc/cron.ts` (L0)

```ts
export const CRON_PERIOD_MS = 15 * 60_000; // "*/15 * * * *" (seal-document-sweep.ts:18 and the other three sweeps)
export const CRON_TICK_MARGIN_MS = 120_000;

/** The next quarter hour strictly after nowMs (UTC minutes 00, 15, 30, 45; seconds and ms zero). */
export function nextQuarterHourMs(nowMs: number): number {
  const next = Math.floor(nowMs / CRON_PERIOD_MS) * CRON_PERIOD_MS + CRON_PERIOD_MS;
  return next;
}

/** Deadline for one tick: the next quarter hour plus the margin. Used with expect.poll (SLO docCronTick). */
export function tickDeadlineMs(nowMs: number): number {
  return nextQuarterHourMs(nowMs) + CRON_TICK_MARGIN_MS - nowMs;
}
```

Unit tests (`cron.test.ts`, +3): at 10:00:00.000 UTC the next tick is 10:15:00.000 (fails when "strictly after" is "at or after"); at 10:14:59.999 the next is 10:15:00; the deadline is at most `CRON_PERIOD_MS + CRON_TICK_MARGIN_MS` (fails when the margin is missing).

### 6.5 `src/lanes/doc/envelope.ts` (L0)

Uses `ApiRequestLike` (the same structural type the clients use). Routes cited in the probe file (P-DOC-9).

```ts
import type { ApiRequestLike } from "../../clients/base.ts";
import type { ReadOnlyDb } from "../../db/pg.ts";

export interface LaneHttp {
  readonly request: ApiRequestLike;
  readonly baseUrl: string;
  /** Value of the Authorization header (the API token). Never logged. */
  readonly authorization: () => string;
}

export interface SignerRow { readonly recipientId: number; readonly email: string; readonly token: string; readonly fieldId: number | undefined }

export interface PreparedEnvelope {
  readonly envelopeId: string;
  readonly documentId: number;
  readonly signers: readonly SignerRow[];
}

export async function v2Post(http: LaneHttp, path: string, body: unknown): Promise<{ status: number; text: string }> {
  const res = await http.request.fetch(`${http.baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: http.authorization(), "content-type": "application/json" },
    data: JSON.stringify(body),
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  return { status: res.status(), text: await res.text() };
}

export async function trpcPost(http: LaneHttp, procedure: string, json: unknown): Promise<{ status: number; text: string }> {
  const res = await http.request.fetch(`${http.baseUrl}/api/trpc/${procedure}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    data: JSON.stringify({ json }),
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  return { status: res.status(), text: await res.text() };
}

/** Create, add one SIGNATURE field per signer (required, P-DOC-9), read rows. Does NOT distribute. */
export async function createSignableEnvelope(input: {
  http: LaneHttp;
  db: ReadOnlyDb;
  envelopeId: string;
}): Promise<PreparedEnvelope> {
  const rows = await input.db.select<{ id: number; email: string; token: string }>(
    `SELECT r."id" AS id, r."email" AS email, r."token" AS token FROM "Recipient" r JOIN "Envelope" e ON e."id" = r."envelopeId" WHERE e."id" = $1 ORDER BY r."id"`,
    [input.envelopeId],
  );
  const created = await v2Post(input.http, "/api/v2/envelope/field/create-many", {
    envelopeId: input.envelopeId,
    data: rows.map((r) => ({ recipientId: r.id, type: "SIGNATURE", page: 1, positionX: 10, positionY: 10, width: 20, height: 5 })),
  });
  if (created.status !== 200) throw new Error(`TEST BUG: field create-many ${created.status}: ${created.text.slice(0, 120)}`);
  const env = await input.db.select<{ secondaryId: string }>(`SELECT "secondaryId" AS "secondaryId" FROM "Envelope" WHERE "id" = $1`, [input.envelopeId]);
  const documentId = Number(env[0]!.secondaryId.replace(/^document_/, ""));
  const fields = await input.db.select<{ id: number; recipientId: number }>(`SELECT "id" AS id, "recipientId" AS "recipientId" FROM "Field" WHERE "envelopeId" = $1`, [input.envelopeId]).catch(() => []);
  return {
    envelopeId: input.envelopeId,
    documentId,
    signers: rows.map((r) => ({ recipientId: r.id, email: r.email, token: r.token, fieldId: fields.find((f) => f.recipientId === r.id)?.id })),
  };
}
```

Note: `"Field"` has no `envelopeId` column in some schemas: the L0 builder runs `SELECT column_name FROM information_schema.columns WHERE table_name = 'Field'` first and uses `recipientId` only if `envelopeId` is absent (UNPROBED column set; P-DOC-9 used `WHERE "recipientId" = $1` successfully). Use the `recipientId` form in the code above if the first check fails.

Other helpers (same file, skeleton names only; the builder writes them with the same pattern, each with a unit test):
- `distribute(http, envelopeId): Promise<number>` → `v2Post(http, "/api/v2/envelope/distribute", {envelopeId})` returns the status.
- `signField(http, signer): Promise<number>` → `trpcPost(http, "field.signFieldWithToken", {token: signer.token, fieldId: signer.fieldId, value: "probe"})`.
- `completeRecipient(http, env, signer): Promise<number>` → `trpcPost(http, "recipient.completeDocumentWithToken", {token: signer.token, documentId: env.documentId})`.

Unit tests (`envelope.test.ts`, +3): `v2Post` sends the Authorization header (fake request records it; fails when the header is missing); `createSignableEnvelope` throws `TEST BUG` when field create-many is not 200 (fake returns 400); `documentId` parses `document_1025` to 1025 (fails on a missing prefix strip).

### 6.6 `src/lanes/doc/fixtures.ts` (L0)

Wraps the foundation fixture writer (time travel only through `qa_fixture`, allow-listed columns, `caseId` checked).

```ts
import { createFixtureWriter, defaultFixtureLogFile, type FixtureWriter } from "../../db/fixture.ts";

export function documensoFixtureWriter(runPrefix: string): FixtureWriter {
  return createFixtureWriter({ product: "documenso", logFile: defaultFixtureLogFile(runPrefix) });
}

/** caseId must be one of the allow-list entry's cases (fixture-allowlist.ts:27-35); the writer refuses otherwise. */
export async function setRecipientExpiresAt(w: FixtureWriter, recipientId: number, at: Date, caseId: string): Promise<void> {
  await w.update({ table: "Recipient", column: "expiresAt", pk: recipientId, value: at, caseId });
}

export async function setRecipientNextReminderAt(w: FixtureWriter, recipientId: number, at: Date, caseId: string): Promise<void> {
  await w.update({ table: "Recipient", column: "nextReminderAt", pk: recipientId, value: at, caseId });
}
```

Unit tests (`fixtures.test.ts`, +2): a `caseId` not in the allow-list is refused (`FixtureRefusedError`) (fails when the wrapper bypasses the writer); an allow-listed case updates `expiresAt` with a fake pool (fails when the column is wrong).

### 6.7 `src/lanes/doc/stripe.ts` (L2)

```ts
import { signStripe } from "../../webhooks/sign.ts";

/** Live Stripe rows run only with a real test-mode key present (OD-2). The condition is named, never silent. */
export const hasStripeKey = (env: NodeJS.ProcessEnv): boolean => Boolean(env.STRIPE_API_KEY?.trim());

/** Per-run secret: generated in CI by the job step (openssl rand -hex 24), passed to `up` and to the test environment. */
export function stripeWebhookSecret(env: NodeJS.ProcessEnv): string {
  const s = env.P2_STRIPE_TEST_WH_SECRET?.trim();
  if (!s) throw new Error("ENV: P2_STRIPE_TEST_WH_SECRET is not set (the billing stack needs the same value)");
  return s;
}

export function signedStripeHeaders(secret: string, body: string, timestampSeconds: number): Record<string, string> {
  return signStripe({ payload: body, secret, timestampSeconds }).headers;
}
```

Unit tests (`stripe.test.ts`, +2): `hasStripeKey({})` is false and `hasStripeKey({STRIPE_API_KEY: " "})` is false (fails when blank counts as set); `stripeWebhookSecret` throws without the variable (fails when a default is used).

### 6.7b `src/lanes/doc/stripe-fixture.ts` (L2, owner decision OD-15 override)

Each run creates its own Stripe test-mode fixture. The sync reads subscriptions by customer and writes only when a Documenso organisation carries that customer id (`sync-stripe-customer-subscription.ts:31, 55-68`), so the fixture creates the organisation through the product, which creates the Stripe customer and stores its id (`packages/lib/server-only/organisation/create-organisation.ts:39`; `packages/trpc/server/organisation-router/create-organisation.ts`). The lane then tags that customer with `run_id`, and attaches one subscription to it.

Rules, all enforced in code:
- Refuse any key that does not start with `sk_test_` (`ENV`). Never print the key or any Stripe object id. Stripe error messages can contain ids, so the teardown reports only the error code.
- Setup runs inside a Playwright fixture. Teardown runs in `finally`, after the test body, so it runs when the test fails and when setup fails part-way.
- Teardown order: cancel the subscription, delete the customer, archive the product, then delete the organisation through the product. Every step is attempted; failures are collected and thrown together.
- The organisation route names and the trial-subscription call are UNPROBED. L2 step 0 probes them (commands in section 8, step 0b). If a call is refused, STOP and report; do not weaken the test.

```ts
import Stripe from "stripe";
import { test as base } from "../../fixtures/index.ts";
import { currentRunPrefix } from "../../run/prefix.ts";

export const RUN_TAG = "run_id";
export const TEST_KEY_PREFIX = "sk_test_";

/** Refuses anything that is not a secret test-mode key. The message never contains the value. */
export function assertTestModeKey(key: string | undefined): string {
  if (key === undefined || key.trim() === "") throw new Error("ENV: STRIPE_API_KEY is not set");
  if (!key.startsWith(TEST_KEY_PREFIX)) {
    throw new Error("ENV: STRIPE_API_KEY is not a secret test-mode key (sk_test_); the lane refuses to run. The value is not shown.");
  }
  return key;
}

export interface RunStripeFixture {
  readonly runId: string;
  readonly organisationId: string;   // Documenso organisation created through the product (OD-16)
  readonly customerId: string;       // Organisation.customerId, read through qa_ro; tagged run_id
  readonly productId: string;
  readonly subscriptionId: string;
}

/** Setup after the organisation exists. Each object carries metadata[run_id]. */
export async function attachRunSubscription(stripe: Stripe, runId: string, customerId: string): Promise<{ productId: string; subscriptionId: string }> {
  const product = await stripe.products.create({ name: `p2-lane ${runId}`, metadata: { [RUN_TAG]: runId } });
  const price = await stripe.prices.create({ product: product.id, currency: "usd", unit_amount: 100, recurring: { interval: "month" }, metadata: { [RUN_TAG]: runId } });
  await stripe.customers.update(customerId, { metadata: { [RUN_TAG]: runId } });
  const sub = await stripe.subscriptions.create({ customer: customerId, items: [{ price: price.id }], trial_period_days: 1, metadata: { [RUN_TAG]: runId } });
  return { productId: product.id, subscriptionId: sub.id };
}

/** Teardown. Collects every failure and throws once, with codes only (never messages, never ids). */
export async function teardownRunStripe(stripe: Stripe, f: Partial<RunStripeFixture>): Promise<void> {
  const failures: string[] = [];
  const step = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    try { await fn(); } catch (e) { failures.push(`${label}:${(e as { code?: string }).code ?? "error"}`); }
  };
  if (f.subscriptionId) await step("subscription", () => stripe.subscriptions.cancel(f.subscriptionId!));
  if (f.customerId) await step("customer", () => stripe.customers.del(f.customerId!));
  if (f.productId) await step("product", () => stripe.products.update(f.productId!, { active: false }));
  if (failures.length > 0) throw new Error(`Stripe teardown incomplete for run ${f.runId ?? "unknown"}: ${failures.join(", ")}`);
}

/** Playwright fixture: setup, use(), teardown in finally. Organisation calls are UNPROBED (L2 step 0). */
export const stripeTest = base.extend<{ stripeRun: RunStripeFixture }>({
  stripeRun: async ({ request, docAuth }, use) => {
    const key = assertTestModeKey(process.env.STRIPE_API_KEY);
    const stripe = new Stripe(key);
    const runId = currentRunPrefix();
    const partial: Partial<RunStripeFixture> = { runId };
    try {
      partial.organisationId = await createOrganisationThroughProduct(request, docAuth, runId);   // UNPROBED route
      partial.customerId = await readOrganisationCustomerId(partial.organisationId);             // qa_ro, schema.prisma:822
      const attached = await attachRunSubscription(stripe, runId, partial.customerId);
      Object.assign(partial, attached);
      await use(partial as RunStripeFixture);
    } finally {
      await teardownRunStripe(stripe, partial);                                  // always runs
      if (partial.organisationId) await deleteOrganisationThroughProduct(request, docAuth, partial.organisationId); // UNPROBED route
    }
  },
});

/** A signed-event body (Stripe v1 shape) for the sync path. Ids here are fixture ids; this text is never printed. */
export function subscriptionEvent(input: { id: string; type: string; customerId: string; subscriptionId: string; status: string; created: number }): string {
  return JSON.stringify({ id: input.id, object: "event", type: input.type, created: input.created, data: { object: { id: input.subscriptionId, object: "subscription", customer: input.customerId, status: input.status } } });
}
```

Helpers `createOrganisationThroughProduct`, `readOrganisationCustomerId`, `deleteOrganisationThroughProduct` live in the same file (same pattern as `src/lanes/doc/envelope.ts`). `readOrganisationCustomerId` uses `SELECT "customerId" FROM "Organisation" WHERE "id" = $1` (qa_ro). The builder writes them with unit tests against fakes.

Unit tests (`tests/unit/lanes/doc/stripe-fixture.test.ts`, +5 in the L2 count): `assertTestModeKey(undefined)` throws `ENV: STRIPE_API_KEY is not set`; `assertTestModeKey("sk_live_FAKE")` throws and its message does not contain `sk_live_FAKE` (fails when the guard echoes the value); `assertTestModeKey("rk_test_FAKE")` throws (restricted keys are refused); `assertTestModeKey("sk_test_FAKE")` returns the value; `teardownRunStripe` with a fake whose `subscriptions.cancel` rejects with `{code:"resource_missing", message:"No such subscription: x"}` still calls `customers.del` and `products.update`, and the thrown message contains `resource_missing` and not `No such subscription` (fails when teardown stops at the first error or leaks a message).


### 6.8 Spec skeletons

Every spec imports `test`, `expect` from `src/fixtures/index.ts` (worker `receiverHandle`, client `doc`, `docAuth`, the P2-X-DB-001 sweep). Waits are `expect.poll` with `SLO` (code-defined budgets) and `POLL_INTERVALS`.

**`tests/contracts/doc/upload.spec.ts` (L1).**

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../../../src/fixtures/index.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import { productsRoot } from "../../../src/readiness/checks.ts";

const pdf = () => readFileSync(path.join(productsRoot(), "documenso", "assets", "example.pdf"));
const upload = (request: any, docAuth: any, buffer: Buffer, name = "a.pdf") =>
  request.fetch(`${apiBaseUrl("documenso")}/api/files/upload-pdf`, {
    method: "POST",
    headers: { cookie: docAuth.sessionCookie.reveal() },
    multipart: { file: { name, mimeType: "application/pdf", buffer } },
    maxRedirects: 0,
    failOnStatusCode: false,
  });

test("P2-DOC-UP-001 a valid PDF upload with the session is accepted (positive control)", async ({ request, docAuth }) => {
  const res = await upload(request, docAuth, pdf());
  expect(res.status()).toBe(200); // control: if this fails the zero-byte row proves nothing
});

test("P2-DOC-UP-001 a zero-byte PDF is refused with 4xx, not 500 (KNOWN PRODUCT BUG: P-DOC-12)", async ({ request, docAuth }) => {
  const res = await upload(request, docAuth, Buffer.alloc(0), "empty.pdf");
  // files.ts:56-57 returns 500 "Upload failed" for this input (P-DOC-12). test.fail passes while the product answers 500.
  test.fail(true, "files.ts:56-57: any upload error is a 500");
  expect([400, 415, 422]).toContain(res.status());
});
```

Rows UP-002..005 follow the same pattern (one `test` each). Their request bodies come from the master-plan rows read at L1 start (UP-002/003), the 50 MB + 1 byte buffer (UP-004), and an encrypted PDF fixture generated at L0 with a documented tool or taken from the fork's `assets` (UP-005; if neither is available: STOP for that row, not a skip).

**`tests/contracts/doc/envelope-contract.spec.ts` (L1).** `loadSpec("doc", "contracts/doc/openapi.json")` from `src/contracts/oas.ts`, then `GET /api/v2/envelope/{id}` for an envelope created in the test and `expect(result.valid).toBe(true)` with the AJV error text attached (`formatAjvErrors`). The OAS file is the one Documenso serves at its OpenAPI path (the route is found in `apps/remix/server/router.ts` at L1; UNPROBED path).

**`tests/contracts/doc/i18n.spec.ts` (L1).** Create with the meta fields (names read from the fork's `ZEnvelopeMeta`-type schema at L1; UNPROBED), complete (section 6.5 helpers, through `signField` and `completeRecipient`), download the sealed PDF, run `pdftotext` (`execFile("pdftotext", [file, "-"])`), and `expect(text).toContain(expectedDate)`. The expected date is computed from the document's fixed timestamp (not "today") to keep the oracle exact.

**`tests/webhooks/doc/delivery.spec.ts` (L2).**

```ts
import { test, expect } from "../../../src/fixtures/index.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";
import { verifyDocumenso } from "../../../src/webhooks/verify.ts";
import { randomSecret } from "../../../src/readiness/checks.ts";
import { runScopedName, currentRunPrefix } from "../../../src/run/prefix.ts";

test("P2-DOC-WH-002 one event makes 1 + 3 attempts with no back-off, and createdAt differs per attempt", async ({ doc, receiverHandle, request, docAuth }) => {
  const key = receiverHandle.key("p2-wh-002");
  receiverHandle.receiver.setMode(key, { kind: "500" });
  const secret = randomSecret();
  const id = await doc.webhooks.create({ webhookUrl: receiverHandle.urlFor("p2-wh-002"), eventTriggers: ["DOCUMENT_CREATED"], secret });
  let envelopeId: string | undefined;
  try {
    envelopeId = await doc.envelopes.create({ title: runScopedName("wh-002"), pdf: /* example.pdf, see upload.spec */ Buffer.alloc(0), recipients: [] });
    await expect.poll(() => receiverHandle.receiver.deliveries(key).length, { timeout: SLO.docWebhookDelivery.ms, intervals: POLL_INTERVALS, message: "four attempts" }).toBe(4);
    const ds = receiverHandle.receiver.deliveries(key);
    const createdAt = new Set(ds.map((d) => (JSON.parse(d.rawBody.toString("utf8")) as { createdAt: string }).createdAt));
    expect(createdAt.size).toBe(4); // P-DOC-2: differs per attempt
    const ids = new Set(ds.map((d) => (JSON.parse(d.rawBody.toString("utf8")) as { payload: { id: unknown } }).payload.id));
    expect(ids.size).toBe(1); // payload.id stable
    for (const d of ds) expect(verifyDocumenso({ secret, headers: d.headers })).toEqual({ ok: true });
  } finally {
    if (envelopeId) await doc.envelopes.remove(envelopeId);
    await doc.webhooks.remove(id);
  }
});
```

Builder note: the envelope `pdf` must be the real `example.pdf` (read as in `tests/readiness/doc.readiness.spec.ts`), not `Buffer.alloc(0)`. The skeleton shows the structure; the zero buffer is a placeholder that the builder replaces. Keep the `finally` cleanup.

Other WH tests (same file, same pattern): WH-001 (secret equality, plus `doc.webhooks.create` with `http://127.0.0.1:…` expecting a rejection: the client's `trpc` throws `ApiError` 400 on a non-200; assert `expect(err.status).toBe(400)`); WH-003 two tests (9 s and 11 s; the 11 s one polls with `SLO.docWebhookTimeoutChain` and asserts consecutive gaps `>= 9500`); WH-004 matrix (one webhook subscribed to the five triggers, actions executed in turn, per-event counts equal 1 each, polled per action); WH-006 (headers and body compared across attempts: no header matches `/delivery|event-id|idempotenc/i`; the only body field that changes is `createdAt`); WH-007 (`setMode` redirect 302: 4 deliveries, none with `path` ending `/redirected`).

Add `SLO.docWebhookTimeoutChain = { ms: 50_000, basis: "4 attempts x WEBHOOK_TIMEOUT_MS 10 000 (execute-webhook-call.ts:6) + 10 s margin" }` to `src/slo.ts` (shared-file hunk, section 13).

**`tests/billing/doc/stripe.spec.ts` (L2, project `doc-billing-api`).**

```ts
import { test, expect } from "../../../src/fixtures/index.ts";
import { apiBaseUrl } from "../../../src/env.ts";
import { hasStripeKey, stripeWebhookSecret, signedStripeHeaders } from "../../../src/lanes/doc/stripe.ts";
import { stripeTest, subscriptionEvent } from "../../../src/lanes/doc/stripe-fixture.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import Stripe from "stripe";

const body = (type: string, customer: string | null) =>
  JSON.stringify({ id: "evt_p2_probe", object: "event", type, data: { object: { id: "obj_p2", object: "subscription", customer } } });
const post = (request: any, headers: Record<string, string>, text: string) =>
  request.fetch(`${apiBaseUrl("documenso")}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", ...headers }, data: text, maxRedirects: 0, failOnStatusCode: false });

test("P2-DOC-STR-001 an unsigned Stripe event is refused with 400", async ({ request }) => {
  const res = await post(request, {}, body("customer.subscription.updated", "cus_p2"));
  expect(res.status()).toBe(400);
});

test("P2-DOC-STR-001 a bad or stale signature is refused with a non-2xx and changes no rows", async ({ request }) => {
  const now = Math.floor(Date.now() / 1000);
  const stale = signedStripeHeaders(stripeWebhookSecret(process.env), body("charge.succeeded", "cus_p2"), now - 600);
  const res = await post(request, stale, body("charge.succeeded", "cus_p2"));
  expect(res.status()).toBeGreaterThanOrEqual(400); // OD-5: the product answers 500 (P-DOC-7)
  // + row-count snapshot before and after (qa_ro) for Subscription and Organisation: unchanged
});

const db = readOnlyDb("documenso"); // src/db/pg.ts (import with Stripe from "stripe")
subscriptionsFor = async (customerId: string) => db.select(`SELECT "id", "status" FROM "Subscription" WHERE "customerId" = $1`, [customerId]); // column names checked at L2 step 0

test.describe("STR-002/003 against the run's Stripe fixture", () => {
  test.skip(!hasStripeKey(process.env), "P2-DOC-STR-002/003 need STRIPE_API_KEY (test mode): none in this run");

  stripeTest("P2-DOC-STR-002 a validly signed synced event is processed once against the run's subscription", async ({ request, stripeRun }) => {
    const ts = Math.floor(Date.now() / 1000);
    const body = subscriptionEvent({ id: `evt_${stripeRun.runId}_str002`, type: "customer.subscription.updated", customerId: stripeRun.customerId, subscriptionId: stripeRun.subscriptionId, status: "trialing", created: ts });
    const headers = signedStripeHeaders(stripeWebhookSecret(process.env), body, ts);
    expect((await post(request, headers, body)).status()).toBe(200);
    const afterFirst = await subscriptionsFor(stripeRun.customerId);
    expect(afterFirst).toHaveLength(1); // STOP if the first delivery writes no row: report, do not weaken
    expect((await post(request, headers, body)).status()).toBe(200); // the identical signed event again
    expect(await subscriptionsFor(stripeRun.customerId)).toEqual(afterFirst);
  });

  stripeTest("P2-DOC-STR-003 out-of-order subscription events end in the live Stripe state", async ({ request, stripeRun }) => {
    const stripe = new Stripe(assertTestModeKey(process.env.STRIPE_API_KEY));
    const live = (await stripe.subscriptions.retrieve(stripeRun.subscriptionId)).status;
    const t2 = Math.floor(Date.now() / 1000);
    const t1 = t2 - 60;
    const newer = subscriptionEvent({ id: `evt_${stripeRun.runId}_t2`, type: "customer.subscription.updated", customerId: stripeRun.customerId, subscriptionId: stripeRun.subscriptionId, status: "trialing", created: t2 });
    const older = subscriptionEvent({ id: `evt_${stripeRun.runId}_t1`, type: "customer.subscription.created", customerId: stripeRun.customerId, subscriptionId: stripeRun.subscriptionId, status: "canceled", created: t1 });
    expect((await post(request, signedStripeHeaders(stripeWebhookSecret(process.env), newer, t2), newer)).status()).toBe(200);
    expect((await post(request, signedStripeHeaders(stripeWebhookSecret(process.env), older, t1), older)).status()).toBe(200);
    expect((await subscriptionsFor(stripeRun.customerId)).map((r) => r.status)).toEqual([live]);
  });
});
```

Also: the valid unsynced test (200), and STR-003 (skipped without key). Within the billing project only; this spec fails if run against the non-billing stack (the 400/500 rows would change), which is why it is in its own project.

**`tests/integration/doc/lifecycle.spec.ts` (L3).** Uses `createSignableEnvelope`, `distribute`, `signField`, `completeRecipient` and the DB snapshot helper. Assertions:
- SM-001 B3 oracle: `expect.poll(status, {timeout: SLO.docWebhookDelivery.ms, intervals: POLL_INTERVALS}).toBe("COMPLETED")` then `expect(completedAt).not.toBeNull()`. Fails when the seal does not set `completedAt`.
- SM-001 refused transitions: distribute on the COMPLETED envelope → `status >= 400`; field create → 400; the snapshot (status, title, field count) equal before and after.
- AUD-001: `DocumentAuditLog` types for the envelope: `expect(counts).toEqual({DOCUMENT_CREATED:1, DOCUMENT_SENT:1, DOCUMENT_FIELD_INSERTED:1, DOCUMENT_RECIPIENT_COMPLETED:1, DOCUMENT_COMPLETED:1, …})` with the exact set observed in P-DOC-15 (EMAIL_SENT and FIELD_CREATED counts are measured by the L3 builder first; the list is then pinned).
- SM-002, AUD-002: skeletons as above; their behaviour is probed first (L3 step 1).

**`tests/integration/doc/signature.spec.ts` (L3).** Download the sealed PDF with `GET /api/v2/envelope/item/<id>/download` and `docAuth.headerValue`, write it to `test-results/doc-sig/<runId>.pdf` (never committed; the builder checks `git check-ignore -q test-results/` exits 0, else STOP), and run `runPdfsig`. SIG-001: `expect(verdict).toMatchObject({signed: true, validation: "Signature is Valid."})` plus an unsigned control on `example.pdf` (`expect(control).toEqual({signed: false})`). SIG-002: copy the file, flip one byte at an offset inside the first signed range (offset 1000, probed), run `runPdfsig` → `expect(verdict.validation).not.toBe("Signature is Valid.")` and `toMatch(/Digest Mismatch/)`. SIG-003: the CN of the signing cert file (`openssl pkcs12 -in <cert> -nokeys -clcerts -passin pass:<redacted> | openssl x509 -noout -subject`) equals `verdict.commonName`. The cert path is UNPROBED at L3 (`documensoLocalSigningCertPath` in the harness); the builder probes it first.

**`tests/integration/doc/expiry.spec.ts` (L3).** EXP-001: `setRecipientExpiresAt(w, rid, new Date(Date.now()+2000), "P2-DOC-EXP-001")` then immediately `signField` → 200 and `expect.poll` status SIGNED. EXP-002: `expiresAt = now - 1000` → `signField` → `400` with `RECIPIENT_EXPIRED` in the body; recipient `signingStatus` equal before and after. EXP-003: set past then future (`now + 1 hour`) → `signField` → 200 (scope OD-10).

**`tests/integration/doc/mail.spec.ts` (L3).** Two signers, distribute, then `expect.poll(() => listMail(mailboxOf(e)).then(l => l.length), {timeout: SLO.docWebhookDelivery.ms, intervals: POLL_INTERVALS}).toBe(1)` per recipient; then wait 5 s (a fixed settle of the mail count only after the first mail; justified by P-DOC-10; this is the ONLY allowed fixed wait and it is labelled `SETTLE_MS = 5_000` in the spec) and `expect(count).toBe(1)` again (duplicate detection); `signingTokenIn(await bodyOf(...))` equals that recipient's token.

**`tests/serial/doc/reminders.spec.ts` and `jobs.spec.ts` (L4).** Reminders: create two signers, distribute (recipient NOT_SIGNED, SENT), set `nextReminderAt = now - 60 s` via fixture (REM-001), then `expect.poll(() => newMailCount(...), { timeout: tickDeadlineMs(Date.now()) + 60_000, intervals: [1000] })` — the poll interval is a cron-scale wait, so `intervals: [5000]` (named const `TICK_POLL_MS` in the spec). REM-002: sign the recipient first, then set the fixture, wait for the tick, count mails to that recipient: 0. JOB-001: `SELECT count(*) FROM "BackgroundJob" WHERE "jobId" = 'internal.seal-document' AND "payload"::text LIKE '%"documentId":<id>%'` equals 1 after COMPLETED. JOB-004: `readSecondaryKey`, `signJobOptions` for a COMPLETED job's options, `replayDispatch` three times → status 404 each; row snapshot equal.

Serial specs run after `doc-api` (playwright `dependencies`). They include the tick wait, so they are budgeted separately (section 8).

---

## 7. Data isolation, cleanup and leak check

- **Run prefix.** Every name the lane creates comes from `runScopedName(label)` (`src/run/prefix.ts`); the prefix is `p2-qa-<timestamp>-<hex>`. Envelope titles, recipient emails (local part) and API token names carry it, so the leak rules (`doc-leak-*`) and the afterEach sweep see only this run.
- **What each test creates:** envelopes (with recipients, fields), webhooks (tRPC), receiver paths (`/r/<runId>/<testId>`), job rows (product-owned), audit and signature rows (product-owned), mail (Inbucket mailboxes named after the prefix), downloaded PDFs (`test-results/`, not committed).
- **How each is removed:** envelopes → `POST /api/v2/envelope/delete` (soft delete: `Envelope.deletedAt` set, `schema.prisma:445`); webhooks → `webhook.deleteWebhook` (tRPC, `GridClient.webhooks.remove`); API tokens → `auth.revoke()` at worker end (foundation, `src/auth/*`); receiver → `receiver.stop()` (worker end). Product-owned job, audit and signature rows are not deleted (the product owns them; the sweep does not look at them).
- **Leak rule change (R28, shared file `src/invariants/rules.ts`, L1):** `doc-leak-recipient-email` is scoped to live envelopes:
  ```ts
  sql: `SELECT r."id"::text AS id, r."email" AS value FROM "Recipient" r JOIN "Envelope" e ON e."id" = r."envelopeId" WHERE r."email" LIKE $1 ${ESC} AND e."deletedAt" IS NULL`,
  ```
  Unit test (`tests/unit/invariants/doc-leak-recipient.test.ts`, +2): the rule's SQL text is accepted by `assertRuleShape`; a fake DB returning one row for a live envelope gives one violation, and zero rows for a soft-deleted envelope gives none (fails when the join is missing).
- **Shared seed state.** The lane never writes seed rows. Fixture time travel changes only recipient rows of this run's envelopes, which the test created. No restore is needed; the test asserts the expiry it set (`expect(row.expiresAt)` equal to the value written) so a silent write failure is caught.
- **Stripe objects (OD-15, OD-16).** Each run creates, through the product, one organisation (name carries the run prefix) and its Stripe customer (`create-organisation.ts:39`). The lane tags the customer, one product and one subscription with `metadata[run_id]`. Teardown (section 6.7b) cancels the subscription, deletes the customer, archives the product and deletes the organisation through the product. The product's organisation delete only schedules the Stripe subscription cancel (`delete-organisation.ts:20-50`), so the lane's own Stripe calls are the ones that remove the objects.
- **Stripe residue (reaper, FC-7).** If a teardown fails, run-tagged objects can remain. The reaper covers all three objects the fixture creates: subscriptions, customers and organisations (Documenso) tagged `run_id` (organisation name carries the run prefix) and created more than 2 hours ago. It deletes them with the same teardown rules, and its output carries counts only.
- **Leak rule for organisations (L2, shared file `src/invariants/rules.ts`).** New rule `doc-leak-organisation-name`: an `Organisation` whose name carries the run prefix is a leak. Its SQL adds `AND "deletedAt" IS NULL` only if the product's soft-delete column exists (checked in L2 step 0 with `information_schema`; UNPROBED).
- **Leak check after each test.** The sweep (`src/invariants/after-test.ts`) runs for every test in `doc-api` and `doc-serial`: any leftover run-prefixed row fails the test with the SQL and rows attached.
- **Rate-limit budget (R15).** Each project mints one session (one worker). A CI run mints at most 4 sessions for Documenso in the 15-minute bucket (`doc-api`, `doc-serial`, `doc-billing-api`, and one for the readiness spec inside `doc-api`, which shares the worker). The lane never mints more than once per worker.

---

## 8. Build steps per task (autonomous procedure)

**Step 0 (every task).** Check the stack is down and the ports are free (the checks in the probe file); `export PATH="/usr/local/bin:$PATH"`; confirm `"$NODE24"` exists; `git fetch origin`; confirm the previous build branch exists on `origin` and its head passes `npm run check` (for L0, `origin/main`).
  ```bash
  docker ps --format '{{.Names}}' | grep -E '^qa-harness-' && { echo "STOP: another stack is up"; exit 1; } || true
  for p in 3000 3001 5555 5433 5434 5450 5451 6380 6381 2525 9000 9003 4317; do (exec 3<>/dev/tcp/127.0.0.1/$p) 2>/dev/null && { echo "STOP: port $p taken"; exit 1; } || true; done
  export PATH="/usr/local/bin:$PATH"
  git fetch origin
  ```

**Step 0b (L2 only): probe the per-run Stripe fixture before any test is written (section 6.7b).** These calls write test-mode objects. Run them only on a stack with the billing variables and a key that starts with `sk_test_`. Print counts and HTTP codes only; never print a key or an object id.

1. Key check, silent: `[[ "$STRIPE_API_KEY" == sk_test_* ]] || { echo 'STOP: key is not test mode'; exit 1; }`.
2. Organisation route: sign in as the seeded user (one login), `POST /api/trpc/organisation.create` (the route name is read from `packages/trpc/server/organisation-router/create-organisation.ts` first). Record the HTTP status. STOP if it is not 200.
3. Read `"Organisation"."customerId"` for that organisation through `qa_ro` (`schema.prisma:822`). Record whether it is non-null. STOP if null: the product did not create a customer, and OD-16 must be re-decided.
4. Stripe: `customers.update` (metadata `run_id`), `products.create` and `prices.create` (metadata `run_id`), `subscriptions.create` with `trial_period_days: 1` and no payment method. Record each HTTP status. STOP if the trial subscription is refused: report the code, do not switch to a different payment setup without owner approval.
5. Sync: POST one signed `customer.subscription.updated` for that customer (`subscriptionEvent` plus `signedStripeHeaders`). Record the status and the `Subscription` rows for that customer, using the column names from `information_schema.columns` for `Subscription` (checked, not guessed). STOP if the first delivery writes no row: the STR-002 oracle would be empty.
6. Repeat step 5 with the same body. Record whether the rows are unchanged.
7. Teardown: cancel the subscription, delete the customer, archive the product, delete the organisation through the product. Then search Stripe for metadata `run_id` equal to this run and record the count (must be 0). Record the organisation's absence through `qa_ro`.

The probe result goes into the probe file as a new entry (dated, with the command as text and the counts), not into the plan. Until it is recorded, the STR-002/003 tests are not written, and the plan's status for them stays "BUILT (pending L2 step 0b)".

**Step 1: base count.** `npm run unit 2>&1 | grep -E '^# (tests|pass|fail)'` on the cut-from branch; record `BASE_UNIT`. Expected 285 on `aa10ec1`. If not, the task records the measured base and uses "base + N".

**Step 2: branch.** `git checkout -b feat/<date>-p2-documenso-l<n>-<topic> <previous head>` (L0: `origin/main`).

**Step 3: edit** the files listed for the task (section 13 has the shared-file hunks). Write the tests first (unit tests fail first), then code (red, green). Run `npm run typecheck` and `npx eslint <changed files>` after each file.

**Step 4: unit.** `npm run unit`; the count equals `BASE_UNIT + N`.

**Step 5: static.** `npm run check` (format, lint, typecheck, unit) exit 0.

**Step 6: list.** `npm run list:api`; the new titles appear with the exact text in section 4.1. Save the list to the PR body.

**Step 7: live (L1 to L4 only).** Cold or warm `up`, then the lane project, then `down`. Commands in section 12.2. The builder records the exact `N passed (M skipped)` line.

**Step 8: secret scan and trailer gate** (section 9 done criteria), then commit with explicit paths, push (`git push -u origin <branch>`; retry network errors 4 times with 2, 4, 8, 16 s), open the PR (base = previous branch), and subscribe to its CI.

**Step 9: CI.** On a red check, reproduce locally, fix the root cause (`file:line`), push again. Never disable a test, never raise a timeout, never add a retry. A PRODUCT BUG shows as a `test.fail` only when the rule in section 14 is met; otherwise the run is red and the report says why.

**STOP conditions** (report and end the task; do not work around): base mismatch; a sibling plan file in the diff; another stack up or a port taken; `up` fails twice for the same reason or passes its deadline; a host blocked (403, ENOTFOUND); a probe needs a fork or harness edit; a secret would be printed; the branch exists on `origin` before the task starts; the harness version in `node_modules` is not `0.3.0` (a build session never uses a scratch copy without owner approval); `pdfsig` missing on the runner.

**Autonomous build design.** Each task runs in its own session with no owner input. The builder starts from the branch named above, follows section 8 and the task's done criteria (section 9), pushes, opens the PR, subscribes to its CI, fixes failures by root cause, and never merges, tags or dispatches a workflow. An AI review of the PR is requested by the owner, not the builder. The last message of each task is the report in section 15.

### 8.1 Task list with time budgets (wall clock, excluding review)

| Task | Scope | Cases (tests) | Budget | Notes |
|---|---|---|---|---|
| L0 | helpers and unit tests (no spec); FC-1 probe | 0 specs; unit +21 | 3 h | no stack needed for unit tests; one warm `up` for the FC-1 probe |
| L1 | contracts, uploads, i18n, leak-rule scope | 9 specs (UP-001 positive + test.fail, UP-002..005, CON-001, I18N-001/002) | 4 h (cold `up` 11 min) | positive control first; UP-002/003 need the master-plan text |
| L2 | webhooks and Stripe (incl. the per-run Stripe fixture) | 7 webhook tests (doc-api), 5 Stripe (doc-billing-api; 2 skip without a key) | 6.5 h (two stacks: cold + billing warm 29 s; the fixture adds about 1 min per Stripe test) | billing stack is a second `up`; the organisation route, the trial subscription and the Subscription columns are UNPROBED until the L2 step 0 probe |
| L3 | lifecycle, signature, expiry, mail, bulk | 14 specs | 6 h | bulk and SM-002/AUD-002 probes first |
| L4 | serial: reminders, seal job, CAS | 4 specs, 2 with a 15-min tick wait each | 3 h + up to 2 tick waits per run (about 34 min in CI) | serial project depends on doc-api |
| L5 | CI lane job | 0 specs | 3 h | lane job budget 45 min incl. two stacks |

Totals: 39 new test definitions (doc-api 30 new, doc-serial 4, doc-billing-api 5 of which 2 skip without a key), plus the 5 existing readiness tests in `doc-api`; unit +N as stated per task.

---

## 9. Done criteria per task (machine-checkable)

Every task:
1. `npm run check` exit 0.
2. Unit count = `BASE_UNIT + N` (the N in each task below) with `fail 0`:
   `npm run unit 2>&1 | grep -E '^# (tests|pass|fail)'`.
3. `npm run list:api` shows every new title of the task with the exact text (section 4.1). Check: `npx playwright test --list --project=doc-api | grep -c 'P2-DOC-'` equals the task's count.
4. `git status --porcelain` is empty after the commit.
5. Secret scan (exit 1 = no match): `git diff origin/main...HEAD | grep -nE '(sk_(test|live)_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.)'; test $? -eq 1`.
6. Trailer gate (exit 1 = no match): `BASE=$(git rev-parse origin/main); git rev-parse --verify "$BASE" || exit 1; git log "$BASE"..HEAD | grep -iE 'co-authored-by|generated with'; test $? -eq 1`.
7. No file outside the task's list changed: `git diff --name-only "$BASE"..HEAD` is compared to the task's list.

Task-specific:
- **L0:** unit +21 (jobs 5, pdfsig 4, mail 4, cron 3, envelope 3, fixtures 2); `src/lanes/doc/{jobs,pdfsig,mail,cron,envelope,fixtures}.ts`, `tests/fixtures/doc/pdfsig-*.txt`; FC-1 probe recorded in the L0 PR body (no spec).
- **L1:** unit +2 (the two leak-rule tests); live: `doc-api` shows the 9 L1 titles of section 4.1 (UP-001 control, UP-001 test.fail, UP-002..005, CON-001, I18N-001, I18N-002); `npm run specs:validate` exit 0 (the committed OAS).
- **L2:** unit +10 (`tests/unit/lanes/doc/stripe.test.ts` +3: hasStripeKey 2, stripeWebhookSecret 1; `tests/unit/lanes/doc/stripe-fixture.test.ts` +5; `tests/unit/invariants/doc-leak-organisation.test.ts` +2); live `doc-billing-api` = 5 tests (3 pass; the STR-002 and STR-003 tests run when the key is present and skip when it is absent). After each billing run, a check (counts only): no Stripe customer, subscription or product tagged with this run's id remains, and no run-named organisation remains (qa_ro).
- **L3:** unit +0 unless a helper is added (then it carries its own unit test); live: 14 tests in `doc-api` (SM-001 x2, SM-002, AUD-001, AUD-002, SIG-001..003, EXP-001..003, BULK-001, BULK-002, MAIL-001).
- **L4:** unit +0 (the cron helper is tested in L0); live: `doc-serial` 4 tests (REM-001, REM-002, JOB-001, JOB-004).
- **L5:** unit +6 (workflow text tests: `doc-api`, `doc-billing-api` and `doc-serial` jobs exist with the `always()` down step; `DANGEROUS_BYPASS_RATE_LIMITS` absent (FC-2); the `Available projects` check string now lists 9 project names); the CI run of the lane job is green on a PR (owner runs or the builder reports the run's conclusion).

---

## 10. Self-verification: how each assertion is proven able to fail

Procedure: for each case, the builder runs the listed mutation in a scratch copy or a `git stash`-able local edit, observes the red result, reverts, and records the observed failure text in the PR body. Mutations are never committed.

| Case | Mutation or bad input | Expected red |
|---|---|---|
| UP-001 control | none (it is the control) | fails only if the product stops accepting valid PDFs |
| UP-001 test.fail | remove the `test.fail` line | the zero-byte test fails with 500 |
| WH-001 | fake receiver header with another secret (`verifyDocumenso` input) | `{ok:false}` |
| WH-002 | receiver `setMode` to `ok` (1 delivery) | `expect.poll` times out with "four attempts" |
| WH-003 9 s | receiver `slow` 11 s | count 1 fails |
| WH-003 11 s | `setMode` to `ok` | count 4 fails, gaps check fails |
| WH-004 | do not subscribe one trigger | that event's count 0 |
| WH-006 | add a fake header `x-documenso-delivery-id` to the receiver log in a unit test | the header check fails |
| WH-007 | receiver mode `redirect` with the follow-up path | a delivery on `/redirected` fails |
| STR-001 unsigned | send with an invalid signature instead | 400 check fails |
| SM-001 B3 | a fixture that sets `completedAt` NULL on a completed envelope (unit fake) | the `not.toBeNull` fails |
| SM-001 refused | a fake that accepts distribute (2xx) | status assertion fails |
| SIG-001 | `pdfsig` on the unsigned file | `validation` undefined: fails |
| SIG-002 | do not flip the byte (copy as is) | `Signature is Valid.` and the digest assertion fails |
| SIG-003 | a cert CN mismatch (unit fake) | equality fails |
| AUD-001 | remove one action in the lifecycle | the exact-count assertion fails |
| EXP-001 | `expiresAt` one minute in the past | 400, the 200 expectation fails |
| EXP-002 | `expiresAt` one hour in the future | 200, the refusal expectation fails |
| MAIL-001 | a second distribute (duplicate) | count 2 fails |
| REM-001 | fixture `nextReminderAt` in the future | zero mails: fails |
| REM-002 | do not sign the recipient | the mail count is non-zero: fails |
| JOB-001 | completed envelope with a second seal job (unit fake rows) | count 2: fails |
| JOB-004 | replay with a wrong signature | 401, the 404 expectation fails |
| leak rule | a fake DB row for a soft-deleted envelope | the unit test expects zero violations: a row fails it |
| STR-002 | the second delivery changes the status (unit fake) | the unchanged-state assertion fails |
| STR-003 | the sync trusts the payload status (fake sync) | the final-state assertion fails (final equals the stale payload status) |
| teardown | skip the subscription cancel in teardown | the teardown check finds a run-tagged subscription: fails |
| test-mode guard | a `sk_live_` value | refused with `ENV`; the value is not in the message (unit test) |

---

## 11. Commit plan

Lowercase Conventional Commits. Explicit paths only (never `git add -A` or `git add .`). One commit per logical step. No trailers of any kind (section 14).

L0 (`feat/2026-11-02-p2-documenso-l0-probes-helpers`):
1. `test(doc): add unit tests for job signing, pdfsig, mail, cron, envelope and fixtures helpers` — `tests/unit/lanes/doc/*.test.ts`, `tests/fixtures/doc/pdfsig-*.txt`.
2. `feat(doc): add lane helpers for job replay, pdfsig parsing, mail, cron ticks, envelopes and fixtures` — `src/lanes/doc/jobs.ts src/lanes/doc/pdfsig.ts src/lanes/doc/mail.ts src/lanes/doc/cron.ts src/lanes/doc/envelope.ts src/lanes/doc/fixtures.ts`.

L1: `test(doc): add upload, contract and i18n specs` (`tests/contracts/doc/*.spec.ts`); `fix(invariants): scope the recipient leak rule to live envelopes` (`src/invariants/rules.ts`, `tests/unit/invariants/doc-leak-recipient.test.ts`); `chore(doc): add the envelope OpenAPI document for the contract spec` (`contracts/doc/openapi.json`, if the OAS path probe requires it).

L2: `feat(doc): add stripe helpers and webhook delivery specs` (`src/lanes/doc/stripe.ts`, `tests/unit/lanes/doc/stripe.test.ts`, `tests/webhooks/doc/delivery.spec.ts`); `test(doc): add the billing stripe spec for the billing stack` (`tests/billing/doc/stripe.spec.ts`); `chore(slo): add the webhook timeout chain budget` (`src/slo.ts`), `chore(playwright): add the doc-billing-api project` (`playwright.config.ts`).

L3: `test(doc): add lifecycle, signature, expiry, mail and bulk specs` (`tests/integration/doc/*.spec.ts`); `chore(fixtures): allow-list nothing new` is NOT a commit (no allow-list change in L3 unless OD-4 is approved).

L4: `test(doc): add serial reminder and seal job specs` (`tests/serial/doc/*.spec.ts`); `chore(deps): add the noble cipher and hash packages for job signing` (`package.json package-lock.json`, only after OD-1 is accepted).

L5: `ci(api): add the documenso lane jobs` (`.github/workflows/api.yml`); `test(ci): cover the lane job shape and the absence of the rate-limit bypass` (`tests/unit/ci/workflow.test.ts`, `tests/unit/lanes/doc/ci.test.ts`); `chore(scripts): install pdftotext with pdfsig on the cloud image` (`scripts/cloud-install.sh`, only the line in section 12.1).

---

## 12. Environment changes

### 12.1 Cursor cloud (`.cursor/environment.json`, `scripts/cloud-install.sh`)

- **Automatic from the repo:** `npm ci` and `scripts/bootstrap.sh` run in `install`; `start` runs `npm run qa:passwords` and `scripts/ensure-receiver-hostname.sh` (idempotent).
- **Repo change (L5):** `scripts/cloud-install.sh` adds `apt-get install -y poppler-utils` if `pdfsig`/`pdftotext` are missing (`command -v pdfsig || sudo apt-get install -y poppler-utils`). P-DOC-8 needs both binaries on the runner.
- **Pasted by the owner:** the Stripe test-mode key as the secret `STRIPE_API_KEY`. It must start with `sk_test_`; the lane refuses any other value (`ENV`, value not shown). Without it STR-002/003 skip with a named condition. The lane creates per-run test-mode objects (OD-15).
- **Steps for the owner:** Cursor cloud → environment secrets panel → add `STRIPE_API_KEY` (test mode). Nothing else.

### 12.2 Claude Code cloud (`.claude/hooks/session-start.sh`, environment setup script, environment variables)

- **Automatic:** the session-start hook sets `NODE24` and runs `npm run qa:passwords` and the hosts script (AGENTS.md).
- **Verified in this session:** `pdfsig` 24.02.0 and `pdftotext` present (`/usr/bin/pdfsig`, `/usr/bin/pdftotext`); Docker present; `api.stripe.com` reachable (401).
- **Pasted by the owner:** the same test-mode key as the environment variable `STRIPE_API_KEY` (optional; `sk_test_` only, see 12.1). The lane creates per-run test-mode objects (OD-15).
- **Install state (resolved 2026-11-02):** the checkout's `node_modules` was stale (harness `0.2.11`, no `stripe`). The owner approved `npm ci`; `bash scripts/cloud-install.sh` ran (rc 0). The repo's `node_modules` now holds harness `0.3.0` and `stripe` 23.0.1; the unit baseline on that install is 285 pass, 0 fail.
- **Steps for the owner:** environment settings → variables → add `STRIPE_API_KEY` if available. Then run `npm ci` in the environment setup script (the owner decides; the builder does not run it unless the sandbox allows it).

### 12.3 Running the lane locally (both clouds)

```bash
export PATH="/usr/local/bin:$PATH"
docker ps --format '{{.Names}}' | grep -E '^qa-harness-' && { echo "STOP: another stack is up"; exit 1; } || true
START=$(date +%s); PRODUCTS_ROOT=/home/user/products NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=p2-receiver.test timeout 1000 "$NODE24" node_modules/qa-portfolio-harness/scripts/up.mjs documenso; echo "up rc=$? secs=$(( $(date +%s)-START ))"
node scripts/db-roles.ts provision documenso
npx playwright test --project=doc-api --project=doc-serial
PRODUCTS_ROOT=/home/user/products "$NODE24" node_modules/qa-portfolio-harness/scripts/down.mjs documenso; echo "down rc=$?"
```

The billing run is the same with the billing variables (`NEXT_PUBLIC_FEATURE_BILLING_ENABLED=true`, `NEXT_PRIVATE_STRIPE_WEBHOOK_SECRET=$P2_STRIPE_TEST_WH_SECRET`, `NEXT_PRIVATE_STRIPE_API_KEY=${STRIPE_API_KEY:-p2-placeholder-stripe-key}`) and `--project=doc-billing-api`. Billing and the envelope tests never share a stack.

The scratch harness (a clone of tag `v0.3.0`) was used only before the 2026-11-02 install and is no longer used. Build sessions use the repo's `node_modules` after `bash scripts/cloud-install.sh`. If the installed harness is not `0.3.0`, STOP (section 8 STOP list).

---

## 13. Harness requests and shared-file touch list

### 13.1 Harness requests (the lane never edits the harness)

| HR | Problem | Evidence | Blocks | Proposed change |
|---|---|---|---|---|
| HR-4 | The Inbucket REST base is a compose mapping, not an output of `up documenso` | `documenso.compose.yml:31-32`; P-DOC-10 | none (the lane constant works; a unit test pins the port) | to harness **v0.3.1** (owner decision 2026-11-02): export `documensoMailApiUrl` from the harness config |
| HR-5 | No Gotenberg in the Documenso stack, so DOCX conversion cannot run | `document-conversion.ts:15-17` (`NEXT_PRIVATE_DOCUMENT_CONVERSION_URL`); no harness reference | **P2-DOC-CONV-002 (U) and P2-DOC-CONV-003 (K): DEFERRED** until v0.3.1 | to harness **v0.3.1** (owner decision 2026-11-02): add a Gotenberg service to the Documenso compose with a published port and the env var; the stop/start fault needs the container name |

The owner decided on 2026-11-02 to move HR-4 and HR-5 to harness v0.3.1 and to defer CONV-002 and CONV-003 until it is released. The lane builds neither case before then.

### 13.2 Shared-file touch list (exact hunks, per task)

| File | Task | Hunk |
|---|---|---|
| `src/slo.ts` | L2 | add inside `SLO`: `docWebhookTimeoutChain: { ms: 50_000, basis: "4 attempts x WEBHOOK_TIMEOUT_MS 10 000 (execute-webhook-call.ts:6) + 10 s margin" }` and `docCronTick: { ms: 17 * 60_000, basis: "*/15 cron (seal-document-sweep.ts:18) + 2 min margin" }` |
| `src/invariants/rules.ts` | L1 | `doc-leak-recipient-email` SQL scoped to live envelopes (section 7) |
| `src/invariants/rules.ts` | L2 | add `doc-leak-organisation-name` (section 7); unit test `tests/unit/invariants/doc-leak-organisation.test.ts` |
| `src/db/fixture-allowlist.ts` | none | no change (OD-4 deferred) |
| `playwright.config.ts` | L2 | add `apiProject`-style project `doc-billing-api` with `testMatch: ["billing/doc/**/*.spec.ts"]` (no `dependencies`) |
| `.github/workflows/api.yml` | L5 | add jobs `doc-api`, `doc-serial`, `doc-billing-api` (depend on `foundation`); update the `Available projects` check string to list 9 names |
| `tests/unit/ci/workflow.test.ts` | L5 | update the expected job and project names |
| `package.json`, `package-lock.json` | L4 | devDependencies `@noble/ciphers` and `@noble/hashes` at the exact versions of the fork's lock (read at L4; default `@noble/ciphers@0.6.0`, OD-1) |
| `scripts/cloud-install.sh` | L5 | one line installing `poppler-utils` when `pdfsig` is absent (section 12.1) |
| `scripts/db-roles.ts`, `scripts/bootstrap.sh`, `src/env.ts`, `src/fixtures/*`, `src/auth/*`, `src/webhooks/*` | — | no change |

Any other shared file is out of scope. A builder who needs one raises a STOP.

---

## 14. Will not do; open decisions; risks; repo rules

### 14.1 Will not do

- No test of CUT IDs (CONV-001, I18N-003, CON-002). No `test.fail` on an unproven product behaviour. No fixed sleeps except the labelled `SETTLE_MS` in MAIL-001 (justified by P-DOC-10). No use of `DANGEROUS_BYPASS_RATE_LIMITS`. No write to seed rows. No Stripe object outside the per-run fixture, and never a live-mode key (OD-15). No edit to the fork, its `.env`, its `node_modules`, or the harness. No stripe-mock or TLS interception (rejected in the foundation). No merge, tag or workflow dispatch. No PR review request by the builder.

### 14.2 Open decisions (owner decision 2026-11-02: every default accepted; none is BLOCKING)

| ID | Decision | Evidence | Default |
|---|---|---|---|
| OD-1 | Add `@noble/ciphers` and `@noble/hashes` as devDependencies for job signing | the fork's job signature uses them (`packages/lib/universal/crypto.ts:2-4`) | add, exact fork versions, L4 hunk. Alternative: HR asking for a harness job-trigger helper |
| OD-2 | Live Stripe rows need a real test-mode key | P-DOC-7; R12 | run live only with `STRIPE_API_KEY`; otherwise skip with the named condition |
| OD-3 | Stripe rows in a second stack (billing on) and a second CI job | R16; billing breaks document creation (foundation 1.3) | separate `doc-billing-api` project and job |
| OD-4 | DOC-JOB-002, DOC-JOB-003 and DOC-JOB-005 need enum writes (`Envelope.status`, `Recipient.signingStatus`, `BackgroundJob.status`) that the allow-list forbids | P-DOC-13; R18 | defer all three; not built in this plan. The owner may approve an enum allow-list kind |
| OD-5 | Stripe bad or stale signature answers 500 (catch-all) | `handler.ts:113-118`; P-DOC-7 | assert non-2xx and no row change; no `test.fail`. The owner may pin 400 |
| OD-6 | Precondition refusals answer 500 in two routes, 400 in others | P-DOC-11; `sign-field-with-token.ts:100`, `send-document.ts:125` | assert non-2xx and no row change; no `test.fail` |
| OD-7 | The concurrent CAS race (three simultaneous dispatches on one PENDING row) | no PENDING row can be produced (P-DOC-13) | JOB-004 tests the replay (three sequential, terminal rows); the race is recorded as not built |
| OD-8 | Zero-byte upload `test.fail` (UP-001) | P-DOC-12; the case expects 4xx | `test.fail` after the positive control. The owner may change the case to "non-2xx" |
| OD-9 | DOC-CONV-002 and DOC-CONV-003 | HR-5 | ACCEPTED: DEFERRED until harness v0.3.1 |
| OD-10 | DOC-EXP-003 scope (no row text in the master plan) | derived from EXP-001/002 | "a recipient whose expiry is moved into the future signs again" |
| OD-11 | DOC-WH-005 (row text not in the repository) | search of `docs/master-plan.html` found no row | DEFERRED; the owner supplies the text |
| OD-12 | DOC-MAIL-002 (row text not in the repository) | the master plan lists MAIL-001 only | DEFERRED; the owner supplies the text |
| OD-13 | Upstream duplicates: the verdicts in section 4.4 | the table | no cut proposed; KEEP for all rows that have a DB end-state, timing or artifact oracle |
| OD-14 | Fork secret for job signing read from the fork's `.env` at run time | `readSecondaryKey` | read in memory, never printed; the CI variant reads from the cloned fork's `.env` written by bootstrap |
| OD-15 (2026-11-02, OVERRIDDEN by the owner) | Stripe fixtures for STR-002/003. Owner decision: each run creates its own Stripe test-mode fixture (one customer and one subscription, tagged `run_id`), created in setup and deleted in teardown even when a test fails; STR-002/003 assert "processed once" against that subscription; refuse to run unless the key is test mode; never print the key or any object id. The original default (no Stripe objects, PARTIAL oracle) is withdrawn. | ACCEPTED as overridden. Section 6.7b implements it. The sync needs a Documenso organisation with the customer id (`sync-stripe-customer-subscription.ts:55-68`), so the fixture creates the organisation through the product (OD-16) |
| OD-16 (2026-11-02, DECIDED by the owner, default confirmed) | How the fixture gets a customer the sync can see | `sync-stripe-customer-subscription.ts:55-68` (no organisation, no sync); `create-organisation.ts:39` (the product creates the Stripe customer); `schema.prisma:822` (`Organisation.customerId`); `qa_fixture` cannot write that column (`src/db/fixture-allowlist.ts`) | DECIDED: the fixture creates the organisation through the product, tags its Stripe customer with `run_id`, and attaches the subscription. Teardown in the same `finally` deletes the subscription, the customer and the organisation; the reaper covers all three. Alternatives rejected: writing `Organisation.customerId` directly (outside the fixture policy), or a sync with no organisation (the oracle would be empty). UNPROBED until L2 step 0b: the organisation route, the trial subscription without a payment method, and the Subscription column names |

### 14.3 Risks

- **Wall clock.** Reminders and the seal tick cost up to 15 min per run; the serial job is about 34 min. Mitigation: the tick waits run once per CI run for all sweep cases together (`tickDeadlineMs`).
- **Rate limit.** 10 logins per 15 minutes per IP. A re-run within the bucket fails with 429. Mitigation: one session per worker (R15); the builder waits for the bucket reset before a live re-run (about 15 min).
- **Install state (resolved 2026-11-02, section 12.2).** The repo's `node_modules` now matches the lockfile (harness 0.3.0, stripe 23.0.1). The `npm audit` advisories printed by the install are not addressed by this plan.
- **Stripe reachability** (P-DOC-17): the test-mode key is accepted. The per-run fixture (OD-15) replaces the partial oracle; its organisation route, the trial subscription and the Subscription columns are UNPROBED until the L2 step 0 probe. The CI lane needs the key as a secret.
- **Stripe residue.** A failed teardown leaves run-tagged objects. The reaper (FC-7, section 7) removes them after 2 hours.
- **Seeded state.** Seed rows are not used by the lane; the B3 rows remain for other lanes and are excluded by the run-scoped rule (R6).
- **Probe defects.** Two probe defects were found and corrected (P-DOC-3 early read, P-DOC-9 missing field); the builder must not reuse the probe scripts without the fixes listed in the probe file.

### 14.4 Repo rules (apply verbatim to the plan and the build)

1. No personal names in repository text; use roles (the owner, the maintainer, the builder). The fork URL keeps the owner handle only where it is part of an address that cannot be reworded.
2. No Co-authored-by lines, no "Generated with" lines, no session links, in commits or PR bodies. The Claude-Session trailer requested by the session reminder is NOT added: `AGENTS.md` (Claude Code cloud section) forbids it, and the brief forbids session links.
3. Never edit the product forks, their `.env` files, `node_modules` or the harness. A needed harness change is an HR item (section 13.1).
4. Never print secrets. Test-only secrets are generated per run and passed only through spawn or step environments. Redact in probes and logs.
5. Never weaken an assertion, raise a timeout, add retries or sleeps, or skip a test to get green (the explicit key-condition skip is not a silent skip).
6. Root-cause every failure with `file:line` and label it PRODUCT BUG, TEST BUG or ENV, with evidence.
7. Name TW-RACE-004, OBS-TW-001 and P6-OBS-DOC-003 by ID only, with no description (none of them is in this lane).
8. Lowercase Conventional Commits with explicit paths; never `git add -A` or `git add .`.
9. Do not use or describe the GitHub command-line client anywhere in plans, prompts or scripts. Never merge, tag or dispatch workflows.
10. Every environment change has exact steps for Cursor cloud and Claude Code cloud (section 12).
11. Stripe rows fall back to a named skip when no key is set; a key that is not `sk_test_` is refused (never run, never printed).
12. `test.fail()` only for a proven product bug, placed right before the product assertion, with the positive control asserted first. The zero-byte upload (UP-001) is the only one planned; it is listed as OD-8.
13. Waits are `expect.poll` with an explicit per-call `timeout` from a named `SLO` budget and `intervals: POLL_INTERVALS` (or the labelled cron poll interval). Budgets come from code-defined timeouts plus a margin, with `file:line`.
14. One product stack at a time; always finish with its `down`.

---

## 15. Escalation check for the owner (planning session, updated 2026-11-02)

- Base mismatch: NO (`origin/main` = `aa10ec1`).
- Any BLOCKING decision: NO. Every OD default is accepted (owner decision, 2026-11-02).
- Any HR item that blocks a KEEP case: NO. The owner moved HR-4 and HR-5 to harness v0.3.1; CONV-002 and CONV-003 are DEFERRED until then.
- Any CONTRADICTS against the index: YES, recorded and accepted: unit count 285 vs 277; expiry entry points 6 vs 5; U14 Stripe reachability; C-DOC-3 zero-byte 500 vs the case; SIG-002 wording; the earlier harness pin state; tick batches at the quarter hour with a dispatch lag of 10 to 34 s (RR-TICK).
- Any secret risk: NO. The key was checked by prefix and by count only; it appears in no output, log or file.
- Any stop hit: NO. The two earlier hits are resolved: `npm ci` was approved and run (`cloud-install.sh` rc 0), and harness 0.3.0 is in `node_modules`.

- Owner decision deviation: OD-15 is overridden as instructed. The customer and subscription alone cannot show "processed once", because the sync writes nothing without an organisation with that customer id (`sync-stripe-customer-subscription.ts:55-68`). OD-16 (the organisation is created through the product) was added with a default. Owner confirmation is requested before the L2 build.

Verdict: **NO ESCALATION** (nothing blocks). Owner confirmation requested: OD-16.

---

## Appendix A. Harness and environment facts used by this plan

- Documenso web `http://127.0.0.1:3001` (`DOCUMENSO_DEFAULT_PORT`, `documenso-env.ts:18`); Postgres host `127.0.0.1:5451` (`documenso.compose.yml:19`); Inbucket SMTP `127.0.0.1:2525`, REST `127.0.0.1:9003` (`documenso.compose.yml:31-32`).
- Ports to check before `up` (the brief's list plus three): 3000, 3001, 5555, 5433, 5434, 5450, 5451, 6380, 6381, 2525, 9000, 9003, 4317 (5450 Cal DB `cal.compose.yml:15`; 2525/9003 Inbucket; 9000 unused but checked).
- `NODE24` = `/opt/node24/bin/node` (the session hook sets it; the probe ran `v24.22.0`).
- `PRODUCTS_ROOT=/home/user/products` (harness `config.ts:148`).
- `DOCUMENSO_HEAP_MB = 7168` (`documenso-env.ts:10`).
- The cron jobs and their ids (`cron_<hash>`) come from `local.ts`'s cron helper (`cron-parser`); the cadence is in each sweep definition.
