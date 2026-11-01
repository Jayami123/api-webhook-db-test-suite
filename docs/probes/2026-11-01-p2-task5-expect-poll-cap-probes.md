# P2 Task 5 probe: expect.poll and the configured expect timeout (2026-11-01)

Written after the probe, from the recorded output. Playwright 1.64.0. `playwright.config.ts` sets
`expect: { timeout: 10_000 }`. One throwaway spec (not committed) ran with an explicit poll timeout above it.

## Question

Does `expect.poll(fn, { timeout: T })` honour an explicit `T` larger than the configured `expect.timeout`?

## Probe

```text
expect.poll(() => elapsed >= 60_000, { timeout: 10_500 }).toBe(true)
  -> timed out after 9886 ms
config: expect.timeout 10_000
```

## Consequence for the plan

Playwright caps the poll at the configured `expect.timeout` (10 s here). The plan's named SLO budgets above 10 s are
therefore not in effect: Documenso 20 s, Twenty 35 s (`twWebhookDelivery`), Medusa 25 s. The Twenty canary
precondition needs a wait longer than the 10 s memo window; it races the cap, and the probe above is the mechanism of
the intermittent failure. Observed on the Twenty readiness spec, 2026-11-01: 3 of 10 spec runs failed at the first
canary wait (`canary: memo window elapsed or canary delivered`), 7 passed. In the failing runs the canary was dropped
by the memo (no delivery in the receiver log) and the poll gave up at `elapsed` 9966 ms.

Raising `expect.timeout` or a test timeout would fix it, but the rules for this build forbid raising timeouts, so
this is recorded as a STOP for the owner's decision. Status: CONFIRMED by the probe above; the owner decides the fix.
