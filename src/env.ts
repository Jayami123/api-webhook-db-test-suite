import { isIP } from "node:net";
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

/** An explicit IP literal. Wildcards would expose the receiver beyond this machine, so they are refused. */
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "[::]"]);
const bindHostList = z
  .string()
  .trim()
  .transform((raw) =>
    raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== ""),
  )
  .pipe(
    z
      .array(
        z.string().refine((host) => isIP(host) !== 0 && !WILDCARD_HOSTS.has(host), {
          message:
            "must be explicit IP literals (no 0.0.0.0 or ::); wildcards expose the receiver beyond this machine",
        }),
      )
      .min(1),
  );

// Defaults are the harness's public local defaults (qa-portfolio-harness v0.3.0 src/config.ts),
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
  P2_RECEIVER_HOSTS: z.preprocess(blankToUndefined, bindHostList.default(["127.0.0.1"])),
  P2_RECEIVER_PORT: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1024).max(65535).default(4317),
  ),
  // Passwords of the two roles scripts/db-roles.ts creates. Optional here: only code that connects as
  // a role needs them, and it checks the shape (src/db/roles.ts assertPassword) without echoing it.
  P2_QA_RO_PASSWORD: z.preprocess(blankToUndefined, z.string().trim().optional()),
  P2_QA_FIXTURE_PASSWORD: z.preprocess(blankToUndefined, z.string().trim().optional()),
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

/** Where the webhook receiver binds (src/webhooks/receiver.ts). Loopback unless the caller adds more. */
export function receiverConfig(env: NodeJS.ProcessEnv = process.env): {
  readonly hosts: readonly string[];
  readonly port: number;
} {
  const parsed = loadEnv(env);
  return { hosts: parsed.P2_RECEIVER_HOSTS, port: parsed.P2_RECEIVER_PORT };
}

export type DbRole = "qa_ro" | "qa_fixture";

/**
 * Connection string for a P2 role: the product's host, port and database with the role's name and
 * password. `dbUrl()` (the harness owner) is for scripts/db-roles.ts and tests/db only; ESLint
 * forbids importing it anywhere else. Errors never contain a URL or a password.
 */
export function roleDbUrl(
  product: ProductId,
  role: DbRole,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const parsed = loadEnv(env);
  const variable = role === "qa_ro" ? "P2_QA_RO_PASSWORD" : "P2_QA_FIXTURE_PASSWORD";
  const password = role === "qa_ro" ? parsed.P2_QA_RO_PASSWORD : parsed.P2_QA_FIXTURE_PASSWORD;
  if (password === undefined || !/^[A-Za-z0-9_-]{16,128}$/.test(password)) {
    throw new Error(
      `TEST BUG: ${variable} is missing or malformed (run npm run db:roles:provision)`,
    );
  }
  const url = new URL(dbUrl(product, env));
  url.username = role;
  url.password = password;
  return url.toString();
}
