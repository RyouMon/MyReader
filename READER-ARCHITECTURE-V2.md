# READER-ARCHITECTURE-V2

## 一、当前版本的主要缺陷

现有阅读器架构的方向是正确的：尝试把解析、分页、渲染从业务 UI 中抽离出来，形成一套可复用的阅读器内核。但从当前桌面端、移动端和 `my-reader-tools` 的实际实现来看，第一版架构仍然存在几个关键问题，已经开始限制移动端性能、跨端一致性和后续演进空间。

### 1. “Headless” 抽象不彻底，核心层仍然强依赖 DOM

第一版文档里，`Reader`、`Parser`、`Paginator`、`Render` 被描述为逻辑与视图解耦。但当前实现中，流式正文分页的核心能力仍然深度依赖浏览器 DOM：

1. `BookReader.layout()` 需要 `measureHost: HTMLDivElement`。
2. `ProgressivePaginator` 使用 `document.createElement`、`Range`、DOM clone、图片预解码等浏览器能力完成分页。
3. `renderTextChapterPage()` 直接基于 DOM 节点和 CSS 作用域输出页面内容。

这意味着当前真正无关平台的只有一部分“导航状态机”和“解析器壳子”，而不是完整的阅读器核心。

### 2. 固定版式与浮动版式共用了一套过于折中的控制层

固定版式和浮动版式在本质上是两种不同的问题：

1. 固定版式的核心问题是页资源调度、预取、缩放、连续滚动和可见窗口管理。
2. 浮动版式的核心问题是 HTML/CSS 排版、章内锚点、分页切片、滚动续读和内部链接。

第一版架构虽然在数据模型里区分了 `ImageChapterData` 与 `TextChapterData`，但在控制器层仍试图用同一套 `Reader + Paginator` 语义覆盖两种模式。这会导致 API 越来越抽象，最终既不利于 fixed layout 性能优化，也不利于 reflowable layout 的平台适配。

### 3. 移动端没有形成独立的原生阅读 Surface

当前桌面端已经实现了较完整的 fixed/reflowable 双路径，但移动端仍然停留在过渡态：

1. 当前移动端阅读器只真正支持固定版式的 PDF / CBZ。
2. EPUB 等浮动版式并未接入移动端阅读路径。
3. 移动端固定版式仍运行在 `expo/dom` 环境中，本质上是 DOM 子运行时里的图片阅读器，而不是 React Native 原生阅读器 Surface。

这导致移动端无法充分利用原生图片缓存、列表虚拟化、页面窗口预取、内存释放和 WebView/原生渲染的各自优势。

### 4. 解析缓存与渲染缓存混在一起，没有统一的资源缓存层

目前 `ComicParser`、`PdfParser` 等解析器内部各自维护了缓存，但这些缓存更像“解析结果缓存”，而不是“会话级资源缓存”。

这带来几个问题：

1. 缓存策略不感知当前视口和阅读模式。
2. 无法统一做页窗口预取。
3. 无法统一做超出窗口资源释放。
4. 无法自然扩展到磁盘缓存与内存缓存的组合。

对于移动端而言，这个缺口会直接表现为：翻页时才开始加载、峰值内存较高、无法建立稳定的邻近页体验。

### 5. 流式正文的滚动模式在桌面端可用，但不适合作为移动端默认实现

当前桌面端滚动模式会把全书章节加载到内存中，以支持全书连续滚动。这对桌面浏览器是一个可接受的折中，但对移动端并不适合：

1. 章节数多时会明显放大内存占用。
2. 加载链路容易拉长首屏时间。
3. JS 线程在连续解析章节时会产生卡顿风险。

因此，第一版架构虽然定义了 `gotoPage`、`gotoNextPage`、`gotoPrevPage` 等通用接口，但没有对“章节窗口化”这一移动端关键能力给出明确建模。

### 6. 架构文档没有区分“逻辑分页”和“测量分页”

第一版文档中的 `Paginator` 同时承担了两种职责：

1. 逻辑层：维护当前页、上一页、下一页、缓存和翻页导航。
2. 测量层：根据视口、字体、样式和内容真实算出分页切片。

这在桌面端实现阶段是方便的，但在跨端演进时会成为问题。因为：

1. 固定版式几乎不需要“文本测量分页”。
2. 浮动版式的测量分页在 DOM、WebView、原生文本引擎之间完全不同。
3. 真正跨端稳定的，应该是逻辑导航模型，而不是具体测量实现。

---

## 二、V2 架构设计

V2 的核心目标是：

1. 真正把跨端共享的能力收敛到 Headless Core。
2. 把 DOM 相关实现从核心层剥离为 Layout Engine / Surface Adapter。
3. 让固定版式与浮动版式分别沿着最合适的性能路径演进。
4. 让桌面端继续复用现有能力，同时为移动端建立原生优先的阅读器 Surface。

### 总体分层

```mermaid
flowchart TB
  subgraph App["App Layer"]
    Desktop["my-reader\nDesktop Reader Shell"]
    Mobile["my-reader-mobile\nMobile Reader Shell"]
  end

  subgraph Surface["Platform Surfaces"]
    DesktopFixed["Desktop Fixed Surface\nReact DOM + virtual scroll/spread"]
    DesktopReflow["Desktop Reflow Surface\nReact DOM paginated/scroll"]
    MobileFixed["Mobile Fixed Surface\nReact Native + FlashList/expo-image"]
    MobileReflow["Mobile Reflow Surface\nWebView first, Native later"]
  end

  subgraph Engine["Layout Engines"]
    FixedEngine["Fixed Layout Engine\npage window + prefetch + viewport model"]
    DomReflowEngine["DOM Reflow Engine\nmeasure/layout/range mapping"]
    NativeReflowEngine["Native Reflow Engine\nfuture optional"]
  end

  subgraph Core["Reader Core (Headless)"]
    Session["ReaderSession\nbook lifecycle / state machine"]
    Nav["NavigationController\nchapter/page/anchor navigation"]
    Progress["ProgressController\nBookAnchor / percentage / resume"]
    Cache["ResourceCache\nchapter/page/bitmap/html window"]
    TOC["TOC Controller\nflatten / resolve / current item"]
    Settings["ReaderSettingsModel\nfont/line-height/theme/layout mode"]
  end

  subgraph Format["Format Adapters"]
    EPUB["EpubAdapter"]
    PDF["PdfAdapter"]
    CBZ["ComicAdapter"]
  end

  subgraph Data["Book Sources"]
    Local["Local file / Tauri URI"]
    WebDAV["WebDAV cache / file cache"]
  end

  Desktop --> DesktopFixed
  Desktop --> DesktopReflow
  Mobile --> MobileFixed
  Mobile --> MobileReflow

  DesktopFixed --> FixedEngine
  MobileFixed --> FixedEngine

  DesktopReflow --> DomReflowEngine
  MobileReflow --> DomReflowEngine
  MobileReflow -. optional later .-> NativeReflowEngine

  FixedEngine --> Session
  DomReflowEngine --> Session
  NativeReflowEngine --> Session

  Session --> Nav
  Session --> Progress
  Session --> Cache
  Session --> TOC
  Session --> Settings

  Session --> EPUB
  Session --> PDF
  Session --> CBZ

  EPUB --> Local
  EPUB --> WebDAV
  PDF --> Local
  PDF --> WebDAV
  CBZ --> Local
  CBZ --> WebDAV
```

---

### 2.1 Reader Core

Reader Core 是跨端共享的无头内核，必须不直接依赖 React、DOM、WebView 或 React Native 组件树。

#### 2.1.1 ReaderSession

`ReaderSession` 是 V2 的核心控制器，用来取代当前过于肥大的 `BookReader`。

它的职责包括：

1. 负责书籍生命周期：打开、关闭、销毁。
2. 维护当前阅读快照：当前章节、当前页、当前锚点、加载状态、错误状态。
3. 协调 `FormatAdapter`、`LayoutEngine`、`ResourceCache`。
4. 对外提供订阅与命令式导航接口。

建议接口：

```ts
interface ReaderSession {
  open(input: OpenBookRequest): Promise<OpenBookResult>
  close(): void

  getSnapshot(): ReaderSnapshot
  subscribe(listener: () => void): () => void

  gotoChapter(index: number): Promise<void>
  gotoPageInChapter(offset: number): Promise<void>
  gotoNext(): Promise<void>
  gotoPrev(): Promise<void>
  gotoAnchor(anchor: BookAnchor): Promise<void>

  prefetchAroundCurrent(): Promise<void>
}
```

#### 2.1.2 NavigationController

`NavigationController` 负责导航逻辑本身，而不是界面渲染。它需要统一处理：

1. 章节跳转。
2. 章内页跳转。
3. 固定版式的上一页/下一页。
4. 浮动版式的分页翻页或滚动续读。
5. 目录点击与内部链接跳转。

它的价值在于把“跳到哪里”与“如何渲染出来”分离开来。

#### 2.1.3 ProgressController

`ProgressController` 统一负责阅读进度与锚点模型，继续沿用并扩展现有的 `BookAnchor` 思路。

职责包括：

1. 输出全书进度百分比。
2. 构建持久化锚点。
3. 从持久化锚点恢复阅读位置。
4. 统一 fixed layout 与 reflowable layout 的进度计算。

语义建议：

1. 固定版式以页位置细分进度。
2. 浮动版式以章节体量加权，并结合 `charOffset` / boundary 细分。

#### 2.1.4 ResourceCache

`ResourceCache` 是 V2 新增的关键层，负责统一缓存策略。

职责包括：

1. 章节内容缓存。
2. 固定版式页资源缓存。
3. PDF 页图缓存。
4. 邻近章节 / 邻近页预取。
5. 超出窗口资源释放。
6. 内存缓存与磁盘缓存协同。

它与 `Parser` 内部 cache 的区别在于：

1. `Parser` cache 更偏向解析结果复用。
2. `ResourceCache` 更偏向当前阅读会话的视口感知缓存。

#### 2.1.5 TOC Controller

`TOC Controller` 统一负责：

1. 目录树标准化。
2. 树状 TOC 扁平化。
3. 当前章节/页对应的 TOC 高亮。
4. TOC href 到 `chapterIndex` / `BookAnchor` 的解析。

这样桌面端与移动端不再各自维护 TOC flatten 逻辑。

#### 2.1.6 ReaderSettingsModel

`ReaderSettingsModel` 只维护阅读语义相关设置，不关心面板打开状态等 UI 细节。

职责包括：

1. 字号、字族、行高、边距。
2. `paginate` / `scroll`。
3. fixed layout 的 single / spread / fit-width / original。
4. 主题、亮度、方向等阅读属性。

---

### 2.2 Format Adapters

V2 中把第一版的 `Parser` 升级为 `Format Adapter` 概念。原因是解析器除了 `parse()` 之外，实际上还承担了章节数据和资源供应能力。

统一接口建议：

```ts
interface BookFormatAdapter {
  parse(buffer: ArrayBuffer): Promise<ParsedBook>
  getChapter(index: number): Promise<ChapterData>
  resolveInternalLink?(
    fromChapterIndex: number,
    href: string
  ): ResolvedInternalTextLink | null
  destroy(): void
}
```

#### 2.2.1 EpubAdapter

`EpubAdapter` 负责：

1. 解析 EPUB 元数据、目录、spine。
2. 输出 `TextChapterData`。
3. 提供内部链接解析能力。
4. 为 `BookAnchor` / `charOffset` 恢复提供章节正文语义。

#### 2.2.2 PdfAdapter

`PdfAdapter` 负责：

1. 解析 PDF 元数据和目录。
2. 提供按页访问能力。
3. 输出固定版式单页资源。

在 V2 中，桌面端和移动端允许共享“文档解析接口”，但不要求共享“页渲染实现”。移动端可根据性能需要走不同的页图生成或原生 PDF 渲染路径。

#### 2.2.3 ComicAdapter

`ComicAdapter` 负责：

1. 解析 CBZ 文件。
2. 构建固定版式页索引。
3. 输出单页图片资源。
4. 提供简单目录或卷/章节分组信息。

---

### 2.3 Layout Engines

V2 中明确把 Layout Engine 从 Reader Core 中拆出来。核心原则是：

1. Core 只知道“我需要一个布局结果”。
2. 具体如何测量和输出布局结果，由平台相关的 Layout Engine 实现。

#### 2.3.1 FixedLayoutEngine

固定版式并不需要文本测量分页，因此它的核心职责不是“切页”，而是“管理页窗口与视口状态”。

职责包括：

1. 生成当前应显示的页索引。
2. 生成邻近预取窗口。
3. 统一 single page、spread、scroll 三种 fixed 阅读模式下的视口模型。
4. 为 UI 提供 `visibleIndexes`、`preloadIndexes`、`canGoNext`、`canGoPrev`。

建议模型：

```ts
interface FixedViewportState {
  currentIndex: number
  visibleIndexes: number[]
  preloadIndexes: number[]
  canGoNext: boolean
  canGoPrev: boolean
}
```

#### 2.3.2 DomReflowEngine

`DomReflowEngine` 是当前 `ProgressivePaginator + renderTextChapterPage + DOM boundary mapping` 的正式抽象。

职责包括：

1. 基于 HTML/CSS/DOM Range 对章节进行测量和分页。
2. 输出 `sliced` 或 `full` 模式布局结果。
3. 处理 `fragmentId` 定位。
4. 处理 `charOffset` / boundary 到列页的映射。

建议接口：

```ts
interface ReflowLayoutEngine {
  layoutChapter(
    chapter: TextChapterData,
    config: LayoutConfig,
    options?: {
      initialAnchor?: BookAnchor | null
      fragmentId?: string | null
    }
  ): Promise<ReflowLayoutResult>
}
```

#### 2.3.3 NativeReflowEngine

`NativeReflowEngine` 在 V2 中只作为未来可选项，不作为第一阶段落地目标。

引入它的前提是：

1. WebView reflow 路径已被验证无法满足移动端性能目标。
2. EPUB 样式兼容范围已经裁剪清晰。
3. 可以接受移动端与桌面端排版结果不完全一致。

在达成以上条件之前，移动端浮动版式优先采用 WebView + DOM layout engine。

---

### 2.4 Platform Surfaces

Platform Surface 是具体承载阅读内容的 UI 表面层。它不拥有阅读状态机，只消费 `ReaderSession` 的快照和命令。

#### 2.4.1 Desktop Fixed Surface

桌面端固定版式 Surface 继续沿用现有 React DOM 方案，负责：

1. single / spread / scroll 展示。
2. 键盘翻页与快捷键。
3. TOC、设置面板、底栏进度。
4. 固定版式连续滚动虚拟化。

#### 2.4.2 Desktop Reflow Surface

桌面端浮动版式 Surface 继续沿用现有 React DOM 方案，负责：

1. scroll / paginate 模式切换。
2. 单章分页 DOM 绘制。
3. 全书滚动视图。
4. 内部链接捕获与续读恢复。

#### 2.4.3 Mobile Fixed Surface

移动端固定版式 Surface 是 V2 的优先建设项，应从 `expo/dom` 过渡到 React Native 原生优先实现。

推荐形态：

1. `FlashList` 或 `FlatList` 横向分页阅读。
2. `expo-image` 负责页图渲染。
3. 邻近页窗口预取。
4. 可选连续滚动模式。

推荐窗口策略：

1. `visible = [current - 1, current, current + 1]`
2. `preload = [current - 2, current + 2]`
3. 超出 `current +/- 4` 的页资源可释放。

#### 2.4.4 Mobile Reflow Surface

移动端浮动版式 Surface 在 V2 第一阶段采用 WebView 优先方案。

职责拆分：

1. React Native 外层负责：顶部栏、底栏、目录、设置、手势、持久化。
2. WebView 内负责：HTML/CSS 渲染、章节定位、滚动位置同步。
3. Reader Core 负责：章节切换、续读锚点、进度快照。

推荐加载策略：

1. 默认滚动阅读模式。
2. 只保留当前章和邻近章窗口，而不是全书一次性加载。
3. 章节切换时使用 `BookAnchor` 统一恢复位置。

---

### 2.5 数据模型建议

为保证桌面端与移动端共用统一状态快照，V2 建议引入更明确的数据模型。

#### ReaderSnapshot

```ts
interface ReaderSnapshot {
  ready: boolean
  loading: boolean
  error: string | null

  layoutMode: "fixedLayout" | "reflowable" | "unknown"
  totalChapters: number
  toc: TocItem[]

  currentChapter: number
  currentPageInChapter: number
  totalPagesInChapter: number

  progress: ReaderProgress
  currentAnchor: BookAnchor | null
}
```

#### FixedSurfaceSnapshot

```ts
interface FixedSurfaceSnapshot {
  totalPages: number
  currentIndex: number
  visibleIndexes: number[]
  preloadIndexes: number[]
}
```

#### ReflowSurfaceSnapshot

```ts
interface ReflowSurfaceSnapshot {
  readingLayout: "paginate" | "scroll"
  currentChapter: number
  currentAnchor: BookAnchor | null
  chapterWindow: number[]
}
```

---

### 2.6 推荐目录边界

V2 推荐将跨端核心目录调整为：

```text
my-reader-tools/
  src/
    reader-core/
      ReaderSession.ts
      NavigationController.ts
      ProgressController.ts
      ResourceCache.ts
      types.ts

    format-adapters/
      EpubAdapter.ts
      PdfAdapter.ts
      ComicAdapter.ts

    layout-engines/
      fixed/
        FixedLayoutEngine.ts
      reflow/
        DomReflowEngine.ts
        DomBoundaryMapper.ts
        DomSliceRenderer.ts
        types.ts

    progress/
      BookAnchor.ts
      epubBookAnchor.ts
      reflowViewportAnchor.ts

my-reader/
  src/components/reader/
    fixed-layout/
    reflowable/
    shared/

my-reader-mobile/
  src/components/reader/
    fixed/
      MobileFixedReader.tsx
      FixedPagerView.tsx
      FixedScrollView.tsx
      PageCell.tsx
    reflow/
      MobileReflowReader.tsx
      ReflowWebViewBridge.tsx
      ReflowChapterWindow.ts
    shared/
      ReaderChrome.tsx
      ReaderTocSheet.tsx
      ReaderProgressBar.tsx
```

---

### 2.7 典型链路

#### 固定版式链路

```mermaid
sequenceDiagram
  participant UI as MobileFixedSurface
  participant Session as ReaderSession
  participant Engine as FixedLayoutEngine
  participant Adapter as Pdf/ComicAdapter
  participant Cache as ResourceCache

  UI->>Session: open(book)
  Session->>Adapter: parse(buffer)
  Adapter-->>Session: ParsedBook
  Session->>Engine: buildViewportState(currentIndex=0)
  Engine-->>Session: visible/preload indexes
  Session->>Cache: prefetch pages
  Cache->>Adapter: getFixedPage(index)
  Adapter-->>Cache: page uri
  Session-->>UI: snapshot + page sources

  UI->>Session: gotoNext()
  Session->>Engine: compute next window
  Session->>Cache: prefetch next window
  Session-->>UI: updated snapshot
```

#### 浮动版式链路

```mermaid
sequenceDiagram
  participant UI as MobileReflowSurface
  participant Session as ReaderSession
  participant Adapter as EpubAdapter
  participant Engine as DomReflowEngine
  participant WV as WebView

  UI->>Session: open(book)
  Session->>Adapter: parse(buffer)
  Adapter-->>Session: ParsedBook
  Session->>Adapter: getChapter(current)
  Adapter-->>Session: TextChapterData
  Session->>Engine: layoutChapter(chapter, config, anchor)
  Engine-->>Session: layout result
  Session-->>UI: chapter snapshot
  UI->>WV: inject html/css + initial anchor

  UI->>Session: gotoAnchor(anchor)
  Session->>Adapter: getChapter(target)
  Session->>Engine: layoutChapter(...)
  Session-->>UI: new snapshot
  UI->>WV: scroll to anchor
```

---

## 三、V2 相比 V1 的优化点

V2 并不是完全推翻第一版，而是在第一版“Reader / Parser / Paginator / Render 分层”思路上的一次工程化收敛。它相对 V1 的主要优化体现在以下几个方面。

### 1. 真正把跨端共享能力收敛到了 Core

V1 中核心层仍深度依赖 DOM。V2 则把共享能力明确限定为：

1. 书籍生命周期。
2. 导航控制。
3. 进度锚点。
4. TOC 处理。
5. 会话级缓存。

这样“Headless” 才变成真实可复用的工程边界，而不是停留在概念层。

### 2. 把 DOM 测量分页从核心层剥离出来

V1 把“逻辑导航”和“DOM 测量分页”混在 `BookReader + Paginator` 中。V2 明确区分：

1. `ReaderSession` 负责控制与状态。
2. `DomReflowEngine` 负责排版测量。
3. 未来可以引入 `NativeReflowEngine` 而不需要重写整个阅读器控制层。

这为移动端浮动版式的演进提供了明确路径。

### 3. 固定版式和浮动版式不再强行共用一套过度抽象的分页语义

V1 中 fixed 和 reflow 虽然数据上区分了，但控制层仍然被迫共享同一类 API。V2 则明确：

1. fixed layout 关注页窗口、预取和视口状态。
2. reflowable layout 关注章节排版、锚点与滚动/分页切换。

这样两条路线都能针对各自性能瓶颈优化，而不会互相牵制。

### 4. 为移动端建立了独立的性能路径

V1 没有给移动端单独建模，导致移动端只能复用桌面端的 DOM 思路。V2 明确建立：

1. `Mobile Fixed Surface`：React Native 原生图片 + 列表虚拟化 + 预取。
2. `Mobile Reflow Surface`：WebView 优先，章节窗口化。

这让移动端性能优化有了清晰、可实施的落点。

### 5. 新增 ResourceCache，补上了缓存策略层

V1 的缓存散落在 parser 内部。V2 引入 `ResourceCache` 后，可以统一实现：

1. 邻近页预取。
2. 邻近章节预取。
3. 窗口外资源释放。
4. 内存/磁盘缓存分层。

这对于移动端 fixed layout 和 reflowable layout 都是关键提升。

### 6. 文档与实现更一致，后续重构更容易拆解

V1 的问题之一是：文档里看起来已经跨平台解耦，但代码里仍然把大量平台细节塞进了核心层。V2 把“Core / Engine / Surface / Adapter”的边界写清楚后，后续重构可以按层推进：

1. 先拆 `ReaderSession`。
2. 再拆 `DomReflowEngine`。
3. 再补 `MobileFixedSurface`。
4. 最后接入 `MobileReflowSurface`。

这样迁移路径更平滑，风险也更可控。

---

## 四、结论

第一版架构解决了“不要把阅读逻辑直接写死在 UI 组件里”的问题；V2 则进一步解决了“如何让这套逻辑真正跨端、真正适合移动端性能优化”的问题。

可以把 V2 概括为一句话：

**把阅读器拆成 Headless Core、Format Adapters、Layout Engines 和 Platform Surfaces，让固定版式与浮动版式分别沿着最合适的性能路径演进。**

这也是后续桌面端稳定演进、移动端补齐 EPUB 阅读、以及长期统一阅读器能力的基础。
