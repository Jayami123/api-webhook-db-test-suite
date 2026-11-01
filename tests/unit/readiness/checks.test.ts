import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import { productsRoot, randomSecret } from "../../../src/readiness/checks.ts";
import { SLO, TWENTY_CONFIG_REFRESH_MS, TWENTY_WEBHOOK_VISIBLE_MS } from "../../../src/slo.ts";

describe("readiness helpers", () => {
  test("randomSecret is 32 hex characters and different each time", () => {
    const a = randomSecret();
    assert.match(a, /^[0-9a-f]{32}$/);
    assert.notEqual(a, randomSecret());
  });

  test("productsRoot uses PRODUCTS_ROOT, ignores blank, and defaults next to the repo", () => {
    assert.equal(productsRoot({ PRODUCTS_ROOT: "/srv/products" }), path.resolve("/srv/products"));
    assert.equal(
      productsRoot({ PRODUCTS_ROOT: "  " }),
      path.resolve(process.cwd(), "..", "products"),
    );
    assert.equal(productsRoot({}), path.resolve(process.cwd(), "..", "products"));
  });
});

const ms = (name: keyof typeof SLO): number => SLO[name].ms;

describe("SLO budgets", () => {
  test("every budget is a positive whole number of ms with a stated basis that names its source", () => {
    for (const [name, slo] of Object.entries(SLO)) {
      assert.ok(Number.isInteger(slo.ms) && slo.ms >= 1_000, name);
      assert.ok(slo.basis.length > 30, name);
    }
  });

  test("the Twenty budgets cover the lazy-application cycles they are derived from", () => {
    assert.ok(ms("twConfigPropagation") >= 2 * TWENTY_CONFIG_REFRESH_MS);
    assert.ok(ms("twWebhookDelivery") >= 2 * TWENTY_WEBHOOK_VISIBLE_MS);
    assert.ok(ms("docWebhookDelivery") >= 10_000, "Documenso times a call out at 10_000 ms");
    assert.ok(
      ms("medWebhookProcessing") >= 5_000,
      "Medusa delays the event by webhook_delay (5000 ms)",
    );
  });
});
