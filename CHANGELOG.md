# Changelog

All notable changes to MyReader are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/).
Versioning follows [Semantic Versioning](https://semver.org/).

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
