<div align="right"><a href="./ARCHITECTURE_EN.md">English</a></div>

# MyReader 架构现状

> 审视日期：2026-10-08
>
> 本文件只描述当前已落地实现。历史方案和后续决策见 `docs/adr/`。

## 1. 架构摘要

MyReader 是一个同时支持 Calibre 与 MyReader 自有书库的 Local-First 跨平台阅读器：

- Calibre 拥有外部 `metadata.db`、封面和书籍文件；MyReader 对 Calibre 书库始终只读。
- MyReader 自有书库以 marker 标识所有权，以 Automerge catalog 为书目逻辑权威，并把 catalog
  投影到设备本地的 Calibre-shaped 查询表；它不生成或维护 `metadata.db`。
- 每个书库拥有独立的设备本地 SQLite sidecar 和 Automerge document。Calibre document 包含六个
  阅读数据 root；MyReader document 还包含 catalog root。
- desktop、iOS 和 Android 共同使用 Rust `my-reader-core` 处理数据库、书库、书目、阅读数据与
  sidecar 同步业务。
- Tauri Commands 与移动 UniFFI/JSI binding 是平台 adapter，不再维护第二套数据库或业务规则。
- UI、Readium Navigator、系统授权、凭据、目录句柄、生命周期和后台调度触发仍由平台实现。
- 当前数据源为本地目录、WebDAV 和 OneDrive；当前可读格式为 EPUB、PDF 和 CBZ。

```mermaid
flowchart TB
    Calibre["Calibre 书库<br/>metadata.db · 封面 · 书籍文件 · .myreader"]
    Managed["MyReader 书库源<br/>marker · Books · Automerge StorageKey"]

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
    Core --> Managed
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
| `my-reader-core` | 跨端业务 API、SeaORM 数据访问、统一书目查询、Automerge 与同步规则 |
| `my-reader-core-ffi`（位于 `my-reader-mobile/modules/my-reader-core/rust`） | typed UniFFI 导出、FFI 数据转换和移动原生产物 |

移动端另有应用内原生模块：

- `my-reader-mobile/modules/my-reader-core`：通过生成的 JSI/TurboModule 把 UniFFI 产物接入 React Native。
- `my-reader-mobile/modules/readium`：应用自有 Readium Swift/Kotlin 集成。
- `my-reader-mobile/modules/book-transition`：阅读器原生转场。
- `my-reader-mobile/modules/security-scoped-bookmarks`：持久化并恢复 iOS 外部书库目录授权。

React/React Native UI 和 Navigator Surface 不跨端共享。共享边界由稳定语义决定，不为了复用而
建立空 package、crate 或抽象层。

## 3. `my-reader-core`

### 3.1 分层

```text
api/                跨端粗粒度 use-case API
    ↓
services/           业务校验、事务和用例编排
    ↓
repositories/       MyReader catalog projection 与 Calibre 只读访问
    ↓
database.rs
entities/
migration.rs

infrastructure/     registry 与对象存储实现
library/            书库上下文、身份与写权限、共享元数据存储
sync/               Automerge document、持久化、传输和调度规则
models/             跨层稳定业务 DTO
```

`services`、`repositories` 和 `infrastructure` 是 crate 内部实现。平台通过 `api` 和必要的稳定
合同调用 core；平台 adapter 不复制 SQL、CRDT 合并或业务事务。

`library::LibraryContext` 汇集 sidecar 路径、数据库访问与副本身份初始化。它复用 `database`
已有的连接池、migration 和关闭 / 删除保护，不建立第二份缓存或新的全局状态。创建上下文时
不加载 Automerge 或访问源书库；写入与同步按需验证源身份。Calibre 身份来自外部 `library_id`，
MyReader 身份读取 marker，设备副本身份保留在各自 sidecar。无效 UTF-8 sidecar 路径直接拒绝。

组合查询直接复用 repository：最近阅读组合 catalog 与 reading 查询，格式选择按目标书籍
查询格式，书库注册 / 同步通过 count 查询更新数量。marker、写权限校验、远程 metadata
校验替换和 catalog 时间格式化由 `library/` 共享；TTS 配置校验位于 `services/config/tts.rs`。
这些模块不反向调用 service。现有 service 只按单向依赖编排用例，例如 Library 调用 Sync，
Catalog / Sync / BookTransfer 调用 Content 的状态转换，TTS 调用 Config。
`api::*Service` 的公开路径和签名保持稳定；没有为单一实现引入新的 trait 或通用 service 框架。

Core 的 `FileState.local_state` / `FileStateUpdate.local_state` 使用 `FileLocalState`，
`Library.source_type` 使用 `Option<LibrarySourceType>`。业务状态判断使用枚举；SQLite、JSON、
Tauri DTO 和 UniFFI 的既有字符串值保持不变，转换集中在持久化与平台边界。未知字符串原样保留，
不视为可用的本地文件或已支持的可写书库来源；缺失 / null 的旧 `sourceType` 仍为 `None`。
Rust 调用者构造这些字段时使用枚举变体。

同步身份用 `LibraryUuid` 和 `ReplicaId` 两个 newtype 区分，构造时保留现有的规范 UUID 校验：
书库接受 RFC UUID v1–v8，设备副本只接受 v4；两者都要求小写且带连字符。内部类型不能互换，
SQLite 和 Automerge 边界仍写入原字符串。newtype 限于这里实际易混淆的身份；现有文件系统
`Path` / `PathBuf` 和带单位的时间参数不另建通用包装层。

同步 SQLite / Automerge 的异步调用经过 `sync/persistence/async_io.rs`：同一数据库异步排队，
完整事务在有并发上限的 `spawn_blocking` 工作中执行；不同数据库不再共用全局写锁。
远端 Automerge 对象校验也在阻塞线程执行。排队 guard 跟随实际工作，连接持有书库生命周期
lease；取消调用撤销尚未开始的工作，不提前释放正在执行的事务，删除书库会等待已打开的连接关闭。
SeaORM / SQLx 的异步查询保留原路径。

SQLite 投影以同一事务中的 Automerge heads 为增量边界：阅读写入只解析并更新实际变更的
domain，不再重建无关 catalog。远端对象仍完整校验，合并后的 SQLite 更新也按 domain 选择。
变更范围来自原始操作及其父路径，包含未胜出的冲突值。初始化、schema 迁移、根对象变更或
投影版本 / heads 失效时完整重建；查询完整 document 的入口始终返回全量投影。
当前粒度为 domain，受影响 domain 内仍完整投影；没有跨事务的内存投影缓存。
性能与边界见 [增量投影报告](./core-incremental-projection-performance.md)。

### 3.2 当前业务范围

`my-reader-core` 已拥有：

- 设备本地的数据源与书库 registry。
- `calibre` / `myreader` 书库所有权、marker 身份校验与向后兼容的只读默认值。
- 本地、WebDAV 和 OneDrive 数据源校验、远程目录、两类书库添加/打开与刷新。
- Calibre 与 MyReader 共用的书目数量、分页、搜索、详情、系列、格式和文件相对路径查询。
- MyReader 单格式图书导入、删除、书名/作者修改及 catalog projection。
- 阅读格式选择、文件状态和封面缩略图 manifest。
- 下载任务去重、并发限制、取消、状态转换及 MyReader 正文 SHA-256 校验。
- 收藏、阅读位置与冲突候选、书签、高亮和笔记。
- 阅读 session、完成记录和当前书库统计。
- Automerge change、projection、outbox、远端交换、pull freshness、retry/suspend 和
  single-flight 规则。
- 设备本地 TTS provider profile、默认引擎、voice mapping，以及 OpenAI-compatible / Qwen 的语音发现、
  音频合成、缓存和错误归一化。

不进入 core 的平台能力包括 UI 状态、Readium Navigator、窗口、系统目录授权、secure storage、
系统 TTS、音频播放、OAuth UI、通知、计时器和应用生命周期。

### 3.3 TTS 所有权

TTS 遵循 [ADR-0022](./adr/0022-adopt-readium-tts-and-core-provider-architecture.md)：Readium 负责
正文切分、当前句、Locator 和 Decoration；`my-reader-core` 负责 provider 配置、网络推理、音频
artifact 与统一错误；平台 adapter 负责系统语音、音频播放和 keyring/SecureStore。Core 配置只
保存 credential reference，不保存密钥。当前产品切片只面向可朗读的文本 EPUB，并以前台会话
提供 System、OpenAI-compatible 和 Qwen 引擎。桌面与移动产品层通过 `@my-reader/tools/reader-tts-session`
共享 session/generation、终态隔离、导航去重和暂停恢复状态机；Readium Locator 与实际播放继续由
平台 adapter 持有。

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
- 应用容器文件 URI、单文件选择、iOS 外部目录授权、移动下载和缓存文件操作。
- iOS/Android 系统分享入口；分享文件与文件选择器进入同一导入用例。
- SecureStore、OAuth token 刷新和短期凭据注入。
- 网络、前后台、当前书库和阅读器关闭等同步 trigger。
- Readium View、选择菜单、Decoration、手势和系统交互。

`domain/` 只容纳仍需跨多个移动 feature 复用的 UI/平台流程。单纯转发 core API 的兼容层不保留。

### 5.2 原生 Reader

`my-reader-mobile/modules/readium` 负责 Publication handle、Streamer、Search、Locator、
Selection、Decoration 和原生 View 转换。iOS 使用 Readium Swift Toolkit，Android 使用 Readium
Kotlin Toolkit。TTS 同样由该 bridge 组合 Readium 会话与系统或 Core 远端引擎；Reader bridge 与
`my-reader-core` 的业务 binding 是两个独立平台边界。

## 6. 数据与持久化

### 6.1 Calibre 数据

Calibre `metadata.db` 是外部只读数据库：

- 桌面本地书库直接查询；iOS 移动端可通过授权外部目录或已配置远程数据源打开 Calibre 书库，
  Android 移动端只支持远程 Calibre 书库。
- 远程书库先下载到设备缓存，再由 core 查询。
- MyReader 不迁移、不增加字段、不写入 Calibre 表。
- `my-reader-core/src/entities/calibre` 是受支持 Calibre 表的只读 SeaORM 映射。

Core 每次打开外部数据库时读取 `PRAGMA user_version` 和实际表列信息。数据库 schema
25、26、27、28 共用目录读取合同，通过列是否存在选择可选能力；未知版本也按实际能力
判断，不因版本号较新而拒绝。官方 SQL 测试快照分别来自 Calibre 6.14.0、6.15.0、9.0.0、
9.16.0，来源与许可证见 [fixture 说明](../my-reader-core/tests/fixtures/calibre/README.md)。
这些测试验证 Core 的读取和同步，不代表各版本 Calibre 程序或原生客户端的端到端认证。

目录读取要求 `books.id/title/path` 和 `data.book/format/name/uncompressed_size`。
书库身份读取独立要求 `library_id.uuid`，阅读进度、收藏等操作不依赖目录字段。
完整书库检查和远程下载同时验证这两份合同。缺失必要字段时返回
`CALIBRE_SCHEMA_UNSUPPORTED`，包含数据库 schema 版本和缺失字段。

查询显式选择消费的字段，文件摘要和路径查询不解码无关书目元数据。可选书籍字段缺失时
返回空值，缺失 `sort` 时按 `title` 排序；可选元数据表或关联字段缺失时，该项返回空集合
或空值。ISBN 从 `identifiers` 读取，不依赖遗留 `books.isbn`；空评分表示未评分。
MyReader 自有 projection 仍由自身 migration 管理，不套用 Calibre 版本号。

远程数据库先写入临时文件，校验书库身份、必要字段和文件摘要，关闭数据库连接后再通过
同目录 rename 替换缓存。失败保留旧数据库、正文缓存和已记录的远端版本，并清理临时文件。
旧缓存存在 schema 不兼容时可以重新下载有效远端目录，此时保留无法可靠判断的旧正文文件。
每次打开替换后的数据库都会重新检测能力，不复用旧文件的 schema 判断。

### 6.2 MyReader 自有书库

MyReader 自有书库源包含 `.myreader/library.json`、
`Books/<storage-name> (<book-uuid 前 6 位>)/<storage-name>.<format>` 和按
[ADR-0020](./adr/0020-adopt-automerge-repo-storage-model.md) 存放的 Automerge StorageKey
对象。正文路径在导入时确定，后续修改书名或作者不会移动文件；旧版
`Books/<book-uuid>/book.<format>` 路径继续原样使用。marker、Automerge document 和设备本地
`library_id` projection 使用同一个稳定 `libraryUuid`。

Automerge catalog 是规范书目；`myreader.db` 中的 `library_id`、`books`、`authors`、
`books_authors_link` 和 `data` 只是可重建的 Calibre-shaped projection。每本书只有一个 EPUB、
PDF 或 CBZ 正文，稳定 `book_id` 和 `books.uuid` 同时供统一查询、Reader 与现有阅读数据引用。
MyReader 不生成、同步或写入 `metadata.db`，也不与 Calibre 书库互相转换。

移动端“应用内部存储”在 iOS、Android 上都将 MyReader 书库创建到应用容器
`Documents/libraries/<library-id>/`。iOS 另提供“本地存储”：通过系统目录选择器和
security-scoped bookmark 在用户目录创建或打开 MyReader 书库，也可打开只读 Calibre 书库；外部
源中的 `Books`、marker 和 Automerge StorageKey 保持原位，活动 `myreader.db` 留在应用容器
sidecar。Android 不提供外部本地书库入口，也不使用 SAF 私有镜像。远程数据源与单本图书导入入口
不受此平台差异影响；桌面本地目录书库继续使用桌面文件系统能力。

### 6.3 每书库 sidecar

每个书库拥有逻辑独立的 `.myreader/myreader.db`。远程书库和 iOS 外部本地书库在设备容器中维护
本地 sidecar，多设备通过 Automerge StorageKey 对象交换数据，不直接共享活动 SQLite/WAL/SHM。

业务表：

| 表 | 用途 |
|---|---|
| `library_id`、`books`、`authors`、`books_authors_link`、`data` | MyReader catalog 的本地查询 projection；Calibre 书库继续查询外部 `metadata.db` |
| `reading_progress` | Locator、展示进度、冲突投影和更新时间 |
| `favorite_books` | 收藏状态 |
| `bookmarks` | 书签 Locator、稳定位置键和 tombstone |
| `annotations` | 高亮、颜色、可选笔记和 tombstone |
| `reading_sessions` | 阅读时长区间 |
| `reading_completions` | 阅读完成记录 |
| `book_reading_format` | 设备选择的阅读格式 |
| `file_state` | 书籍/封面文件本地缓存状态 |
| `pending_book_imports` | 设备本地的远程正文待上传意图；上传成功后才允许对应 catalog outbox 发布 |
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

MyReader 自有书库的 Automerge document 同时承载 catalog 与以上六个阅读数据 domain；Calibre
书库的 document 只承载六个阅读数据 domain。两类书库共用同一 state、outbox、projection 和
调度实现。

### 6.4 Schema 权威

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

当前数据源为 Local、WebDAV 和 OneDrive。书库所有权与存储位置正交：`libraryType` 决定 catalog
权威和可用 command，`sourceType` / `dataSourceId` 决定对象所在后端。

远程 Calibre 书库继续先把外部只读 `metadata.db` 刷新到设备缓存，再查询书目并按需取得封面和
正文。远程 MyReader 书库不传输 `metadata.db`：创建或打开时读取 marker，并通过 Automerge
StorageKey 交换 catalog 与阅读数据。

MyReader 正文与 Automerge 是同一 DataSource 上的 content plane 与 control plane：

1. 导入先复制到设备暂存文件并由 core 计算 `size + sha256`。
2. 远程导入把正文和 catalog projection 先落到设备本地，`pending_book_imports` 保存稳定
   `book_id + books.uuid`，`file_state` 标记为 `dirty_push`；只要正文尚未上传并确认远端 size，
   既有 Automerge outbox 就保持不可发布。
3. 独立的 core `BookTransferService` 在后台重试正文上传，不占用 sidecar 同步任务。上传与 stat
   成功后将文件标记为 `present`、移除待上传意图，再调度一次短 push 发布原有 catalog change；
   待上传表不参与合并，也不是第二个 catalog。缺失的本地待上传文件只进入 `source_missing`，
   不会使 sidecar/Automerge 同步失败。
4. 其他设备合并 catalog 后将正文标记为 `remote_only`，打开或显式下载时写入同目录 `.part`，
   只有 size 与 SHA-256 都匹配后才原子安装并标记为 `present`。
5. 删除先把 Automerge tombstone 持久化到共享 DataSource，再幂等清理远端正文与各设备缓存。
6. 外部手动删文件只产生 `source_missing`，不会自动生成 catalog tombstone。

OneDrive 大文件写入由 OpenDAL OneDrive backend 使用 upload session 分块完成。设备本地
`file_state` 记录 `dirty_push`、`remote_only`、`present`、`source_missing` 和已验证的
`local_sha256`；正文 bytes 和传输中间状态不进入 Automerge document。

对象存储、Calibre 本体刷新与 Automerge 同步是不同语义；手动“全部同步”按书库类型编排实际需要
的 control-plane 阶段，自动同步由 durable outbox 和事件调度器驱动，正文传输由独立后台任务消费
设备本地传输队列。

### 7.2 Automerge sidecar

[ADR-0016](./adr/0016-adopt-automerge-for-library-sidecar-sync.md) 已落地：

- 每个书库一个 Automerge document。
- Calibre 书库同步收藏、阅读位置、书签、批注、阅读 session 和完成记录六个 domain；MyReader
  书库在同一 document 中再同步 catalog root。
- core 负责 change 因果关系、去重、冲突候选、SQLite projection、outbox 和收敛。
- 阅读位置真并发时保留候选；用户选择后写入因果上更新的 change。
- 同步完成后平台只负责刷新可见查询。

[ADR-0020](./adr/0020-adopt-automerge-repo-storage-model.md) 进一步规定：

- 远端采用 automerge-repo `StorageSubsystem` 的 snapshot/incremental `StorageKey`，直接映射到
  `.myreader/automerge/<document_id>/<kind>/<hash>`；`document_id` 是 Calibre `library_id.uuid`
  或 MyReader marker 中的 `libraryUuid`。
- core 负责 snapshot-first 加载、内容寻址增量和只删除 covered chunks 的并发安全压缩。

自动同步遵循 [ADR-0017](./adr/0017-event-driven-library-sidecar-sync-scheduling.md)：业务写入通知
平台 trigger，core 负责 debounce/max-wait、single-flight、pull freshness、retry/backoff、
suspend 和恢复规则；平台提供前后台、网络、书库切换、Reader 关闭和计时器事件。

同步阶段的失败类别由 Core 根据结构化存储错误决定，通过报告中的 `failureKind` 传递给平台。
临时网络故障和限流进入退避重试，凭据、配置和数据完整性问题暂停等待修复。平台不得根据
诊断消息重新判断已有类别；报告的 `error` 保留诊断信息，展示文案与国际化属于 UI。

移动 UniFFI 异常同样保留 `Config`、`NotFound`、`Credential`、`Request`、`DataIntegrity`
等类别；`Core` 仅用于 FFI 自身没有更具体类别的错误。同步适配器将这些类别转换为既有
`failureKind`，并通过 `cause` 保留原异常。诊断字符串不构成前端恢复策略的协议。

两端同步状态详情、移动手动同步弹窗与后台通知使用共享的 `syncFailureKeys` 按类别选择文案，
在展示时按当前语言翻译；旧记录缺少类别或类别未知时使用通用提示。诊断消息保留在同步
记录和日志中。同步详情在本地化说明后拼接既有错误类别和原始诊断，文本可选中复制；诊断不参与
文案选择或恢复策略，旧记录缺少类别时仍可展示原始消息。

书库探测、重复添加、文件未下载等需要不同处理的失败使用明确的 Core/Tauri/UniFFI 变体；
只有缺失 MyReader 标记时才允许探测其他书库格式，其他文件读取错误不能触发回退。
HTTP 状态与 TTS 错误类别保留到适配层，移动登录和下载使用原生错误码识别取消与网络失败。
桌面下载、上传事件在诊断 `error` 旁携带结构化 `failure`；移动下载的 UI 状态保留原异常。
旧事件缺少类别时安全回退，不能从诊断字符串推断类别。

其他错误提示使用共享的 `errorMessageKey` 和两端 UI 展示适配器，书库、数据源、下载、阅读器、
TTS 设置与播放先展示本地化建议，再换行拼接原始错误类型、消息及 cause 链。桌面文本可选中复制，
移动原生错误弹窗提供复制完整消息的按钮。诊断内容不用于策略判断。Core 和基础设施不依赖 UI 翻译。
`react-native-app-auth` 的仓库补丁将 AppAuth 原生取消与网络类别传入 JS，保留原始异常为 `cause`；
不再匹配系统本地化错误描述。

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

1. **Calibre 只读**：不把 MyReader 字段写进 `metadata.db`，不把 Calibre 书库升级为可写书库。
2. **MyReader 独立所有权**：marker + Automerge catalog 定义 MyReader 书库；复用表形状不等于
   Calibre 兼容，也不提供两类书库转换。
3. **每书库数据域**：业务数据随书库隔离，不建立中央 Profile 数据库。
4. **共享业务，不共享渲染**：core 统一后端；UI、Navigator 和系统能力归平台。
5. **单一数据库 writer**：desktop/mobile 通过 core 访问 MyReader SQLite。
6. **Rust migration 权威**：不恢复 TypeScript/Drizzle schema 链或 Entity-First schema sync。
7. **凭据设备本地化**：secret 不进入 sidecar、Automerge 或可持久前端 DTO。
8. **远端交换 change，不共享 SQLite**。
9. **不预想功能**：评分、书架、账户、中心 Profile、跨书库统计等不存在的能力不进入当前架构。

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
高频查询参考值见 [my-reader-core 运行基线](./my-reader-core-runtime-baseline.md)。

## 11. 相关 ADR

| ADR | 当前关系 |
|---|---|
| [ADR-0005](./adr/0005-adopt-readium-reader-architecture.md) | 当前 Reader 架构基础 |
| [ADR-0006](./adr/0006-desktop-typed-ipc-and-layered-backend.md) | 桌面类型 IPC 与后端分层基础 |
| [ADR-0007](./adr/0007-pnpm-monorepo-and-shared-code-ownership.md) | monorepo 与语义共享原则 |
| [ADR-0008](./adr/0008-shared-database-schema-authority.md) | 已由 ADR-0019 取代，保留历史 |
| [ADR-0013](./adr/0013-maintain-mobile-readium-integration.md) | 移动 Readium 集成所有权 |
| [ADR-0016](./adr/0016-adopt-automerge-for-library-sidecar-sync.md) | 当前 Automerge 同步内核 |
| [ADR-0017](./adr/0017-event-driven-library-sidecar-sync-scheduling.md) | 当前自动同步调度语义 |
| [ADR-0018](./adr/0018-shared-rust-components.md) | 共享 Rust/UniFFI 试点，crate 组织由 ADR-0019 部分取代 |
| [ADR-0019](./adr/0019-adopt-modular-my-reader-core.md) | 当前共享后端和数据库权威 |
| [ADR-0020](./adr/0020-adopt-automerge-repo-storage-model.md) | 当前 Automerge 远端存储、压缩和故障恢复模型 |
| [ADR-0021](./adr/0021-support-myreader-managed-libraries.md) | 当前 MyReader 自有书库、catalog projection 与正文同步模型 |
| [ADR-0022](./adr/0022-adopt-readium-tts-and-core-provider-architecture.md) | 当前 Readium TTS 会话与 Core provider 所有权 |
