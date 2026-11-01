import { scrubSecrets, type SecretString } from "./secret.ts";

/**
 * Minimal HTTP port used by the auth modules. Production uses Node's fetch (outside Playwright, so
 * nothing is recorded in a trace); unit tests pass a fake. Cookies are kept by the caller.
 */
export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly setCookies: readonly string[];
  readonly text: string;
}
export interface HttpRequest {
  readonly method: "GET" | "POST" | "DELETE";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}
export type HttpPort = (request: HttpRequest) => Promise<HttpResponse>;

export const fetchPort: HttpPort = async (request) => {
  const init: RequestInit = {
    method: request.method,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  };
  if (request.headers !== undefined) init.headers = { ...request.headers };
  if (request.body !== undefined) init.body = request.body;
  const response = await fetch(request.url, init);
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    setCookies: response.headers.getSetCookie(),
    text: await response.text(),
  };
};

export class AuthError extends Error {
  override readonly name = "AuthError";
  readonly status: number | undefined;
  constructor(step: string, status: number | undefined, detail = "") {
    super(
      scrubSecrets(
        `TEST BUG: auth step "${step}" failed${status === undefined ? "" : ` (HTTP ${String(status)})`}${detail === "" ? "" : `: ${detail.slice(0, 160)}`}`,
      ),
    );
    this.status = status;
  }
}

export function parseJson(step: string, response: HttpResponse): unknown {
  try {
    return JSON.parse(response.text);
  } catch {
    throw new AuthError(step, response.status, "response is not JSON");
  }
}

/** Simple in-memory cookie jar for the session-based products (Documenso, Cal). */
export class CookieJar {
  readonly #cookies = new Map<string, string>();
  absorb(setCookies: readonly string[]): void {
    for (const line of setCookies) {
      const pair = line.split(";")[0] ?? "";
      const index = pair.indexOf("=");
      if (index > 0) this.#cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }
  header(): string {
    return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
  has(name: string): boolean {
    return this.#cookies.has(name);
  }
}

export interface Revocable {
  /** Idempotent. Throws AuthError if the product refuses. */
  revoke(): Promise<void>;
}

/** What a minted credential looks like to a client: one header, kept secret. */
export interface MintedAuth extends Revocable {
  readonly product: "cal" | "documenso" | "medusa" | "twenty";
  readonly headerName: string;
  readonly headerValue: SecretString;
  /** Name carrying the run prefix, for the leak check. */
  readonly label: string;
}
