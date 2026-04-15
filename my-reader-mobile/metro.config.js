const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { FileStore } = require("@expo/metro-config/build/file-store");
const { withNativewind } = require("nativewind/metro");

// 在 EAS local build 的临时目录中，`__dirname` 可能是 /var/... 而进程 cwd 是 /private/var/...；
// 两者混用会让 Metro 生成越级相对路径，导致入口模块解析失败。
const projectRoot = process.env.EXPO_PROJECT_ROOT ?? process.cwd();
const config = getDefaultConfig(projectRoot);

// 默认 Metro 缓存在系统临时目录（如 /var/.../T/metro-cache），会与 EAS 每次拷贝到新临时目录的路径
// 交叉污染：`expo export:embed` 为「use dom」生成相对 require 时若命中旧缓存，会指向已不存在的绝对路径。
// 将缓存固定到项目内，使每次干净安装/CI 工作副本互不串缓存。
config.cacheStores = [
  new FileStore({
    root: path.join(projectRoot, "node_modules", ".cache", "metro"),
  }),
];

config.watchFolders = [
  projectRoot,
  path.resolve(projectRoot, "..", "my-reader-tools"),
];

// `my-reader-tools` 若自带 node_modules/react，会与宿主应用形成双 React，导致 DOM 组件里
// useBookReader 等 hooks 报 Invalid hook call。强制统一到应用根目录的 react/react-dom。
const appReact = path.resolve(projectRoot, "node_modules", "react");
const appReactDom = path.resolve(projectRoot, "node_modules", "react-dom");
// `watchFolders` 中的 my-reader-tools 与 app 为兄弟目录：从该包内解析 npm 依赖时，默认
// 不会走到 my-reader-mobile/node_modules，需与 react 一样显式映射到应用根 node_modules。
const appPdfjsDist = path.resolve(projectRoot, "node_modules", "pdfjs-dist");
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  react: appReact,
  "react-dom": appReactDom,
  "pdfjs-dist": appPdfjsDist,
};

module.exports = withNativewind(config, {
  inlineVariables: false,
  globalClassNamePolyfill: false,
});
