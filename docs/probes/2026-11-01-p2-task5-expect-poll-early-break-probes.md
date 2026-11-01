# P2 Task 5 probe: where expect.poll gives up (2026-11-01, supersedes the cap reading)

Playwright 1.64.0 (`@playwright/test` and `playwright-core` in `node_modules`), Node 22.23.3. This record corrects
`docs/probes/2026-11-01-p2-task5-expect-poll-cap-probes.md`: the earlier file read the 10 s figure as a cap at
`expect.timeout`. It is not. The explicit `timeout` is honoured; the loop gives up up to one poll step early.

## Code path (file:line in node_modules)

- `node_modules/playwright/lib/matchers/expect.js:13267-13269`: `expect.poll(actual, options)` passes
  `poll.timeout` into the matcher info. The explicit value is not dropped.
- `expect.js:13392`: `timeout = poll.timeout ?? info.timeout ?? expectConfig().timeout ?? 5000`. The explicit
  value wins over `expect.timeout`.
- `expect.js:13017-13029` (`deadlineForMatcher`): deadline = min(matcher deadline, test deadline - 250 ms). The
  test deadline comes from the test timeout (`playwright.config.ts` `timeout: 60_000`), not from a request timeout.
- `playwright-core/lib/coreBundle.js:4754-4769` (`pollAgainstDeadline`): the loop breaks when
  `deadline <= monotonicTime() + interval` (line 4769) with `interval` the next step. The default last step is
  1000 ms (line 4755). So the loop gives up up to one step before the deadline, without a final check at it.

## Measurements (throwaway specs, not committed)

```text
default steps (100, 250, 500, 1000 ...), expect.timeout 10 s:
  explicit 5000  -> timed out after 4864 ms
  explicit 10500 -> timed out after 9899 ms   (the 9.9 s of the Twenty failures)
  explicit 20000 -> timed out after 19918 ms
steps [100], expect.timeout 10 s, test timeout 60 s:
  explicit 10500 -> timed out after 10413 ms
  explicit 35000 -> timed out after 34978 ms
  explicit 20000 -> timed out after 19930 ms
```

## Conclusion (CONFIRMED by the measurements above)

- The explicit per-call budget is honoured. The loss is up to one poll step (1000 ms by default), not a cap.
- The neighbour of the test timeout is not involved (the test budget is 60 s and the waits are shorter).
- Fix used: `intervals: [100]` on every readiness `expect.poll` (`src/slo.ts` `POLL_INTERVALS`). The loss falls to
  100 ms per wait. Each wait then ends at its plan budget.
- `expect.timeout` and the test timeout are unchanged. No timeout was raised.
