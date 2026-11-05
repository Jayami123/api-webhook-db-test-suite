import { expect } from "../../../src/fixtures/index.ts";
import { quietState } from "../../../src/lanes/doc/quiet.ts";
import { POLL_INTERVALS } from "../../../src/slo.ts";

/**
 * A6: after the expected count is reached, hold a quiet window and fail if anything extra arrives.
 * Call it after the poll that reached `expected`. The window is measured from this call, so any arrival
 * before it is already in the count: an arrival during the window turns the state to "over" at once.
 */
export async function holdQuiet(
  read: () => number | Promise<number>,
  expected: number,
  windowMs: number,
  message: string,
): Promise<void> {
  const startedMs = Date.now();
  await expect
    .poll(async () => quietState(await read(), expected, startedMs, Date.now(), windowMs), {
      timeout: windowMs + 5_000,
      intervals: POLL_INTERVALS,
      message,
    })
    .toBe("settled");
}
