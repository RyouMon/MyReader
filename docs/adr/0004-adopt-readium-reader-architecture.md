# ADR-0004：使用 Readium 取代自研 Reader V2 架构

- 状态：已接受
- 决策日期：2026-05-07
- 完成迁移日期：2026-05-13
- 记录日期：2026-07-22
- 记录方式：根据 Git 历史回溯补录
- 取代：[ADR-0001](./0001-reader-architecture.md)、[ADR-0002](./0002-reader-architecture-v2.md)
- 后续决策：[ADR-0009](./0009-maintain-mobile-readium-integration.md)

## 说明

这项决策在实施时没有单独的 ADR。本文根据 2026-05-07 至 2026-05-13 的提交、被删除的
Reader V1/V2 文档和现存实现补录。

下文分为两种信息：

- **历史事实**：能够直接从提交、文件增删和现有文档确认。
- **回溯推断**：根据替换顺序、删除范围和 V2 已记录的问题推断出的决策背景，不声称是当时
  留下的原话。

## 背景

### V1/V2 的目标与已识别问题

Reader V1 把解析、分页和渲染从产品 UI 中抽离。V2 又进一步识别并试图修复以下问题：

- 所谓 Headless Core 仍依赖 DOM、`Range`、节点克隆和图片预解码。
- fixed layout 与 reflowable layout 被迫共享过度折中的分页控制层。
- 移动端没有独立的原生阅读 Surface，固定版式仍运行在 DOM 子运行时。
- 解析缓存、资源缓存和渲染缓存没有清晰边界。
- DOM 测量分页无法真正跨桌面浏览器、移动 WebView 和原生文本引擎复用。

V2 为此提出 `Reader Core + Format Adapters + Layout Engines + Platform Surfaces`，并计划由
MyReader 自己维护以下能力：

- EPUB、PDF、CBZ 的格式解析和资源供应。
- fixed layout 页窗口、预取和缩放。
- reflowable DOM 测量、分页切片、锚点映射和内部链接。
- 桌面 React DOM、移动 React Native 与 WebView Surface。
- 跨格式阅读进度、目录、缓存和 Reader 会话状态机。

### V2 继续存在的结构性成本（回溯推断）

V2 改善了边界，但没有降低 MyReader 对完整阅读器技术栈的所有权。根据迁移中被替换的代码，
继续执行 V2 意味着同时维护：

1. 三种格式的 Parser/Adapter 和规范兼容行为。
2. 自研 DOM Paginator、Layout Engine、ResourceCache 和 ReaderSession。
3. 桌面 fixed/reflow 两套 Surface。
4. 移动 EPUB WebView、原生 PDF、原生 CBZ 三条不同路径。
5. `BookAnchor`、章节哨兵、页码和各格式自定义进度之间的转换。
6. iOS、Android、浏览器和 Tauri 不同资源加载与生命周期模型。

这会把大量开发成本投入到出版物解析、导航、定位和原生渲染基础设施，而不是书库、同步、
批注和阅读体验等产品能力。

### 迁移前已经出现的具体分叉（历史事实）

- 移动 EPUB 使用 `ReflowableDOMReader`。
- 移动 CBZ 使用手写 `FlatList + zip extract` 阅读器及独立文档生命周期。
- 移动 PDF 使用 `react-native-pdf`、独立目录和进度适配。
- 桌面端维护自己的 fixed layout、reflowable、DOM 分页和 TTS UI。
- 共享层维护 Parser、Paginator、Layout Engine、Reader Core、进度 Anchor 和 foliate-js vendor。

不同格式能够阅读，但出版物、当前位置、目录和导航并没有稳定的统一契约。

## 决策驱动因素

按历史事实和回溯推断，本次选择主要由以下因素驱动：

1. **统一位置语义**：需要用一个能够跨 EPUB、PDF、CBZ 和平台持久化的 Locator 契约取代
   `BookAnchor`、章节哨兵和各格式自定义页码。
2. **减少规范实现范围**：不再由 MyReader 独立承担完整的出版物解析、Navigator 和格式兼容。
3. **移动端原生能力**：iOS/Android 应使用原生 Navigator、WebView 生命周期、缓存和系统
   交互，而不是继续模拟桌面 DOM Surface。
4. **接受平台实现不同**：跨端统一的是 Publication、Link、Locator 和产品行为，不要求桌面
   与移动共享同一套渲染代码。
5. **按格式表达能力**：EPUB、PDF、CBZ 的分页、选择、搜索、缩放和批注能力不同，不再通过
   一个万能 Reader Core 隐藏差异。
6. **降低长期维护面**：把有限工程资源集中到 MyReader 拥有的 UI、持久化、同步和产品语义。

## 决策

MyReader 使用 Readium 的出版物与导航模型作为阅读器架构基础，停止把自研 Reader V2 作为
主要演进方向。

### 1. 采用 Readium 的核心领域契约

跨平台阅读链路以以下概念为共同语言：

- `Publication`：已经打开并可供导航的出版物。
- `Manifest` / `Link`：资源、目录和阅读顺序。
- `Navigator`：格式和平台相关的阅读 Surface 与导航能力。
- `Locator`：可序列化、可恢复的内容位置。

这些契约取代自研 `BookReader + Parser + Paginator + BookAnchor` 作为跨端主抽象。

### 2. 不再追求跨平台共享渲染内核

桌面和移动端允许采用不同实现：

- **桌面端**：使用 Readium Web/JS 包和 MyReader 的 Tauri 资源适配，分别承载 EPUB、PDF、
  Divina/CBZ。格式适配可以由 MyReader 实现，但必须输出 Readium 兼容的 Publication、Link
  和 Locator 语义。
- **移动端**：通过 React Native bridge 使用 Readium Swift/Kotlin Toolkit 的原生
  Publication 与 Navigator。bridge 可以替换，Readium 领域契约保持稳定。

跨端共享纯领域算法、Locator 规范化、目录结构、书签/批注排序和产品规则，不共享实际
Navigator Surface。

### 3. 使用完整 Locator 作为持久化位置

- 阅读进度、书签、批注和恢复位置保存序列化 Locator，而不是只保存视觉页码。
- EPUB 优先保留 `href`、`progression`、`position`、`totalProgression` 和必要文本锚点。
- PDF 与 CBZ 保留各自可恢复的 position/page fragment。
- 同步协议传输应用规范化后的 Locator JSON。
- 视觉页码、百分比和重新排版后的屏幕页不是稳定存储主键。

Readium 只定义位置和导航契约；数据库表、LWW、tombstone、同步与迁移仍由 MyReader 负责。

### 4. Reader 产品能力继续由 MyReader 持有

以下能力不下放给 Readium：

- 阅读器 chrome、主题设置和交互流程。
- 阅读进度、书签、批注和笔记的持久化与同步。
- Calibre/远端书库资源解析和下载生命周期。
- 搜索 UI、批注编辑器、产品级快捷操作和无障碍策略。
- 展示进度、阅读统计和其他应用派生数据。

Readium 提供出版物、Navigator、Locator、Selection 和 Decoration 等机制；MyReader 决定
如何组合成产品。

### 5. 每种格式单独声明能力

不得因为 EPUB 支持某项 Readium 能力，就推断 PDF 或 CBZ 也具有同等行为。至少分别审计：

- reflowable EPUB 的分页/滚动、DOM Range、文本选择和 Decoration。
- fixed-layout EPUB/Divina/CBZ 的页序、缩放、双页和 RTL。
- PDF 的页位置、文本层、选择、搜索和批注能力。

产品层可以统一入口和视觉语言，但必须保留格式能力差异。

## 迁移方案和历史落地

迁移采用按平台、格式和契约逐步替换的方式，而不是一次性重写：

| 日期 | 提交 | 历史动作 |
|---|---|---|
| 2026-05-07 | `137e2a85` | 移动 EPUB 从 `ReflowableDOMReader` 迁移到 Readium，并切换 Locator 进度 |
| 2026-05-07 | `8a611907` | PDF/CBZ 输出规范化 Locator，数据库 `anchor_json` 改为 `locator_json` |
| 2026-05-07 | `f7f2cd7c` | 准备桌面 Readium 依赖和构建环境 |
| 2026-05-07 | `c420e9d7` | 引入 Publication、Manifest、Locator 和资源获取基础 |
| 2026-05-07 | `86e08d82` | 桌面 fixed/reflow 阅读 Surface 切换为 Readium 组件 |
| 2026-05-07 | `509224a6` | Tauri 接入资源 Streamer 和 Locator 持久化 |
| 2026-05-07 | `089b7076` | 路由、Store 和同步适配到新 Reader 流程 |
| 2026-05-09 | `3e9dae37` | 移动 CBZ 从手写原生阅读器迁移到 Readium |
| 2026-05-10 | `b1d3d8ae` | 删除旧 Reader Core、Parser、Paginator、Layout Engine、Anchor 和 V1/V2 文档 |
| 2026-05-13 | `adb9216e` | 移动 PDF 从 `react-native-pdf` 迁移到 Readium |

`b1d3d8ae` 一次删除了约 7,783 行旧 Reader 引擎、文档和测试，表明这不是在 V2 旁新增
另一套实现，而是正式终止旧架构。

2026-06-18，移动端又把 Nitro Modules fork 替换为应用自有 Expo Module bridge。该变化只
替换集成层，没有改变“Readium Toolkit + Locator + 平台 Navigator”的本决策。

## 考虑过的方案

### 方案 A：继续完成 Reader V2

优点：

- 完全控制解析、渲染和分页行为。
- 桌面与移动可以共享更多自研代码。
- 不受上游 API 和发布节奏约束。

放弃原因（回溯推断）：

- V2 仍需长期维护完整格式栈和多平台 Surface。
- DOM 测量分页无法成为真正的平台无关内核。
- 位置、目录、资源和导航契约仍需自行设计并保持跨端兼容。
- 移动端的 EPUB、PDF、CBZ 已经形成三套不同实现，继续扩展会增加分叉。

### 方案 B：只在移动端或部分格式使用 Readium

优点：

- 迁移风险较低，可以保留已经工作的桌面 Reader。
- 可先解决移动端原生渲染问题。

放弃原因（回溯推断）：

- 跨端仍需维护 BookAnchor 与 Locator 两套位置模型。
- 同一本书的目录、进度和同步语义会随平台或格式变化。
- 旧 Reader Core 无法真正删除，长期成本仍然存在。

### 方案 C：把所有能力完全交给 Readium

没有采用。Readium 不负责 MyReader 的数据库、同步、书库协议、UI 和产品行为；桌面端也仍需
Tauri fetch/streamer 与格式适配。MyReader 必须保留明确的应用集成层。

### 方案 D：Readium 领域契约 + 平台适配 + MyReader 产品层

采用。它允许 Readium 承担通用出版物和 Navigator 基础，同时保留 MyReader 对产品和数据的
所有权。

## 结果

### 正面结果

- EPUB、PDF、CBZ 的进度统一为 Locator 契约。
- 删除自研 Reader Core、DOM Paginator、Parser 和多个格式专用移动阅读器。
- 移动端获得 Swift/Kotlin 原生 Navigator 和平台生命周期能力。
- 桌面与移动共享语义而不强制共享渲染实现。
- 后续搜索、书签、批注和同步可以围绕同一位置模型建设。

### 代价和风险

- 桌面 Web Readium、Swift Toolkit 和 Kotlin Toolkit 的能力与版本并不完全一致。
- Readium Locator 是内容位置，不等于重新排版后的视觉页码。
- bridge、构建脚本、原生依赖和上游升级仍需要 MyReader 维护。
- PDF、CBZ 和 EPUB 的选择、搜索、Decoration 和 RTL 能力必须分别测试。
- 上游没有提供的产品能力仍需在应用集成层实现，不能通过修改 Toolkit 私有实现形成长期依赖。

## 长期约束

1. 不重新引入与 Readium 平行的通用自研 Reader Core，除非新增一份取代本 ADR 的决策。
2. 跨端共享 Publication/Link/Locator 和产品语义，不以共享渲染代码为目标。
3. 持久化完整、可恢复且经过应用规范化的 Locator。
4. MyReader 持有数据库、同步、书签、批注、阅读统计和产品 UI。
5. EPUB、PDF、CBZ/Divina 的能力分别验证，不用一个格式的结论替代另一个格式。
6. 移动 bridge 可以从第三方 fork 迁移到应用自有模块，但必须保持公开 Locator 和 Navigator
   契约兼容。
7. Readium 升级改变持久化 Locator 或导航语义时，必须提供数据库和同步协议迁移方案。
