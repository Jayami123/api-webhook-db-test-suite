import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { PRODUCT_IDS, type ProductId } from "../src/env.ts";
import { provisionProduct, teardownRoles, withAdmin } from "../src/db/roles-admin.ts";

/**
 * Explicit setup step, never run from a test (plan Task 3, decision D1).
 *   node scripts/db-roles.ts provision <product|all>   create or converge qa_ro / qa_fixture
 *   node scripts/db-roles.ts teardown  <product|all>   drop what provision created
 * Needs the product running (migrations done) and P2_QA_RO_PASSWORD / P2_QA_FIXTURE_PASSWORD.
 * Prints role names and outcomes only; never a statement, URL or password.
 */
// Local convenience, as in playwright.config.ts: values already in the shell (CI) win over .env.
if (existsSync(".env")) loadEnvFile(".env");

const [command, target] = process.argv.slice(2);
const products: ProductId[] =
  target === "all" ? [...PRODUCT_IDS] : PRODUCT_IDS.filter((p) => p === target);

if ((command !== "provision" && command !== "teardown") || products.length === 0) {
  console.error(
    "usage: node scripts/db-roles.ts <provision|teardown> <cal|documenso|medusa|twenty|all>",
  );
  process.exit(2);
}

for (const product of products) {
  try {
    if (command === "provision") await provisionProduct(product);
    else await withAdmin(product, (client) => teardownRoles(client));
    console.log(`db-roles ${command}: ${product} ok`);
  } catch (error) {
    // The message never contains a URL or a password (see roles.ts / roles-admin.ts).
    console.error(
      `db-roles ${command}: ${product} FAILED: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exit(1);
  }
}
