# P2 lane ownership

The four product lanes (cal, med, doc, tw) build in parallel from the shared foundation. This page is
the file-ownership map. A lane edits only the paths in its own row. It never edits a shared file.
If a lane needs a shared change, it stops and reports it (see "Shared changes still open").

Lane codes match the Playwright project names and the folder codes: `cal`, `med` (Medusa), `doc`
(Documenso), `tw` (Twenty).

## Per-lane ownership

| Lane | Folders it owns | Workflow file it owns |
|---|---|---|
| cal (Cal) | `src/lanes/cal/`, `tests/unit/lanes/cal/`, `tests/contracts/cal/`, `tests/integration/cal/`, `tests/webhooks/cal/`, `tests/serial/cal/`, `contracts/cal/`, `tests/fixtures/cal/` | `.github/workflows/p2-cal.yml` |
| med (Medusa) | `src/lanes/med/`, `tests/unit/lanes/med/`, `tests/contracts/med/`, `tests/integration/med/`, `tests/webhooks/med/`, `tests/serial/med/`, `contracts/med/` | `.github/workflows/p2-med.yml` |
| doc (Documenso) | `src/lanes/doc/`, `tests/unit/lanes/doc/`, `tests/contracts/doc/`, `tests/integration/doc/`, `tests/webhooks/doc/`, `tests/serial/doc/`, `tests/billing/doc/`, `contracts/doc/`, `tests/fixtures/doc/` | `.github/workflows/p2-doc.yml` |
| tw (Twenty) | `src/lanes/tw/`, `tests/unit/lanes/tw/`, `tests/contracts/tw/`, `tests/integration/tw/`, `tests/webhooks/tw/`, `tests/serial/tw/` | `.github/workflows/p2-tw.yml`, and `.github/workflows/tw-study.yml` (its study, never a required check) |

The `.gitkeep` files in those folders are placeholders. A lane may delete its own `.gitkeep` when it
adds a real file.

## Shared files (lanes must not edit these)

- CI: `.github/workflows/api.yml`, `tests/unit/ci/workflow.test.ts`
- Playwright and scripts: `playwright.config.ts`, `package.json`, `package-lock.json`, `scripts/`
- Shared runtime: `src/slo.ts`, `src/invariants/`, `src/db/`, `src/contracts/`, `src/webhooks/`,
  `src/run/`, `src/auth/`, `src/clients/`, `src/fixtures/`, `src/env.ts`
- Config and docs: `.env.example`, `.cursor/environment.json`, `.claude/`, `README.md`, `docs/` (except
  the lane's own plan and probe files)
- The harness (`node_modules/qa-portfolio-harness`) and the product forks: never edited by any lane.

## Gate for lane workflows

`needs` cannot cross workflow files, so `needs: foundation` from the plans becomes a `workflow_run`
trigger on `api`. A lane job runs only when the `api` run for the same commit concluded `success` and
its head repository is this repository. It checks out `github.event.workflow_run.head_sha`. Each stub
in `.github/workflows/p2-*.yml` and `tw-study.yml` is manual-only and its job is skipped, so nothing
runs until a lane replaces its stub.

## Shared changes made in this PR

- `qa-portfolio-harness` pinned to `v0.3.1` (`7d4a3ae`).
- `@noble/ciphers` 0.6.0 and `@noble/hashes` 1.8.0 as devDependencies (Documenso job signing; pins
  taken from the fork lock, integrity hashes checked).
- `src/invariants/rules.ts`: the two Cal leak rules (`cal-leak-scheduled-trigger`,
  `cal-leak-booking-active`); the Documenso recipient rule scoped to live envelopes.
- `src/slo.ts`: the Documenso budgets `docWebhookTimeoutChain` and `docCronTick`.
- `src/db/fixture-allowlist.ts`: Cal case `P2-CAL-SCH-003` allowed for the scheduled-trigger purge.
- `src/clients/twenty.ts` and its test: `people.update` (PATCH `/rest/people/{id}`, expects 200).
- `playwright.config.ts`: project `doc-billing-api` (`billing/doc/**`); the check in `api.yml` lists it.
- `scripts/cloud-install.sh`: installs poppler-utils when `pdfsig` or `pdftotext` is missing.
- Inert lane workflow stubs, the empty lane folders, and this page.

No new package.json script is needed: every lane command in the plans uses an existing script
(`npm run db:roles:provision -- <product>`, `node scripts/harness-seed.mjs medusa`,
`npx playwright test --project=<code>-api`). `.env.example` is unchanged: the lane-only variables in
the plans are `up` inputs set by the lane's command, or generated per run in CI, not stored names.
`README.md` and a CHANGELOG are not touched by any plan, so neither changes here.

## Shared changes still open (not in this PR)

A lane must not start these until the owner resolves them:

- Medusa `src/invariants/rules.ts` rules (plan 6.10): the second rule's SQL is not written in the plan
  (`med-order-total-conservation`, "UNPROBED"). The first rule
  (`med-inv-level-reserved-matches-reservations`) has its SQL written, but it is also still open until
  the owner accepts the second.
- Medusa `src/slo.ts` entries (plan 6.11): `medPriceListBoundary`, `medCacheVisibility`,
  `medPoisonParked`. Their basis cites `hooks/payment/[provider]/route.js:21-22`, which is not in the
  pinned fork (`f677db4`) or the installed `@medusajs` packages, so the citation is unverified.
- Documenso `src/invariants/rules.ts` rule `doc-leak-organisation-name` (plan 7): its SQL depends on
  whether `Organisation` has a soft-delete column, which the plan marks UNPROBED.
