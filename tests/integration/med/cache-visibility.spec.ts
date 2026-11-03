import { test, expect } from "../../../src/fixtures/index.ts";
import { laneEnvGate } from "../../../src/lanes/med/env-gate.ts";
import { laneOf } from "../../../src/lanes/med/lane-client.ts";
import { redisKeys } from "../../../src/lanes/med/redis.ts";
import { runScopedName } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";

// The core cache is on only with the exact string "true" (medusa-env.ts:184-186; F4). With the flag
// off the product does not cache and this case has nothing to observe.
// Evaluated when the tests start, never at collection: `playwright test --list` must not throw.
test.beforeAll(() => {
  const cacheGate = laneEnvGate("MEDUSA_FF_CACHING", {
    isValid: (value) => value === "true",
    expectText: 'the string "true"',
    reason: "the core cache is off without it (medusa-env.ts:184-186, F4)",
  });
  test.skip(!cacheGate.ready, cacheGate.ready ? "" : cacheGate.reason);
});

test.describe("medusa product cache", () => {
  test("P2-MED-CACHE-001 an admin price change is visible on the next store read while the cache is on", async ({
    request,
    medAuth,
  }) => {
    const label = "cache001";
    const lane = laneOf({ request, medAuth });
    try {
      const region = await lane.regionFor("usd");
      const product = await lane.productWithPrice(label, "usd", 10);
      expect(await lane.productPrice(product.id, region.id)).toBe(10);
      // Positive control: the warm read wrote cache keys. Without it a cache that never fills would pass.
      const keysAfterWarm = await redisKeys("mc:*");
      expect(keysAfterWarm.length, "cache keys written by the warm read").toBeGreaterThan(0);

      await lane.setVariantPrice(product.id, product.variantId, "usd", 15);
      await expect
        .poll(() => lane.productPrice(product.id, region.id), {
          timeout: SLO.medCacheVisibility.ms,
          intervals: POLL_INTERVALS,
          message: "the new price appears on the next read",
        })
        .toBe(15);
    } finally {
      await lane.removeProductsByPrefix(runScopedName(label));
      await lane.releaseRegions();
    }
  });
});
