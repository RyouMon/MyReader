const { withNativewind } = require("nativewind/metro")
const { getSentryExpoConfig } = require("@sentry/react-native/metro")

// projectRoot must always resolve to the mobile app directory.
// `process.cwd()` can resolve to the monorepo root when run from there,
// breaking module resolution (e.g. expo-router/entry not found).
// `__dirname` is always the directory of this config file.
const projectRoot = process.env.EXPO_PROJECT_ROOT ?? __dirname
const config = getSentryExpoConfig(projectRoot)

// Support .sql file imports for Drizzle migrations
config.resolver.sourceExts.push("sql")
config.resolver.unstable_enablePackageExports = true

module.exports = withNativewind(config, {
  inlineVariables: false,
  globalClassNamePolyfill: false,
})
