// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "node_modules/*", ".expo/*"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["error", "warn", "info"] }],
    },
  },
  {
    files: ["src/services/**/*.ts", "src/services/**/*.tsx"],
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          basePath: "src",
          zones: [
            { target: "services", from: ["repos", "domain"] },
          ],
        },
      ],
    },
  },
  {
    files: ["src/repos/**/*.ts"],
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          basePath: "src",
          zones: [
            { target: "repos", from: ["domain"] },
          ],
        },
      ],
    },
  },
  {
    files: ["src/domain/**/*.ts", "src/domain/**/*.tsx"],
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          basePath: "src",
          zones: [
            // store/ is global state (Zustand), not UI — domain may read it
            { target: "domain", from: ["hooks", "features", "app", "services/db"] },
          ],
        },
      ],
    },
  },
  {
    files: [
      // domain/sync/scheduler reads queryClient for cache invalidation
      "src/domain/sync/scheduler.ts",
      // domain/reading-progress parses stored locator from reader
      "src/domain/reading-progress.ts",
    ],
    rules: {
      "import/no-restricted-paths": "off",
    },
  },
]);