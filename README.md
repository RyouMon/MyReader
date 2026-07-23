# MyReader

> 一款面向 Calibre 书库的 Local-First 跨平台阅读器。桌面端与移动端分别使用适合各自平台的 Readium 实现，并共享数据契约、阅读位置语义和纯工具。

## 当前能力

- 添加并切换多个 Calibre 书库，始终以只读方式访问 Calibre 的 `metadata.db`。
- 支持本地目录、WebDAV 和 OneDrive 数据源；远程书库在设备侧缓存元数据、封面和按需下载的书籍文件。
- 桌面端与移动端当前可阅读 EPUB、PDF、CBZ。
- 使用 Readium `Locator` 保存阅读进度、书签和批注位置，不把重排后的视觉页码当作持久化主键。
- 支持收藏、阅读进度、书签、高亮与笔记；具体阅读能力按格式和平台分别实现。
- 每个书库拥有独立的 MyReader SQLite sidecar，应用设置和凭据保留在设备本地。
- 当前 sidecar v3 同步阅读进度与书签；已接受但尚未实施的 v4 CRDT 目标见 [ADR-0015](./docs/adr/0015-library-sidecar-crdt-reading-sync.md)。

MyReader 不再维护一套跨平台共享的自研渲染内核。桌面端使用 Web/JS 阅读适配，移动端通过应用自有 Expo Module 接入 Readium Swift/Kotlin Toolkit；两端共享的是 Publication、Link、Locator 等语义和产品规则，而不是渲染 UI。

## 仓库结构

```text
MyReader/
├── my-reader/             桌面端：Tauri 2 + React 18
├── my-reader-mobile/      移动端：Expo 56 + React Native 0.85
├── packages/
│   ├── db/                跨端数据库 schema 与 SQL migrations
│   ├── fonts/             阅读字体目录与资产来源
│   └── tools/             跨端类型、Locator/书签/批注/目录等纯工具
├── docs/                  ADR 与同步协议文档
└── scripts/               schema、生成代码和设计 token 脚本
```

完整的运行边界、分层和数据流见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 快速开始

### 环境要求

- Node.js 22 或更高版本
- pnpm 11.7.0（仓库 `packageManager` 锁定版本）
- Rust stable 1.85 或更高版本（桌面端）
- Xcode 16+（iOS）或 Android Studio / Android SDK（Android）

### 安装与开发

```bash
git clone https://github.com/RyouMon/MyReader.git
cd MyReader
corepack enable
pnpm install

# 启动 Tauri 桌面端
pnpm dev:desktop

# 启动 Expo Metro
pnpm dev:mobile

# 构建并运行移动开发客户端
pnpm --filter my-reader-mobile ios
pnpm --filter my-reader-mobile android
```

### 构建

```bash
# 桌面前端
pnpm --filter my-reader build

# Tauri 安装包
pnpm --filter my-reader tauri build

# 本地 EAS development build
pnpm --filter my-reader-mobile build:dev:ios
pnpm --filter my-reader-mobile build:dev:android
```

### 单元测试

```bash
pnpm --filter @my-reader/fonts test
pnpm --filter @my-reader/tools test
pnpm --filter my-reader run test:unit
pnpm --filter my-reader-mobile exec jest --runInBand
(cd my-reader/src-tauri && cargo test)
```

桌面 Playwright/WebdriverIO 与移动 Maestro 的运行方式见 [DEVELOPMENT.md](./DEVELOPMENT.md)。

## 技术栈

| 范围 | 当前实现 |
|---|---|
| Monorepo | pnpm workspace |
| 桌面 UI | React 18、TypeScript、Vite 6、Tailwind CSS 4、TanStack Router/Query、Zustand |
| 桌面后端 | Tauri 2、Rust、SeaORM、SQLite、tauri-specta、OpenDAL |
| 移动端 | Expo 56、React Native 0.85、Expo Router、NativeWind 5、TanStack Query、Zustand |
| 移动数据 | op-sqlite、Drizzle ORM |
| 阅读器 | 桌面 `@readium/*` + PDF.js 适配；移动 Readium Swift/Kotlin Toolkit + 应用自有 Expo Module |
| 远程数据源 | WebDAV、OneDrive |
| 测试 | Vitest、Jest、Playwright BDD、WebdriverIO、Maestro、Cargo test |

## 项目文档

- [架构现状](./ARCHITECTURE.md) — 当前系统边界、分层、数据与同步路径
- [开发指南](./DEVELOPMENT.md) — 环境、命令、生成流程和测试入口
- [架构决策](./docs/adr/README.md) — 已接受、已实施、已撤回和已取代的 ADR
- [设计系统](./DESIGN.md) — 跨端视觉原则与颜色 token
- [Roadmap](./ROADMAP.md) — 尚未落地的规划，不作为当前能力说明
