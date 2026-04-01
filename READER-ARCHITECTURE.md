# 接口设计

这是一套基于“无头（Headless）”理念的电子书解析与渲染前端架构设计。该设计的核心在于**逻辑与视图解耦**，`Reader`、`Parser`、`Paginator` 负责纯数据和排版逻辑的处理，而具体的视图展现交由用户去完成。


### 一、 核心架构与逻辑

1. **Reader (核心控制器)**：作为对外的唯一 API 入口，单例或实例化挂载。它负责组装 `Parser`、`Paginator` 和 `Render`，调度生命周期（打开、解析、排版、渲染），并暴露翻页、目录跳转等指令。
2. **Parser (解析器)**：不关心视图，只关心文件本身。它将各种格式（EPUB, TXT, PDF）的原始文件标准化为平台可读的结构（元数据、目录树结构、分块的章节 HTML 或纯文本片段）。
3. **Paginator (排版分页器)**：这是电子书引擎最复杂的部分。它接收 `Parser` 提供的章节内容和终端的视口尺寸（宽、高、字体大小、边距），计算出每一页可以容纳的内容节点。它内置**三页缓存机制（上一页、当前页、下一页）**，当用户请求当前页时，异步触发前后页的预渲染与数据抓取，为平滑的翻页动画（如仿真翻页、平滑滑动）提供数据支撑。
4. **Render (渲染器)**：使用者可以使用 React (DOM)、Vue、Canvas 对Reader中的数据进行渲染。

---

### 二、 接口设计 (TypeScript)

```Mermaid
classDiagram
    class Reader {
        -IParser parser
        -IPaginator paginator
        -IRender renderer
        -book ParsedBook
        
        +totalChapters: number
        +chapters: ChapterInfo[]
        +curChapter: number
        
        +totalPagesOfCurChapter: number
        +curPage: PageData
        +prevPage: PageData
        +nextPage: PageData
        
        +progress: number
        
        +init(buffer: ArrayBuffer, format: str) Promise~null~
        +layout(config: LayoutConfig) Promise~null~
        
        +gotoChapter(index: number) Promise~null~
        +gotoPage(chapter: number, offset: number) Promise~null~
        +gotoNextPage() Promise~null~
        +gotoPrevPage() Promise~null~
    }
    
    class IParser {
        <<interface>>
        +parse(buffer: ArrayBuffer) Promise~ParsedBook~
    }

    class IPaginator {
        <<interface>>
        -cache: Map~pageId, PageData~
        +curPage: PageData
        +prevPage: PageData
        +nextPage: PageData
        +layout(content: Content, config: LayoutConfig) Promise~null~
        +gotoPage(offset: number) Promise~null~
        +gotoNextPage() Promise~null~
        +gotoPrevPage() Promise~null~
        +clearCache() Promise~null~
    }
    
    class RichTextPaginator {
        <<implementation>>
    }

    class EpubParser {
        <<implementation>>
    }
    
    class CbzParser {
        <<implementation>>
    }

    IRender --> Reader : 使用
    Reader *-- IParser : 组合
    Reader *-- IPaginator : 组合
    IParser <|.. EpubParser : 实现
    IParser <|.. CbzParser : 实现
    IPaginator <|.. RichTextPaginator : 实现

    ChapterInfo <|-- TextChapterData : 继承
    ChapterInfo <|-- ImageChapterData : 继承
    
    class PageData {
        <<interface>>
        +index number
        +chapter number
        +columns any[]
        +isStartOfChapter boolean
        +isEndOfChapter boolean
    }
    
    class LayoutConfig {
        <<interface>>
        +fontFamily str
        +fontSize number
        +viewPortHeight number
        +viewPortWidth number
        +doubleColumn bool
    }
    
    class ChapterInfo {
      <<interface>>
      +index: number
      +title: string
      +href: string
    }
    
    class ParsedBook {
      <<interface>>
      metadata: BookMetadata
      toc: TocItem[]
      chapters: ChapterInfo[]
      contentType: ContentType
    }
    
    class ImageChapterData {
      type: "image"
      imageUrl: string
    }

    class TextChapterData {
      type: "text"
      bodyHtml: string
      cssText: string
      text: string
    }

```



---

### 三、 时序图：书籍加载与翻页缓存逻辑 (Sequence Diagram)

展示了用户发起操作时，Reader 如何协调 Parser 解析文件、Paginator 计算和缓存分页、Render 呈现视图的完整生命周期。

```Mermaid
sequenceDiagram
    participant User as 使用者 (UI/Render)
    participant Reader as Reader (控制器)
    participant Parser as IParser (解析器)
    participant Paginator as IPaginator (分页器)

    %% 阶段一：初始化与图书解析
    rect rgb(240, 248, 255)
    Note over User, Paginator: 阶段 1: 初始化与解析 (init)
    User->>Reader: init(buffer, "epub")
    Reader->>Parser: parse(buffer)
    Parser-->>Reader: 返回 ParsedBook (含 Metadata, TOC, chapters[])
    Note right of Reader: Reader 填充内部状态:<br/>totalChapters, chapters[], curChapter=0
    Reader-->>User: Promise<null> (初始化完成)
    end

    %% 阶段二：排版布局 (layout)
    rect rgb(240, 255, 240)
    Note over User, Paginator: 阶段 2: 排版布局与首屏加载
    User->>Reader: layout(LayoutConfig)
    
    %% 此处逻辑：Reader 获取当前章节数据并交给 Paginator
    Reader->>Reader: 获取当前章节 curChapter 的数据 (Text/ImageChapterData)
    Reader->>Paginator: layout(ChapterData, LayoutConfig)
    
    Note over Paginator: 根据窗口宽高/双列配置<br/>分割内容并填充 cache
    
    Paginator-->>Reader: Promise<null> (分页完成)
    
    %% Reader 更新自身暴露的 curPage/prevPage/nextPage
    Reader->>Paginator: 获取 curPage, prevPage, nextPage
    Paginator-->>Reader: 返回 PageData 缓存
    
    Reader-->>User: 触发 UI 渲染 (通过状态订阅或回调)
    end

    %% 阶段三：翻页逻辑 (Next Page)
    rect rgb(255, 245, 238)
    Note over User, Paginator: 阶段 3: 翻页与跨章节处理
    User->>Reader: gotoNextPage()
    
    alt 当前章节内还有下一页
        Reader->>Paginator: gotoNextPage()
        Paginator->>Paginator: 更新内部 cur/prev/next 指针 (命中缓存)
        Paginator-->>Reader: Promise<null>
    else 当前章节已结束 (isEndOfChapter == true)
        Reader->>Reader: curChapter++
        Reader->>Reader: 获取新章节数据
        Reader->>Paginator: clearCache()
        Reader->>Paginator: layout(新章节数据, LayoutConfig)
        Paginator-->>Reader: 分页完成
    end

    Reader->>Paginator: 获取最新 curPage, prevPage, nextPage
    Paginator-->>Reader: 返回 PageData
    Reader-->>User: 更新界面渲染
    end

    %% 阶段四：跳转特定位置
    rect rgb(245, 245, 245)
    Note over User, Paginator: 阶段 4: 跳转逻辑 (gotoPage)
    User->>Reader: gotoPage(chapterIndex, offset)
    Reader->>Paginator: clearCache()
    Reader->>Paginator: layout(chapters[chapterIndex], config)
    Reader->>Paginator: gotoPage(offset)
    Paginator-->>Reader: 返回指定页数据
    Reader-->>User: 更新界面
    end
```



# 技术架构

[https://github.com/koodo-reader/kookit](https://github.com/koodo-reader/kookit)

|Package|Purpose|
|-|-|
|`foliate-js`|EPUB / MOBI / AZW3 / FB2 rendering engine|
|`pdf-js`|PDF rendering engine|
|`jszip` / `@zip.js/zip.js` / `fflate`|ZIP decompression (multiple engines for compatibility)|
|`7z-wasm`|7z archive support (CB7)|
|`js-untar`|TAR archive support (CBT)|
|`mammoth`|DOCX to HTML conversion|
|`marked`|Markdown to HTML conversion|
|`mhtml2html`|MHTML to HTML conversion|
|`rangy`|Cross-browser text selection and range utilities|
|`chardet`|Automatic character encoding detection|
