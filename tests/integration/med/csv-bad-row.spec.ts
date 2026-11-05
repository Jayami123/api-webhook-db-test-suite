import { test, expect } from "../../../src/fixtures/index.ts";
import { laneOf, type LaneClient } from "../../../src/lanes/med/lane-client.ts";
import { ORACLE_QUERIES } from "../../../src/lanes/med/oracle.ts";
import { readOnlyDb } from "../../../src/db/pg.ts";
import { likePrefixPattern, runScopedName } from "../../../src/run/prefix.ts";
import { POLL_INTERVALS, SLO } from "../../../src/slo.ts";
import { runAllThenRethrow } from "../../../src/shared/cleanup.ts";

/**
 * Product import, observed on 2026-11-02 (P-MED-13): the whole file is refused at preview when one price is
 * invalid (400 invalid_data, no product written), and a valid file imports after confirm. The confirm deadline
 * is the lane's SLO entry medCsvImport (src/slo/medusa.ts), derived and cited there.
 */

function csvFor(prefix: string, badRow: number | undefined): string {
  const head =
    "Product Handle,Product Title,Product Status,Variant Option 1 Name,Variant Option 1 Value,Variant Title,Variant SKU,Variant Price USD";
  const rows: string[] = [];
  for (let i = 1; i <= 100; i++) {
    const price = badRow === i ? "abc" : (10 + i / 100).toFixed(2);
    rows.push(
      `${prefix}-${i},${prefix}-title-${i},published,Size,One,${prefix}-v${i},${prefix}-sku-${i},${price}`,
    );
  }
  return [head, ...rows].join("\n") + "\n";
}

async function uploadAndImport(
  admin: LaneClient["admin"],
  name: string,
  csv: string,
): Promise<{ status: number; body: unknown }> {
  const uploaded = await admin<{ files: { id: string }[] }>("POST", "/admin/uploads", {
    multipart: { files: { name, mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") } },
  });
  const fileKey = uploaded.body.files[0]?.id ?? "";
  return admin("POST", "/admin/products/imports", {
    body: {
      file_key: fileKey,
      originalname: name,
      extension: "csv",
      size: csv.length,
      mime_type: "text/csv",
    },
    expect: [202, 400],
  });
}

async function productsWithPrefix(prefix: string): Promise<number> {
  const rows = await readOnlyDb("medusa").select<{ n: string }>(
    ORACLE_QUERIES.productsWithTitlePrefix,
    [likePrefixPattern(prefix)],
  );
  return Number(rows[0]?.n ?? "0");
}

test.describe("medusa product csv import", () => {
  test("P2-MED-CSV-001 a CSV with a bad price on row 50 of 100 leaves the outcome the database records", async ({
    request,
    medAuth,
  }) => {
    const lane = laneOf({ request, medAuth });
    const okPrefix = runScopedName("csvok");
    const badPrefix = runScopedName("csvbad");
    try {
      // Positive control: the same file shape with every price valid imports all 100 products.
      const good = await uploadAndImport(lane.admin, "csvok.csv", csvFor(okPrefix, undefined));
      expect(good.status, "valid file preview").toBe(202);
      const transactionId = (good.body as { transaction_id: string }).transaction_id;
      expect((good.body as { summary: { toCreate: number } }).summary.toCreate).toBe(100);
      expect(
        (
          await lane.admin("POST", `/admin/products/imports/${transactionId}/confirm`, {
            body: {},
            expect: [202],
          })
        ).status,
      ).toBe(202);
      await expect
        .poll(() => productsWithPrefix(okPrefix), {
          timeout: SLO.medCsvImport.ms,
          intervals: POLL_INTERVALS,
          message: "valid file products after confirm",
        })
        .toBe(100);

      // The bad file: row 50 has the price "abc".
      const bad = await uploadAndImport(lane.admin, "csvbad.csv", csvFor(badPrefix, 50));
      expect(bad.status, "bad file refused at preview").toBe(400);
      const body = bad.body as { type: string; message: string };
      expect(body.type).toBe("invalid_data");
      expect(body.message).toMatch(/Invalid value provided for "variant price usd"/);
      expect(body.message).toMatch(/received "abc"/);
      // All-or-nothing at preview (P-MED-13): nothing from the bad file exists.
      expect(await productsWithPrefix(badPrefix), "products from the bad file").toBe(0);
    } finally {
      await runAllThenRethrow([
        () => lane.removeProductsByPrefix(okPrefix),
        () => lane.removeProductsByPrefix(badPrefix),
        () => lane.releaseRegions(),
      ]);
    }
  });
});
