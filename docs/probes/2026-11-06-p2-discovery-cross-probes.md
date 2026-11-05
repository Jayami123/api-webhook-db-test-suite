# P2 discovery cross-product gap pass (charter Task 5) — 2026-11-06

Times: Asia/Colombo (UTC+05:30). Branch `feat/2026-11-05-p2-discovery-probes`. Inputs: only the CONFIRMED evidence from the product records in this session (`2026-11-05-p2-cal-fresh-volume-probes.md`, `2026-11-05-p2-doc-probes.md`, `2026-11-06-p2-med-race-probes.md`, `2026-11-06-p2-tw-probes.md`) and the code/spec reads they cite. No new stacks were started for this task.

Scope limit (stated up front): the cross-product categories in the brief (replay, duplicate, out-of-order, signature tamper, boundary and malformed payloads, error-code shape, partial failure, cross-tenant DB end state) were **not swept** in this session beyond the cases listed below. Existing cases already cover several of them (see the coverage table). A full sweep is a follow-up.

## Gap candidates

| ID or label | Category | Evidence | Verdict | Note |
|---|---|---|---|---|
| Medusa webhook ‖ cart completion, same-instant overlap | race / out-of-order | `tests/webhooks/med/race-completion.spec.ts:42` (WH-008, completion before the 5 s delayed webhook, 20 runs, all pass) and `:86` (WH-008b, webhook first, then completion, pass). Both are sequential orderings. No case asserts the two overlapping. Med probe run 4. | **CONFIRMED-GAP** (coverage) | Proposed `P2-MED-WH-009` (section 6 of the charter update). Oracle: one order, one payment, one capture after the overlap. The overlap trigger is not yet deterministic (P-MED-4 remains open). |
| Medusa parallel duplicate deliveries | duplicate | `tests/webhooks/med/parallel-duplicates.spec.ts` exists on `main`; not run this session. | NOT ATTEMPTED | Existing case; run in the next Medusa session. |
| Medusa payment route answers 200 before signature verification | signature / error-code shape | Code read: `dist/api/hooks/payment/[provider]/route.js:17-29` (emit with `delay: 5000`, then `res.sendStatus(200)`; no check in the route). | **PRODUCT DEFECT (P5, design)** | Not a P2 case. Draft note only (no upstream filing). |
| Twenty route trigger needs `LOGIC_FUNCTION_TYPE` | partial failure / config | Fork `logic-function-driver.factory.ts:37,47`; `disabled.driver.ts:23`; harness passthrough lacks the name. | **CONFIRMED-GAP (harness)** | Harness v0.3.2 request. Not a P2 case. |
| Twenty multi-workspace delivery isolation (events reach only their workspace) | cross-tenant end state | `tests/webhooks/tw/tenant.spec.ts:55` passes with `TWENTY_BASE_URL=http://localhost:3002`. | COVERED | The default `127.0.0.1` base fails the token exchange (`Workspace not found`). Configuration gap for the CI job (the base URL must be `localhost`); recorded in the Twenty probe record. |
| Cal retry after a receiver 500 (positive control plus B2 marker) | error-code / partial failure | `tests/webhooks/cal/cal-wh.spec.ts:327` (control, pass), `:352` (B2 `test.fail`, expected failure). | COVERED | Product behaviour (500 acknowledged, not retried) is asserted as an expected failure. Delivery count not captured this run (see Cal record). |
| Documenso token exposure in webhook payloads | cross-tenant / signature-adjacent | `tests/webhooks/doc/payload.spec.ts:22` (WH-005, `test.fail(P5-DOC-TOK-002)`, expected failure in run 1). | COVERED (expected failure) | P5 owns the security verdict. Upstream draft only. |
| Documenso conversion outage answers 400 instead of 503 | error-code shape | `tests/serial/doc/conversion.spec.ts:64` (`test.fail(P5_CONV_001)`, expected failure in run 2). | COVERED (expected failure) | P5 owns the status-code decision. |
| Documenso CONV-003 recovery after Gotenberg restart | partial failure / recovery | `tests/serial/doc/conversion.spec.ts:92` passes live (run 2, 30.8 s). | COVERED | |
| `P2-X-WH-001`, `P2-X-ERR-001` | cross-product | `P2-X-WH-001` referenced in 3 places, `P2-X-ERR-001` in 1. Evidence in this pass does not contradict either case. | **Not touched** | Charter rule: change only when evidence supports it. None did. |

## Cross-tenant DB end state

P2 owns the DB end-state evidence; P5 owns the verdict. The Twenty multi-workspace run (above) shows delivery isolation end to end (receiver only). The Documenso token exposure (WH-005) is a P5 security finding with a `test.fail` marker; no new DB end-state evidence was taken.

## What this pass did not do

* No replay or out-of-order probe was run beyond the Medusa sequential orderings.
* No signature-tamper probe was run this session (the existing WH-006 and signature specs are the coverage).
* No malformed-payload or boundary probe was run this session.
* No partial-failure probe was run outside the Cal retry and Documenso conversion cases.

These are the follow-up items for a second pass; none is a finding.

## Stack state

No stack was started for this task. All earlier stacks are confirmed down (`docker ps -a` count of `qa-harness-*` containers = 0 after the last run).
