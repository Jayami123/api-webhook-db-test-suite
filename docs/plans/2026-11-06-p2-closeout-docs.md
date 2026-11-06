# P2 closeout: docs PR plan (Tasks 2 and 3)

Status: plan revision 2, for maintainer re-review. Plan-only. No build, no PR, no issues, no workflow dispatch.
Base: `origin/main` at `7bb6cd0` (PR #22 merge).
Plan branch: `plan/2026-11-06-p2-closeout-docs`. Build branch (approval-gated, section 9): `feat/2026-11-06-p2-closeout-docs`.

## 0. Lifecycle

- **Phase A, plan revision (this branch, plan-only).** Revise this file, push the plan branch, stop for review.
  No build, no PR, no issue, no dispatch, no commit trailers of any kind.
- **Phase B, build (approval-gated, not started by this plan).** Starts only on a separate owner instruction.
  It uses the build branch in section 9. Nothing in Phase A runs Phase B.
- The owner deletes the plan branch after the build PR copies this cleaned plan. There is no history rewrite.
  The earlier plan commit on the plan branch is public and stays as it is.

## 1. Goal and scope of the build PR

Turn the 12-line README stub into a landing page with a known-findings table and an index, add
`docs/upstream/` with an index and exactly ten public draft files, and keep this plan as a record.
The build PR changes no code, no tests, no workflows, no harness files, and files nothing upstream.

## 2. Privacy rule (applies to the plan and to every changed Markdown file)

The repository is public. The following rule applies to this plan, to the README, to the upstream index,
to every public draft, to titles, comments, verification text, and to the full Markdown diff of the build PR.

- Three findings are **private-first** or **held**. Their details are withheld. New text names them by ID and
  status only:
  - `P5-DOC-TOK-002`: private-first. Status row only. Details withheld.
  - `P2-TW-BUG-004`: private-first. Generic README row only. Details withheld.
  - Medusa ack-before-verify: design finding. Held for P5. Status row only.
- No new mechanism detail for these three in any changed file. The existing public probe records stay as
  they are, and new text links to them neutrally, with no paraphrase of their mechanisms.
- This plan does not reproduce any sensitive literal, field name, constant, or mechanism of those three findings.
  Its checks use only IDs and status words.
- Checks that need a deny-list use a **local, uncommitted** file outside the repository (section 10, V6). The
  file is never committed, copied into another file, or printed. Checks report only FILE:LINE and PASS or FAIL.
- Nothing is moved into another committed guard file.
- The earlier plan commit (`239fcc9`) on this branch contains sensitive literals. This revision removes them from the
  tree. There is no history rewrite. The owner deletes the plan branch after the build PR copies this file.

## 3. Status vocabulary (used identically in the README and the upstream index)

- Private-first items: **"to be reported privately"** until the owner confirms that a private report was filed.
  Only then may the wording change, and only with the owner's confirmation.
- Medusa ack-before-verify: **"held for P5"**. Never "reported".
- Public drafts: **"draft; not filed"**.
- SCH-002: **"held; deterministic repro open"**.
- Filing and private reports are owner-only. Status moves to "filed" only when the owner supplies an issue URL.

## 4. Decisions carried in (approved 2026-11-06)

- Repository is public. Private items: status rows only, no bodies, no new mechanism detail.
- Q1 private-first for `P5-DOC-TOK-002` and `P2-TW-BUG-004`. Q2 README table includes SCH-002 and the held Medusa row.
  Q3 public draft for `P2-MED-CON-PRODUCT` (approved in section 6.1). Medusa ack-before-verify is held. Q4 no new HTML or PDF report.
- **E5 (`p2-doc-serial`, run 42172842345)**: not re-dispatched. The README cites run 42172842345 only if its concluded
  result is `success`. Otherwise the README uses unlinked text "Nightly CI proof pending", and the PR body states the actual
  concluded result. A failed or cancelled run is never represented as in progress.
- Shared `README.md` is owned by the session PR. `docs/lane-ownership.md:77` says the README is not touched by any plan.
  That line is now wrong and is the one named ownership correction (section 9, optional).

## 5. Findings matrix (14 rows)

Link base for immutable evidence (GitHub, pinned to the base SHA):
`https://github.com/Jayami123/api-webhook-db-test-suite/blob/7bb6cd0/`

Short keys used below:
- D = `docs/probes/2026-11-02-p2-lane-documenso-probes.md`
- C = `docs/probes/2026-11-02-p2-lane-cal-live-probes.md`
- T = `docs/probes/2026-11-03-p2-lane-tw-probes.md`
- M = `docs/probes/2026-11-02-p2-medusa-l0-probes.md`

Columns: finding ID, product, proof status, disclosure or upstream status, case ID, expected-failure marker (separate
from the case ID), evidence (immutable link with line span). Marker presence is confirmed by grep at build (V2).

| Finding ID | Product | Proof status | Disclosure / upstream status | Case ID | Expected-failure marker | Evidence |
|---|---|---|---|---|---|---|
| P5-DOC-TOK-002 | Documenso | proven; details withheld | to be reported privately; no file | WH-005 | yes, `tests/webhooks/doc/payload.spec.ts` (verify at build) | D `#L521` (record row, no paraphrase) |
| P5-DOC-DEL-001 | Documenso | proven | draft; not filed | none | none | D `#L535-L539` |
| P5-DOC-CONV-001 | Documenso | proven | draft; not filed | P2-DOC-CONV-002 | yes, `tests/serial/doc/conversion.spec.ts` | D `#L526-L530` |
| PB-DOC-001 | Documenso | proven | draft; not filed | P2-DOC-UP-001/002/003/005 | yes, `tests/contracts/doc/upload.spec.ts` | D `#L478-L492` |
| B2 | Cal | proven | draft; not filed | P2-CAL-WH-003 | yes, `tests/webhooks/cal/cal-wh.spec.ts` | C `#L338-L344` |
| B4 | Cal | proven | draft; not filed | P2-CAL-TASK-003 | yes, `tests/serial/cal/cal-task.spec.ts` | C `#L346-L352` |
| SCH-002 | Cal | intermittent | held; deterministic repro open; no file | P2-CAL-SCH-002 | none (positive control only; a marker would be flaky) | C `#L354-L361` |
| PB-CAL-OAS-1 | Cal | proven | draft; not filed | P2-CAL-CON-* and CON-005 crawl | yes, `tests/contracts/cal/cal-con.spec.ts` | C `#L325-L336` |
| P2-TW-BUG-001 | Twenty | proven (REST and GraphQL) | draft; not filed | currency cases | yes, `tests/integration/tw/currency.spec.ts` | T `#L77-L93` |
| P2-TW-BUG-002 | Twenty | proven | draft; not filed | rest-oas cases | yes, `tests/contracts/tw/rest-oas.spec.ts` | T `#L95-L110` |
| P2-TW-BUG-003 | Twenty | proven | draft; not filed | P2-TW-WH-010 | yes, `tests/webhooks/tw/b1-drop.spec.ts` | T `#L112-L128` |
| P2-TW-BUG-004 | Twenty | proven; generic claim only | to be reported privately; no file | none (off-plan) | none | T `#L130-L141` (record, no paraphrase) |
| P2-MED-CON-PRODUCT | Medusa | proven contract deviation (register-backed) | new public draft; not filed | product contract cases | yes, `tests/contracts/med/product-contract.spec.ts` (verify at build) | `src/lanes/med/deviation-register.json`, `tests/contracts/med/product-contract.spec.ts` |
| Medusa ack-before-verify | Medusa | design finding | held for P5; no file | none | none | M (neutral link, no line span, no paraphrase) |

Proof status and disclosure status are separate. "Private-first" is a disclosure status, never a proof
classification. A private row may say "proven" but states no mechanism.

Row claims for the README (plain, no mechanism):
- P5-DOC-TOK-002: "Webhook data issue. Details withheld; to be reported privately."
- P5-DOC-DEL-001, P5-DOC-CONV-001, PB-DOC-001, B2, B4, PB-CAL-OAS-1, P2-TW-BUG-001/002/003: use the public draft title, copied at build.
- SCH-002: "Concurrent scheduled-trigger fires can deliver one due row twice. Intermittent; positive control only."
- P2-TW-BUG-004: "Workspace deletion returns an internal error in one lifecycle state. Details withheld; to be reported privately."
- P2-MED-CON-PRODUCT: the public draft title (section 6.1).
- Medusa ack-before-verify: "Design finding. Held for P5. No bug claim."

## 6. Public drafts: exact sources and extraction rules

Ten public draft files. Each is a verbatim extraction of the source span (copied at build), under a source-backed heading
that names the record and the span. Source-backed additions are labelled as additions, never represented as copied text.
Where a source has no cause or environment paragraph, the draft omits it. No invented cause, environment or steps.

| Draft file | Source span (immutable, base SHA) | Copy rule |
|---|---|---|
| `docs/upstream/p5-doc-conv-001.md` | D `#L528-L530` (draft) | Verbatim. Evidence link to D `#L526-L530`. |
| `docs/upstream/p5-doc-del-001.md` | D `#L537-L539` (draft) | Verbatim. Evidence link to D `#L535-L539`. |
| `docs/upstream/pb-doc-001.md` | D `#L484-L492` (draft) | Verbatim. Evidence link to D `#L478-L492`. |
| `docs/upstream/b2.md` | C `#L338-L344` | Verbatim finding section; reviewer confirms it is the draft text at build. |
| `docs/upstream/b4.md` | C `#L346-L352` | Verbatim finding section; reviewer confirms at build. |
| `docs/upstream/pb-cal-oas-1.md` | C `#L325-L336` | Verbatim finding section. |
| `docs/upstream/p2-tw-bug-001.md` | T `#L91-L93` (draft title and result), evidence T `#L77-L90` | Verbatim draft; evidence labelled as the record. |
| `docs/upstream/p2-tw-bug-002.md` | T `#L95-L110` | Observed and expected sections only. The record's generator-location line is UNVERIFIED in the source; it is not copied and no cause is claimed. |
| `docs/upstream/p2-tw-bug-003.md` | T `#L126-L128` (draft); evidence T `#L112-L125` | Draft only. The cause paragraph in the evidence span is not copied. |
| `docs/upstream/p2-med-con-product.md` | new text, section 6.1 | Draft text as approved in review. |

Not written as files: P5-DOC-TOK-002, P2-TW-BUG-004, Medusa ack-before-verify, SCH-002 (section 3).

### 6.1 Medusa public draft (new text, for approval in this review)

Title: Store API responses omit properties required by the published OpenAPI schema

Observed: On fork `f677db4` using qa-portfolio-harness 0.3.1, successful Store API responses do not validate against the
pinned upstream Store OpenAPI document from tag `v2.21.2`. For example, `GET /store/products` omits `deleted_at`,
`external_id` and `status` at `/products/N`, although the corresponding schema requires them. The recorded operation and
path signatures are in `src/lanes/med/deviation-register.json`, class PRODUCT.

Reproduction: Use a seeded store with the publishable-key access and product setup described by this repository's Medusa
lane. Request `GET /store/products?limit=2` and validate the HTTP 200 JSON against
`contracts/med/upstream/store.openapi.full.yaml`. `tests/contracts/med/product-contract.spec.ts` records the broader cart,
payment, completion and list flow and asserts successful setup before it checks deviations.

Expected: The published schema and the default successful response should agree. Either the response returns the required
properties, or the response schema is adjusted to match the intended API.

Scope: This reports an observed schema and response mismatch. It does not establish which serializer or schema
declaration is the root cause. Nullability and content-type entries in the SPEC class are separate and are not included.

Evidence: `src/lanes/med/deviation-register.json`, `tests/contracts/med/product-contract.spec.ts`,
`contracts/med/upstream/store.openapi.full.yaml`, `contracts/med/upstream/PROVENANCE.md` (tag `v2.21.2`).
Draft only; not filed upstream.

Distinction preserved: the draft reports an observed contract mismatch. It claims no proven serializer root cause.

## 7. README skeleton (`README.md`)

Rules: plain claim headings only. No personal first-name heading or byline. No Claude cloud setup block and no Windows
setup changes (Task 4). Relative links for local navigation; `blob/7bb6cd0/` links for immutable evidence.

1. **H1**: plain claim, not a slug. Example: "P2: HTTP contract, webhook and database tests for four open-source products".
2. **Plain claim paragraph** (two or three sentences): what P2 tests (HTTP contracts against OpenAPI, signed webhooks,
   async chains, database assertions through a read-only client) and across which four products.
3. **Badge**, linked to the workflow page:
   `[![ci](https://github.com/Jayami123/api-webhook-db-test-suite/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Jayami123/api-webhook-db-test-suite/actions/workflows/ci.yml)`
4. **Lane overview** (four rows: Twenty, Medusa, Cal.com, Documenso). Each row links to its workflow:
   - Twenty: `.github/workflows/p2-tw.yml`
   - Medusa: `.github/workflows/p2-med.yml`
   - Cal.com: `.github/workflows/p2-cal.yml`
   - Documenso: `.github/workflows/p2-doc.yml`
   - The Documenso serial project: `.github/workflows/p2-doc-serial.yml`
5. **CI** (short):
   - `ci.yml` calls the path-selected lane workflows (`api.yml`, `env-check.yml`, `p2-cal.yml`, `p2-doc.yml`, `p2-med.yml`, `p2-tw.yml`).
   - The `gate` job is the required check.
   - The Documenso serial project (`p2-doc-serial.yml`) is outside PR CI. It runs nightly at 08:07 Asia/Colombo (cron `37 2 * * *` UTC) and by manual dispatch.
   - `tw-study.yml` is separate. It is not called by `ci.yml` and is not part of the required gate.
   - Nightly proof text follows section 4 (E5): link only on a concluded `success`; otherwise "Nightly CI proof pending".
6. **Quick check** (product-free):
   - `npm ci`: exit 0.
   - `npm run check`: exit 0. This runs `check:static` and `unit`.
   - `npm run list:api`: exit 0 and a Playwright listing of the API project's tests.
   - These checks do not start any product. They are not a live lane run.
7. **Running product lanes** needs the harness (`node_modules/qa-portfolio-harness`) and the product forks.
   `scripts/bootstrap.sh` prepares forks and dependencies; by itself it is not a running test environment.
   Setup detail is in the lane plans, linked here:
   - `docs/plans/2026-11-02-p2-lane-twenty.md`
   - `docs/plans/2026-11-02-p2-lane-medusa.md`
   - `docs/plans/2026-11-02-p2-lane-cal.md`
   - `docs/plans/2026-11-02-p2-lane-documenso.md`
8. **Known product findings** (heading; not "proven bugs"). The 14-row table from section 5, with columns:
   finding ID, product, proof status, disclosure or upstream status, case ID, expected-failure marker, evidence.
   Row claims as listed in section 5. Private rows carry no mechanism. Links point to `blob/7bb6cd0/` evidence.
9. **Architecture pointer**: `docs/plans/2026-10-20-p2-phase1-roadmap.md`, `docs/lane-ownership.md`, and
   `docs/upstream/README.md` (the upstream index).
   - Architecture diagram: later (plain text, no link).
   - Live report: later (plain text, no link).
   - Video: later (plain text, no link).

## 8. Upstream index (`docs/upstream/README.md`)

- Channel rules: public (draft file plus an issue to file, owner-only) or private (status row only, no body).
- One table with the 14 rows of section 5. Columns: finding ID, product, channel, status (section 3 vocabulary),
  draft file (public only), evidence link.
- Private rows: "to be reported privately" until the owner confirms a report. Medusa ack-before-verify: "held for P5".
  SCH-002: "held; deterministic repro open".
- The index never claims a report or a filing that has not happened.

## 9. Build handoff (approval-gated; not executed by this plan)

Starts only after this plan is approved and only on a separate owner instruction.

1. Verify `origin/main` is `7bb6cd0`. If it has moved, stop and report the new SHA. Do not rebase silently.
2. Create `feat/2026-11-06-p2-closeout-docs` from that verified `origin/main` SHA.
3. Copy this approved plan to `docs/plans/2026-11-06-p2-closeout-docs.md` on the build branch, as a docs record, so the build PR does not cite a missing plan.
4. Write the files in the allow-list below. Run section 10 checks and record the real output.
5. Commit with no commit trailers. Push with `git push -u origin feat/2026-11-06-p2-closeout-docs`.
6. Do not open a PR, merge, dispatch a workflow, or file an issue without the owner's separate instruction.

File allow-list (the build PR may change only these):
- `README.md` (rewrite)
- `docs/upstream/README.md` (new)
- `docs/upstream/p5-doc-conv-001.md`, `docs/upstream/p5-doc-del-001.md`, `docs/upstream/pb-doc-001.md`
- `docs/upstream/b2.md`, `docs/upstream/b4.md`, `docs/upstream/pb-cal-oas-1.md`
- `docs/upstream/p2-tw-bug-001.md`, `docs/upstream/p2-tw-bug-002.md`, `docs/upstream/p2-tw-bug-003.md`
- `docs/upstream/p2-med-con-product.md`
- `docs/plans/2026-11-06-p2-closeout-docs.md` (plan record)
- `docs/lane-ownership.md` (optional; only line 77, the README ownership statement, is corrected)

## 10. Build checks (run at build; recorded in the PR; not run for this plan revision)

- V1 Scripts: `npm run format:check` and `npm run lint` exit 0. Also `npm run check` exit 0 and `npm run list:api` exit 0.
- V2 Link and fragment check: a one-off Node script run from a scratchpad directory outside the repo, using built-ins
  only (no new dependency). It resolves relative links from the containing file, checks that the target exists in the
  build tree, and checks `#fragment` values against GitHub heading slugs in the target. It checks each `blob/7bb6cd0/...#L...`
  link with `git cat-file -e 7bb6cd0:<path>` and checks the line span against the file length. Expected: every link PASS.
  Also grep each row's marker claim (`test.fail` or `expectedDefect` in the named test file) and record PASS or FAIL.
- V3 Counts: exactly 14 rows in the README table and 14 rows in the index. Exactly 10 files under `docs/upstream/` other
  than the README, matching the allow-list. No draft files for P5-DOC-TOK-002, P2-TW-BUG-004, SCH-002, or Medusa
  ack-before-verify.
- V4 Changed-files allow-list: `git diff --name-only origin/main...HEAD` lists only the section 9 allow-list. Anything else fails.
- V5 No-secrets scan: a scan of the full diff for key-like patterns (for example a private key header or a token prefix).
  Expected: no match. Output recorded as PASS or FAIL.
- V6 Privacy review, two parts:
  a. A reviewer reads the full Markdown diff against section 2. No new mechanism detail for the three private or held items.
     No personal first-name heading. No constraint identifier or sensitive literal of those items in any changed file.
  b. Deny-list check, if used: a local, uncommitted list outside the repository, one literal per line, run with
     `grep -F -w -f <list> <file>` over each changed file. Output is only PASS or FAIL per file, with FILE:LINE for any
     fail. The list is never printed, committed, or copied.
- V7 Trailers: `git log --format=%B origin/main..HEAD` contains no `Co-Authored-By` and no `Claude-Session` text. Expected: no output.
- V8 Format: `git diff --check origin/main...HEAD` clean.

Plan-revision checks (this revision only): V6b on this file, V7 on the plan branch, and V4 on this file (only the plan file changes).

## 11. Out of scope (stays out of the build PR)

- Filing any issue, or any private report (owner only, Task 7). Re-dispatching or citing E5 while it is not green.
- BACKLOG and journal updates (Task 6). Task 4 follow-ups, the Claude cloud setup block, Windows setup changes.
- `src/contracts/oas.ts`, `src/ci/known-defect-guard.ts`, workflow timeouts (Task 5), Discovery Tasks 1 to 6 branch.
- New HTML or PDF reports. Architecture diagram, live report and video stay as plain "later" text.

## 12. Open questions for this review

1. SCH-002: status row only, no file (no deterministic repro). Confirm.
2. Medusa draft (section 6.1): confirm the wording, including the observed-versus-root-cause distinction.
3. The `docs/lane-ownership.md:77` correction: confirm it is in the build PR, or drop it.
4. Marker presence in section 5 is marked "verify at build" where this plan has not confirmed it by grep. Confirm the
   approach: grep at build, PASS or FAIL recorded.
5. Section 5 links to the Medusa probe record without a line span, because its text is not reproduced. Confirm.

## 13. Stop point

Phase A ends when this revision is committed and pushed. Stop for re-review. Phase B starts only on a separate instruction.
