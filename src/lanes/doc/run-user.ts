/**
 * The email of the worker-scoped billing run user (tests/fixtures/doc/stripe-run.ts). It starts with the run prefix,
 * so the documenso leak rule (doc-leak-user-email, `email LIKE <prefix>%`) would match it while it is alive. The
 * fixture therefore keeps it in the sweep's retained registry for the worker's life and releases it after teardown.
 */
export const RUN_USER_EMAIL_DOMAIN = "example.test";

export function runUserEmail(runId: string): string {
  if (!/^p2-qa-\d{8}t\d{6}z-[0-9a-f]{8}$/.test(runId)) {
    throw new Error("TEST BUG: runUserEmail needs a run prefix");
  }
  return `${runId}-str@${RUN_USER_EMAIL_DOMAIN}`;
}
