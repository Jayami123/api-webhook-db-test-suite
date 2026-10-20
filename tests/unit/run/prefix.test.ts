import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  RUN_PREFIX_PATTERN,
  currentRunPrefix,
  ensureRunPrefix,
  escapeLike,
  likePrefixPattern,
  makeRunPrefix,
  runScopedName,
} from "../../../src/run/prefix.ts";

const FIXED = new Date("2026-10-21T09:30:05.123Z");

describe("run prefix", () => {
  test("makeRunPrefix formats UTC time and hex", () => {
    assert.equal(makeRunPrefix(FIXED, "1a2b3c4d"), "p2-qa-20261021t093005z-1a2b3c4d");
  });

  test("makeRunPrefix output matches RUN_PREFIX_PATTERN and has no LIKE wildcards", () => {
    const prefix = makeRunPrefix(FIXED, "00ff00ff");
    assert.match(prefix, RUN_PREFIX_PATTERN);
    assert.equal(escapeLike(prefix), prefix);
  });

  test("makeRunPrefix rejects non-hex or wrong-length random parts", () => {
    for (const bad of ["", "1a2b3c4", "1A2B3C4D", "zzzzzzzz", "1a2b3c4d5"]) {
      assert.throws(() => makeRunPrefix(FIXED, bad), /TEST BUG: randomHex/);
    }
  });

  test("ensureRunPrefix sets P2_RUN_ID once and keeps it", () => {
    const env: NodeJS.ProcessEnv = {};
    const first = ensureRunPrefix(env, FIXED);
    assert.match(first, RUN_PREFIX_PATTERN);
    assert.equal(env["P2_RUN_ID"], first);
    assert.equal(ensureRunPrefix(env, new Date()), first);
  });

  test("ensureRunPrefix rejects a malformed preset", () => {
    assert.throws(() => ensureRunPrefix({ P2_RUN_ID: "p2-qa-%" }), /must match/);
  });

  test("currentRunPrefix throws when the config did not run", () => {
    assert.throws(() => currentRunPrefix({}), /P2_RUN_ID is not set/);
  });

  test("runScopedName appends a safe label", () => {
    const env = { P2_RUN_ID: "p2-qa-20261021t093005z-1a2b3c4d" };
    assert.equal(runScopedName("cart-1", env), "p2-qa-20261021t093005z-1a2b3c4d-cart-1");
    for (const bad of ["", "Cart", "a_b", "a%b", "x".repeat(41)]) {
      assert.throws(() => runScopedName(bad, env), /label must match/);
    }
  });

  test("escapeLike escapes backslash, percent and underscore", () => {
    assert.equal(escapeLike(String.raw`a\b%c_d`), String.raw`a\\b\%c\_d`);
    assert.equal(likePrefixPattern("p2_qa%"), String.raw`p2\_qa\%%`);
  });
});
