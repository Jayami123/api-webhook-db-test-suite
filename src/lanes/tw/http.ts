import type { TwentyAuth } from "../../auth/twenty.ts";

/**
 * Request headers for one minted API key. The value is revealed only here, in memory, at the moment of the request:
 * it is never logged, written to a file or put in a test title.
 */
export function twAuthHeaders(
  auth: Pick<TwentyAuth, "headerName" | "headerValue">,
): Record<string, string> {
  return { [auth.headerName]: auth.headerValue.reveal() };
}
