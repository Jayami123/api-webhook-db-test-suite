import { randomBytes } from "node:crypto";

/** Every entity a P2 run creates starts with this. Lowercase: some products lowercase emails and slugs. */
export const RUN_PREFIX_PATTERN = /^p2-qa-\d{8}t\d{6}z-[0-9a-f]{8}$/;
export const RUN_ID_ENV = "P2_RUN_ID";

/** `p2-qa-<yyyymmddThhmmssZ>-<8 hex>`, e.g. `p2-qa-20261021t093000z-1a2b3c4d`. Pure: inputs are injected. */
export function makeRunPrefix(now: Date, randomHex: string): string {
  if (!/^[0-9a-f]{8}$/.test(randomHex)) {
    throw new Error(
      `TEST BUG: randomHex must be 8 lowercase hex chars, got ${JSON.stringify(randomHex)}`,
    );
  }
  const utc = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "z")
    .toLowerCase();
  return `p2-qa-${utc}-${randomHex}`;
}

/**
 * Called once from playwright.config.ts. The runner process sets P2_RUN_ID and every worker
 * inherits it, so all workers share one prefix. A preset value (CI) must match the pattern.
 */
export function ensureRunPrefix(env: NodeJS.ProcessEnv = process.env, now = new Date()): string {
  const preset = env[RUN_ID_ENV]?.trim();
  if (preset) {
    if (!RUN_PREFIX_PATTERN.test(preset)) {
      throw new Error(
        `TEST BUG: ${RUN_ID_ENV} must match ${String(RUN_PREFIX_PATTERN)}, got ${JSON.stringify(preset)}`,
      );
    }
    return preset;
  }
  const prefix = makeRunPrefix(now, randomBytes(4).toString("hex"));
  env[RUN_ID_ENV] = prefix;
  return prefix;
}

/** Read inside tests and fixtures. Throws if the config did not run (no silent fallback). */
export function currentRunPrefix(env: NodeJS.ProcessEnv = process.env): string {
  const value = env[RUN_ID_ENV]?.trim();
  if (!value || !RUN_PREFIX_PATTERN.test(value)) {
    throw new Error(`TEST BUG: ${RUN_ID_ENV} is not set; run through playwright.config.ts`);
  }
  return value;
}

/** Name for one entity: `<prefix>-<label>`. Label: lowercase letters, digits, dashes. */
export function runScopedName(label: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!/^[a-z0-9-]{1,40}$/.test(label)) {
    throw new Error(`TEST BUG: label must match [a-z0-9-]{1,40}, got ${JSON.stringify(label)}`);
  }
  return `${currentRunPrefix(env)}-${label}`;
}

/** Escape `\`, `%` and `_` for a LIKE pattern used with `ESCAPE '\'`. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** `LIKE $1 ESCAPE '\'` parameter that matches everything starting with `prefix`. */
export function likePrefixPattern(prefix: string): string {
  return `${escapeLike(prefix)}%`;
}
