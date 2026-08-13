---
version: alpha
name: MyReader
description: >
  植根于 Calibre 工作流的 Local-First 阅读产品。以内容为核心，采用温暖的编辑风格，
  为桌面端与移动端的长时间阅读和从容的书库管理而设计。
colors:
  primary: "#b5651d"
  secondary: "#A87E62"
  bg: "#f5efe6"
  bg-secondary: "#f0e8db"
  ink-1: "#3b2f2f"
  ink-2: "#7a6b5d"
  ink-inverse: "#faf5ef"
  success: "#3A7D5A"
  warning: "#C4922D"
  danger: "#b44a3a"
  border: "#ddd2c0"
  border-strong: "#d9cebb"
  brand-onedrive: "#0078d4"
  data-source-local: "#64748b"
  data-source-webdav: "#0f766e"

---

<div align="right"><a href="./DESIGN_EN.md">English</a></div>

# MyReader 设计系统

## 概述

MyReader 是一套**安静的编辑式阅读系统**：Local-First、由 Calibre 工作流驱动并覆盖多个平台。主要用户是重视长时间阅读的可读性、跨设备连续性和从容交互的深度阅读者。

**氛围：** 温暖、克制、低干扰、以内容为主。界面首先应当像良好的阅读环境，其次才是工具界面。

**品牌语气：** 平静、准确、尊重用户。微文案简短、直接；错误状态面向恢复，不制造焦虑。

### 设计系统范围

产品设计系统**只控制颜色**。间距、圆角、字体、阴影和字号层级统一交给 Tailwind / NativeWind 默认工具类，保持系统精简，并避免重复定义平台语义。

### 平台层级

- **共享层**（本文档）：美学方向、品牌语气、语义颜色和无障碍基线。
- **`my-reader/src/design-tokens.css`**：桌面端语义颜色 CSS 自定义属性。
- **`my-reader/src/index.css`**：Tailwind v4 `@theme inline` 颜色映射。
- **`my-reader-mobile/src/design/tokens.tsx`**：移动端 JS 颜色表。
- **`my-reader-mobile/src/design/reader-tokens.ts`**：阅读器 chrome 颜色层。

### 代码权威来源

- `.agents/skills/myreader-design-system/colors_and_type.css`：机器可读的规范颜色值。
- `my-reader/src/design-tokens.css`：桌面端 CSS 实现。
- `my-reader/src/index.css`：Tailwind v4 `@theme inline` 映射。
- `my-reader-mobile/src/design/tokens.tsx`：移动端 JS 颜色表。
- `my-reader-mobile/src/design/reader-tokens.ts`：阅读器 chrome token 层。

---

## 颜色

整体采用温暖的中性色和陶土色强调色。两级正文颜色建立信息层级，三级表面颜色建立深度，语义反馈色表达状态。

- **Background（`#F7F3EC`）：** 暖纸色，作为页面底色。
- **Background Subtle（`#F0EBE1`）：** 轻微后退，用于侧栏和次级面板。
- **Surface（`#FFFFFF`）：** 卡片、弹窗和悬浮面板，在背景之上形成清晰抬升。
- **Surface-2（`#F5F1EA`）：** 面板内交替行与悬停背景。
- **Surface-3（`#EDE8DF`）：** 按下或选中状态背景。
- **Ink-1（`#1C1714`）：** 主文字，接近黑色且偏暖，提供最高可读性。
- **Ink-2（`#5C5349`）：** 次要文字，用于元数据、标签和说明。
- **Ink-3（`#9C9089`）：** 三级文字，用于禁用、占位和装饰信息。
- **Ink-4（`#C4B8AE`）：** 最弱但仍可读的文字层级。
- **Ink Inverse（`#FAF6F0`）：** 深色或强调色表面上的文字。
- **Accent（`#C4622D`）：** 陶土色，唯一的主要交互色，用于主按钮、进度、激活状态和链接；应节制使用。
- **Accent Soft（`#F5E8DF`）：** 徽章和选中行的浅强调背景。
- **Accent Muted（`#E8C9B5`）：** 带强调色的边框或分隔线。
- **Success（`#3A7D5A`）：** 确认、同步完成和已连接状态。
- **Warning（`#C4922D`）：** 非阻断性提醒；保持温暖的琥珀色调。
- **Danger（`#B53A2F`）：** 破坏性操作和严重错误。
- **Border Subtle（`rgba(28,23,20,0.06)`）：** 发丝线分隔和低强调边界。
- **Border（`rgba(28,23,20,0.10)`）：** 默认卡片和控件边框。
- **Border Strong（`rgba(28,23,20,0.18)`）：** 高强调区块分隔。
- **Border Active（`rgba(196,98,45,0.22)`）：** 激活或选中轮廓。
- **Border Error（`rgba(181,58,47,0.18)`）：** 错误卡片或输入框轮廓。

### 深色模式

桌面端通过 `.dark` class 激活，移动端跟随系统 `colorScheme`。深色值定义于 `.agents/skills/myreader-design-system/colors_and_type.css` 的 `[data-theme="dark"]` 下。强调色会略微变暖为 `#D4703A`，以提高在深色表面上的可见性。

---

## 字体排印

产品设计系统不定义字体族或字体角色。应用 UI 使用平台 / Tailwind 默认无衬线字体栈。阅读器内部正文可使用阅读主题配置的衬线字体栈，但它与应用 UI 设计系统相互独立。

所有 UI 表面使用 Tailwind 文字工具类，例如 `text-sm`、`font-medium` 和 `text-base`。

---

## 布局

### 基础网格

- **桌面端：** 4pt 网格，8pt 主节奏，适合紧凑扫描。
- **移动端：** 8pt 网格，4pt 微调，提供宽裕的触控目标。

所有布局值使用 Tailwind 间距工具类，例如 `p-4`、`gap-2` 和 `px-3`。

### 阅读表面

- 内容栏宽度：`66ch`，保持合适的阅读行长。
- 阅读边距：`clamp(24px, 8vw, 96px)`。
- 工具 chrome 不得挤占阅读内容的主导空间。

### 断点

具体断点由平台文档定义。共享原则是阅读表面始终占主导，导航 chrome 退居其次。

---

## 层级与深度

通过**色调分层和轻微阴影**表达深度，不使用厚重投影。Background（`bg`）→ Surface → Surface-2 → Surface-3 形成自然层级；悬浮效果使用 Tailwind 阴影工具类 `shadow-sm`、`shadow-md` 和 `shadow-lg`。

深色模式使用更深的阴影，以 `rgba(0,0,0,…)` 替代暖色调阴影。

---

## 形状

采用**建筑式柔和感**：圆润但不过分活泼。使用 Tailwind 圆角工具类，如 `rounded-sm`、`rounded-md`、`rounded-lg`、`rounded-xl`、`rounded-3xl` 和 `rounded-full`。

同一视图中不要混用锐利直角和高度圆润的边角。

---

## 组件

### 主按钮

使用 Accent 背景（`#C4622D`）和 Ink Inverse 文字。每个界面只设置一个最突出的操作。高度为桌面端 32px、移动端 48px。

### 次按钮

使用 `surface-2` 背景和 `ink-1` 文字。视觉权重较低，但仍具有明确可操作性。

### 破坏性按钮

使用 `danger` 背景。不可恢复的操作必须经过确认流程。

### 图书卡片

封面采用 `aspect-ratio: 2/3`。封面渐变遮罩使用 `rgba(0,0,0,…)`，这是有意设计的图像覆盖效果，不是语义表面。遮罩透明度 token 为 `--cover-scrim-rest` 和 `--cover-scrim-hover`。

### 阅读器 Chrome

阅读时控件必须**退居次要位置**。使用 `reader-chrome-*` token；激活或强调状态使用 `reader-chrome-active`（即 Accent）。固定版式模式下，无论应用主题如何，chrome 都采用深色。

### 状态与反馈

- 成功状态：`success` + `success-soft` 背景。
- 警告状态：`warning` + `warning-soft` 背景。
- 危险 / 错误状态：`danger` + `danger-soft` 背景。
- 不使用 Tailwind 原始色阶（如 `emerald-*`、`red-*`），始终使用语义 token。

### 遮罩

- 弹窗遮罩：`overlay-strong`（浅色 `rgba(28,23,20,0.50)` / 深色 `rgba(0,0,0,0.65)`）。
- Sheet 背景：`overlay`（浅色 `rgba(28,23,20,0.22)` / 深色 `rgba(0,0,0,0.38)`）。

---

## 应做与不应做

- **应**将 `accent` 用于每屏最重要的单一操作。
- **应**使用语义颜色 token（`--ink-1`、`--accent-soft`、`--danger`），不直接写十六进制颜色。
- **应**保证正文达到 WCAG AA 对比度，关键控件尽量高于 AA。
- **应**为所有非必要动画定义 `prefers-reduced-motion` 行为。
- **不应**使用 Tailwind 原始颜色类，如 `bg-black`、`text-white`、`emerald-500`。
- **不应**在组件文件中硬编码 `rgba(...)`，应使用 CSS 自定义属性。
- **不应**让阅读器 chrome 在视觉上与阅读内容竞争。
- **不应**在平台专属文件中重新定义共享语义颜色值。
- **不应**在单个非阅读界面使用超过两种字重。
- **不应**在应用界面使用新奇或宣传风格字体。

---

## 决策记录

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-04-07 | 拆分共享、移动端和桌面端设计文档 | 保持品牌一致，同时尊重平台原生最佳实践 |
| 2026-04-07 | 确立安静的编辑式方向与暖中性色 | 提升长时间阅读可读性并建立阅读产品识别度 |
| 2026-04-23 | 升级为带 YAML frontmatter 的 design.md 规范格式 | 为 AI 工具和 Figma 同步提供机器可读 token |
| 2026-04-23 | Token 值对齐 `.designsystem/colors_and_type.css` | 建立单一视觉权威来源；强调色更新为陶土色 `#C4622D`，Ink 层级取代 text/text-muted |
| 2026-06-27 | 将设计系统缩减为仅管理颜色 | Tailwind 已提供间距、圆角、字体与阴影语义，减少重复 token 和任意覆盖 |
