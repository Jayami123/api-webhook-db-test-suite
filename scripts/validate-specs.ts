import {
  discoverSpecs,
  NEGATIVE_FIXTURES,
  validateSpecs,
} from "../src/contracts/validate-specs.ts";

/** `node scripts/validate-specs.ts` (npm run specs:validate): exit 1 if any committed spec is invalid. */
const files = discoverSpecs(["contracts", "tests/fixtures/oas"]).filter(
  (file) => !NEGATIVE_FIXTURES.includes(file),
);
if (files.length === 0) {
  console.error("specs:validate FAILED: no spec found under contracts/ or tests/fixtures/oas/");
  process.exit(1);
}
const results = await validateSpecs(files);
for (const r of results)
  console.log(`${r.ok ? "ok  " : "FAIL"} ${r.file}${r.ok ? "" : `: ${r.detail}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(
  `specs:validate ${failed === 0 ? "ok" : "FAILED"}: ${String(results.length - failed)}/${String(results.length)} valid`,
);
process.exit(failed === 0 ? 0 : 1);
