const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);
config.watchFolders = [
  projectRoot,
  path.resolve(projectRoot, "..", "my-reader-tools"),
];

module.exports = withNativewind(config, {
  inlineVariables: false,
  globalClassNamePolyfill: false,
});
