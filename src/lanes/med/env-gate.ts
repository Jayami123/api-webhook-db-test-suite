/**
 * One required variable of the medusa lane, checked the same way everywhere. Locally a missing or wrong value
 * skips the rows that need it, with the reason printed. In CI (CI is set on every GitHub Actions run) the same
 * condition THROWS: the file errors instead of passing with nothing run (review R9). The value is never printed.
 */
export interface GateOptions {
  /** True when the value is acceptable. */
  readonly isValid: (value: string) => boolean;
  /** What an acceptable value is, for the message (no value is ever included). */
  readonly expectText: string;
  /** Why the rows need the value. */
  readonly reason: string;
}

export type Gate = { readonly ready: true } | { readonly ready: false; readonly reason: string };

export function laneEnvGate(
  name: string,
  options: GateOptions,
  env: NodeJS.ProcessEnv = process.env,
): Gate {
  const value = env[name];
  const present = value !== undefined && value.trim() !== "";
  if (present && options.isValid(value)) return { ready: true };
  const problem = present ? `is set but is not ${options.expectText}` : "is not set";
  if (env["CI"]) {
    throw new Error(
      `${name} ${problem} in CI: ${options.reason}. The lane does not skip in CI; fix the variable and re-run.`,
    );
  }
  return { ready: false, reason: `${name} ${problem} locally: ${options.reason}` };
}

/** A Stripe test-mode secret key (the account is test mode; live keys are never used here). */
export const isStripeTestKey = (value: string): boolean => value.startsWith("sk_test_");
