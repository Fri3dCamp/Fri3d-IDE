import globals from "globals"
import pluginJs from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["build/", "public/", "test-results/", "playwright-report/", "src/websocket_relay.js"] },
  { languageOptions: { globals: globals.browser }},
  pluginJs.configs.recommended,
  {
    rules: {
      "no-unused-vars": [ "warn", {
          argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_"
      }],
      "no-use-before-define": [ "error", {
          functions: false,
          variables: false,
      }],
      "no-undef": "error",
      "no-empty": "warn",
    },
    languageOptions: {
      globals: {
        analytics:          "readonly",
        loadMicroPython:    "readonly",
        VIPER_IDE_VERSION:  "readonly",
        VIPER_IDE_BUILD:    "readonly",
      }
    }
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      // tsc reports unused locals; the base rule false-positives on
      // interface method parameters.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [ "warn", {
          argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_"
      }],
      // transports.ts merges the Transport class with an interface on
      // purpose, to type the abstract writeBytes() contract.
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
      // Legacy code mixes reassigned and constant names in one destructuring
      "prefer-const": [ "error", { destructuring: "all" } ],
    },
  },
  {
    files: ["scripts/**", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"],
    languageOptions: { globals: globals.node },
  },
)
