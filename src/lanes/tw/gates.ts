export interface Gate {
  readonly skip: boolean;
  /** Printed by test.skip; never a silent pass. */
  readonly reason: string;
}

/** A live row is skipped with its blocker named, not passed. */
export function liveGate(name: string, ready: boolean, blockedBy: string): Gate {
  return ready
    ? { skip: false, reason: "" }
    : { skip: true, reason: `${name} blocked: ${blockedBy}` };
}

/** Stripe rows run live only when the test-mode key is set (repo rule 11). */
export function stripeKeyPresent(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env["STRIPE_API_KEY"] ?? "").trim() !== "";
}

/**
 * A job flag a live case needs (review addendum A7). Locally a missing or different value skips the case with the reason
 * named. In CI (`CI` set) the same condition throws, so a job without its flag fails instead of passing with nothing run.
 * The message names the variable and the required value, never the value that was set.
 */
export function requireTwEnv(
  name: string,
  expected: string,
  env: NodeJS.ProcessEnv = process.env,
): Gate {
  if ((env[name] ?? "").trim() === expected) return { skip: false, reason: "" };
  const message = `${name} must be "${expected}" for this case (missing or different in this job)`;
  if ((env["CI"] ?? "") !== "") throw new Error(`CI: ${message}`);
  return { skip: true, reason: message };
}
