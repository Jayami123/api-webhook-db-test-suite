# P2 lane ownership

The four product lanes (cal, med, doc, tw) build in parallel from the shared foundation. This page is
the file-ownership map. A lane edits only the paths in its own row. It never edits a shared file.
If a lane needs a shared change that its row does not cover, it stops and reports it.

Lane codes match the Playwright project names and the folder codes: `cal`, `med` (Medusa), `doc`
(Documenso), `tw` (Twenty).

## Per-lane ownership

| Lane | Folders it owns | Lane-owned shared-index entries | Workflow file it owns |
|---|---|---|---|
| cal (Cal) | `src/lanes/cal/`, `tests/unit/lanes/cal/`, `tests/contracts/cal/`, `tests/integration/cal/`, `tests/webhooks/cal/`, `tests/serial/cal/`, `contracts/cal/`, `tests/fixtures/cal/` | `src/invariants/lanes/cal.ts` | `.github/workflows/p2-cal.yml` |
| med (Medusa) | `src/lanes/med/`, `tests/unit/lanes/med/`, `tests/contracts/med/`, `tests/integration/med/`, `tests/webhooks/med/`, `tests/serial/med/`, `contracts/med/` | `src/invariants/lanes/medusa.ts`, `src/slo/medusa.ts` | `.github/workflows/p2-med.yml` |
| doc (Documenso) | `src/lanes/doc/`, `tests/unit/lanes/doc/`, `tests/contracts/doc/`, `tests/integration/doc/`, `tests/webhooks/doc/`, `tests/serial/doc/`, `tests/billing/doc/`, `contracts/doc/`, `tests/fixtures/doc/` | `src/invariants/lanes/documenso.ts`, `src/slo/documenso.ts` | `.github/workflows/p2-doc.yml` |
| tw (Twenty) | `src/lanes/tw/`, `tests/unit/lanes/tw/`, `tests/contracts/tw/`, `tests/integration/tw/`, `tests/webhooks/tw/`, `tests/serial/tw/` | none (its rules and budgets stay in the foundation index) | `.github/workflows/p2-tw.yml`, and `.github/workflows/tw-study.yml` (its study, never a required check) |

The `.gitkeep` files in those folders are placeholders. A lane may delete its own `.gitkeep` when it
adds a real file.

## How the shared indexes work

- `src/invariants/rules.ts` is the index. It appends each lane's rules from `src/invariants/lanes/<code>.ts`
  to that product's list. Constants the lane files need come from `src/invariants/lane-kit.ts`.
- `src/slo.ts` is the index. It merges each lane's budgets from `src/slo/<code>.ts`.
- A lane edits only its own lane file. It does not edit `rules.ts`, `slo.ts`, or `lane-kit.ts`.

## Shared files (lanes must not edit these)

- CI: `.github/workflows/api.yml`, `tests/unit/ci/workflow.test.ts`
- Playwright and scripts: `playwright.config.ts`, `package.json`, `package-lock.json`, `scripts/`
- Shared runtime: `src/invariants/rules.ts`, `src/invariants/lane-kit.ts`, `src/invariants/engine.ts`,
  `src/slo.ts`, `src/db/`, `src/contracts/`, `src/webhooks/`, `src/run/`, `src/auth/`, `src/clients/`,
  `src/fixtures/`, `src/env.ts`
- Config and docs: `.env.example`, `.cursor/environment.json`, `.claude/`, `README.md`, `docs/` (except
  the lane's own plan and probe files)
- The harness (`node_modules/qa-portfolio-harness`) and the product forks: never edited by any lane.

## Gate for lane workflows

Lane workflows run on `pull_request` (and `workflow_dispatch`), not on `workflow_run`: GitHub runs a
`workflow_run` workflow only from the file on the default branch, so a lane's PR version would never
run. Each job that runs on `pull_request` is guarded by the same-repo check
(`github.event.pull_request.head.repo.full_name == github.repository`), so fork PRs never start a stack
or receive secrets. Lane workflows run alongside `api`; there is no cross-file `needs`. The shape is
enforced by `tests/unit/ci/workflow.test.ts`, which also lists the allowed secret names (currently
`STRIPE_API_KEY`). Inert stubs stay valid until a lane replaces its file.

## Shared changes made in this PR

- `qa-portfolio-harness` pinned to `v0.3.1` (`7d4a3ae`).
- `@noble/ciphers` 0.6.0 and `@noble/hashes` 1.8.0 as devDependencies (Documenso job signing; pins
  taken from the fork lock, integrity hashes checked).
- Invariant index split: `lane-kit.ts` (constants), `lanes/cal.ts` (the two Cal leak rules), and empty
  `lanes/medusa.ts` and `lanes/documenso.ts`. The Documenso recipient rule scoped to live envelopes
  stays in the foundation list.
- SLO index split: `slo/documenso.ts` (`docWebhookTimeoutChain`, `docCronTick`) and an empty
  `slo/medusa.ts`.
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

## Lane-owned work carried over from the plans (not in this PR)

Each item below is the lane's own, to be done in its lane file. Each needs a probe before the rule or
budget is written. None of them is written from the plan text alone.

- **Medusa (`src/invariants/lanes/medusa.ts`, `src/slo/medusa.ts`).**
  1. Probe: find the real payment webhook route at the pinned fork `f677db4`. The plan's citation
     `hooks/payment/[provider]/route.js:21-22` is not in the checkout, and it is not in the installed
     `@medusajs` packages. Record the actual path and lines before citing anything in a budget.
  2. Probe: read the order-total columns (P-MED-8 names) and write the SQL for
     `med-order-total-conservation` from that output. The first Medusa rule
     (`med-inv-level-reserved-matches-reservations`) is in the plan and is also the lane's to add.
  3. Then add the three budgets (`medPriceListBoundary`, `medCacheVisibility`, `medPoisonParked`) with
     citations from step 1.
- **Documenso (`src/invariants/lanes/documenso.ts`, `src/slo/documenso.ts`).**
  1. Probe: check whether `Organisation` has a soft-delete column (`information_schema` on the running
     Documenso database). The plan marks this UNPROBED.
  2. Then write `doc-leak-organisation-name` with `AND "deletedAt" IS NULL` only if the probe shows the
     column exists.
