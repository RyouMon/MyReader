# Changelog

All notable changes to MyReader are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/).
Versioning follows [Semantic Versioning](https://semver.org/).

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
