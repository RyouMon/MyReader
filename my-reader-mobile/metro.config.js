const path = require("node:path");
const { FileStore } = require("@expo/metro-config/build/file-store");
const { withNativewind } = require("nativewind/metro");
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

// projectRoot must always resolve to the mobile app directory.
// `process.cwd()` can resolve to the monorepo root when run from there,
// breaking module resolution (e.g. expo-router/entry not found).
// `__dirname` is always the directory of this config file.
const projectRoot = process.env.EXPO_PROJECT_ROOT ?? __dirname;
const config = getSentryExpoConfig(projectRoot);

// Pin Metro cache inside the project so CI builds don't cross-contaminate.
config.cacheStores = [
  new FileStore({
    root: path.join(projectRoot, "node_modules", ".cache", "metro"),
  }),
];

// Support .sql file imports for Drizzle migrations
config.resolver.sourceExts.push("sql");

module.exports = withNativewind(config, {
  inlineVariables: false,
  globalClassNamePolyfill: false,
});
