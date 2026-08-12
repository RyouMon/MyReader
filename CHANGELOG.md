# Changelog

All notable changes to MyReader are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [0.12.0] - 2026-08-12

### Highlights

- 新增由 MyReader 创建、管理并同步的可写书库；不使用 Calibre 的用户现在也可以直接导入、阅读和
  管理自己的图书
- 打通里程碑版本的交付链路：iOS 内部 TestFlight、可直接安装的 Android APK，以及 macOS、
  Windows、Linux 桌面安装包

### Breaking Changes

- MyReader 书库 catalog 升级为需要不可变 `path` 与 `name` 的 v2 schema；仅使用过 0.12.0 早期
  开发构建的用户需要删除并重建当时创建的 MyReader 书库
- Android 不再支持或迁移早期开发构建中的 SAF 外部目录书库；需手动移除旧注册，并在应用内部
  存储中重建书库。iOS 仍支持通过 security-scoped bookmark 持久授权的外部本地目录

> 升级说明：正常从 0.11.0 升级的 Calibre 书库继续保持只读，不需要转换为 MyReader 书库。

### Managed MyReader Libraries

#### Added

- 新增独立的 `myreader` 书库类型，与现有只读 `calibre` 书库共享 Library、Book、Reader、
  DataSource 和同步模型，但不生成、同步或修改 Calibre `metadata.db`
- 支持创建多个 MyReader 书库，并在本地、WebDAV 与 OneDrive 数据源创建或打开书库；打开已有
  书库时自动识别 MyReader 与 Calibre 类型
- 支持向 MyReader 书库导入、阅读和删除 EPUB、PDF、CBZ，并修改书名与作者；当前每本导入图书
  只包含一种格式
- 新增共享出版物分析：EPUB 读取内嵌元数据与声明封面，PDF 读取标题、作者并渲染第一页封面，
  CBZ 读取 `ComicInfo.xml` 并使用首张图片；解析失败时回退到文件名和未知作者
- 新增“全部图书”“最近阅读”“收藏”“已下载”书集，以及按需显示的“正在下载”“正在上传”
  和“仅本机”书集，桌面端与移动端使用一致的名称和筛选语义
- 新增远程图书按需下载、后台上传、上传进度、失败状态、手动重试和设备本地待上传队列

#### Changed

- MyReader catalog 与收藏、阅读位置、书签、批注、阅读会话和完成记录共用同一个 Automerge
  document；v2 sidecar schema 增加 catalog root，并继续投影到设备本地的 Calibre-shaped 查询表
- 导入后的正文使用稳定且不可变的目录与文件名；修改书名或作者不会移动正文，也不会改变图书身份
- 文件完整性由旧的 BLAKE3 状态迁移为跨端统一的流式 SHA-256；下载先写入 `.part`，校验大小和
  SHA-256 后再原子安装
- 远程导入改为本地优先：正文在当前设备可立即阅读，只有正文与可选封面上传并确认后，catalog
  变更才会发布给其他设备
- 删除远程图书时先同步 Automerge tombstone，再清理远端正文和设备缓存；远端文件意外缺失不会
  自动删除 catalog 记录
- 删除应用内部书库会同时删除由 MyReader 拥有的完整容器；移除 iOS 外部目录、桌面外部目录或
  远程书库时保留源文件

#### Fixed

- 上传请求会保留到运行时监听器就绪，并会在导入、手动同步和显式上传后启动，避免启动时漏掉任务
- OneDrive 大文件上传改用可恢复 upload session 和唯一暂存对象，发布到最终路径后再校验，避免
  并发或重试占用最终文件路径
- 为并发导入分配独立的 catalog 身份与正文路径，避免重复导入发生覆盖或冲突

### Mobile

#### Added

- iOS 与 Android 均可在应用内部存储创建 MyReader 书库；iOS 还可在用户授权的外部目录创建或
  打开本地 MyReader / Calibre 书库，Android 保持应用内部存储模式
- 新增 iOS Share Extension 与 Android 系统分享入口，可将单个 EPUB、PDF 或 CBZ 文件直接导入
  MyReader；没有可写书库时会先保留待导入文件，引导完成普通创建流程后继续导入
- 新增文件选择器导入、图书元数据编辑、删除图书、书库切换页、书集导航和传输状态入口
- 新增当前书库同步状态页，显示同步阶段、触发原因、进度、最近结果和失败原因，并支持手动同步
- 新增 WebDAV 重新配置与 OneDrive 重新登录入口，以及凭据失效、数据源缺失和书库缺失的可操作
  恢复状态

#### Changed

- “创建新书库”和“打开已有书库”改为连续流程，可在流程内选择应用内部、本地或远程位置、添加
  数据源、浏览目录并为远程新书库指定子目录
- 本地文件、目录选择和 security-scoped access 收敛到平台服务层，业务层不再直接操作文件系统
- 统一 MyReader / Calibre 书库与本地 / WebDAV / OneDrive 数据源的身份图标、空状态和帮助文案

#### Fixed

- 修复 Android 文档选择器返回 `content://` URI 时丢失原始文件扩展名、导致 EPUB、PDF 或 CBZ
  被误判为不支持格式的问题
- 修复 Android 从系统文档提供程序复制并覆盖文件时使用失效句柄的问题
- 修复同步协调器销毁后仍可能继续调度、应用结果或报告错误的问题，并稳定同步提示胶囊的进入和
  退出动画
- 修复 Expo Compose 标题栏无法序列化 React Native 平台颜色、导致删除操作未显示危险色的问题
- 修复添加书库表单再次打开后已持久化书库可能不显示，以及根路由下添加/关闭操作不稳定的问题

### Desktop

#### Added

- 支持在本地目录、WebDAV 和 OneDrive 创建 MyReader 书库，或打开已有 MyReader / Calibre
  书库；远程浏览器可在当前位置创建命名子目录
- 新增本地优先导入：先提取元数据，再并行复制、计算摘要和生成封面；远程上传在后台继续时，图书
  已可在当前设备阅读
- 新增图书导入、书名与作者编辑、删除、上传、失败重试，以及“仅本机”和传输进度显示
- 侧边栏新增跨端一致的主要书集、传输书集与存储状态书集；空的临时书集会自动隐藏
- 新增当前书库同步状态面板，展示阶段、原因、最近结果、错误与手动同步操作

#### Changed

- 添加书库流程统一为“创建”或“打开”，并明确区分 MyReader 可写书库与 Calibre 只读书库
- 书库、数据源、Reader 与同步状态使用共享文案和语义图标，并提供缺失路径、无效凭据和重新授权
  等恢复入口

#### Fixed

- 明确下载任务认领、取消、失败和文件状态映射，避免缺失取消令牌或重复请求留下不一致状态
- 修复输入框与 Dialog overlay 的 ref 转发，使表单、焦点和浮层组合可以正确连接底层元素
- 仅图标显示的下载状态现在具有明确的无障碍角色和标签；装饰图标不再被屏幕阅读器重复朗读

### Branding and Shared UX

- 桌面端窗口、安装包和移动端显示名称由默认的 `my-reader` / `my-reader-mobile` 统一为 `MyReader`
- 新增统一的 MyReader 应用图标、macOS/Windows 桌面图标、iOS 图标、Android adaptive / monochrome
  图标与启动画面资源
- 新增 MyReader 与 Calibre 书库图标，并为本地、WebDAV、OneDrive 数据源补充共享语义颜色
- 统一跨端书库、书集、同步、Reader 空状态和错误恢复文案，补齐中英文资源合同

### Shared Core and Data

#### Added

- 共享 Rust Core 新增 MyReader 书库身份校验、catalog command、Calibre-shaped projection、出版物
  分析、内容传输、后台上传调度和本地文件状态服务
- 新增 `pending_book_imports` 持久化队列、SHA-256 文件状态 migration、catalog projection migration
  和 Automerge v1 → v2 互操作 fixture
- 扩展 UniFFI / JSI / Tauri 接口及生成绑定，使桌面端和移动端调用同一套创建、打开、导入、编辑、
  删除、上传、下载与同步合同

#### Changed

- Tauri Commands 与移动端适配器只负责平台路径、配置和 IPC，书库所有权校验、catalog 事务、
  传输状态与同步调度统一由共享 Core 负责
- 共享类型新增 `libraryType`、书集 ID、同步状态与传输状态，并统一 Reader locator、catalog DTO、
  React Native CSS interop 和原生 bridge 的类型边界

### Build and Distribution

- 新增 GitHub Actions 发布候选流水线；先运行 fonts、i18n、tools、桌面端、移动端和 Rust workspace
  的完整单元测试，全部通过后才并行构建各平台
- macOS 同时生成 Apple Silicon 与 Intel DMG；应用和磁盘镜像使用 Developer ID 签名，并完成
  Apple 公证、staple 与 Gatekeeper 校验
- Windows x64 同时生成 MSI 与 NSIS `setup.exe`；Linux x64 同时生成 AppImage、DEB 与 RPM
- Android 通过 EAS Build 生成可直接安装的签名 APK，并随 GitHub 产物提供 SHA-256 校验文件
- iOS 通过 EAS Build 生成 App Store distribution 构建，再由 EAS Submit 自动上传到 App Store
  Connect 的内部 TestFlight 测试组
- 手动运行作为候选验证，不创建 GitHub Release；GitHub Actions 桌面端与 APK 产物保留 30 天。
  仅 `v*` 标签在测试、桌面构建、APK 和 TestFlight 全部成功后创建 GitHub Release，并附加所有
  桌面安装包、APK 与校验文件
- 同一分支的新候选会取消旧候选，正式标签构建不会被后续运行取代；Apple 凭据仅注入 macOS
  签名步骤，未配置签名时的手动候选仍可使用 ad-hoc 签名
- 修复 EAS archive 遗漏 Cargo workspace metadata、Intel iOS simulator Rust target 和移动端图标资源
  的问题，并降低 GitHub Runner 上 Rust 测试的磁盘占用
- 修复 EAS Submit 内部 TestFlight 分组参数与 macOS DMG 二次公证流程

### Engineering and Documentation

- 补充本地 EPUB / PDF / CBZ 导入、重启持久化和删除，以及 WebDAV / OneDrive MyReader 书库的
  Maestro E2E 流程与 fixture 准备脚本
- 加强桌面下载、移动同步、书库管理、书集、共享文案、文件路径、传输队列和 Core migration 的
  单元与合同测试
- 收紧桌面 Reader locator 与 iframe callback、移动端 Reader / catalog / CSS interop、header
  action 和 Zustand slice 测试工具的类型边界
- 新增 ADR-0021 并更新架构文档，记录 MyReader 书库、Calibre 只读边界、平台存储所有权、远程
  传输顺序与 Automerge catalog 设计

## [0.11.0] - 2026-07-31

### Breaking Changes

- 应用配置改由 `my-reader-core` 的单一 `config.json` 管理；移动端旧版 Zustand 配置以及开发期的
  `device-registry.json` / `device-library-state.json` 不会迁移，升级后需重新添加或授权数据源、
  书库，并检查本机偏好
- 远端 sidecar 改用 `.myreader/automerge/<document_id>/<kind>/<hash>` StorageKey 布局；旧远端
  sidecar 与本地传输状态不再读取或迁移，旧目录也不会自动删除；已有本地 Automerge 文档与业务
  数据会保留，并在新空间首次同步时发布完整 snapshot

### Mobile

#### Changed

- 书库注册、Calibre 书目、内容状态、阅读数据、下载和同步统一切换到共享 Rust Core，通过生成的
  UniFFI/JSI typed binding 调用
- 移除 TypeScript 数据库、repository 和旧同步后端，由 Core 统一执行 SQLite migration、事务和
  连接生命周期
- 阅读完成、格式选择、进度换算、Locator 规范化与阅读 session 批处理改用跨端一致规则

#### Fixed

- 修复 OneDrive 根目录浏览、书库注册与当前 sandbox 路径解析
- 修复首页无阅读记录时的空状态、封面缓存复用，以及删除书库和数据源后的状态收敛

#### Build

- 修复 EAS iOS / Android production 构建所需的 Rust target、Cargo NDK、Core binding、MMKV
  Pod 配置和 Sentry 上传流程

### Desktop

#### Changed

- Tauri Commands 收敛为共享 Core 的平台适配层，统一数据源、书库、书目、阅读、下载和同步语义
- 应用数据库、配置持久化与 sidecar 同步改由 Core 统一管理

### Shared

#### Added

- 新增模块化 `my-reader-core`，集中维护跨端数据库、书库、Calibre catalog、内容、阅读与同步业务
- 新增共享 `@my-reader/i18n` 资源，统一桌面端和移动端中英文文案
- 建立 Core runtime、生成 binding 和跨端合同的验收基线

#### Changed

- MyReader 数据库 schema 与 migration 权威迁移到 Rust / SeaORM，并为旧移动 Drizzle migration
  状态提供一次性 handoff
- sidecar 同步采用 automerge-repo StorageKey、内容寻址 snapshot / incremental 与并发安全压缩
- 自动同步时机、远端目标解析、下载协调和阅读数据投影统一由 Core 管理

## [0.10.0] - 2026-07-27

### Breaking Changes

- 书库 sidecar 同步切换为 Automerge；旧 `.myreader/changes/` 和
  `.myreader/changes-v4/` 不再读取
- 升级会保留本机现有业务数据，但不会迁移旧同步状态和远端变更；既有记录在下次修改后才会进入
  Automerge 同步

### Mobile

#### Added

- sidecar 变化后自动安排上传，并支持应用进入后台后继续完成上传

#### Changed

- 通过原生 UniFFI/JSI bridge 在 Hermes 上运行 Automerge
- 阅读进度、收藏、书签、批注和阅读统计由 Automerge document 与本地 SQLite projection
  原子更新
- 数据库 migration 改为事务执行，失败后完整回滚并可重试

### Desktop

#### Added

- 从应用启动、书库切换、阅读器关闭和本地写入事件自动安排 sidecar 同步
- 同步跨设备阅读统计，并保留并发阅读位置供后续选择

### Shared

#### Added

- 基于 Automerge 的跨设备阅读进度、收藏、书签、批注、阅读会话与完成记录同步
- 持久化 document、不可变增量、outbox、receipt 和 projection metadata，支持崩溃恢复与幂等重放
- 同步诊断快照，以及跨 Rust、TypeScript 和原生 bridge 的互操作 fixture

#### Changed

- 以 Automerge 因果历史和冲突保留取代自研 HLC/JSON segment 合并
- 同步改为事件驱动调度，合并 debounce、single-flight、重试和 pull/push 模式升级
- 根据应用生命周期、书库上下文和网络状态触发 pull，并每分钟轮询活跃书库的远端变化

## [0.9.0] - 2026-07-23

### Breaking Changes

- 桌面端旧版远程缓存与 Entity-First 数据库不再迁移，受影响的本地状态需重新创建
- 桌面端 OneDrive refresh token 改用数据源 ID 命名，已有数据源需重新授权或创建
- 书签升级为正文范围锚点；旧版书签键和同步游标不再读取，已有远程书库需移除后重新添加

### Mobile

#### Added

- 阅读统计：阅读时长、趋势、年度热力图与完成记录
- 首页最近阅读书架与卡片样式设置
- 书籍收藏与筛选、格式文件分享、默认阅读格式持久化
- 固定版式阅读偏好、阅读进度拖动，以及更自然的原生开合书过渡

#### Changed

- Readium 集成由外部 fork 迁移为自维护 Expo Module，开放出版物、解析器与后续扩展能力
- 重设计书籍详情与自适应封面 Hero；阅读器面板迁移为原生 Sheet
- 优化封面缩略图缓存、骨架屏与列表渲染，降低冷启动和滚动开销

#### Fixed

- 修复预览版 EAS 构建、Android 详情页按钮和首页菜单交互
- 修复嵌套目录定位、iOS PDF 缩放与滚动条、Sheet 状态卡住
- 启动时立即应用已保存语言；添加远程书库时同步阅读进度

### Desktop

#### Added

- OneDrive 数据源、目录浏览与远程书库支持
- 自适应列表—详情工作区、最近阅读、收藏、默认格式和逐格式下载状态
- 浅色/深色/跟随系统主题与界面语言设置
- 沉浸式 EPUB/PDF/CBZ 阅读窗口；PDF/CBZ 支持触控板、滚轮、捏合、拖动和双击缩放

#### Changed

- 统一远程存储与同步编排，Tauri 命令下沉到服务层，应用数据库查询迁移至 SeaORM
- 重做设置、侧边栏、书籍详情与封面加载流程
- 批量缓存封面、文件状态和分页书目，改善大型书库加载与窗口缩放性能

#### Fixed

- 修复 EPUB 图片跨页断裂、PDF 页面缩放/旋转错误和 Windows 阅读器 Chrome
- 保持详情切换与窗口变化时的书库滚动锚点
- 修复重复下载、缺失远程封面缓存与 OneDrive 并发凭证读取

### Shared

#### Added

- 跨桌面与移动端的书签、全文搜索、高亮和笔记
- 按内容语言提供阅读字体选项

#### Changed

- 统一跨端阅读主题、目录定位与可见正文锚点；字体和版式变化后恢复原阅读位置
- 阅读显示进度与 Readium Locator 分离，短书按实际位置显示一致百分比
- 设计系统收敛为颜色 token，并更新为暖中性色与陶土色强调色

#### Fixed

- 书签改用精确 DOM 范围，避免相邻页误判并提升重排后的定位稳定性
- 标注按全书位置排序，笔记标记兼容 XHTML

## [0.8.0] - 2026-06-13

### Mobile

#### Added

- Expo SDK 55 → 56 升级
- 设置页 SettingsRow 图标、书库添加通知
- 书库搜索移至原生 Header
- OneDrive OAuth scheme 分离、登录后进度反馈

#### Changed

- 统一屏幕 Header 策略（Android/iOS）
- 远程目录浏览器合并、设置分区简化

#### Fixed

- Readium NDK27 C++ 编译
- Dynamic Type 布局漂移、SettingsRow 按压/分隔线
- Android 隐藏本地书库选项、Reader chrome 原生 onTap

### Shared

#### Build

- `react-native-readium` git submodule

#### Fixed

- 浅色背景层级 token 对调

## [0.7.0] - 2026-05-30

### Mobile

#### Added

- OneDrive 远程书库（OAuth、目录浏览、书籍下载）
- i18n（zh/en）
- RemoteBackend 统一接口（WebDAV + OneDrive）
- AuthCache、CoverMirror、etag 增量 metadata 检测
- ESLint 三层边界规则（domain/features/services）
- 下载进度环动画

#### Changed

- Zustand 数据态迁移至 React Query
- 架构重构：domain → repos → services
- 凭证集中至 SecureStore
- 封面改为 remote URL；每库数据目录 `libraries/{id}`

#### Fixed

- OneDrive 书籍下载、metadata.db 404 路径重复前缀
- 书库切换阻塞、React 19 ReactNode 类型错误

### Desktop

#### Changed

- Zustand 数据态迁移至 React Query
- 凭证存储迁移至 macOS Keyring

### Shared

#### Added

- OneDrive 数据源类型定义（`packages/tools`；Desktop 仅有查询层映射，非完整集成）

## [0.6.0] - 2026-05-17

### Desktop

#### Added

- WebDAV Calibre 书库导入

#### Changed

- Rust 后端 tracing、结构化错误、IPC 瘦身
- RTL-safe 布局（logical CSS）

### Shared

#### Added

- pnpm workspaces monorepo（`my-reader` / `my-reader-mobile` / `packages/*`）
- `packages/db` 共享 Calibre metadata.db schema（SeaORM）
- per-library 阅读进度 DB + LWW 同步

#### Changed

- 共享类型移入 `@my-reader/tools`

#### Build

- Husky + lint-staged

## [0.5.0] - 2026-05-13

### Mobile

#### Added

- EPUB/PDF/CBZ 全面迁移至 Readium

#### Changed

- feature-based 目录 + NativeWind 迁移

#### Fixed

- Android Readium desugaring / networkSecurityConfig / abiFilters

#### Test

- Maestro 阅读器 chrome E2E

### Desktop

#### Added

- Readium 集成（publication/manifest/locator 进度）
- 阅读器滚动模式、主题预设、设置控件
- i18n 基础设施 + ARIA + reduced-motion

#### Changed

- 后端引入 Repository + Service 分层
- 前端统一 tauri-specta 生成 API

#### Test

- Playwright + Gherkin BDD 测试框架

### Shared

#### Changed

- 移除自研 reader-core / foliate-js 遗留引擎
- 阅读进度统一为 Readium Locator

## [0.4.0] - 2026-04-23

### Mobile

#### Added

- WebDAV 远程书库、原生传输队列、直链格式下载
- 书籍详情 Modal 滑动分页、原生菜单操作

#### Test

- Maestro/Jest 测试管线

#### Fixed

- WebDAV 连接探测、同步生命周期、连接测试 UX

### Desktop

#### Added

- WebDAV 数据源管理（TanStack Form）
- Sync Phase 2 完整 rollout
- 书库 grid/list 视图、骨架屏、下载菜单

#### Fixed

- WebDAV 表单死锁、添加书库死锁、中文乱码

### Shared

#### Added

- 设计系统 token 全量对齐 + 自动 sync 脚本

## [0.3.0] - 2026-04-12

### Mobile

#### Added

- Expo 移动应用（SDK 55）、NativeWind
- 本地 Calibre 书库浏览、书库详情、删除书库
- iOS Security-Scoped Bookmarks
- FixedLayout 阅读器、EPUB/PDF/CBZ 移动阅读
- 阅读器 Chrome UI、原生漫画阅读器
- Dev Client / EAS 构建链

#### Changed

- `react-native-pdf` 替换 pdf.js
- 仅 iOS/Android（移除 Web 支持）

#### Fixed

- 路由层级、PDF/CBZ 阅读器、iOS CBZ 解压黑屏
- 固定版式捏合/点按手势误触
- EAS iOS 归档 Metro/RN prebuilt 问题

### Shared

#### Added

- `@my-reader/tools` 共享包抽取

#### Changed

- Reader V2 架构六阶段迁移（A–F），移除 ArrayBuffer 书源

## [0.2.0] - 2026-04-08

### Desktop

#### Added

- 独立窗口阅读模式
- 阅读进度恢复、全书加权进度
- 滚动/分页锚点同步
- Zustand 阅读偏好持久化
- 双列渲染、窗口 resize 防抖 + 骨架屏
- 日志插件（前后端同步）

#### Changed

- 阅读器组件重构（TextReader/ComicReader 统一接口）
- 目录/书签位置调整

#### Fixed

- 章节解析、书内超链接跳转
- 漫画滚动模式高度裁切

### Shared

#### Added

- 设计文档与语义 token 初版

## [0.1.0] - 2026-04-01

### Desktop

#### Added

- Tauri 2 + React + Vite 项目初始化
- Calibre 书库主界面、设置、书籍详情
- 后端分页 + 前端虚拟滚动
- EPUB / PDF / CBZ 自研阅读器初版
- 渐进式分页系统与 benchmark 页

#### Fixed

- Sidebar 横向滚动问题
