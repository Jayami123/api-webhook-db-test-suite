import { test, expect } from "../../../src/fixtures/index.ts";
import { cleanupLabel, laneOf } from "../../../src/lanes/med/lane-client.ts";
import { dbNowIso } from "../../../src/lanes/med/oracle.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";
import { runAllThenRethrow } from "../../../src/shared/cleanup.ts";

/**
 * starts_at is compared with now() on the DATABASE clock (@medusajs/pricing dist/repositories/pricing.js:137,
 * 188). Both sides are proven: before starts_at the price is still the base price, and the first read of the
 * sale price happens at or after starts_at on the same clock.
 */
const START_OFFSET_MS = 5_000;

test.describe("medusa price list boundary", () => {
  test("P2-MED-PL-001 a price list is active exactly at starts_at on the database clock", async ({
    request,
    medAuth,
    med,
  }) => {
    const label = "pl001";
    const lane = laneOf({ request, medAuth });
    let priceListId: string | undefined;
    try {
      const region = await lane.regionFor("usd");
      const product = await lane.productWithPrice(label, "usd", 10);

      const dbNow = await dbNowIso();
      const startsAt = new Date(Date.parse(dbNow) + START_OFFSET_MS).toISOString();
      priceListId = await lane.createPriceList({
        variantId: product.variantId,
        currency: "usd",
        amountMajor: 8,
        startsAt,
        title: `${label}-list`,
      });

      // Before starts_at: the database clock is earlier, and the store still shows the base price.
      expect(Date.parse(await dbNowIso()), "database clock before starts_at").toBeLessThan(
        Date.parse(startsAt),
      );
      expect(await lane.productPrice(product.id, region.id), "base price before starts_at").toBe(
        10,
      );

      // At starts_at: the first read of the sale price happens at or after starts_at (database clock).
      let firstSaleAtMs: number | undefined;
      await expect
        .poll(
          async () => {
            const price = await lane.productPrice(product.id, region.id);
            if (price === 8 && firstSaleAtMs === undefined)
              firstSaleAtMs = Date.parse(await dbNowIso());
            return price;
          },
          {
            timeout: SLO.medPriceListBoundary.ms,
            intervals: POLL_INTERVALS,
            message: "sale price after starts_at",
          },
        )
        .toBe(8);
      expect(firstSaleAtMs, "database clock at the first sale read").toBeGreaterThanOrEqual(
        Date.parse(startsAt),
      );
    } finally {
      const listId = priceListId;
      await runAllThenRethrow([
        ...(listId === undefined ? [] : [() => lane.removePriceList(listId)]),
        () => cleanupLabel(lane, med, label),
      ]);
    }
  });
});
