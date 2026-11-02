import { test, expect } from "../../../src/fixtures/index.ts";
import { laneOf } from "../../../src/lanes/med/lane-client.ts";
import { dbNowIso } from "../../../src/lanes/med/oracle.ts";
import { runScopedName } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";

test.describe("medusa price list boundary", () => {
  test("P2-MED-PL-001 a price list is active exactly at starts_at on the database clock", async ({
    request,
    medAuth,
  }) => {
    const label = "pl001";
    const lane = laneOf({ request, medAuth });
    try {
      const region = await lane.regionFor("usd");
      const product = await lane.productWithPrice(label, "usd", 10);
      expect(await lane.productPrice(product.id, region.id), "price before the list").toBe(10);

      // starts_at is five seconds after the DATABASE clock: the product compares to now() there.
      const dbNow = await dbNowIso();
      const startsAt = new Date(Date.parse(dbNow) + 5_000).toISOString();
      await lane.createPriceList({
        variantId: product.variantId,
        currency: "usd",
        amountMajor: 8,
        startsAt,
        title: `${label}-list`,
      });
      await expect
        .poll(() => lane.productPrice(product.id, region.id), {
          timeout: SLO.medPriceListBoundary.ms,
          intervals: POLL_INTERVALS,
          message: "sale price after starts_at",
        })
        .toBe(8);
      test
        .info()
        .annotations.push({ type: "list-title", description: runScopedName(`${label}-list`) });
    } finally {
      await lane.removeProductsByPrefix(runScopedName(label));
      await lane.releaseRegions();
    }
  });
});
