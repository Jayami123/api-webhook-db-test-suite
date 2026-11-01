# P2 Task 5 probe: worker-start reaper, live (2026-11-01)

Plan Task 5 step 5b (Task 4 section 6.2b). Each product stack was started, one credential per product was minted under
a run prefix 9 hours old (`p2-qa-20261101t000000z-deadbeef-leftover`) and left in place, then the readiness spec ran
with the worker-start reaper (`src/auth/reaper-run.ts`, called from `src/fixtures/auth.ts` before each worker's first
mint). Live leftover counts come from a read-only query on the same tables the leak rules read (`qa_ro`).

## Results

| Product | Leftovers before the spec | Revoked by the worker-start reaper | After spec run 1 | After spec run 2 | Spec |
|---|---|---|---|---|---|
| Cal | 1 (`ApiKey`) | 1 | 0 | 0 | 6/6, 6/6 |
| Documenso | 1 (`ApiToken`) | 1 | 0 | 0 | 5/5, 5/5 |
| Medusa | 2 (`api_key`, secret and publishable) | 2 | 0 | 0 | 5/5, 5/5 |
| Twenty | 1 (`core.apiKey`, unrevoked) | 1 | 0 | 0 | 5/5 on each of 10 runs |

Teardown and `down` exited 0 for every product.

## Deviation from the plan (recorded)

Plan step 5b asks to probe each product's list call once (U16). The list here is the read-only oracle, not a product
endpoint: the same rows the P2-X-DB-001 leak rules read, selected by the run-prefix name. Reason: one source of truth
for "what is left", readable as `qa_ro`, and no product list-shape to guess. Revoke is still done through each
product's own API as the seeded account (`src/auth/reaper-revoke.ts`), and the live proof above shows those calls
succeed on all four products.

## Status

CONFIRMED on the four live stacks above. Unit tests: `tests/unit/auth/reaper-revoke.test.ts` (5 tests, fake HTTP).
