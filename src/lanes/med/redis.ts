import {
  composeServiceContainer,
  dockerRunner,
  type DockerRunner,
} from "../../webhooks/docker-net.ts";

// Compose project and service of the harness Redis (probe P-MED-1, 2026-11-02: qa-harness-medusa-redis-1).
const PROJECT = "qa-harness-medusa";
const SERVICE = "redis";
const SAFE_KEY = /^[A-Za-z0-9:*_.-]{1,200}$/;

export function parseRedisScan(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key)) {
    throw new Error(`TEST BUG: unsafe redis key or pattern ${JSON.stringify(key)}`);
  }
}

async function cli(args: readonly string[], run: DockerRunner): Promise<string> {
  const container = await composeServiceContainer(PROJECT, SERVICE, run);
  return run(["exec", container, "redis-cli", ...args]);
}

/** Keys matching a glob. The pattern is validated: no shell, no spaces. SCAN, never KEYS. */
export async function redisKeys(
  pattern: string,
  run: DockerRunner = dockerRunner,
): Promise<string[]> {
  assertSafeKey(pattern);
  return parseRedisScan(await cli(["--scan", "--pattern", pattern], run));
}

/** Members of a sorted set (for example the event bus failed set), in score order. */
export async function redisZrange(
  key: string,
  run: DockerRunner = dockerRunner,
): Promise<string[]> {
  assertSafeKey(key);
  return parseRedisScan(await cli(["zrange", key, "0", "-1"], run));
}

/** One hash field as text; "" when the field is absent. */
export async function redisHget(
  key: string,
  field: string,
  run: DockerRunner = dockerRunner,
): Promise<string> {
  assertSafeKey(key);
  if (!/^[A-Za-z0-9_]{1,40}$/.test(field)) throw new Error(`TEST BUG: unsafe hash field ${field}`);
  return (await cli(["hget", key, field], run)).trim();
}
