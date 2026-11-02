# P2 Documenso lane probe record, 2026-11-02

Immutable once merged. Written by the planning session for `docs/plans/2026-11-02-p2-lane-documenso.md`. Earlier
probe files (`2026-11-01-p2-foundation-probes.md` and the Task 5 files) are not edited. Where a result below
contradicts an older entry, the entry names it ("CONTRADICTS <file> <entry>").

- Base: `origin/main` = `aa10ec1` (verified before any probe).
- Product: Documenso at the pinned ref `f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c` (`scripts/bootstrap.sh:11`); `git -C /home/user/products/documenso rev-parse HEAD` returned that SHA before every stack `up`, and the tree was clean.
- Harness: `qa-portfolio-harness` **tag `v0.3.0` (commit `be86e0e608f7ae2ccbe973a57465d2cbe88fb752`)**, built from a scratch clone in `/tmp/p2-lane-probes/harness-v0.3.0` (`npm ci` there: 21 packages; `node -p "require('./package.json').version"` printed `0.3.0`). Ops run with `PRODUCTS_ROOT=/home/user/products`. The repo's own `node_modules/qa-portfolio-harness` is **0.2.11** (stale against `package-lock.json`, which pins `0.3.0` at `be86e0e`). See P-DOC-16. **Superseded 2026-11-02:** from the re-run section on, the harness is the repo's own `node_modules` at 0.3.0 (after `bash scripts/cloud-install.sh`); the scratch build is no longer used.
- Host: Claude Code cloud VM, Node 22.23.3 (`/usr/local/bin/node`), Node 24.22.0 (`$NODE24=/opt/node24/bin/node`), Docker present, `pdfsig` poppler 24.02.0, `pdftotext` present, 4 cores (foundation record).
- Foundation clients and receiver (first entries): a scratch copy of `origin/main`. **Superseded 2026-11-02:** the re-run probes import the repo checkout `src/` directly (same content at `aa10ec1`).
- Secrets: the per-run webhook secret, the job-signing key and the API tokens were never printed. Only lengths and equality results are shown. The Stripe placeholder key is the string `p2-placeholder-stripe-key`; it is not a credential.
- Login budget: Documenso limits login to 10 per 15-minute bucket per user and IP (P-DOC-14). Probes were batched to one login per probe run after the first 429.
- Stacks: one at a time. Every `up` was preceded by `docker ps` and `/dev/tcp` port checks (all clear), and every stack ended with `down` (`down rc=0`).

Status vocabulary: **CONFIRMED** (observed in this session, output below), **UNPROBED** (not run; reason and settling probe given), **CONTRADICTS <ref>** (observed value differs from the cited older entry, the review, or the master plan).

Index: P-DOC-1 webhook send | P-DOC-2 receiver 500 | P-DOC-3 slow 9/11 s and redirect | P-DOC-4 job runner | P-DOC-5 B3 recount | P-DOC-6 expiry | P-DOC-7 Stripe | P-DOC-8 pdfsig | P-DOC-9 API completion path | P-DOC-10 signing mail | P-DOC-11 precondition status codes | P-DOC-12 upload | P-DOC-13 fixture grants | P-DOC-14 rate limit | P-DOC-15 audit rows | P-DOC-16 stack and harness facts | P-DOC-17 Stripe reachability | P-DOC-18 sweeps and cron.

---

## P-DOC-1. One DOCUMENT_CREATED event reaches a receiver on `p2-receiver.test` with the configured secret header

- Date (UTC): 2026-11-02T10:05:10Z
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c (equal to the pin)
- Harness version: 0.3.0 (scratch build)
- Command: stack `up documenso` (billing off, `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=p2-receiver.test`); `node --experimental-strip-types p1-webhook.mts p1-send '{"kind":"ok"}' 15000` (webhook create via tRPC `webhook.createWebhook`, envelope create via `POST /api/v2/envelope/create`, receiver on `127.0.0.1:4317`).
- Output (trimmed):
  ```text
  webhookCreated: true   envelopeCreatedMs: 235
  deliveries: 1   attempt 1   mode ok   path /r/<runId>/p1-send   method POST
  headerNames: accept, accept-encoding, accept-language, connection, content-length, content-type, host, sec-fetch-mode, user-agent, x-documenso-secret
  secretHeaderEqualsConfigured: {ok: true}   secretHeaderLength: 32
  bodyKeys: event, payload, createdAt, webhookEndpoint   event: DOCUMENT_CREATED   bodyBytes: 1210
  WebhookCall: SUCCESS / 200 / DOCUMENT_CREATED   BackgroundJob "Execute Webhook" COMPLETED retried 0
  ```
- Proves: the product sends `X-Documenso-Secret` with the configured value in plain text (no HMAC), one delivery for one event, and a `WebhookCall` row per call.
- Citation: `packages/lib/server-only/webhooks/execute-webhook-call.ts:36-41` (`redirect: 'manual'`, header `X-Documenso-Secret`); `packages/lib/jobs/definitions/internal/execute-webhook.handler.ts:20-27` (body with `webhookEndpoint`).
- Status: CONFIRMED. Agrees with the foundation record (`2026-11-01-p2-foundation-probes.md` 4.2).

## P-DOC-2. Receiver `500`: attempts, gaps, call rows, and `createdAt` per attempt

- Date (UTC): 2026-11-02T10:05:29Z (run 1) and 10:05:47Z (run 2, with body hashes)
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0 (scratch build)
- Command: `node --experimental-strip-types p1-webhook.mts p2-500 '{"kind":"500"}' 15000` (run 2: `p2b-500`).
- Output (trimmed):
  ```text
  run 1: deliveries 4 (attempts 1..4)   gaps ms: 54, 18, 16
  run 2: attempt 1 body createdAt 10:05:47.406Z  bodySha256 344947b7...
         attempt 2 body createdAt 10:05:47.427Z  bodySha256 a003f093...
         attempt 3 body createdAt 10:05:47.443Z  bodySha256 6e1d017e...
         attempt 4 body createdAt 10:05:47.457Z  bodySha256 6032036c...   payload.id 1020 (same on all)
         gaps ms: 18, 15, 15
  WebhookCall rows: 4 x (status FAILED, responseCode 500, event DOCUMENT_CREATED)
  BackgroundJob "Execute Webhook": FAILED, retried 3, maxRetries 3
  ```
- Proves: one event makes 1 + 3 attempts with no back-off (gaps of 15 to 54 ms), the body `createdAt` changes per attempt while `payload.id` does not, and the job ends `FAILED` after `retried = maxRetries`.
- Citation: `packages/lib/jobs/client/local.ts:318` (`retried >= maxRetries`), `local.ts:336-350` (retry dispatch), `packages/lib/jobs/definitions/internal/execute-webhook.handler.ts:20-27`; `WebhookCall` columns read via `information_schema` (id, status, url, requestBody, responseCode, responseHeaders, responseBody, createdAt, webhookId, event).
- Status: CONFIRMED. Matches the index (DOC-WH-002 rewrite: 4 deliveries, no back-off, `createdAt` differs). Agrees with the foundation 4.2 (4 deliveries within about 82 ms).

## P-DOC-3. Receiver `slow` at 9 s and 11 s against the 10 s timeout; `redirect` followed or not

- Date (UTC): 2026-11-02T10:05:59Z (slow 9 s, first read before the job finished: read after 1 s is NOT a valid oracle, see note), 10:06:13Z (slow 9 s, re-run with completion wait), 10:06:23Z (slow 11 s), 10:06:01Z (redirect 302)
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0 (scratch build)
- Command: `p1-webhook.mts p3-slow9b '{"kind":"slow","delayMs":9000}' 20000`; `p1-webhook.mts p3-slow11 '{"kind":"slow","delayMs":11000}' 60000`; `p1-webhook.mts p3-redirect '{"kind":"redirect","status":302}' 15000`.
- Output (trimmed):
  ```text
  slow 9000 ms : deliveries 1 (10:06:13.231Z)   WebhookCall SUCCESS 200   job COMPLETED retried 0   read at 9190 ms
  slow 11000 ms: deliveries 4 at 10:06:23.368Z, 10:06:33.377Z, 10:06:43.394Z, 10:06:53.410Z
                 gaps ms 10009, 10017, 10016   WebhookCall 4 x (FAILED, responseCode 0)   job FAILED retried 3   read at 40240 ms
  redirect 302 : deliveries 4, all on the original path (no /redirected delivery)   WebhookCall 4 x (FAILED, 302)   job FAILED retried 3
  ```
- Note (probe defect, recorded not hidden): the first slow-9 s run read the database one second after the first delivery and saw the job still `PROCESSING` with no `WebhookCall` row. The probe was changed to wait for a terminal job row (bounded), and the 9 s and 11 s runs were repeated with that wait. The first slow-9 s result is not used.
- Proves: the request timeout is 10 s (an 11 s receiver is aborted at about 10 s, four times, about 10 s apart); a 9 s receiver is accepted; the product does not follow a 3xx (no delivery on `/redirected`).
- Citation: `packages/lib/server-only/webhooks/execute-webhook-call.ts:6` (`WEBHOOK_TIMEOUT_MS = 10_000`), `:33-37` (`timeoutMs`, `redirect: 'manual'`); `packages/lib/utils/timeout.ts:17-33` (`Request timed out after ${timeoutMs}ms`).
- Status: CONFIRMED.

## P-DOC-4a. BackgroundJob states through a delivery

- Date (UTC): 2026-11-02T10:05:11Z to 10:06:53Z (rows from P-DOC-1, P-DOC-2, P-DOC-3)
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0 (scratch build)
- Command: the `backgroundJobs` read (qa_ro) inside `p1-webhook.mts`.
- Output (trimmed): `PROCESSING` observed mid-call (slow 9 s read: `status PROCESSING, retried 0, maxRetries 3`); terminal rows `COMPLETED retried 0` (success) and `FAILED retried 3 maxRetries 3` (any failure). The sweep jobs run in the same stack: `internal.cleanup-rate-limits`, `internal.send-signing-reminders-sweep`, `internal.expire-recipients-sweep` (`COMPLETED`, see P-DOC-18).
- Proves: a job row goes PROCESSING then a terminal state; a failed chain ends `FAILED` with `retried = maxRetries`. `PENDING` was not observed (the product dispatches at once).
- Citation: `packages/lib/jobs/client/local.ts:277-291` (update where `status: PENDING` sets PROCESSING), `:304-313` (COMPLETED with `completedAt`), `:318-331` (FAILED).
- Status: CONFIRMED for PROCESSING, COMPLETED and FAILED. PENDING state: UNPROBED as an observed value (the row exists only between create and dispatch).

## P-DOC-4b. Second dispatch of a terminal job (compare-and-set) and a wrong signature (control)

- Date (UTC): about 10:07Z (the replay ran after P-DOC-3; the exact timestamp was not recorded)
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0 (scratch build)
- Command: `node --experimental-strip-types p4-cas.mts`. The dispatch signature is the fork's own scheme, reproduced with the fork's `@noble/ciphers` 0.6.0 and `@noble/hashes` from `/home/user/products/documenso/node_modules`: `sha512(JSON.stringify(options))` encrypted with `xchacha20poly1305`, key `sha256(NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY)` (read in memory from the fork's `.env`, never printed). Body `{name: 'internal.execute-webhook', payload: {event, webhookId: 'p2-nonexistent-webhook', data: {}}}`. Target: `POST /api/jobs/internal.execute-webhook/<jobId>` with `x-job-id` and `x-job-signature`.
- Output (trimmed):
  ```text
  job FAILED (retried 3):   control (wrong signature) 401 Unauthorized
                            correct signature x3       404 Job not found, 404, 404
                            row after: status FAILED, retried 3, completedAt set   -> unchanged: true
  job COMPLETED (retried 0): control 401 Unauthorized; correct x3 404 x3; row unchanged: true
  ```
- Proves: the route is mounted and checks the signature (401 for a wrong one), and a correctly signed dispatch of a job that is not PENDING is refused by the compare-and-set (404) with no row change and no handler run (the payload names a non-existent webhook, so a wrong pass would not send a webhook either).
- Not proven: a concurrent race. A PENDING row cannot be produced from outside the product (`qa_fixture` cannot write `BackgroundJob.status`, see P-DOC-13), so three simultaneous dispatches on one PENDING row are UNPROBED.
- Citation: `packages/lib/jobs/client/local.ts:228-230` (signature headers), `:259-262` (`verify` before the update), `:277-295` (CAS update with `status: PENDING`, `.catch(() => null)`, then `404 Job not found`); `packages/lib/server-only/crypto/sign.ts`, `packages/lib/server-only/crypto/verify.ts:4-12`, `packages/lib/universal/crypto.ts:11-18`.
- Status: CONFIRMED on terminal rows. Concurrent-race case: UNPROBED (settled by a PENDING-row fixture or a fork-side hook; see plan Open decision OD-7).

## P-DOC-4c. Seal-sweep window edges and cron cadence

- Date (UTC): not run (the cadence query failed in the probe script after the stack was already down; the failure was not re-run).
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0
- Command: `node --experimental-strip-types p4c-cron.mts` (a read of `BackgroundJob` rows with `id LIKE 'cron\_%'`). First attempt: the script exited with an error after the stack was stopped; no retry was made.
- Output: not available (script error on the first attempt; no output captured).
- Code facts (read, not probed): the sweep reads `Recipient.signedAt`, not the envelope's last action: an envelope is picked when `status = PENDING`, every recipient is `SIGNED` or `CC` (or one is `REJECTED`), no recipient has `signedAt > now - 15 min`, and some recipient has `signedAt > now - 6 h` (`packages/lib/jobs/definitions/internal/seal-document-sweep.handler.ts:12-13, 25-76`; `.limit(100)` at 77). The cron is `*/15 * * * *` (`packages/lib/jobs/definitions/internal/seal-document-sweep.ts:18`).
- Status (updated in the re-run section, RR-TICK): cron tick timing CONFIRMED (two tick batches observed, see RR-TICK). Window edges (14 min / 16 min / 5 h 59 min / 6 h 01 min): UNPROBED.
- Builder's command for the window edges (not run; needs OD-4 approval, the plan defers JOB-005): `npx playwright test --project=doc-serial -g "P2-DOC-JOB-005"`. Until then the window is not measured and no test claims it. Reason: the edge cases need `PENDING` envelopes with all recipients signed, which the product never leaves (completion seals at once, P-DOC-9), and the fixture role cannot write `Envelope.status` or `Recipient.signingStatus` (P-DOC-13). Settled by plan Open decision OD-4 (deferred), not by this probe.

## P-DOC-5. B3 recount: COMPLETED envelopes with `completedAt` NULL, split by seed rows and rows of this run

- Date (UTC): 2026-11-02T10:07:14Z
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0
- Command: `node --experimental-strip-types p5-b3.mts` (qa_ro).
- Output (trimmed):
  ```text
  Envelope by status (all rows):  COMPLETED 333 / completedAt set 0   DRAFT 354 / 0   PENDING 337 / 0
  rows of this run (title LIKE run prefix): none (before any completion in this run)
  COMPLETED with completedAt NULL and title NOT LIKE 'p2-qa-%': 333
  ```
- Proves: the 333 inconsistent rows are all seeded (no run prefix), and none were created by a run.
- Citation: seed writer `packages/prisma/seed/documents.ts:65` (`.with(COMPLETED, seedCompletedDocument)`) and `:670-680` (`status: DocumentStatus.COMPLETED`, no `completedAt`); `documents.ts:762` sets `completedAt` in a different seed function (not the 333 rows).
- Status: CONFIRMED (seed data). Agrees with `2026-11-01-p2-foundation-probes.md` 6.4.

## P-DOC-5b. B3 runtime oracle: an envelope completed through the product gets `completedAt`

- Date (UTC): 2026-11-02T10:16:49Z (run `p69b`), also 10:17:4x (`pmisc`) and 10:18:0x (`pdl`)
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0
- Command: `node --experimental-strip-types p69-combined.mts` (section A) with SIGNATURE fields; the same flow in `pmisc.mts` and `pdl.mts` (see P-DOC-9).
- Output (trimmed):
  ```text
  after complete: envelope status COMPLETED, completedAt 2026-11-02 10:16:49.014 (set)
  recipient: signingStatus SIGNED, signedAt set
  BackgroundJob internal.seal-document: PROCESSING at the read (the seal job was still running)
  pmisc: envelope COMPLETED, completedAt set; pdl: download 200 (see P-DOC-8)
  ```
- Proves: the product sets `Envelope.completedAt` when a envelope completes (the seal transaction writes status and `completedAt`). The B3 rows are therefore seed data and not a runtime defect.
- Citation: `packages/lib/jobs/definitions/internal/seal-document.handler.ts:310-316` (`status: finalEnvelopeStatus, completedAt: new Date()` in one update); `packages/lib/jobs/definitions/internal/seal-document-sweep.handler.ts` is not the writer.
- Status: CONFIRMED. Scope of the claim: SES envelopes completed by token completion, one signer. TSP envelopes not probed (UNPROBED).

## P-DOC-6. Expiry: live refusal after a `qa_fixture` time travel; the guard's call sites

- Date (UTC): 2026-11-02T10:15:2x to 10:16:2x (run `p69b`, section B)
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0
- Command: `p69-combined.mts`: distribute an envelope, set `Recipient.expiresAt = now() - interval '1 minute'` through the `qa_fixture` role (`pg` client on `roleDbUrl('documenso','qa_fixture')`), then `field.signFieldWithToken` with the recipient token.
- Output (trimmed):
  ```text
  fixture UPDATE Recipient.expiresAt rows 1
  sign after expiry: 400 {"code":"RECIPIENT_EXPIRED","httpStatus":400,"message":"Recipient signing window has expired"}
  recipient after: signingStatus NOT_SIGNED (unchanged)
  ```
- Proves: the live refusal for `field.signFieldWithToken` is 400 `RECIPIENT_EXPIRED` and the recipient row is unchanged.
- Call sites (static, six files, not five): `packages/trpc/server/envelope-router/sign-envelope-field.ts:105-106`; `packages/lib/server-only/field/remove-signed-field-with-token.ts:50`; `packages/lib/server-only/field/sign-field-with-token.ts:103`; `packages/lib/server-only/document/reject-document-on-behalf-of.ts:105`; `packages/lib/server-only/document/reject-document-with-token.ts:60`; `packages/lib/server-only/document/complete-document-with-token.ts:131`. Guard: `packages/lib/utils/recipients.ts:297-300`.
- CONTRADICTS the review's "5 entry points" (review text, index DOC-EXP-001/002 upgrade): six files, seven call sites.
- Not probed live: `remove-signed-field`, `reject-*`, `complete-document-with-token` on an expired recipient (UNPROBED; the L3 builder probes them, see plan).
- Status: CONFIRMED for `sign-field-with-token` only.

## P-DOC-7. Stripe webhook route: rows that need no Stripe API call (billing on, no real key)

- Date (UTC): 2026-11-02T10:19:xxZ (stack with `NEXT_PUBLIC_FEATURE_BILLING_ENABLED=true`, `NEXT_PRIVATE_STRIPE_WEBHOOK_SECRET` = a per-run random value passed in the `up` environment only, `NEXT_PRIVATE_STRIPE_API_KEY=p2-placeholder-stripe-key`)
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0
- Command: `up documenso` with those variables (`up-documenso-billing.log`, `up rc=0 secs=26`); `node --experimental-strip-types p7-stripe.mts`. The probe read the secret in memory from the web process environment (`/proc/<pid>/environ`) and signed with the foundation's `signStripe` (`src/webhooks/sign.ts`, stripe 23.0.1).
- Output (trimmed):
  ```text
  unsigned (no Stripe-Signature)                 400  "No signature found in request"
  bad signature (v1=abab...)                     500  "Unknown error"
  correctly signed, timestamp now-600 s         500  "Unknown error"
  correctly signed, charge.succeeded (not synced) 200  "Webhook received"
  correctly signed, synced type, no customer      200  "Webhook received"
  correctly signed, synced type, customer cus_p2  500  "Unknown error"   (see P-DOC-17)
  ```
- Proves: a missing signature is 400; a bad or stale signature is 500 through the blanket catch; a correctly signed unsynced or customer-less event is 200. The per-run secret was not printed.
- Citation: `packages/ee/server-only/stripe/webhook/handler.ts:31-34` (missing secret throws), `:50-56` (no signature 400), `:72` (`constructEvent`), `:74-80` (unsynced 200), `:89-100` (no customer 200), `:113-118` (catch, 500 `Unknown error`); route `apps/remix/app/routes/api+/stripe.webhook.ts`.
- Status: CONFIRMED for the six rows above. Not proven: the 500 for a bad signature is a deliberate contract (it is the catch-all, `handler.ts:113-118`). The plan treats it as an open decision (OD-5) and asserts non-2xx plus no DB change.
- Re-run with the real test-mode key: see RR-STRIPE. The 500 on a synced event with a customer is explained: with the real key the same request returns 200 (the placeholder key was rejected by Stripe).

## P-DOC-8. `pdfsig` on the VM; the sealed PDF's signature is valid; a flipped byte is rejected

- Date (UTC): 2026-11-02T10:18:0xZ (sealed file from run `pdl`, `/tmp/p2-lane-probes/sealed-pdl.pdf`, 215610 bytes, magic `%PDF-`)
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0
- Command: `pdfsig -v`; `pdfsig sealed-pdl.pdf`; a copy with one byte flipped at offset 1000 (inside the signed range), then `pdfsig` again.
- Output (trimmed):
  ```text
  pdfsig version 24.02.0
  Signature #1: Signature Field Name: Signature_1   Signer Certificate Common Name: Documenso
    Signing Hash Algorithm: SHA-256   Signature Type: ETSI.CAdES.detached
    Signed Ranges: [0 - 190304], [214882 - 215610]   Total document signed
    Signature Validation: Signature is Valid.    Certificate Validation: Certificate issuer is unknown.
  control (unchanged):  Signature Validation: Signature is Valid.
  tampered (1 byte):    Signature Validation: Digest Mismatch.
  ```
- Proves: `pdfsig` is installed; the product's sealed PDF carries a CAdES signature by `CN=Documenso` (self-signed, issuer unknown) that validates; a one-byte change inside the signed range breaks it.
- CONTRADICTS the master-plan text for DOC-SIG-002 ("Signature is invalid"): pdfsig 24.02 prints `Digest Mismatch.`. The assertion must read the `Signature Validation:` value, not one fixed phrase.
- Citation: `apps/remix/server/api/download/download.ts:55-56` (route under `/api/v2`, see P-DOC-16); the signing configuration is the harness's (`/tmp/p2-lane-probes/harness-v0.3.0/src/adapters/documenso-env.ts:225`, `documensoLocalSigningCertPath`).
- Status: CONFIRMED (P-DOC-8 is the pdfsig requirement, which is met on this VM; the CI runner needs its own check, see plan L0).

## P-DOC-9. API-only envelope completion (no UI): create, fields, distribute, sign with token, complete

- Date (UTC): 2026-11-02T10:16:4xZ (`p69b` section A) and 10:18:0xZ (`pdl`)
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0
- Command: `POST /api/v2/envelope/create` (recipient SIGNER); `POST /api/v2/envelope/field/create-many` `{envelopeId, data:[{recipientId, type:'SIGNATURE', page:1, positionX:10, positionY:10, width:20, height:5}]}`; `POST /api/v2/envelope/distribute {envelopeId}`; `POST /api/trpc/field.signFieldWithToken` `{json:{token, fieldId, value:'probe'}}`; `POST /api/trpc/recipient.completeDocumentWithToken` `{json:{token, documentId}}`.
- Output (trimmed):
  ```text
  field create-many 200   distribute 200   sign 200   complete 200 {"status":"SIGNED"}
  envelope COMPLETED, completedAt set; recipient SIGNED
  ```
- Earlier attempts (same session, recorded): (1) without a SIGNATURE field, distribute 400 `The following recipients are missing required fields ... Signers must have ...`; `isSignatureFieldType` is the rule (`packages/lib/utils/recipients.ts:170`, `packages/lib/server-only/document/send-document.ts:198`). (2) TEXT field: the same 400. Completion of a DRAFT envelope is 400 `ENVELOPE_DRAFT` (`must be pending to be completed, found DRAFT`).
- Proves: a full signer flow is possible through the public API and the token procedures, with no UI and no Stripe. This is the foundation for DOC-SM, DOC-SIG, DOC-AUD, DOC-MAIL and the B3 oracle.
- Citation: `packages/trpc/server/recipient-router/router.ts:589-631` (`completeDocumentWithToken`), `packages/trpc/server/field-router/router.ts:616-626` (`signFieldWithToken`), `packages/trpc/server/envelope-router/envelope-fields/create-envelope-fields.types.ts:17,79-82`, `packages/trpc/server/envelope-router/distribute-envelope.types.ts:11`.
- Status: CONFIRMED.

## P-DOC-10. Signing mail: one per recipient, token matches the recipient

- Date (UTC): 2026-11-02T10:20:4xZ (stack: non-billing, `up` rc 0 in 26 s)
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0
- Command: `node --experimental-strip-types pmail.mts`. Envelope with 2 SIGNER recipients (SIGNATURE field each), distribute, then the Inbucket REST API `GET http://127.0.0.1:9003/api/v1/mailbox/<local part>` and `/<id>`; the signing token is the `/sign/<token>` segment of the body, compared with `Recipient.token`.
- Output (trimmed):
  ```text
  distribute 200
  messagesPerMailbox: <runId>-ma: 1   <runId>-mb: 1        (after a 5 s settle)
  tokenMatchesRecipient: <runId>-ma: 1 of 1   <runId>-mb: 1 of 1
  ```
- Proves: one signing mail reaches each recipient's mailbox and carries that recipient's token. A duplicate send would have shown as 2 within the 5 s settle (not observed).
- Citation: `/tmp/p2-lane-probes/harness-v0.3.0/docker/documenso.compose.yml:30-32` (`inbucket` SMTP `127.0.0.1:2525`, REST `127.0.0.1:9003`); `documenso-env.ts:273-275` (`NEXT_PRIVATE_SMTP_TRANSPORT=smtp-auth`, host `127.0.0.1`, port `2525`).
- Status: CONFIRMED. The Inbucket API port is a compose mapping, not a harness constant (HR-4 proposes exporting it).

## P-DOC-11. Status codes for refused transitions and preconditions (observed)

- Date (UTC): 2026-11-02T10:17:4xZ (`pmisc`) and 10:16:4x (`p69b`)
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0
- Command: the calls listed; no DB writes except through the product.
- Output (trimmed):
  ```text
  distribute a COMPLETED envelope      500  {"message":"Can not send completed document","code":"INTERNAL_SERVER_ERROR"}
  field create-many on COMPLETED       400  {"message":"Envelope already complete","code":"INVALID_REQUEST"}
  sign a non-pending envelope (DRAFT)  500  {"message":"Document ... must be pending for signing","code":"INTERNAL_SERVER_ERROR"}
  complete a DRAFT envelope            400  {"code":"ENVELOPE_DRAFT"}
  sign an expired recipient            400  {"code":"RECIPIENT_EXPIRED"}
  rows after the refused distribute and field create: unchanged (true)
  ```
- Proves: the product returns 500 for two precondition refusals (plain `Error` throws) and 400 for others. Refused calls change no rows.
- Citation: `packages/lib/server-only/document/send-document.ts:125` (`throw new Error('Can not send completed document')`); `packages/lib/server-only/field/sign-field-with-token.ts:100` (`throw new Error(...must be pending for signing)`); `packages/lib/server-only/field/update-envelope-fields.ts:68` (`Envelope already complete`); `packages/lib/utils/recipients.ts:299-300` (`RECIPIENT_EXPIRED`).
- Status: CONFIRMED for the observed codes. Whether 500 is the intended class is not stated anywhere in the repo: a SUSPECTED inconsistency (plan OD-6).

## P-DOC-12. Upload: zero-byte file with a session, and with an API token

- Date (UTC): 2026-11-02T10:17:4xZ (`pmisc`)
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0
- Command: `POST /api/files/upload-pdf` as multipart `file` = 0 bytes, `name=empty.pdf`, `application/pdf`, once with the session cookie and once with `Authorization: <api token>`.
- Output (trimmed):
  ```text
  session cookie   500  {"error":"Upload failed"}
  API token        401  {"error":"Unauthorized"}
  ```
- Proves: a zero-byte upload with a valid session returns 500 (the case expects 4xx); the upload route accepts a session only, not the API token.
- Citation: `apps/remix/server/api/files/files.ts:29` (route), `:56-57` (`console.error('Upload failed')`, `c.json({error:'Upload failed'}, 500)`), `:33-34` (`resolveFileUploadUserId`, 401 without a user).
- CONTRADICTS the master-plan case P2-DOC-UP-001 (expects 400/415/422).
- Not probed: a valid PDF upload with the session (the L1 positive control must be probed first, see plan L1); an oversize file (P2-DOC-UP-004); an encrypted PDF (P2-DOC-UP-005); a non-PDF (P2-DOC-UP-002).
- Status: CONFIRMED for the zero-byte row.

## P-DOC-13. `qa_fixture` grants: an allow-listed timestamp works; a non-listed column is refused by the database

- Date (UTC): 2026-11-02T10:15:2xZ (`p69b`, section B and C)
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0
- Command: `pg` client as `qa_fixture` (`roleDbUrl('documenso','qa_fixture')`): `UPDATE "Recipient" SET "expiresAt" = now() - interval '1 minute' WHERE "id" = $1`; and `UPDATE "Recipient" SET "signingStatus" = 'SIGNED' WHERE "id" = $1`.
- Output (trimmed):
  ```text
  expiresAt update: rowCount 1
  signingStatus update: REFUSED 42501 permission denied for table Recipient
  ```
- Proves: the grant set provisioned by `scripts/db-roles.ts provision documenso` (`src/db/roles.ts` `provisionStatements`) lets `qa_fixture` update only the allow-listed columns; the database refuses others.
- Not proven: `BackgroundJob.status` writes (not granted: the allow-list only permits timestamp kinds, `src/db/fixture-allowlist.ts:8-18`). Settled by the plan (OD-4, OD-7).
- Status: CONFIRMED.

## P-DOC-14. Login rate limit: 429 after about 10 logins in one bucket

- Date (UTC): 2026-11-02T10:07:xx to 10:10:47Z (first 429 at 10:10:47Z, then the bucket reset; success at 10:16:24Z)
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0
- Command: every probe run calls `mintDocumenso` (csrf, `POST /api/auth/email-password/authorize`, `apiToken.create`). The 11th login in one 15-minute bucket returned 429.
- Output (trimmed):
  ```text
  AuthError: TEST BUG: auth step "documenso authorize" failed (HTTP 429)     (10:10:47Z)
  next successful login: 10:16:24Z (after the 10:15 bucket began)
  ```
- Proves: the login route is limited to 10 per 15-minute window (`loginRateLimit`: `max: 10`, `globalMax: 50`, `window: '15m'`), keyed by IP (`ip:<addr>`) and by user; buckets are fixed clock windows (`getBucket`: `now - now % windowMs`).
- Citation: `packages/lib/server-only/rate-limit/rate-limits.ts:34-39`; `packages/lib/server-only/rate-limit/rate-limit.ts:48-53` (`getBucket`), `:84-93` (`ip:${ip}` key); `packages/auth/server/routes/email-password.ts:82-85` (`rateLimitResponse` then `HTTPException(429)`).
- Bypass (not used): `DANGEROUS_BYPASS_RATE_LIMITS=true` (`packages/lib/server-only/rate-limit/rate-limit.ts:73`). The lane will not set it.
- Not checked: whether a refused login leaves a row (for example a session or token). Evidence that no token is created: `apiToken.create` runs only after a successful authorize (`src/auth/documenso.ts`, the `apiToken.create` call after the 201 check), so the 429 path creates none. A row count is UNPROBED (Framework check F1 in the plan).
- Status: CONFIRMED (429). Row count: UNPROBED.

## P-DOC-15. Audit rows for a completed envelope

- Date (UTC): 2026-11-02T10:17:4xZ (`pmisc`)
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0
- Command: `SELECT "type", count(*) FROM "DocumentAuditLog" WHERE "envelopeId" = $1 GROUP BY 1` (qa_ro).
- Output (trimmed): `DOCUMENT_CREATED 1, DOCUMENT_FIELD_INSERTED 1, DOCUMENT_FIELDS_AUTO_INSERTED 1, DOCUMENT_SENT 1, DOCUMENT_RECIPIENT_COMPLETED 1, DOCUMENT_COMPLETED 1, EMAIL_SENT (count not shown), FIELD_CREATED (count not shown)`.
- Proves: one audit row per lifecycle action for one envelope; the DB table is `DocumentAuditLog` (`packages/prisma/schema.prisma:517`).
- Status: CONFIRMED for the listed types. The `EMAIL_SENT` and `FIELD_CREATED` counts were not captured in this run.

## P-DOC-16. Stack timing and harness facts

- Date (UTC): 2026-11-02T09:56:42Z (cold `up`), 10:19:00Z (warm `up`, billing on), 10:20:09Z (warm `up`, billing off), `down` 1 to 2 s each
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0 (scratch build)
- Command: `PRODUCTS_ROOT=/home/user/products NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=p2-receiver.test timeout 1000 "$NODE24" .../up.mjs documenso`; the same with `NEXT_PUBLIC_FEATURE_BILLING_ENABLED=true`, `NEXT_PRIVATE_STRIPE_WEBHOOK_SECRET`, `NEXT_PRIVATE_STRIPE_API_KEY`; `down.mjs documenso` with `PRODUCTS_ROOT`.
- Output (trimmed):
  ```text
  up (cold, image layers extracting): up rc=0 secs=396 ; "Documenso web is up at http://127.0.0.1:3001"
  up (warm, build skipped by SHA marker): up rc=0 secs=26 (billing on), up rc=0 secs=26 (billing off)
  down: down rc=0 (secs 1-2); no qa-harness containers left
  down with no PRODUCTS_ROOT: Error: Cal product root does not exist: /tmp/p2-lane-probes/products/cal   (first attempt, fixed by setting PRODUCTS_ROOT)
  ```
- Facts: `DOCUMENSO_HEAP_MB = 7168` and `withDocumensoHeap` merges it into `NODE_OPTIONS` (`documenso-env.ts:10-14`; harness CHANGELOG v0.3.0) (HR-3 landed). The Documenso DB is host port **5451** (`docker/documenso.compose.yml:19`, `127.0.0.1:5451:5432`), which the brief's port list did not include; the Inbucket container publishes 2525 (SMTP) and 9003 (REST). The harness default `PRODUCTS_ROOT` is `<harness>/../products`, so a scratch harness needs the variable.
- Status: CONFIRMED. The cold `up` in this session took 396 s with image layers still extracting; the foundation measured about 11 min. The plan's budget uses the 11-minute figure.

## P-DOC-17. Stripe API reachability from this sandbox

- Date (UTC): 2026-11-02T10:2xZ
- Product commit: n/a (outbound check)
- Harness version: n/a
- Command: `curl -sS -m 10 -o /dev/null -w 'api.stripe.com http=%{http_code}\n' https://api.stripe.com/v1/charges`
- Output: `api.stripe.com http=401`
- Proves: `api.stripe.com` answers from this sandbox now (401 for an unauthenticated request). The foundation recorded it as blocked (`2026-11-01-p2-foundation-probes.md` 2.4: `000`; index U14: 403).
- CONTRADICTS `2026-11-01-p2-foundation-probes.md` 2.4 and index U14 (the proxy policy may have changed; the CI lane still needs its own check).
- Consequence in P-DOC-7: the 500 on a synced event with a customer is the SDK's authentication failure with the placeholder key. The product log was not read, so the cause is UNPROBED (inferred).
- Status: CONFIRMED (reachability). The cause of the 500 is UNPROBED.

## P-DOC-18. Recurring sweeps run in the stack (names and their status)

- Date (UTC): 2026-11-02T10:16:24Z (rows read by `p69b`, section A `jobs` query)
- Product commit: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c
- Harness version: 0.3.0
- Command: `SELECT "jobId", "status", "retried", "completedAt" IS NOT NULL FROM "BackgroundJob" WHERE "submittedAt" >= now() - interval '3 minutes'`.
- Output (trimmed): `internal.cleanup-rate-limits COMPLETED`, `internal.send-signing-reminders-sweep COMPLETED`, `internal.expire-recipients-sweep COMPLETED`, `send.document.completed.emails PROCESSING`, `internal.seal-document PROCESSING`, `send.recipient.signed.email COMPLETED`.
- Proves: the recurring sweeps run inside a stack without any harness action, so the serial cases can observe their effects. The cadence is 15 minutes (code: `*/15 * * * *` in `send-signing-reminders-sweep.ts`, `expire-recipients-sweep.ts`, `seal-document-sweep.ts`, `cleanup-rate-limits.ts`); the tick timing itself is UNPROBED (P-DOC-4c).
- Status: CONFIRMED (names and states) and CONFIRMED for tick timing (RR-TICK): ticks at quarter-hour batches, each batch dispatches the four sweeps within 0.1 s, dispatch lag 10 s to 34 s after the quarter hour, and no tick while the web process is down.

---

## Re-run on 2026-11-02 (owner-requested): repo harness 0.3.0, real key, consolidated

Why: the first entries used a scratch harness and a scratch copy of the foundation code. The owner ran `bash scripts/cloud-install.sh` (`npm ci` approved), and asked for the probes that depended on the scratch build and the Stripe rows to be re-run with the real key.

- Install: `bash scripts/cloud-install.sh` rc 0 (72 s; `npm ci` added 138 packages; bootstrap of the four products ran; Twenty comes from Docker images). Harness in the repo's own `node_modules`: `0.3.0` (`node -p "require('./node_modules/qa-portfolio-harness/package.json').version"`). `stripe` 23.0.1 present. Unit: `npm run unit` → `# tests 285`, `# pass 285`, `# fail 0`, exit 0. `npm audit` printed advisories; they were not changed (out of scope).
- Probe code: the probes now import the repo checkout `src/` (content identical to `aa10ec1`); the scratch copy is no longer used. The scratch harness is no longer used.
- Key handling: `STRIPE_API_KEY` is set in the environment and is test mode (prefix checked silently, never printed). Every output and log was checked by count only: `grep -c -F` = 0 in the `up` logs, the probe outputs and the `down` logs. The key authenticates: `GET /v1/balance` with `Authorization: Bearer` via a header on stdin returned 200; without auth 401. Test account: 3 customers returned by `/v1/customers?limit=3` (counted, ids not printed), 0 subscriptions.
- Stacks (one at a time; port and container checks clear before each): (1) billing off, `up` rc 0 in 28 s (build cached by SHA), roles provisioned (`node scripts/db-roles.ts provision documenso` → ok), `down` rc 0. (2) billing on, real key passed in the `up` environment, `up` rc 0 in 29 s, `down` rc 0. No container left running.

### RR-1 to RR-3. Webhook delivery (P-DOC-1, P-DOC-2, P-DOC-3), repo harness

- RR-1 send: deliveries 1, secret equal to configured (`verifyDocumenso` ok), event `DOCUMENT_CREATED`, `WebhookCall` SUCCESS 200, job COMPLETED retried 0. CONFIRMED.
- RR-2 receiver 500: deliveries 4 (attempts 1 to 4), body `createdAt` distinct 4, `payload.id` distinct 1, gaps 22, 23, 22 ms; `WebhookCall` FAILED 500 x4; job FAILED retried 3. CONFIRMED.
- RR-3a slow 9 s: deliveries 1, SUCCESS 200, job COMPLETED. Isolated run: completion at 9.38 s (`slow-iso.mts`, 1 s sampling). CONFIRMED.
- RR-3b slow 11 s: deliveries 4, gaps 10016, 10019, 10016 ms; `WebhookCall` FAILED responseCode 0 x4; job FAILED retried 3. CONFIRMED.
- RR-3c redirect 302: deliveries 4, all on the original path; `WebhookCall` FAILED 302 x4; job FAILED retried 3. CONFIRMED.
- Probe defects corrected in this re-run (recorded, not hidden): (a) the first consolidated run left each case's webhook subscribed, so later envelope events also fired earlier webhooks and the slow cases were still `PROCESSING` when read; each case now removes its own webhook after reading its rows. (b) the first wait condition counted any job submitted after the start time, which an unrelated job could satisfy; the wait now uses that webhook's own call rows. The first consolidated output is `out-rerun.json` (errors and the defects above); the valid output is `out-rerun3.json`.
- Product fact found while cleaning up: deleting a webhook removes its `WebhookCall` rows (`packages/prisma/schema.prisma:215`, `onDelete: Cascade`). Probes and tests must read call rows before they delete the webhook.

### RR-4 to RR-15. Completion, CAS, B3, expiry, grants, mail, PDF, refusals, upload, audit (repo harness, one login)

- RR-4b CAS replay on a FAILED job (`cmvz4marl00f37d5elkja2agz`) and a COMPLETED job: wrong signature 401; correct signature 404 `Job not found` x3; row unchanged (status, retried, completedAt). CONFIRMED on terminal rows (concurrent race still UNPROBED).
- RR-5 B3 recount: `COMPLETED` 339, of which `completedAt` set 6, `completedAt` NULL 333 (all seeded, title without run prefix). The 6 are the runtime-completed envelopes of this session's runs (earlier probes and this re-run). CONFIRMED (seed data, not a runtime defect). P-DOC-5b stands: the runtime sets `completedAt`.
- RR-5b completion through the API (repo harness): field create 200, distribute 200, sign 200, complete 200 → envelope COMPLETED with `completedAt` set. CONFIRMED.
- RR-6 expiry: fixture `Recipient.expiresAt` UPDATE 1 row; sign after expiry 400 `RECIPIENT_EXPIRED`; recipient unchanged. CONFIRMED.
- RR-13 grants: fixture `Recipient.signingStatus` UPDATE → `42501`. CONFIRMED.
- RR-10 mail: distribute 200; Inbucket messages `1` and `1` for two recipients. Token-to-recipient match was not re-checked in the re-run (P-DOC-10 entry stands). CONFIRMED (counts).
- RR-8 PDF: sealed download `GET /api/v2/envelope/item/<id>/download` 200, 212795 bytes, `%PDF-`. `pdfsig`: `Signature is Valid.`, `CN=Documenso`. One flipped byte in a copy: `Digest Mismatch.`. CONFIRMED.
- RR-11 refusals: distribute on a COMPLETED envelope 500; field create-many on it 400. CONFIRMED.
- RR-12 upload: zero-byte with session 500. CONFIRMED.
- RR-15 audit: `DOCUMENT_COMPLETED`, `DOCUMENT_CREATED`, `DOCUMENT_FIELD_INSERTED`, `DOCUMENT_FIELDS_AUTO_INSERTED`, `DOCUMENT_RECIPIENT_COMPLETED`, `DOCUMENT_SENT` and further types (full output in `out-rerun3.json`). CONFIRMED.

### RR-STRIPE. Stripe webhook route with the real test-mode key (billing on)

| Case | Result | Note |
|---|---|---|
| unsigned | 400 `No signature found in request` | unchanged from P-DOC-7 |
| bad signature | 500 `Unknown error` | unchanged |
| stale (-600 s) | 500 `Unknown error` | unchanged |
| valid, not synced (`charge.succeeded`) | 200 `Webhook received` | unchanged |
| valid, synced, no customer | 200 `Webhook received` | unchanged |
| valid, synced, real customer (STR-002, sent twice, same event id) | 200, 200 | placeholder key gave 500 (P-DOC-7); with the real key 200. Cause of the earlier 500 confirmed: Stripe rejected the placeholder key |
| valid, out of order (STR-003: `updated` t2, then `created` t1) | 200, 200 | |

Row counts before and after the synced and out-of-order rows (qa_ro): `Subscription` 0 → 0, `Organisation` 5 → 5, `Webhook` 0 → 0. Oracle strength: weak. The test account has no subscriptions and no Documenso organisation is linked to the customer used, so "processed once" and "one end state" are not proven by these counts. STR-002 and STR-003 therefore run live with the key, and are marked PARTIAL in the plan. A meaningful oracle needs Stripe test-mode fixtures (new decision OD-15 in the plan, default: not created).

### RR-TICK. Quarter-hour ticks (P-DOC-18 and P-DOC-4c, tick timing)

`BackgroundJob` rows with `id LIKE 'cron\_%'` (qa_ro), read after each tick:

```text
batch A  internal.seal-document-sweep  10:15:34.452   (stack up 10:03 to 10:19)
         internal.expire-recipients-sweep 10:15:34.480
         internal.send-signing-reminders-sweep 10:15:34.499
         internal.cleanup-rate-limits  10:15:34.518
  (no batch at 10:30: no stack was running)
batch B  internal.seal-document-sweep  10:45:09.996   (stack up 10:36 to 10:4x)
         internal.expire-recipients-sweep 10:45:10.045
         internal.send-signing-reminders-sweep 10:45:10.064
         internal.cleanup-rate-limits  10:45:10.082
```

- Proves: the four `*/15` sweeps run as one batch per quarter hour (the batch lands 10 s and 34 s after the quarter hour, consistent with the scheduler's own dispatch lag; the scheduled quarter-hour is the cron time, which the row id hashes but does not expose), and no tick runs while the web process is down.
- Builder's command to reproduce (any run with the stack up across a quarter hour): `node --experimental-strip-types /tmp/p2-lane-probes/cron-rows.mts` (a read-only qa_ro query; the builder keeps it outside the repo). The lane's own check is the serial reminder test, `npx playwright test --project=doc-serial -g "P2-DOC-REM-001"`.
- Status: tick timing CONFIRMED. Window edges (P-DOC-4c): UNPROBED (see P-DOC-4c).

## Probe-derived facts that contradict or extend older records

| # | Older statement | Observed here | Entry |
|---|---|---|---|
| C-DOC-1 | Review and index: expiry guard at "5 entry points" | six files (seven call sites) | P-DOC-6 |
| C-DOC-2 | Index U14 and foundation 2.4: `api.stripe.com` blocked | HTTP 401 (reachable) | P-DOC-17 |
| C-DOC-3 | Master-plan DOC-UP-001: zero-byte gives 4xx | 500 with a session | P-DOC-12 |
| C-DOC-4 | Master-plan DOC-SIG-002 text "Signature is invalid" | pdfsig 24.02 prints `Digest Mismatch.` | P-DOC-8 |
| C-DOC-5 | Index note: local dispatch is CAS with no lease | CAS confirmed on terminal rows; no lease in code | P-DOC-4b |
| C-DOC-6 | Index B3: seed data, "report to the fork owner" | confirmed seed data, and runtime sets `completedAt` | P-DOC-5, P-DOC-5b |
| C-DOC-7 | `package.json` and `package-lock.json` pin the harness at `v0.3.0` (`be86e0e`) | the checkout's installed `node_modules` has harness 0.2.11 and no `stripe` package (ENV, plan section 14) | P-DOC-16 |
| C-DOC-8 | Foundation index section 6, U9/U13 | not probed in this session | n/a |

## Probe defects and retries (recorded, not hidden)

- P-DOC-3: first slow-9 s read taken too early (one second after the first delivery) → repeated with a terminal-row wait.
- P-DOC-9: first flows without a SIGNATURE field were refused by the product (distribute 400); the probe was corrected, not retried blindly.
- P-DOC-14: the 11th login in a bucket returned 429; the probe then waited for the bucket reset (about 5 min) instead of retrying in the same bucket.
- P-DOC-4c: the cadence query failed in the probe script after the stack was down; not re-run.
- Install: `npm ci` in the repo was refused by the sandbox classifier (it removes `node_modules` first). The probes used the scratch copy above. Recorded as ENV (plan section 14).

---

## Build session probes (2026-11-02, harness v0.3.1, fork f4105e4)

Run by the build session on the build branch. Harness `0.3.1` (lock `7d4a3ae`), `up documenso` with `DOCUMENSO_GOTENBERG=1` and `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=p2-receiver.test`. Counts, codes and sizes only; no key, token or object id is written here.

| Probe | Question | Result (observed) |
|---|---|---|
| B-1 | Cold `up` with harness 0.3.1 | rc 0 in 484 s; "Documenso web is up at http://127.0.0.1:3001" (UNPROBED budget value now measured: 484 s cold) |
| B-2 | Does `Organisation` have a soft-delete column? (Step 0b, plan UNPROBED) | No. `information_schema.columns` for `Organisation` returns `id`, `name`, `customerId`; no `deletedAt`. Rule `doc-leak-organisation-name` has no soft-delete filter |
| B-3 | Full signing flow (create, field create-many SIGNATURE, distribute, sign, complete) | all 200; envelope `COMPLETED` in 508 ms with `completedAt` set (P-DOC-5b again); download 200, `%PDF-`, 214 231 bytes |
| B-4 | Upload cases (session cookie) | valid PDF 200 `{id, type: BYTES_64, data}`; zero-byte 500 `Upload failed`; EXE renamed to .pdf 500; truncated (first 1 000 bytes) 500; encrypted (AES-256, pypdf 6.17.0) 500; 50 MB + 1 byte 400 `File too large`; API token 401 |
| B-5 | OpenAPI document | `GET /api/v2/openapi.json` 200, `openapi` 3.0.3, 89 paths, 651 272 bytes (committed as `contracts/doc/openapi.json`) |
| B-6 | Envelope meta (`dateFormat`, `timezone`, `language`) | set by `POST /api/v2/envelope/update` (200), stored in `DocumentMeta` joined by `Envelope.documentMetaId` (the create payload does not carry it) |
| B-7 | German date in the sealed PDF | the DATE field renders `03.11.2026 00:24` (German `dd.MM.yyyy HH:mm`, Asia/Kathmandu) for completion at 18:39 UTC: exactly UTC+05:45 (`sign-field-with-token.ts:201`, `complete-document-with-token.ts:254`). The audit lines (`Gesendet`, `Unterzeichnet`) keep the fixed format `2026-11-02 06:39:29 PM (UTC)` (`render-audit-logs.ts:353`). Oracle for I18N-001/002 = the DATE field |
| B-8 | pdfsig on sealed PDF and one-byte flip (offset 1000) | `Signature is Valid.` and `Digest Mismatch.`; signed ranges `[0 - 188925], [213503 - 214231]` (P-DOC-8 again) |
| B-9 | Duplicate distribute | 200; recipient and envelope rows unchanged; Inbucket count 1 per recipient after 3 s (SM-002, MAIL-001) |
| B-10 | Two signers: mail | 1 signing mail per recipient after distribute; after completion the mailboxes hold 3 and 2 (completion notices too). MAIL-001 counts only at the distribute point |
| B-11 | Audit types, one signer | `DOCUMENT_COMPLETED`, `DOCUMENT_CREATED`, `DOCUMENT_FIELDS_AUTO_INSERTED`, `DOCUMENT_FIELD_INSERTED`, `DOCUMENT_RECIPIENT_COMPLETED`, `DOCUMENT_SENT`, `FIELD_CREATED` each 1; `EMAIL_SENT` 2. Two signers: `DOCUMENT_FIELD_INSERTED`, `DOCUMENT_RECIPIENT_COMPLETED`, `FIELDS_AUTO_INSERTED` and `FIELD_CREATED` 2; `EMAIL_SENT` 5 |
| B-12 | Certificate PDF | `GET /api/v2/envelope/{id}/certificate/download` 200; names each signer email. The email wraps across a line in `pdftotext` output: compare with whitespace removed |
| B-13 | Sign before distribute (DRAFT) | `field.signFieldWithToken` 500, message `Document ... must be pending for signing` (P-DOC-11 consistent) |
| B-14 | Sign inside the expiry window | `signFieldWithToken` 200; the recipient becomes SIGNED only on `recipient.completeDocumentWithToken` (P-DOC-9) |
| B-15 | Expired recipient | `signFieldWithToken` 400 `RECIPIENT_EXPIRED` after `expiresAt` moved to now minus 1 s through `qa_fixture` (P-DOC-6) |
| B-16 | Webhook trigger names | `WebhookTriggerEvents` (schema.prisma:167): `DOCUMENT_CREATED`, `DOCUMENT_SENT`, `DOCUMENT_OPENED`, `DOCUMENT_SIGNED`, `DOCUMENT_COMPLETED`, `DOCUMENT_REJECTED`, `DOCUMENT_CANCELLED`. Body key `event`; cancel `POST /api/v2/envelope/cancel` {envelopeId}; reject `recipient.rejectDocumentWithToken` {token, documentId, reason} |
| B-17 | B3 backlog check (read-only, qa_ro) | 333 `COMPLETED` envelopes with `completedAt` NULL, all created 2026-11-02 with titles `[MEDIUM] Document N - COMPLETED` (seed); 0 of them run-prefixed; 0 rows with `completedAt < createdAt`. Verdict: seed artefact. The runtime sets `completedAt` (B-3, SM-001 live) |
| B-18 | Login rate limit | HTTP 429 `documenso authorize` after about 10 logins in one 15-minute window. A failed worker login is retried per test, and each retry counts. A run is stopped at the first 429 and the window waited out |
| B-19 | Stripe webhook route | `/api/stripe/webhook` (apps/remix/app/routes/api+/stripe.webhook.ts); messages `No signature found in request` (400, unsigned) and `Webhook received` (200) (packages/ee/server-only/stripe/webhook/handler.ts) |
| B-20 | Organisation create | `organisation.create` takes `{name, priceId?}` and returns `{paymentRequired}` (the fixture refuses `paymentRequired: true`); `organisation.delete` takes `{organisationId}` |

### PB-DOC-001 (product bug, proven): invalid uploads answer 500

- **Evidence:** B-4 and P-DOC-12. Four inputs that are not a valid PDF (zero-byte, EXE renamed to `.pdf`, truncated, encrypted) each return `500 {"error":"Upload failed"}`. The contract in the master plan (rows P2-DOC-UP-001/002/003/005) expects a 4xx.
- **Mechanism (read):** `apps/remix/server/api/files/files.ts:56-57`: every error in the `try` falls into one `catch` that answers 500 (`console.error('Upload failed:', error)`). Client errors (bad input) are not separated from server errors.
- **Lane treatment:** `test.fail` after the positive control in each of the four tests (`tests/contracts/doc/upload.spec.ts`), so the suite is green while the product answers 500, and turns red once it answers 4xx.

#### Upstream draft (for the fork maintainer; not posted)

Title: `Upload of an invalid PDF answers 500 instead of 4xx`

1. Steps: sign in, `POST /api/files/upload-pdf` with multipart `file` set to (a) an empty buffer, (b) bytes starting `MZ` named `x.pdf`, (c) the first 1 000 bytes of a valid PDF, (d) a password-protected PDF.
2. Observed: HTTP 500, body `{"error":"Upload failed"}` for all four. A valid PDF returns 200.
3. Expected: a 4xx (400 or 415 or 422) for input that is not a PDF. A 500 means a server fault and it should not be the answer to a client error.
4. Cause in code: `apps/remix/server/api/files/files.ts:56-57` (single `catch` answers 500 for every error).
5. Environment: fork `f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c`, harness 0.3.1, Linux, Node 24.

### Pinned values (measured, in the spec)

- AUD-001 (one signer): the pinned map is the observed one above, with `EMAIL_SENT: 2`. The plan's "exactly one per action type" is false for `EMAIL_SENT` (one row per email sent). Reported as a plan-statement correction.
- I18N-001/002: oracle is the DATE field (B-7); the audit lines are not the signed date.
- EXP-001: the recipient reaches SIGNED only after completion (B-14); the case asserts SIGNED after `completeRecipient`.
