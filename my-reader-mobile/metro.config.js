const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);
config.watchFolders = [
  projectRoot,
  path.resolve(projectRoot, "..", "my-reader-tools"),
];

// `my-reader-tools` 若自带 node_modules/react，会与宿主应用形成双 React，导致 DOM 组件里
// useBookReader 等 hooks 报 Invalid hook call。强制统一到应用根目录的 react/react-dom。
const appReact = path.resolve(projectRoot, "node_modules", "react");
const appReactDom = path.resolve(projectRoot, "node_modules", "react-dom");
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  react: appReact,
  "react-dom": appReactDom,
};

module.exports = withNativewind(config, {
  inlineVariables: false,
  globalClassNamePolyfill: false,
});
