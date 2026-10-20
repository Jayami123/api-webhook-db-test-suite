// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

const NO_SLEEP = "No sleeps in API tests: use expect.poll with an explicit timeout (AGENTS.md).";

export default tseslint.config(
  {
    ignores: ["node_modules/", "test-results/", "playwright-report/", "results/", "receiver-logs/"],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // node:test's test()/describe() return promises the runner awaits itself.
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            { from: "package", package: "node:test", name: ["test", "it", "describe", "suite"] },
          ],
        },
      ],
    },
  },
  {
    files: ["tests/contracts/**", "tests/webhooks/**", "tests/integration/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "setTimeout", message: NO_SLEEP },
        { name: "setInterval", message: NO_SLEEP },
      ],
      "no-restricted-properties": ["error", { property: "waitForTimeout", message: NO_SLEEP }],
    },
  },
  {
    files: ["**/*.ts"],
    ignores: ["tests/db/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Property[key.name='unsafeDisableGuardForServerTests']",
          message: "Only tests/db/** may disable the read-only guard.",
        },
      ],
    },
  },
  { files: ["**/*.mjs"], ...tseslint.configs.disableTypeChecked },
  prettier,
);
