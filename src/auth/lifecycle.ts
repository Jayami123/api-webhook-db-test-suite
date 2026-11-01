import type { MintedAuth } from "./http.ts";

export type AcceptanceProbe = () => Promise<boolean>;

/**
 * Teardown of a minted credential: revoke it, then PROVE the product no longer accepts it (the
 * leak check of plan Task 4). A credential that still works after revoke is a leak and fails the
 * run even if every test passed.
 */
export async function revokeAndVerify(
  auth: MintedAuth,
  stillAccepted: AcceptanceProbe,
): Promise<void> {
  await auth.revoke();
  if (await stillAccepted()) {
    throw new Error(
      `TEST BUG: ${auth.product} credential "${auth.label}" is still accepted after revoke (token leak)`,
    );
  }
}
