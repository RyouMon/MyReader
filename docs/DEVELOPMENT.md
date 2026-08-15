<div align="right"><a href="./DEVELOPMENT_EN.md">English</a></div>

# 开发指南

## 环境要求

| 工具 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 22 | 建议使用 LTS |
| pnpm | 11.7.0 | 仓库 `packageManager` 指定版本 |
| Rust | stable | Edition 2021；通过 [rustup](https://rustup.rs) 安装 |
| Android Studio | 最新版本 | Android SDK/NDK 与模拟器 |
| Xcode | ≥ 16 | 在 macOS 上开发 iOS 应用 |

## 首次安装

```bash
git clone https://github.com/RyouMon/MyReader.git
cd MyReader
corepack enable
pnpm install
```

该命令会安装桌面端、移动端、字体和工具 workspace 的依赖，并准备 Git hooks。

## 项目结构

```text
MyReader/
├── my-reader-core/                共享 Rust 后端
├── my-reader/                     Tauri 2 + React 桌面应用
├── my-reader-mobile/              Expo 56 + React Native 0.85 应用
│   └── modules/my-reader-core/    Core 的 UniFFI/JSI 移动适配器
├── packages/
│   ├── fonts/                     共享阅读字体目录
│   └── tools/                     共享 TypeScript 类型与 Reader 算法
├── docs/                           ADR 与协议文档
└── scripts/                        代码生成与设计 token 脚本
```

所有权和依赖边界见 [架构文档](./ARCHITECTURE.md)。

## 桌面端（Tauri）

### 开发

```bash
pnpm dev:desktop
```

该命令会在 1420 端口启动 Vite，并打开 Tauri 窗口。首次 Rust 构建所需时间较长。

### 测试

```bash
pnpm --filter my-reader run test:unit
pnpm --filter my-reader run test:unit:watch
pnpm --filter my-reader run test:unit:coverage

pnpm --filter my-reader run test:e2e:frontend
pnpm --filter my-reader run test:e2e:frontend:ui
pnpm --filter my-reader run test:e2e:desktop

(cd my-reader/src-tauri && cargo test)
```

### 格式化

```bash
pnpm --filter my-reader exec biome check --write .
cargo fmt --all
```

## 移动端（Expo）

### 开发

```bash
pnpm dev:mobile
pnpm --filter my-reader-mobile ios
pnpm --filter my-reader-mobile android
```

`ios` 和 `android` 会构建并安装开发客户端。仅修改 JS/TS 时通常只需保持 Metro 运行；修改原生模块、依赖或应用配置后需要重新构建原生应用。

修改 `app.json`、config plugin 或其他生成式原生配置后，运行：

```bash
pnpm --filter my-reader-mobile expo prebuild --clean
```

### 测试

```bash
pnpm --filter my-reader-mobile exec jest --runInBand
pnpm --filter my-reader-mobile test:e2e
```

Maestro E2E 需要安装 Maestro CLI，并运行开发客户端。

### 共享 Rust 原生验证

移动端通过 `modules/my-reader-core` 中生成的 UniFFI/JSI binding 使用 `my-reader-core`；内部的 `my-reader-core-ffi` crate 拥有 typed FFI 边界。二进制产物应在本地构建，不应提交：

```bash
cargo test -p my-reader-core -p my-reader-core-ffi
pnpm core:build-bindings:ios
pnpm core:build-bindings:android
```

若要验证 iOS 应用可使用生成的 bridge 编译：

```bash
cd my-reader-mobile/ios
pod install
xcodebuild \
  -workspace myreadermobile.xcworkspace \
  -scheme myreadermobile \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

生成的 TypeScript/C++ binding 与平台集成由 Rust 源码派生。个人机器的构建输出、XCFramework 和 Android 动态库不应进入 Git。

### 环境变量

将 `my-reader-mobile/.env.example` 复制为 `my-reader-mobile/.env`：

```text
EXPO_PUBLIC_SENTRY_DSN=<your Sentry DSN>
SENTRY_AUTH_TOKEN=<your Sentry auth token>
```

Sentry 为可选功能。

## 发布构建

正式发布与候选构建分开：

- `Release` 仅在推送 `v*` 标签后运行。完整发布测试通过后，它会并行调用桌面和移动构建；
  Android 与 iOS 均在 GitHub runner 上执行 `eas build --local`。全部成功后，桌面安装包、Android
  APK 与校验文件会写入同一 GitHub 草稿 Release，iOS 会提交到内部 TestFlight。
- `Desktop build candidate` 仅手动运行，为所选引用构建全部桌面安装包并上传 Actions 制品；它不修改
  GitHub Release。
- `Mobile build candidate` 仅手动运行，可分别勾选 Android 和 iOS。它会上传 APK、校验文件或 IPA
  作为 Actions 制品，但不修改 GitHub Release，也不提交 TestFlight。
- 所有正式产物确认完成后，在 GitHub 中手动发布草稿；流水线不会自动公开 Release。

本机也可以使用相同的本地构建配置：

```bash
cd my-reader-mobile
mkdir -p ../.tmp/release-artifacts/{android,ios}

EAS_LOCAL_BUILD_ARTIFACTS_DIR=../.tmp/release-artifacts/android \
  pnpm build:release:android:local

EAS_LOCAL_BUILD_ARTIFACTS_DIR=../.tmp/release-artifacts/ios \
  pnpm build:release:ios:local

npx eas-cli@latest submit \
  --platform ios \
  --profile production \
  --path ../.tmp/release-artifacts/ios/<artifact>.ipa \
  --groups "Team (Expo)"
```

本地构建仍需登录 Expo，以读取远端版本和托管签名凭据；它只是不使用 EAS 的云构建机器。
Android 本地构建需要 JDK、Android SDK/NDK，iOS 本地构建需要 macOS、Xcode、CocoaPods 和
Fastlane。将生成的 Android APK 重命名为 `MyReader-<version>-android.apk`，生成 SHA-256 后可用
`gh release upload <tag> <apk> <apk>.sha256 --clobber` 上传到现有草稿。

## 共享包

```bash
pnpm --filter @my-reader/fonts test
pnpm --filter @my-reader/tools test
```

`packages/tools` 存放稳定的 TypeScript 契约和 Reader 侧纯算法。跨平台后端业务属于 `my-reader-core`，不应放入新的 TypeScript service 包。

## 数据库与迁移所有权

### MyReader sidecar

每个书库拥有独立的 `.myreader/myreader.db`。桌面端和移动端都通过 `my-reader-core` 打开；TypeScript 不拥有 SQLite 连接，也不执行迁移。

```text
my-reader-core/
├── migrations/legacy/        不可变的既有迁移历史
├── src/migration.rs          有序 SeaORM Migrator
├── src/database.rs           打开、接管和迁移生命周期
├── src/entities/app/         SeaORM 查询映射
└── src/repositories/         隐藏在 core service 后的数据访问
```

Core 首次打开旧移动数据库时，会识别历史 `__drizzle_migrations` 状态，记录等价的 SeaORM 版本，应用后续迁移并删除已废弃的 metadata 表。这是一次性兼容接管，不是第二套活跃迁移系统。

### Calibre 数据库

Calibre `metadata.db` 属于外部只读数据。已提交的查询映射位于 `my-reader-core/src/entities/calibre/`；它们不注册到 MyReader Migrator，也绝不能用于修改 Calibre 书库。

支持的 Calibre 表或字段发生变化时：

1. 使用真实且受支持的 Calibre schema 核对字段。
2. 同时更新只读 entity 映射和 repository 查询。
3. 使用 Calibre fixture 新增或更新查询测试。
4. 不要为 Calibre 变更创建 MyReader migration。

### MyReader schema 变更

1. 向 Rust 管理的 `my-reader-core` Migrator 添加有序迁移。既有迁移文件不可修改。
2. 更新 repository/service 行为和迁移测试。
3. 对新数据库和相关升级 fixture 运行完整 Migrator。
4. 重新生成并审查 SeaORM 查询映射：

   ```bash
   pnpm db:generate
   ```

5. 同时提交 migration、生成的 entity 和行为变更。

`pnpm db:generate` 会执行运行时使用的同一套 `my-reader-core` Migrator 来创建临时数据库，再运行 `sea-orm-cli generate entity`。它不使用 Drizzle 或 Entity-First schema 同步器。

生成 entity 前需要安装：

```bash
cargo install sea-orm-cli
```

### 数据库验证

Schema 变更至少需要覆盖：

- 在新 SQLite 数据库上完整重放迁移；
- 从适用的上一个 SeaORM 版本升级；
- 在涉及旧移动 Drizzle metadata 表时完成一次性接管；
- 使用生成后的真实 schema 验证 repository 行为；
- 执行 `pnpm db:generate` 后不存在生成 entity 漂移。

## 设计 Token

修改 `../.agents/skills/myreader-design-system/colors_and_type.css` 或 [设计系统](./DESIGN.md) 后：

```bash
pnpm sync:design-tokens
```

该命令会把颜色同步到桌面端和移动端实现。

## Monorepo 说明

- Metro 兼容性要求 `node-linker=hoisted`。
- 内部 pnpm 包使用 `workspace:*`。
- 桌面端使用 React 18；移动端使用 React 19。
- 移动依赖补丁在 `pnpm-workspace.yaml` 中注册，并存放于仓库 patch 目录。
- Cargo 包从根目录 `Cargo.toml` 共享依赖版本。

## VS Code 配置

推荐扩展：

- Tauri（`tauri-apps.tauri-vscode`）
- rust-analyzer（`rust-lang.rust-analyzer`）
- Expo Tools（`expo.vscode-expo-tools`）

仓库的 VS Code 设置已配置 Biome 格式化和 import 整理。
