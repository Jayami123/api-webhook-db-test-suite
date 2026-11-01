import { inspect } from "node:util";

/**
 * A credential held in memory. It prints as "<redacted:N>" through String(), template strings,
 * JSON.stringify, console.log and util.inspect, so a stray log line cannot leak it. The only way to
 * the value is reveal(), which the HTTP layer calls when it builds a header.
 */
export class SecretString {
  readonly #value: string;
  constructor(value: string) {
    if (value === "") throw new Error("TEST BUG: a secret must not be empty");
    this.#value = value;
    knownSecrets.add(value);
  }
  reveal(): string {
    return this.#value;
  }
  get length(): number {
    return this.#value.length;
  }
  toString(): string {
    return `<redacted:${String(this.#value.length)}>`;
  }
  toJSON(): string {
    return this.toString();
  }
  [inspect.custom](): string {
    return this.toString();
  }
}

const knownSecrets = new Set<string>();

/** Replaces every secret ever wrapped in a SecretString (and anything passed to addSecret). */
export function scrubSecrets(text: string): string {
  let out = text;
  for (const secret of knownSecrets) {
    if (secret.length >= 6) out = out.split(secret).join("<redacted>");
  }
  return out;
}

/** For values that are secret but arrive as plain strings, e.g. a password read from env. */
export function addSecret(value: string | undefined): void {
  if (value !== undefined && value.length >= 6) knownSecrets.add(value);
}

/** Test hook: forget everything. Only tests call this. */
export function clearSecretsForTests(): void {
  knownSecrets.clear();
}
