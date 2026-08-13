<div align="right"><a href="./README_EN.md">English</a></div>

<div align="center">
  <img src="./assets/app-icon/c4-pilot-1024.png" width="112" alt="MyReader 图标" />
  <h1>MyReader</h1>
  <p>面向 Calibre 用户、兼顾轻量自管理书库的 Local-First 跨平台阅读器。</p>
  <p>
    <a href="https://github.com/RyouMon/MyReader/releases/latest">安装</a>
    · <a href="./docs/ROADMAP.md">路线图</a>
    · <a href="./docs/README.md">文档</a>
    · <a href="./docs/DEVELOPMENT.md">开发指南</a>
  </p>
</div>

## 功能

- Local-First，无中心服务器，无需账号
- 支持移动端与桌面端
- 支持多书库管理
- 支持 Calibre 书库
- 支持从 OneDrive、WebDAV 导入书库（更多平台接入中）
- 支持 EPUB、PDF、CBZ 阅读格式（更多格式开发中）
- 阅读数据跨设备同步

> [!WARNING]
> MyReader 仍在快速开发中，可能出现破坏性数据迁移。请保留原始书库与远端存储的独立备份；不要把测试版当作唯一副本。
>
> 跨设备同步目前仍是试验性功能，尚不稳定，可能出现未知的同步、合并或恢复问题。

## 数据源支持

| 数据源 | 当前状态 | 平台范围与说明 |
|---|---|---|
| 本地目录 | 已支持，平台有差异 | 桌面端可使用本地目录；iOS / iPadOS 支持应用内部书库和持久授权的外部目录；Android 目前仅支持应用内部书库 |
| WebDAV | 已支持 | 桌面端、iOS / iPadOS、Android |
| OneDrive | 已支持 | 桌面端、iOS / iPadOS、Android |
| Google Drive | 待规划 | 尚未实现，接入方案与平台范围未定 |
| Dropbox | 待规划 | 尚未实现，接入方案与平台范围未定 |
| S3 兼容对象存储 | 待规划 | 尚未实现，接入方案与平台范围未定 |

## 阅读格式支持

| 格式 | 当前状态 | 平台范围与说明 |
|---|---|---|
| EPUB | 已支持 | 桌面端、iOS / iPadOS、Android |
| PDF | 已支持 | 桌面端、iOS / iPadOS、Android |
| CBZ | 已支持 | 桌面端、iOS / iPadOS、Android |
| MOBI / AZW3 | 待规划 | 尚未实现，解析与阅读方案未定 |
| FB2 | 待规划 | 尚未实现，解析与阅读方案未定 |
| TXT / HTML | 待规划 | 尚未实现，导入与排版方案未定 |
| CBR | 待规划 | 尚未实现，压缩包解析方案未定 |

> [!NOTE]
> “待规划”表示已纳入后续评估，不代表已确定实现方案、版本或交付日期。

更细的格式与平台支持矩阵见 [路线图](./docs/ROADMAP.md)，当前系统边界见 [架构文档](./docs/ARCHITECTURE.md)。

## 为什么做 MyReader

MyReader 旨在解决 Calibre 用户在跨设备阅读中的体验断点。Calibre 适合管理书库，但从电脑切换到手机继续阅读时，往往仍需经历下载、导入、更换阅读器和重新定位阅读位置。Calibre-Web 是一种可行方案，但需要用户自行部署 Web 服务，浏览器中的阅读体验也不如原生桌面和移动应用流畅。MyReader 可以视为 Calibre Sync 的增强方案：除连接、浏览和下载 Calibre 书库外，还整合了 EPUB、PDF、CBZ 的原生阅读，以及跨设备进度、书签、高亮和笔记。

MyReader 最初面向使用 Calibre 管理电子书的用户设计。Calibre 仍负责完整的书目与元数据管理；MyReader 复用既有书库，重点提供原生阅读与跨设备连续性。项目同时支持不依赖 Calibre 的自管理书库，用于直接导入和阅读电子书。该能力目前仅覆盖基础元数据管理，并非用于替代 Calibre。

## 技术架构

| 范围 | 主要技术与框架 | 阅读与数据能力 |
|---|---|---|
| 桌面端 | Tauri 2、React 18、TypeScript、Vite 6、Tailwind CSS 4、Rust | Readium Web 与 PDF.js |
| iOS / iPadOS | Expo 56、React Native 0.85、Expo Router、NativeWind 5、Swift 原生模块 | Readium Swift Toolkit |
| Android | Expo 56、React Native 0.85、Expo Router、NativeWind 5、Kotlin 原生模块 | Readium Kotlin Toolkit |
| 共享业务与数据层 | Rust `my-reader-core`、SeaORM、SQLite | 统一书目查询、阅读数据与同步规则 |
| 同步与合并 | Automerge、WebDAV、OneDrive | Automerge 合并同一书库的并发变更；WebDAV / OneDrive 负责存储与交换同步对象 |

## 未来开发方向

- TTS
- ComfyUI 集成
- 更多数据源支持
- 更多阅读格式支持

明确的非目标：MyReader 不会写入或替代 Calibre 的 `metadata.db`，不会承诺在 Calibre 书库与 MyReader 书库之间转换或保持映射，自管理书库也不以复刻 Calibre 的完整元数据管理为目标。

## 安装

当前稳定版本与安装包见 [GitHub Releases](https://github.com/RyouMon/MyReader/releases/latest)：

| 平台 | 状态 | 获取方式 |
|---|---|---|
| Android | 可下载 | Release 中的签名 APK（同时提供 SHA-256） |
| macOS | 可下载 | Apple Silicon / Intel DMG |
| Windows | 可下载 | x64 EXE / MSI |
| Linux | 可下载 | AppImage / DEB / RPM |
| iOS / iPadOS | 准备审核中 | 外部 TestFlight 通过审核后开放 |

> [!NOTE]
> Release 文件名包含版本号。为避免网站链接随版本失效，请先进入最新 Release，再选择与你的平台和架构匹配的安装包。

## 参与贡献

MyReader 由个人维护，欢迎边界清晰的 Issue 和 Pull Request。开始前请阅读 [贡献指南](./.github/CONTRIBUTING.md) 与 [社区行为准则](./.github/CODE_OF_CONDUCT.md)；本地环境、构建与验证命令见 [开发指南](./docs/DEVELOPMENT.md)。安全问题请按 [安全策略](./.github/SECURITY.md) 私下报告。

## 许可与第三方声明

MyReader 自有代码与资产采用 [MIT License](./LICENSE)。移动 Readium 适配与随包字体的第三方声明见 [my-reader-mobile/modules/readium/NOTICE](./my-reader-mobile/modules/readium/NOTICE)。本地示例书库已从版本控制中移除，不属于仓库分发内容。

Calibre、OneDrive 等产品名称与标识归各自权利人所有。MyReader 是独立项目，未获得相关项目或厂商的认可；兼容性描述不代表从属、合作或背书关系。
