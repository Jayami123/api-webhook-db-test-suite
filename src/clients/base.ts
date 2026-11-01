import type { SecretString } from "../auth/secret.ts";
import { scrubSecrets } from "../auth/secret.ts";

/**
 * Structural subset of Playwright's APIRequestContext / APIResponse, so clients are unit-testable
 * with a fake and a real APIRequestContext still satisfies it (checked by the compiler in
 * tests/unit/clients/clients.test.ts).
 */
export interface ApiResponseLike {
  status(): number;
  headers(): Record<string, string>;
  text(): Promise<string>;
}
export interface ApiRequestLike {
  fetch(
    url: string,
    options?: {
      method?: string;
      headers?: Record<string, string>;
      data?: string | Buffer;
      multipart?: Record<string, string | { name: string; mimeType: string; buffer: Buffer }>;
      maxRedirects?: number;
      failOnStatusCode?: boolean;
      timeout?: number;
    },
  ): Promise<ApiResponseLike>;
}

/** Added to every request so a stray row in a product log or webhook can be tied to a run. */
export const RUN_ID_HEADER = "x-p2-run-id";

export class ApiError extends Error {
  override readonly name = "ApiError";
  readonly status: number;
  constructor(method: string, path: string, status: number, body: string) {
    super(scrubSecrets(`${method} ${path} -> HTTP ${String(status)}: ${body.slice(0, 200)}`));
    this.status = status;
  }
}

export interface CallOptions {
  readonly body?: unknown;
  readonly rawBody?: string | Buffer;
  readonly headers?: Record<string, string>;
  readonly multipart?: NonNullable<Parameters<ApiRequestLike["fetch"]>[1]>["multipart"];
  /** Statuses that are not an error. Default [200, 201]. */
  readonly expect?: readonly number[];
}
export interface CallResult<T> {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly text: string;
  readonly body: T;
}

export type Caller = <T = unknown>(
  method: string,
  path: string,
  options?: CallOptions,
) => Promise<CallResult<T>>;

export function createCaller(input: {
  request: ApiRequestLike;
  baseUrl: string;
  runPrefix: string;
  auth?: { headerName: string; headerValue: SecretString };
  extraHeaders?: () => Record<string, string>;
}): Caller {
  return async <T>(
    method: string,
    path: string,
    options: CallOptions = {},
  ): Promise<CallResult<T>> => {
    const headers: Record<string, string> = {
      accept: "application/json",
      [RUN_ID_HEADER]: input.runPrefix,
      ...(input.auth ? { [input.auth.headerName]: input.auth.headerValue.reveal() } : {}),
      ...input.extraHeaders?.(),
      ...options.headers,
    };
    const fetchOptions: NonNullable<Parameters<ApiRequestLike["fetch"]>[1]> = {
      method,
      headers,
      maxRedirects: 0,
      failOnStatusCode: false,
    };
    if (options.body !== undefined) {
      headers["content-type"] ??= "application/json";
      fetchOptions.data = JSON.stringify(options.body);
    }
    if (options.rawBody !== undefined) fetchOptions.data = options.rawBody;
    if (options.multipart !== undefined) fetchOptions.multipart = options.multipart;
    const response = await input.request.fetch(`${input.baseUrl}${path}`, fetchOptions);
    const text = await response.text();
    const status = response.status();
    if (!(options.expect ?? [200, 201]).includes(status))
      throw new ApiError(method, path, status, text);
    let body: unknown;
    try {
      body = text === "" ? undefined : JSON.parse(text);
    } catch {
      body = text;
    }
    return { status, headers: response.headers(), text, body: body as T };
  };
}
