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
