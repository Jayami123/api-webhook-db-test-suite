import * as z from "zod";

export type ProductId = "cal" | "documenso" | "medusa" | "twenty";
export const PRODUCT_IDS: readonly ProductId[] = ["cal", "documenso", "medusa", "twenty"];

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const blankToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const loopbackUrl = z
  .url({ protocol: /^https?$/ })
  .refine((raw) => LOOPBACK_HOSTS.has(new URL(raw).hostname), {
    message: "must point at 127.0.0.1, localhost or [::1] (P2 never calls remote hosts)",
  });
/** A malformed URL is a failed validation, not a TypeError (and its text is never echoed). */
function isLoopbackPgUrl(raw: string): boolean {
  if (!/^postgres(ql)?:\/\//.test(raw)) return false;
  try {
    return LOOPBACK_HOSTS.has(new URL(raw).hostname);
  } catch {
    return false;
  }
}
const loopbackPgUrl = z.string().trim().refine(isLoopbackPgUrl, {
  message: "must be a postgres:// URL on 127.0.0.1, localhost or [::1]",
});

// Defaults are the harness's public local defaults (qa-portfolio-harness v0.2.11 src/config.ts),
// with localhost rewritten to 127.0.0.1. They are not secrets. Never log a URL taken from env.
const schema = z.object({
  CAL_BASE_URL: z.preprocess(blankToUndefined, loopbackUrl.default("http://127.0.0.1:3000")),
  CAL_API_BASE_URL: z.preprocess(blankToUndefined, loopbackUrl.default("http://127.0.0.1:5555")),
  DOCUMENSO_BASE_URL: z.preprocess(blankToUndefined, loopbackUrl.default("http://127.0.0.1:3001")),
  MEDUSA_BASE_URL: z.preprocess(blankToUndefined, loopbackUrl.default("http://127.0.0.1:9000")),
  TWENTY_BASE_URL: z.preprocess(blankToUndefined, loopbackUrl.default("http://127.0.0.1:3002")),
  CAL_DB_URL: z.preprocess(
    blankToUndefined,
    loopbackPgUrl.default("postgresql://postgres:@127.0.0.1:5450/calendso"),
  ),
  DOCUMENSO_DB_URL: z.preprocess(
    blankToUndefined,
    loopbackPgUrl.default("postgres://documenso:password@127.0.0.1:5451/documenso"),
  ),
  MEDUSA_DB_URL: z.preprocess(
    blankToUndefined,
    loopbackPgUrl.default("postgres://medusa:medusa@127.0.0.1:5433/medusa"),
  ),
  TWENTY_DB_URL: z.preprocess(
    blankToUndefined,
    loopbackPgUrl.default("postgres://postgres:postgres@127.0.0.1:5434/default"),
  ),
  P2_DB_STATEMENT_TIMEOUT_MS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(100).max(600_000).default(5_000),
  ),
});

export type P2Env = z.infer<typeof schema>;

/** Parse and validate once per call. Error lists variable names only, never values. */
export function loadEnv(env: NodeJS.ProcessEnv = process.env): P2Env {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`TEST BUG: invalid P2 environment\n  ${names.join("\n  ")}`);
  }
  return parsed.data;
}

const BASE_URL_KEY = {
  cal: "CAL_API_BASE_URL",
  documenso: "DOCUMENSO_BASE_URL",
  medusa: "MEDUSA_BASE_URL",
  twenty: "TWENTY_BASE_URL",
} as const satisfies Record<ProductId, keyof P2Env>;
const DB_URL_KEY = {
  cal: "CAL_DB_URL",
  documenso: "DOCUMENSO_DB_URL",
  medusa: "MEDUSA_DB_URL",
  twenty: "TWENTY_DB_URL",
} as const satisfies Record<ProductId, keyof P2Env>;

/** API base URL without a trailing slash. Cal's is API v2 (5555), not the web app. */
export function apiBaseUrl(product: ProductId, env: NodeJS.ProcessEnv = process.env): string {
  return loadEnv(env)[BASE_URL_KEY[product]].replace(/\/$/, "");
}

export function dbUrl(product: ProductId, env: NodeJS.ProcessEnv = process.env): string {
  return loadEnv(env)[DB_URL_KEY[product]];
}

export function dbStatementTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return loadEnv(env).P2_DB_STATEMENT_TIMEOUT_MS;
}
