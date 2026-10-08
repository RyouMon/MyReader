const { defineConfig, globalIgnores } = require("eslint/config")
const js = require("@eslint/js")
const ts = require("typescript-eslint")
const hooks = require("eslint-plugin-react-hooks")
const sonarjs = require("eslint-plugin-sonarjs")
const globals = require("globals")

module.exports = defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/.expo/**",
    "**/.features-gen/**",
    "**/target/**",
    ".tmp/**",
    "reports/**",
    "**/src/routeTree.gen.ts",
    "**/src/lib/tauri-specta.ts",
    "**/modules/my-reader-core/src/generated/**",
    "**/modules/my-reader-core/src/NativeMyReaderCore.ts",
    "**/reader-viewport-anchor.generated.*",
    "**/generatedReader*.ts",
    "**/modules/my-reader-core/src/index.ts",
  ]),
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  { files: ["**/*.{js,mjs,cjs}"], extends: [js.configs.recommended] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [ts.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: [
      "my-reader/src/**/*.{ts,tsx}",
      "my-reader-mobile/src/**/*.{ts,tsx}",
      "my-reader-mobile/modules/*/src/**/*.{ts,tsx}",
      "packages/*/src/**/*.{ts,tsx}",
    ],
    plugins: { "react-hooks": hooks, sonarjs },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      complexity: ["error", { max: 22 }],
      "sonarjs/cognitive-complexity": ["error", 16],
    },
  },
  {
    files: [
      "**/*.{test,spec}.{ts,tsx}",
      "**/__tests__/**",
      "**/__mocks__/**",
      "**/tests/**",
    ],
    languageOptions: { globals: { ...globals.jest, ...globals.vitest } },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      complexity: "off",
      "sonarjs/cognitive-complexity": "off",
    },
  },
])
