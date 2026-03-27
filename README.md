# MyReader

> 一款 Local-First 的跨平台电子书阅读器，基于 Calibre 书库浏览，内置多格式阅读器与 TTS 朗读，并集成 ComfyUI 创意生成能力。

---

## 特性一览

### 📚 Calibre 书库浏览

- 直接读取 Calibre 的 `metadata.db`，无需额外导入即可浏览完整书库
- 支持配置**多个书库路径**，在同一界面切换浏览不同藏书
- 保留 Calibre 元数据体系：作者、标签、系列、评分、出版社等维度筛选与搜索
- 书籍封面网格 / 列表 / 书架多种视图模式

### 📖 内置多格式阅读器

- 支持主流电子书格式：EPUB、PDF、MOBI、AZW3、TXT、DOCX、Markdown、FB2、HTML、CBZ/CBR/CBT/CB7
- 三种阅读模式：单页、双页、滚动
- 可自定义字体、字号、行距、边距、主题配色
- 高亮批注、书签、阅读进度自动记录
- 全文搜索与章节目录导航

### 🔊 TTS 语音朗读

- 支持配置外部 TTS 引擎 API 接口（Azure、OpenAI TTS、Edge TTS、自建服务等）
- 朗读时**实时高亮当前阅读文本**，视觉跟踪朗读位置
- 进度条拖动，精确调整朗读进度
- 可调语速、音色、语言，支持多角色语音切换
- 后台朗读模式，锁屏继续播放

### 💾 Local First

- 数据优先存储在本地，离线状态下完全可用
- 阅读进度、笔记、书签等数据使用本地 SQLite 持久化
- 支持将数据同步至用户网盘（WebDAV、S3、OneDrive、Google Drive、Dropbox）
- 无需注册账号，数据完全由用户掌控
- 支持数据导出与备份还原

### 🖥️ 跨平台

- **桌面端**：Windows、macOS、Linux（基于 Tauri 2）
- **移动端**：Android、iOS（基于 React Native / Expo）
- 共享核心阅读引擎与 UI 组件，多端体验一致

### 📱 移动端优质阅读体验

- 流畅手势交互：左右滑动翻页、上下滑动滚动、双指缩放
- 仿真翻页动画，模拟纸质书翻页效果
- 自适应屏幕尺寸，针对手机与平板分别优化布局
- 触控区域可自定义（点击翻页区域划分）
- 全屏沉浸式阅读模式

### 🎨 ComfyUI 创意生成

- 可配置 ComfyUI API 接入地址
- 支持根据书籍内容或选中文本生成插图（图像生成）
- 支持生成视频片段（视频生成），用于可视化场景描写
- 内置工作流模板，支持自定义 ComfyUI 工作流
- 生成结果可保存至书籍笔记或独立画廊

---

## 快速开始

### 环境要求

- Node.js >= 20
- Rust >= 1.75（桌面端构建）
- pnpm >= 9

### 开发

```bash
# 克隆项目
git clone https://github.com/your-username/MyReader.git
cd MyReader

# 安装依赖
pnpm install

# 启动桌面端开发模式
pnpm dev:desktop

# 启动移动端开发模式
pnpm dev:mobile
```

### 构建

```bash
# 桌面端构建
pnpm build:desktop

# 移动端构建
pnpm build:mobile
```

### 测试

```bash
# 运行 Playwright E2E 测试
pnpm test:e2e

# Playwright UI 模式（可视化调试）
pnpm test:e2e:ui
```

---

## 技术栈

| 类别 | 技术 |
|------|------|
| UI 框架 | React 19 + TypeScript (Hooks) |
| UI 组件 | shadcn/ui + Tailwind CSS 4 |
| 桌面端 | Tauri 2 (Rust) |
| 移动端 | React Native / Expo |
| 状态管理 | Zustand |
| 本地数据库 | SQLite (sqlx / better-sqlite3) |
| 阅读引擎 | 自研渲染引擎 (MyReader Engine) |
| TTS 集成 | 可配置 REST API 客户端 |
| 创意生成 | ComfyUI WebSocket/REST API |
| 云同步 | WebDAV / S3 / OneDrive / Google Drive / Dropbox |
| 构建工具 | Vite 6 |
| E2E 测试 | Playwright |

---

## 项目文档

- [架构文档](./ARCHITECTURE.md) — 系统架构、模块设计与技术决策

---

## 许可证

[AGPL-3.0](./LICENSE)
