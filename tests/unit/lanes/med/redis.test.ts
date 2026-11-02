import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseRedisScan, redisKeys } from "../../../../src/lanes/med/redis.ts";

describe("harness redis reader (medusa lane)", () => {
  test("parseRedisScan splits redis-cli output and drops blank lines", () => {
    assert.deepEqual(parseRedisScan("mc:a\n\n  mc:b  \nmc:c\n"), ["mc:a", "mc:b", "mc:c"]);
    assert.deepEqual(parseRedisScan(""), []);
  });

  test("redisKeys rejects an unsafe pattern and runs redis-cli through the container (fake runner)", async () => {
    await assert.rejects(redisKeys("mc:*; FLUSHALL"), /TEST BUG: unsafe redis key or pattern/);
    await assert.rejects(redisKeys("a b"), /TEST BUG/);
    const calls: string[][] = [];
    const fake = (args: readonly string[]): Promise<string> => {
      calls.push([...args]);
      return Promise.resolve(args[0] === "ps" ? "cid123\n" : "mc:one\nmc:two\n");
    };
    const keys = await redisKeys("mc:*", fake);
    assert.deepEqual(keys, ["mc:one", "mc:two"]);
    assert.deepEqual(calls[1], ["exec", "cid123", "redis-cli", "--scan", "--pattern", "mc:*"]);
    assert.ok(calls[0]?.includes("label=com.docker.compose.project=qa-harness-medusa"));
  });
});
