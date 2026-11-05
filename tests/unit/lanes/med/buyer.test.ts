import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { buyerEmail } from "../../../../src/lanes/med/buyer.ts";
import { RUN_ID_ENV } from "../../../../src/run/prefix.ts";

const PREFIX = "p2-qa-20261102t000000z-deadbeef";

describe("buyer identity (medusa lane)", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env[RUN_ID_ENV];
    process.env[RUN_ID_ENV] = PREFIX;
  });
  afterEach(() => {
    if (saved === undefined) Reflect.deleteProperty(process.env, RUN_ID_ENV);
    else process.env[RUN_ID_ENV] = saved;
  });

  test("buyerEmail starts with the run prefix so the customer leak rule can see it", () => {
    assert.equal(buyerEmail("wh001"), `${PREFIX}-wh001@example.test`);
    assert.ok(buyerEmail("wh001").startsWith(PREFIX));
  });
});
