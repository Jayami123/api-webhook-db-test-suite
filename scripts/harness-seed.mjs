// Runs the harness's own seed() for one product (plan Task 5). The harness owns what is seeded; this
// script only calls it, because `up` does not seed Medusa (admin user) or Twenty (workspace users).
//   node scripts/harness-seed.mjs <medusa|twenty>
// Needs the product running and, for Medusa, MEDUSA_ADMIN_EMAIL / MEDUSA_ADMIN_PASSWORD in the
// environment. Prints the product and the account emails, never a password or a token.
import { getAdapter } from "qa-portfolio-harness";

const id = process.argv[2];
if (id !== "medusa" && id !== "twenty") {
  console.error("usage: node scripts/harness-seed.mjs <medusa|twenty>");
  process.exit(2);
}
try {
  const result = await getAdapter(id).seed();
  console.log(
    `harness seed ${id} ok: ${result.users.map((user) => user.email).join(", ") || "(no users)"}`,
  );
} catch (error) {
  console.error(
    `harness seed ${id} FAILED: ${error instanceof Error ? error.message.split("\n")[0] : "unknown error"}`,
  );
  process.exit(1);
}
