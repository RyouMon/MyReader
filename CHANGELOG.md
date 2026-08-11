# Changelog

All notable changes to MyReader are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/).
Versioning follows [Semantic Versioning](https://semver.org/).

## [0.12.0] - 2026-08-11

### Breaking Changes

- MyReader 受管书库改为由应用容器持有固定路径和文件名；早期开发版创建的受管书库需要重建
- Android 不再保留或迁移 SAF 外部目录书库，改用应用内部受管书库；iOS 继续支持用户授权的本地目录

### Mobile

#### Added

- 新增 MyReader 受管书库、书籍导入、元数据编辑、书集导航、书库切换与传输队列
- 支持从系统分享入口导入 EPUB、PDF、CBZ 与 ZIP，并加入 iOS Share Extension
- 新增书库同步状态页、上传进度与失败恢复提示

#### Changed

- 统一新增书库流程、数据源身份与恢复语义，并将本地文件访问收敛到平台服务层
- Android 本地书库改为应用容器所有；iOS 本地书库继续使用 security-scoped bookmark
- 应用显示名称统一为 `MyReader`

#### Fixed

- 修复 Android `content://` 导入、SAF 覆盖、删除操作颜色，以及移动端同步协调器生命周期
- 修复后台上传排队、OneDrive 并发冲突与书库管理流程收敛

### Desktop

#### Added

- 新增 MyReader 受管书库、本地优先导入、书集导航、传输状态与书库同步状态

#### Changed

- 统一新增书库、数据源身份和恢复流程；应用显示名称统一为 `MyReader`

#### Fixed

- 修复下载状态建模、表单引用转发、Dialog overlay 引用和状态图标可访问性

### Shared

#### Added

- 共享 Rust Core 新增受管书库、出版物分析、书籍传输与 SHA-256 文件状态
- 新增跨端书集模型、pending import 持久化和 v2 library sidecar schema
- 更新 MyReader 应用图标与跨端品牌资源

#### Changed

- 统一跨端书籍导入、上传、冲突重试、集合与书库恢复合同

### Build

- 新增 GitHub Actions 发布候选流水线：生成 macOS、Windows、Linux 安装包与 Android APK 产物
- iOS production 构建改由 EAS Build 签名，并通过 EAS Submit 分发到 TestFlight 内部测试组

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
