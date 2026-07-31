# MyReader 架构现状

> 文档日期：2026-07-28
>
> 本文件只描述当前已落地实现。历史方案和后续决策见 `docs/adr/`。

## 1. 架构摘要

MyReader 是一个面向 Calibre 书库的 Local-First 跨平台阅读器：

- Calibre 拥有 `metadata.db`、封面和书籍文件；MyReader 只读查询 Calibre 数据。
- 每个书库拥有独立的 MyReader SQLite sidecar 和 Automerge document。
- desktop、iOS 和 Android 共同使用 Rust `my-reader-core` 处理数据库、书库、书目、阅读数据与
  sidecar 同步业务。
- Tauri Commands 与移动 UniFFI/JSI binding 是平台 adapter，不再维护第二套数据库或业务规则。
- UI、Readium Navigator、系统授权、凭据、目录句柄、生命周期和后台调度触发仍由平台实现。
- 当前数据源为本地目录、WebDAV 和 OneDrive；当前可读格式为 EPUB、PDF 和 CBZ。

```mermaid
flowchart TB
    Calibre["Calibre 书库<br/>metadata.db · 封面 · 书籍文件 · .myreader"]

    subgraph Desktop["桌面端 my-reader"]
        DesktopUI["React UI<br/>Router · Query · Zustand"]
        Tauri["薄 Tauri Commands<br/>平台状态 · 凭据 · 事件"]
        DesktopReader["Web Readium / PDF.js / Divina"]
    end

    subgraph Mobile["移动端 my-reader-mobile"]
        MobileUI["Expo / React Native UI<br/>Features · Hooks · Query · Zustand"]
        Facade["薄 services/core 门面"]
        Binding["生成的 JSI + UniFFI<br/>类型转换 · 异步调用"]
        NativeReader["Readium Swift / Kotlin Toolkit"]
    end

    subgraph SharedRust["共享 Rust"]
        Components["MyReaderCore 移动适配器<br/>TurboModule · JSI · UniFFI"]
        Core["my-reader-core<br/>API · Services · Repositories · Infrastructure"]
        Sidecar["SeaORM + SQLite<br/>Automerge sidecar"]
    end

    DesktopUI --> Tauri --> Core
    DesktopUI --> DesktopReader
    MobileUI --> Facade --> Binding --> Components --> Core
    MobileUI --> NativeReader
    Core --> Sidecar
    Core --> Calibre
```

## 2. Monorepo 与所有权

pnpm workspace：

| Workspace | 所有权 |
|---|---|
| `my-reader` | 桌面 UI、Tauri adapter、桌面 Readium、桌面平台能力 |
| `my-reader-mobile` | 移动 UI、Core binding adapter、移动 Readium、移动平台能力 |
| `packages/fonts` | 跨端阅读字体目录和资产来源 |
| `packages/i18n` | 跨端共享文案、平台专属翻译资源和国际化契约 |
| `packages/tools` | 跨端 TypeScript 类型、Reader 纯算法和产品语义 |

Cargo workspace 中与共享后端相关的 crate：

| Crate | 所有权 |
|---|---|
| `my-reader-core` | 跨端业务 API、SeaORM 数据访问、Calibre 查询、Automerge 与同步规则 |
| `my-reader-core-ffi`（位于 `my-reader-mobile/modules/my-reader-core/rust`） | typed UniFFI 导出、FFI 数据转换和移动原生产物 |

移动端另有应用内原生模块：

- `my-reader-mobile/modules/my-reader-core`：通过生成的 JSI/TurboModule 把 UniFFI 产物接入 React Native。
- `my-reader-mobile/modules/readium`：应用自有 Readium Swift/Kotlin 集成。
- `my-reader-mobile/modules/book-transition`：阅读器原生转场。

React/React Native UI 和 Navigator Surface 不跨端共享。共享边界由稳定语义决定，不为了复用而
建立空 package、crate 或抽象层。

## 3. `my-reader-core`

### 3.1 分层

```text
api/                跨端粗粒度 use-case API
    ↓
services/           业务校验、事务和用例编排
    ↓
repositories/       MyReader SQLite 与 Calibre 只读访问
    ↓
database.rs
entities/
migration.rs

infrastructure/     registry 与对象存储实现
sync/               Automerge document、持久化、传输和调度规则
models/             跨层稳定业务 DTO
```

`services`、`repositories` 和 `infrastructure` 是 crate 内部实现。平台通过 `api` 和必要的稳定
合同调用 core；平台 adapter 不复制 SQL、CRDT 合并或业务事务。

### 3.2 当前业务范围

`my-reader-core` 已拥有：

- 设备本地的数据源与书库 registry。
- 本地、WebDAV 和 OneDrive 数据源校验、远程目录、远程书库添加与刷新。
- Calibre 书目数量、分页、搜索、详情、系列、格式和文件相对路径查询。
- 阅读格式选择、文件状态和封面缩略图 manifest。
- 下载任务去重、并发限制、取消和状态转换。
- 收藏、阅读位置与冲突候选、书签、高亮和笔记。
- 阅读 session、完成记录和当前书库统计。
- Automerge change、projection、outbox、远端交换、pull freshness、retry/suspend 和
  single-flight 规则。

不进入 core 的平台能力包括 UI 状态、Readium Navigator、窗口、系统目录授权、secure storage、
OAuth UI、通知、计时器和应用生命周期。

## 4. 桌面端

### 4.1 运行时边界

```text
React/WebView
  ├─ TanStack Router 页面与组件
  ├─ React Query 后端状态
  ├─ Zustand UI 状态
  └─ 桌面 Reader 适配
          │
          │ tauri-specta 类型 IPC
          ▼
Tauri adapter
  ├─ Commands 与 DTO 转换
  ├─ config / 系统凭据
  ├─ 窗口、protocol 和 streamer
  └─ 平台同步 trigger
          │
          ▼
my-reader-core
```

前端通过 `my-reader/src/lib/tauri-api.ts` 调用生成的类型 IPC。Tauri 现存 service 负责平台协作和
向 core 转换数据；已经迁入 core 的业务不在 Tauri repository 中重复实现。

WebDAV 密码与 OneDrive token 存在系统凭据存储中，不写入前端持久 DTO 或 sidecar。

### 4.2 桌面 Reader

| 格式 | 实现 |
|---|---|
| EPUB | `@readium/navigator` |
| PDF | `pdfjs-dist` + MyReader Readium Locator/Navigator 适配 |
| CBZ | MyReader Divina manifest 与 fixed-layout 适配 |

桌面 Reader、资源 protocol、HTTP streamer 和窗口生命周期是桌面平台实现，不进入 core。

## 5. 移动端

### 5.1 分层

```text
app/ + features/ + domain/ + hooks/
        UI、交互、React Query、Zustand、平台流程
                    ↓
services/core/
        路径/凭据准备、DTO 转换、查询失效和 UniFFI 调用
                    ↓
modules/my-reader-core/
        generated TurboModule + JSI + UniFFI
                    ↓
my-reader-core
```

移动端不再拥有 `repos/`、`services/db/`、Drizzle 或 OP-SQLite 数据库后端。`services/core` 是
FFI 门面，不实现 SQL、合并策略或第二套业务规则。

保留在 TypeScript 的内容应当确实依赖移动平台，例如：

- Expo Router、React Query、Zustand 和 UI 状态。
- 文件 URI、security-scoped bookmark、移动下载和缓存文件操作。
- SecureStore、OAuth token 刷新和短期凭据注入。
- 网络、前后台、当前书库和阅读器关闭等同步 trigger。
- Readium View、选择菜单、Decoration、手势和系统交互。

`domain/` 只容纳仍需跨多个移动 feature 复用的 UI/平台流程。单纯转发 core API 的兼容层不保留。

### 5.2 原生 Reader

`my-reader-mobile/modules/readium` 负责 Publication handle、Streamer、Search、Locator、
Selection、Decoration 和原生 View 转换。iOS 使用 Readium Swift Toolkit，Android 使用 Readium
Kotlin Toolkit。Reader bridge 与 `my-reader-core` 的业务 binding 是两个独立平台边界。

## 6. 数据与持久化

### 6.1 Calibre 数据

Calibre `metadata.db` 是外部只读数据库：

- 本地书库直接查询。
- 远程书库先下载到设备缓存，再由 core 查询。
- MyReader 不迁移、不增加字段、不写入 Calibre 表。
- `my-reader-core/src/entities/calibre` 是受支持 Calibre 表的只读 SeaORM 映射。

### 6.2 每书库 sidecar

每个书库拥有逻辑独立的 `.myreader/myreader.db`。远程书库在设备容器中维护本地 sidecar，
多设备通过 Automerge StorageKey 对象交换数据，不直接共享活动 SQLite/WAL/SHM。

业务表：

| 表 | 用途 |
|---|---|
| `reading_progress` | Locator、展示进度、冲突投影和更新时间 |
| `favorite_books` | 收藏状态 |
| `bookmarks` | 书签 Locator、稳定位置键和 tombstone |
| `annotations` | 高亮、颜色、可选笔记和 tombstone |
| `reading_sessions` | 阅读时长区间 |
| `reading_completions` | 阅读完成记录 |
| `book_reading_format` | 设备选择的阅读格式 |
| `file_state` | 书籍/封面文件本地缓存状态 |
| `book_cover_thumbnail_cache` | 移动封面缩略图 manifest |

同步表：

| 表 | 用途 |
|---|---|
| `sync_local_meta` | 当前书库 Automerge 本地身份与协议元数据 |
| `sync_automerge_state` | Automerge document 快照 |
| `sync_automerge_outbox` | 待保存到远端的本地 incremental chunk |
| `sync_automerge_projection_meta` | document 到业务表的投影状态 |
| `sync_errors` | 可诊断同步错误 |
| `sync_schedule_state` | pull freshness、retry 和 suspension 持久状态 |

设备设置、Reader 偏好、凭据、下载临时任务和书库 registry 不进入 sidecar 同步。

### 6.3 Schema 权威

MyReader 自有数据库由 `my-reader-core` 的有序 SeaORM Migrator 唯一拥有：

```text
my-reader-core/migrations/legacy/*.sql
        既有不可变迁移历史
                    ↓
my-reader-core/src/migration.rs
        运行时有序 Migrator
                    ↓
.myreader/myreader.db
                    ↓
my-reader-core/src/entities/app
        SeaORM 查询映射
```

旧移动数据库第一次由 core 打开时，会把已有 Drizzle migration 记录一次性接管为等价的 SeaORM
状态并删除旧 metadata 表；新安装不加载 TypeScript migrator。

`pnpm db:generate` 通过同一个 Rust Migrator 创建临时数据库，再生成 SeaORM entities。migration
是 schema/升级历史的权威，entities 不是 Entity-First schema 来源。

## 7. 数据源、文件与同步

### 7.1 数据源与文件

当前数据源为 Local、WebDAV 和 OneDrive。远程书库流程为：

1. core 校验数据源并刷新本地 `metadata.db`。
2. UI 从本地 Calibre 缓存查询书目。
3. 平台下载能力按需获取封面和书籍文件。
4. core 持久化 `file_state` 与封面 manifest。
5. React Query 在写入或同步完成后失效相关查询。

对象存储、Calibre 本体同步与 MyReader sidecar 同步是不同语义；手动“全部同步”可以编排两者，
自动阅读数据同步只处理 sidecar。

### 7.2 Automerge sidecar

[ADR-0016](./docs/adr/0016-adopt-automerge-for-library-sidecar-sync.md) 已落地：

- 每个书库一个 Automerge document。
- 同步范围固定为收藏、阅读位置、书签、批注、阅读 session 和完成记录六个现有 domain。
- core 负责 change 因果关系、去重、冲突候选、SQLite projection、outbox 和收敛。
- 阅读位置真并发时保留候选；用户选择后写入因果上更新的 change。
- 同步完成后平台只负责刷新可见查询。

[ADR-0020](./docs/adr/0020-adopt-automerge-repo-storage-model.md) 进一步规定：

- 远端采用 automerge-repo `StorageSubsystem` 的 snapshot/incremental `StorageKey`，直接映射到
  `.myreader/automerge/<document_id>/<kind>/<hash>`；当前 `document_id` 就是 Calibre
  `library_uuid`。
- core 负责 snapshot-first 加载、内容寻址增量和只删除 covered chunks 的并发安全压缩。

自动同步遵循 [ADR-0017](./docs/adr/0017-event-driven-library-sidecar-sync-scheduling.md)：业务写入通知
平台 trigger，core 负责 debounce/max-wait、single-flight、pull freshness、retry/backoff、
suspend 和恢复规则；平台提供前后台、网络、书库切换、Reader 关闭和计时器事件。

旧 JSONL/HLC、自研 join、CR-SQLite 和 v4 临时远端数据不会进入当前产品路径。

## 8. 阅读位置与格式能力

跨端统一 `Publication`、`Link`、`Locator` 等稳定语义。Locator 是可恢复内容位置，不是视觉
页码；持久化保留 `href`、`type`、`locations` 和必要文本/DOM 锚点。

| 格式 | 桌面端 | 移动端 |
|---|---|---|
| EPUB | Web Readium | Readium Swift/Kotlin EPUB Navigator |
| PDF | PDF.js 适配 | Readium PDF Navigator |
| CBZ | Divina/fixed-layout 适配 | Readium fixed-layout/CBZ Navigator |

书签可围绕 Locator 跨格式工作；Selection、Decoration、高亮、搜索、重排和设置能力必须按实际
Navigator/格式显式判断，不能假设三种格式完全相同。

## 9. 关键约束

1. **Calibre 只读**：不把 MyReader 字段写进 `metadata.db`。
2. **每书库数据域**：业务数据随书库隔离，不建立中央 Profile 数据库。
3. **共享业务，不共享渲染**：core 统一后端；UI、Navigator 和系统能力归平台。
4. **单一数据库 writer**：desktop/mobile 通过 core 访问 MyReader SQLite。
5. **Rust migration 权威**：不恢复 TypeScript/Drizzle schema 链或 Entity-First schema sync。
6. **凭据设备本地化**：secret 不进入 sidecar、Automerge 或可持久前端 DTO。
7. **远端交换 change，不共享 SQLite**。
8. **不预想功能**：评分、书架、账户、中心 Profile、跨书库统计等不存在的能力不进入当前架构。

## 10. 验证入口

```bash
# 共享 Rust
cargo test -p my-reader-core -p my-reader-core-ffi

# Core 高频路径基线
cargo run -p my-reader-core --release --example runtime_baseline -- 1000

# 共享 TypeScript
pnpm --filter @my-reader/fonts test
pnpm --filter @my-reader/i18n test
pnpm --filter @my-reader/tools test

# 桌面
pnpm --filter my-reader run test:unit
(cd my-reader/src-tauri && cargo test)

# 移动
pnpm --filter my-reader-mobile exec jest --runInBand
pnpm core:build-bindings:ios
pnpm core:build-bindings:android

# 从 core Migrator 重新生成 app entities
pnpm db:generate
```

本机构建、E2E 和平台测试见 [DEVELOPMENT.md](./DEVELOPMENT.md)。Core 的本机构建、原生产物和
高频查询参考值见 [my-reader-core 运行基线](./docs/my-reader-core-runtime-baseline.md)。

## 11. 相关 ADR

| ADR | 当前关系 |
|---|---|
| [ADR-0005](./docs/adr/0005-adopt-readium-reader-architecture.md) | 当前 Reader 架构基础 |
| [ADR-0006](./docs/adr/0006-desktop-typed-ipc-and-layered-backend.md) | 桌面类型 IPC 与后端分层基础 |
| [ADR-0007](./docs/adr/0007-pnpm-monorepo-and-shared-code-ownership.md) | monorepo 与语义共享原则 |
| [ADR-0008](./docs/adr/0008-shared-database-schema-authority.md) | 已由 ADR-0019 取代，保留历史 |
| [ADR-0013](./docs/adr/0013-maintain-mobile-readium-integration.md) | 移动 Readium 集成所有权 |
| [ADR-0016](./docs/adr/0016-adopt-automerge-for-library-sidecar-sync.md) | 当前 Automerge 同步内核 |
| [ADR-0017](./docs/adr/0017-event-driven-library-sidecar-sync-scheduling.md) | 当前自动同步调度语义 |
| [ADR-0018](./docs/adr/0018-shared-rust-components.md) | 共享 Rust/UniFFI 试点，crate 组织由 ADR-0019 部分取代 |
| [ADR-0019](./docs/adr/0019-adopt-modular-my-reader-core.md) | 当前共享后端和数据库权威 |
| [ADR-0020](./docs/adr/0020-adopt-automerge-repo-storage-model.md) | 当前 Automerge 远端存储、压缩和故障恢复模型 |
