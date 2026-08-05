---
adr: ADR-0021
proposal_date: 2026-07-31
decision_date: 2026-08-02
implementation_date: 2026-08-02
status: 已实施
name: 复用 Calibre 书目结构支持独立的 MyReader 可写书库
overview: 在统一的 Library、Book、DataSource、内容传输、Reader 和 sidecar 领域模型下，新增由 MyReader 拥有并可写的书库类型。MyReader 书库使用现有每书库 Automerge document 作为书目与阅读数据的跨设备逻辑权威，在本地 myreader.db 中投影当前 Calibre 查询所需的同形表，从而复用 SeaORM entities、查询与路径解析，但不生成、同步或维护 Calibre metadata.db，也不承诺 Calibre 兼容或书库互相转换。第一版只开放单格式图书的导入、删除、书名与作者修改，并复用现有数据源、StorageKey、outbox、同步调度和 Reader 基础设施。
isProject: true
---

# 复用 Calibre 书目结构支持独立的 MyReader 可写书库

## 状态说明

本决策已于 2026-08-02 接受并完成主体实施。正文保留接受时的完整设计和实施顺序；当前事实已同步到
[`ARCHITECTURE.md`](../../ARCHITECTURE.md)。

### 实施记录

| 阶段 | 状态 | 实施结果 |
|---|---|---|
| Phase 1 | 完成 | `libraryType`、marker、catalog document schema、Calibre-shaped projection 与共用 catalog 查询已落地（`baa7f807`、`d2ec4e01`、`bdc4d97f`） |
| Phase 2 | 完成 | 本地 MyReader 书库创建/打开、单格式导入、编辑、删除及 desktop/mobile adapter 已落地（`a9204e05`、`dea82e1f`、`b645bd1f`、`17579e4f`） |
| Phase 3 | 完成 | WebDAV/OneDrive 创建与打开、正文上传/按需下载、SHA-256 校验和 tombstone 删除收敛已落地（`71caa7c8`、`7b0d60f6`、`be3c50bb`） |
| Phase 4 | 完成 | 首次导入创建流程、多个书库、远程目录入口和仅 MyReader 可见的增删改操作已接入 desktop/mobile（`9e92d3c8`、`86d2f7ee`、`fb32712f`、`4bd70c64`） |
| Phase 5 | 完成 | 系统分享入口、Android SAF 外部书库、离线远程导入队列及远程子目录创建已落地（`54ea1b96`、`d27d11e7`、`8f171d16`、`94e7f5ca`）；首次分享在没有 MyReader 书库时复用普通创建流程 |

### 首版补充实现

- iOS/Android 的系统“分享到 MyReader”和文件选择器统一进入同一移动导入用例，再调用 core
  catalog command；若首次分享时没有 MyReader 书库，平台先暂存文件，让用户按普通流程选择
  数据源或目录并填写书库名，创建成功后继续导入。分享入口不拥有第二套书目模型。
- 本地 MyReader 书库的源文件始终位于用户通过系统选择器授权的父目录下。创建时以书库名新建
  同名子目录；同名文件或目录已存在时拒绝创建。应用容器只保存活动 SQLite、缓存和 Android
  SAF 工作数据等设备侧派生数据，不再作为可选的书库源位置。
- “移除书库”只移除应用注册，并可清理应用拥有的设备侧派生数据；不得删除本地授权目录、
  远程目录或其中的图书文件。
- Android SAF 外部 MyReader 书库把 `content://` 保存为 `Library.sourcePath`，把应用私有镜像保存
  为 `Library.path`。正文和 control plane 在 SAF 与镜像间按文件合并，不把活动 SQLite 写入 SAF。
- 远程上传因连接失败时，正文保留在设备容器，`pending_book_imports` 记录设备本地传输意图，
  `file_state` 标记为 `dirty_push`。本地 catalog projection 可立即显示并阅读该书，但 Automerge
  outbox 在正文上传并确认远端 size 前保持不可发布。独立的后台 `BookTransferService` 消费原有队列，
  不占用 sidecar 同步任务或其 UI 状态；上传完成后解除发布门禁并调度一次短 push。该表不是第二个
  catalog，也不参与冲突解决。
- 远程目录选择器允许为新书库输入一个子目录名。平台只组合目标路径；marker、`Books` 和
  Automerge genesis 仍由同一个 core 创建书库用例初始化，不增加独立 mkdir 业务协议。

## 结论

本决策采用以下架构：

1. **Library、Book、`library_id`、`book_id`、DataSource、内容传输、Reader 和 sidecar 是通用
   领域概念。** 不因书目来自 Calibre 或 MyReader 而复制业务模型。
2. **书库位置和书库所有权是两个正交维度。** `sourceType` 继续表示 local、WebDAV 或
   OneDrive；新增 `libraryType` 表示 `calibre` 或 `myreader`。
3. **MyReader 书库的书目逻辑权威是现有每书库 Automerge document。** 在现有六个阅读数据
   root 之外增加 `catalog` root；多设备新增、修改和删除只使用现有 Automerge 合并、StorageKey、
   outbox、projection 和调度实现。
4. **MyReader 书库在现有 `myreader.db` 中复用 Calibre 书目表结构。** `library_id`、`books`、
   `authors`、`books_authors_link`、`data` 以及当前查询依赖的空表都是 Automerge catalog 的本地
   projection。现有 entities、分页、搜索、详情和路径解析继续查询这些同形表。
5. **MyReader 不生成、上传、下载或合并自己的 `metadata.db`。** 活动 SQLite、WAL 和 SHM 都是
   设备本地实现细节，不是书库共享对象。
6. **复用结构不等于维护 Calibre 书库。** MyReader 书库具有独立的所有权标记和 schema 版本；
   不承诺能被 Calibre 打开、修改、往返保存或转换。
7. **外部 Calibre 书库永远只读。** 它继续从外部 `metadata.db` 读取书目；任何 MyReader marker、
   registry 字段或数据源写能力都不能把它升级为可写书库。
8. **书库源文件不由注册生命周期托管。** 本地 MyReader 书库只创建在用户选定的父目录下；移除任意
   本地或远程书库只删除应用注册及设备侧派生数据，不删除源目录或源文件。
   创建书库时所选目录是父目录，实际根目录固定为 `<所选目录>/<书库名>`；目标名称必须尚不存在。
9. **第一版只开放最小图书管理。** 一本书只有一种格式；支持导入、删除、修改书名和作者，不
   引入完整 Calibre 元数据管理。
10. **正文传输与 Automerge 状态交换职责分离，但复用同一 DataSource。** Automerge 同步正文的
   `size + sha256` 描述和删除 tombstone；正文 bytes 继续通过现有 local、WebDAV 和 OneDrive
   内容传输能力上传、下载。两者复用同一 DataSource 和现有 Content/传输调度基础设施，但只有
   Automerge change 进入 durable outbox，正文传输状态继续由设备本地 `file_state`/传输任务维护。
11. **两类书库不互相转换。** 打开 Calibre 或 MyReader 书库都只是注册已有数据源；产品
    不提供 Calibre ↔ MyReader 转换、升级或降级。

一句话概括本决策：

> 同一领域模型，同形本地查询表，同一个 Automerge 合并内核；不同书库所有权，不承诺 Calibre
> 兼容。

## 背景

MyReader 当前以 Calibre 书库为内容权威。用户必须先使用 Calibre 创建书库，MyReader 才能读取
`metadata.db`、封面和书籍文件。这对已有 Calibre 工作流的用户合理，但对只想导入文件并开始
阅读的用户形成了不必要的前置依赖。

新增普通书库有四种可能方向：

1. 为 MyReader 发明另一套 library/book/author/format schema 和查询实现；
2. 让 MyReader 创建并维护完整、对外兼容的 Calibre 书库；
3. 把整个 `metadata.db` 当作远端共享文件，用 ETag、时间戳或自定义 command replay 解决并发；
4. 用现有 Automerge 实现合并 MyReader 书目，并把结果投影成现有查询兼容的 Calibre 表形状。

第一种方向会复制已经存在的概念、DTO、SQL、分页、搜索、详情和文件定位规则。第二种方向会把
Calibre 的完整 schema、trigger、排序规则、迁移和兼容性变成 MyReader 的长期承诺。第三种方向
无法支持离线多设备合并，还会在现有 Automerge 之外建立第二套冲突协议。

因此采用第四种方向。MyReader 复用的是当前 Calibre repository 已经依赖的关系表结构和查询代码，
不是 `metadata.db` 文件，也不是 Calibre 的完整书库格式。

## 书库类型、能力与身份

### 两个正交维度

`Library` registry 增加：

```ts
type LibraryType = "calibre" | "myreader"

type Library = {
  id: string
  name: string
  libraryType: LibraryType
  sourceType: "local" | "webdav" | "onedrive"
  dataSourceId?: string | null
  sourcePath?: string | null
  // 现有字段保持不变
}
```

- `libraryType` 决定书目所有权、catalog 来源和可用 command。
- `sourceType` 和 `dataSourceId` 决定 marker、Automerge 对象和正文位于哪个存储后端。
- 数据源自身的 `readonly` 继续限制底层写能力。
- 不持久化第二个容易漂移的 `writable` 布尔值。
- 旧配置没有 `libraryType` 时必须默认解释为 `calibre`，禁止升级后意外获得写能力。

MyReader command 的能力检查为：

```text
library.libraryType == myreader
AND ownership marker valid
AND marker libraryUuid == Automerge libraryUuid
AND data source is writable
```

该检查是所有权与底层能力校验，不参与并发冲突解决。通过检查后的书目变化仍只由 Automerge
合并。

### 身份

继续使用现有身份概念：

| 身份 | 作用域 | 用途 |
|---|---|---|
| `Library.id` | 单设备 registry | 路由、缓存、设备本地配置 |
| `libraryUuid` / `library_id.uuid` | 书库内、跨设备稳定 | Automerge document ID、书库身份校验 |
| `books.id` / `book_id` | 单书库稳定正整数 | catalog 查询和阅读数据关联 |
| `books.uuid` | 单书库稳定 UUID | Automerge book key、正文目录和未来扩展 |

两类书库的 UUID 启动来源不同：

- Calibre：从外部只读 `metadata.db.library_id.uuid` 读取。
- MyReader：创建时生成并写入 `.myreader/library.json`；打开已有书库时先用 marker 定位同 UUID
  的 Automerge document。`myreader.db.library_id.uuid` 是同值 projection。

MyReader marker 必须保存 UUID，因为新设备在尚未创建本地 SQLite projection 前就需要得到
document ID。Automerge document 中现有 `libraryUuid` 继续用于内容校验，二者不一致时停止打开，
不得自动改写任一侧。

每本新书生成一次 `books.uuid` 和稳定正整数 `book_id`，并把两者写入同一个 Automerge book
record。`book_id` 不使用设备本地 `MAX(id) + 1`；实现应使用跨副本低碰撞、且不超过
`Number.MAX_SAFE_INTEGER` 的正 53 位随机 ID，并在本地提交前检查已占用值。这样同一 ID 可由
Rust、SQLite、Tauri 和 React Native 的 JavaScript `number` 无损传递。书目 map 以完整
`books.uuid` 为 key，ID 生成不承担任何合并或胜负选择。

## 存储结构

### 共享书库源

local、WebDAV 和 OneDrive 上的 MyReader 书库源使用：

```text
<library-source-root>/
  Books/
    <book-uuid>/
      book.<format>
      cover.jpg
  .myreader/
    library.json
    automerge/
      <library-uuid>/
        snapshot/
          <heads-hash>
        incremental/
          <content-hash>
```

`.myreader/library.json` 是 MyReader 所有权和 bootstrap 标记：

```json
{
  "type": "myreader-library",
  "version": 1,
  "libraryUuid": "018f2f8d-980b-40ef-b72e-c6e86cb7cc28"
}
```

共享源中不存在 MyReader `metadata.db` 或 `myreader.db`。书名和作者变化不重命名或移动正文，
现有相对路径解析固定映射为：

```text
books.path = Books/<book-uuid>
data.name = book
data.format = <大写格式名>
```

### 每设备容器

每台设备继续维护自己的书库容器：

```text
<device-library-container>/
  Books/                    # 按需下载的正文/封面缓存；local-direct 可直接引用源文件
  .myreader/
    myreader.db             # Automerge state、outbox、阅读 projection、catalog projection
```

`myreader.db`、WAL 和 SHM 不进入 DataSource 的远端对象列表，也不能由文件同步代替 Automerge。
即使 local-direct 指向可被多个设备访问的目录，活动 SQLite 仍必须位于各设备自己的容器。

### Catalog schema 复用边界

`my-reader-core` 的 app database migrator 在 `myreader.db` 中创建当前
`entities/calibre` 和 catalog 查询所需的同形表。现有 repository 的查询实现从“固定打开
`<library-root>/metadata.db`”拆成“给定只读连接和 content root 执行查询”：

- Calibre adapter 提供外部 `metadata.db` 的只读连接；
- MyReader adapter 提供本地 `myreader.db` 中 catalog projection 的连接；
- 列表、分页、搜索、详情、格式和相对路径组装共用同一查询实现。

第一版由 catalog projector 填充：

- `library_id`
- `books`
- `authors`
- `books_authors_link`
- `data`

当前查询会 join 的标签、系列、出版社、评分、评论、语言和 identifiers 等表按现有 Calibre 表
形状创建但保持为空，避免为 MyReader 复制或分叉查询。第一版不为它们增加编辑 UI 或同步字段。

Automerge 中的规范书目不是上述关系表的逐行镜像，而是“每本书一个聚合 record”。这样可以让
一本书的书名、作者、格式和正文描述在同一个 CRDT object 中演进，同时避免在并发环境中维护
`authors.name` 唯一性、`books_authors_link` 外键、`data` 单格式唯一性和孤立关系行。Calibre-shaped
关系表只是设备本地、可完整重建的读取 projection。

projection 规则如下：

- `library_id.uuid = document.libraryUuid`；
- `books.id = bookId`，`books.uuid = catalog.books` 的 map key，`books.path = Books/<book-uuid>`；
- `books.title`、`books.timestamp`、`books.last_modified` 和 `books.has_cover` 来自 record，
  `books.sort` 与 `books.author_sort` 由 projector 从书名和作者确定性派生；
- 每个可见 record 生成一条 `data`，其中 `book = bookId`、`format` 为大写格式名、
  `uncompressed_size = size`、`name = book`；
- `authors` 是 record 内的有序作者名列表。projector 按完全相同的作者名复用本地 `authors` 行，
  并生成 `books_authors_link`；这只是满足现有查询形状，不建立跨书、跨设备的作者实体身份。

`authors.id`、`books_authors_link.id` 和 `data.id` 都只是本地 projection surrogate key，不进入
Automerge，也不能被 sidecar 数据引用；完整重建后它们允许重新分配。跨设备稳定且可被阅读数据
引用的仍然只有 `books.id / bookId`。第一版不提供独立作者管理、作者合并或作者实体级同步。

这不是 Calibre 兼容承诺：

- 不创建名为 `metadata.db` 的 MyReader 数据库；
- 不复制当前查询不需要的 Calibre 内部表、view、trigger 或自定义 SQLite 函数；
- 不承诺 Calibre 的 `application_id`、`user_version` 或 migration 语义；
- MyReader 自有表只由现有 `myreader.db` migrator 管理；
- 外部 Calibre `metadata.db` 永远不进入 MyReader migrator。

### 单格式规则

Automerge book record 只保存一个格式；projection 维持：

```text
每个可见 books.id 恰好对应一条 data 记录
```

- 导入另一个文件会创建另一本书，不提供“给现有图书添加格式”。
- MyReader UI 不展示格式选择或多格式管理。
- 现有 Reader/DTO 若以格式数组表达数据，继续返回长度为 1 的数组。
- 单格式书籍继续走现有阅读格式短路逻辑，不写冗余选择记录。

## Automerge document

### 扩展现有 document

继续保持“每书库一个 Automerge document”。现有六个阅读数据 root 不变，只新增一个 catalog
root：

```text
ROOT
├── schema
├── libraryUuid
├── catalog
│   └── books
│       └── <books.uuid>
│           ├── bookId
│           ├── title
│           ├── authors[]
│           ├── format
│           ├── size
│           ├── sha256
│           ├── hasCover
│           ├── timestamp
│           ├── lastModified
│           └── deleted
├── favorites
├── positions
├── bookmarks
├── annotations
├── sessions
└── completions
```

每个 `<books.uuid>` 必须是嵌套的 Automerge map，`authors` 必须是该 map 下的 Automerge list；
不得把整本书编码成一个 JSON string 或单个 scalar register。`update_book_metadata` 只改目标字段，
不能重写整个 record，因此书名和作者等不同字段的并发修改可以独立合并。

catalog record 只表达第一版已有概念：`size` 是正文准确字节数，`sha256` 是正文准确字节的
SHA-256 32-byte 摘要的小写十六进制编码，`format` 是 EPUB、PDF 或 CBZ 的大写格式名；这些值在
record 创建后不可由 metadata command 修改。`timestamp` 和 `lastModified` 只服务于现有列表、
详情和 projection，不能用于冲突胜负。Calibre 表中的 `path`、`data.name`、排序字段和关系行由
deterministic projector 生成，不作为第二份可编辑状态。

删除不移除 `<books.uuid>` map，而是把 `deleted` 单调写为 `true`。缺失 `deleted` 的旧 record 按
`false` 解释；第一版没有把它写回 `false` 的 undelete command。projector 与现有 annotation
tombstone 一样读取该字段的 Automerge 并发候选，只要任一可见候选为 `true` 就不再投影该 record。
该约束复用已有删除语义，不增加另一套删除冲突协议。

这次扩展需要提升 document schema version，并提供从当前 schema 的明确 migration：

- 为已有 document 增加空 `catalog.books`；
- 保留六个现有 root、change history、library UUID 和业务 projection；
- Calibre 书库的 catalog root 始终为空；
- MyReader 新书库从新 schema genesis 开始；
- 不创建第二个 document、第二个远端目录或双写期。

### 唯一冲突语义

Automerge 是书目和阅读数据唯一的多设备冲突语义：

- 不使用 ETag 串行化整个 catalog；
- 不增加 HLC/LWW 时间戳、SQL diff、last-write-wins service 或 command replay 协议；
- 不由平台层根据设备时间、上传顺序或 replica ID 选择胜者；
- concurrent change 由 Automerge 保存和合并；
- projector 使用 Automerge 当前可见值；并发候选仍保留在 document 中，可沿用现有
  `get_all` 能力诊断或供未来产品化解决，不在第一版另造冲突表。

不同字段的并发修改可以自然合并；除前述复用的 tombstone “任一 `true` 即删除”规则外，同一字段
的真并发结果遵循 Automerge 本身的 map/list 语义。删除 command 只写 `deleted = true`，metadata
command 不触碰该字段，因此删除与书名、作者修改并发时 record 仍保持 tombstone，且不会因整个
JSON record 的 register 冲突而复活。第一版不覆盖或包装这套语义。

## Core 架构

```text
Library API / use case
          │
          ▼
通用 CatalogService
          │
          ├─ calibre
          │    └─ 外部 metadata.db（只读）
          │
          └─ myreader command
               └─ 现有 Automerge document
                    └─ 同一 myreader.db 事务
                         ├─ Automerge state
                         ├─ durable outbox
                         ├─ catalog projection（Calibre-shaped tables）
                         └─ 六个阅读数据 projection

共享 CatalogRepository queries
          ├─ 查询 Calibre metadata.db
          └─ 查询 MyReader myreader.db catalog projection

通用 DataSource / Content / Reader
          ├─ local
          ├─ WebDAV
          └─ OneDrive
```

### 读取

列表、分页、搜索、详情、格式、封面和文件路径继续走同一套 repository 查询。实现时只分离数据库
连接和 content root，不复制 SQL 或 DTO：

- `CalibreBookRepository` 逐步泛化为 `CatalogRepository`，迁移期可保留 alias；
- `CalibreBook` 逐步泛化为 `Book`；
- `calibreId` 逐步泛化为 `bookId`；
- UI 不需要按 `libraryType` 复制列表、详情、收藏或 Reader 页面。

不为了命名一次性重写全部调用方；先让 repository 接受两种只读连接，再按调用链收敛兼容名。

### 写入

第一版 MyReader catalog command：

- `create_myreader_library`
- `import_book`
- `delete_book`
- `update_book_metadata`

平台 adapter 只提交高层 command，不能直接执行 catalog SQL、修改 Automerge binary，或把前端
布尔值转换成写权限。

本地书目 mutation 沿用现有持久化合同：

```text
校验 libraryType + marker + data source
          ↓
向 Automerge catalog root 提交 change
          ↓
同一 myreader.db 事务写 state + outbox + catalog/reading projections
          ↓
事务提交后触发现有同步调度并刷新可见查询
```

catalog projection 可从 Automerge snapshot 完整重建。projection 失败时整个事务失败，不允许
仅更新查询表或仅产生待上传 change。

外部 Calibre `metadata.db` 只有只读打开入口。MyReader 没有“以写模式打开 metadata.db”的入口。

## 产品范围

### 第一版包含

1. 首次启动可以：
   - 导入或分享图书；若尚无 MyReader 书库，进入与普通创建相同的数据源或目录及名称选择流程，
     创建成功后继续导入；
   - 进入添加书库流程。
2. 添加书库流程支持：
   - 创建空白 MyReader 书库；
   - 打开已有 MyReader 书库；
   - 连接已有 Calibre 书库。
3. 支持添加多个 MyReader 书库。
4. 支持在 local、WebDAV 和 OneDrive 数据源创建 MyReader 书库。
5. 支持向 MyReader 书库导入和删除 EPUB、PDF、CBZ。
6. 支持修改书名和作者。
7. 支持远程正文上传和按需下载。
8. 复用当前格式的 Reader 能力。
9. 复用现有 sidecar 阅读数据，包括收藏、阅读位置、书签、批注、阅读 session 和完成记录。
10. 移除书库只移除应用注册，不删除本地或远程书库文件。

系统“分享到 MyReader”与文件选择器都是同一导入用例的平台入口，不改变 catalog 领域模型。

### 产品术语

产品使用：

- “创建新书库”
- “打开已有书库”

“打开已有书库”对 MyReader 和 Calibre 都只表示注册现有目录，不能暗示复制、迁移或转换。

## 不支持转换

本决策明确排除以下路径：

- 不给现有 Calibre 书库补 marker 并改为可写；
- 不把 Calibre `metadata.db` 迁移为 MyReader 所有；
- 不把 MyReader 书库转换或导出为 Calibre 书库；
- 不在两种书库之间保持书目、ID 或文件的映射；
- 不承诺 Calibre 能识别、修复或维护 MyReader 书库。

用户从某个目录取得一本正文文件，再将该文件导入另一书库，只是一次普通 `import_book`，不构成
书库转换或同步关系。

## 数据源与正文文件

DataSource 只提供存储能力，不理解 Calibre 或 MyReader 业务语义。现有 local、WebDAV 和
OneDrive backend 的 stat、read、write、list、download、upload 和 delete 能力继续复用。

### 创建与打开远程书库

创建空白远程 MyReader 书库：

1. 生成稳定 `libraryUuid` 和合法 marker；
2. 创建含空 catalog 和六个阅读 root 的 Automerge genesis；
3. 通过 ADR-0020 的 StorageKey 路径保存 snapshot/incremental；
4. 在当前设备创建 `myreader.db` 并投影空 catalog。

打开已有远程 MyReader 书库：

1. 读取并校验 marker；
2. 使用 marker 中的 UUID 加载现有 Automerge StorageKey 对象；
3. 由 Automerge 合并所有可见 snapshot/incremental；
4. 在当前设备重建 catalog 与阅读数据 projection。

该流程不读取远端 `metadata.db`，也不为不同 backend 实现不同 catalog 合并逻辑。

### 导入、下载与删除

正文路径由稳定 `books.uuid` 决定，正文对象在第一版创建后不可变；替换正文等价于删除旧书后
重新导入，不在原路径原地覆盖。Automerge 是包含文件描述和删除 tombstone 的 control plane，
DataSource 是传输 EPUB、PDF、CBZ 正文字节的 content plane。正文不写入 Automerge snapshot、
incremental 或单独的每书 document。

本地与远程导入都先把输入复制到设备容器的暂存文件，计算准确 `size + sha256`，再安装到
`Books/<uuid>/book.<format>`。本地书库在正文安装成功后即可提交 catalog add；远程书库使用以下
发布顺序：

```text
暂存正文并计算 size + SHA-256
          ↓
记录设备本地待上传状态
          ↓
上传 Books/<uuid>/book.<format>
          ↓
确认上传完成且远端 stat 的 size 一致
          ↓
提交 Automerge catalog add change
          ↓
由现有 outbox 上传 Automerge incremental
```

因此其他设备只会在书目变更可见后下载已经存在的正文。上传成功但 catalog command 未提交时，
最多留下不可见孤立对象，不会产生指向缺失正文的已合并书目。远端不可用时，第一版只保留设备
本地待上传任务并重试，不提前发布 catalog record；它不是可离线完成并立即跨设备可见的导入。
该任务由设备本地 `pending_book_imports` 与 `file_state = dirty_push` 表达；任务完成时才产生原有
Automerge catalog command。它不进入 Automerge document，不复制 catalog，也不定义新的合并或
冲突策略。
上传失败同样不发布 record。

`cover.jpg` 是可选的展示派生物，不是第二种图书格式；`hasCover = true` 时也必须在 catalog add
发布前完成封面上传，否则以 `hasCover = false` 发布。正文的 `size + sha256` 校验合同不因封面
缺失或损坏而降级。

OneDrive 小文件可以继续使用单次 PUT，但不能把它作为所有正文的唯一上传路径。正文大于
10 MiB 时使用 Microsoft Graph upload session，按顺序上传可恢复的 byte range，非末尾 chunk
大小使用 320 KiB 的整数倍且每个请求小于 60 MiB；Graph 单次 PUT 的 250 MB 上限不能成为
MyReader 的图书大小上限。

其他设备合并 catalog 后先把正文标记为 `remote_only`，只在打开图书或显式下载时传输；封面继续
沿用现有独立的按需缓存路径。正文下载必须遵循：

```text
下载到最终文件同目录的临时 .part 文件
          ↓
校验准确 size 和 SHA-256
          ↓
同文件系统原子 rename/replace 到最终路径
          ↓
提交 file_state = present
```

不得因为最终路径已经存在且非空就视为成功；复用已有文件前也必须匹配 catalog 的
`size + sha256`。校验失败或下载中断不能暴露部分正文给 Reader，第一版可以删除 `.part` 后整文件
重试，不要求为所有 DataSource 实现通用分块下载协议。

删除采用 tombstone 先行、正文清理随后且可重试的顺序：

1. `delete_book` 在 Automerge book map 中单调写入 `deleted = true`；同一事务保存 state、outbox
   并从本地 catalog projection 隐藏该书；
2. 对远程书库，等待包含 tombstone 的 Automerge change 已持久化到共享 DataSource；若 push
   失败，保留远端正文并重试，不能先删正文；
3. tombstone 可由其他设备取得后，删除共享源中的该书正文和封面，并清理发起设备的本地缓存；
   该删除是幂等操作，失败只产生待重试的文件传输状态，不能撤销 tombstone；
4. 其他设备 pull 到 tombstone 后，同样移除 catalog projection、设备本地正文/封面缓存和对应
   `file_state`，但保留六个阅读数据 root。

设备恢复联网时先 pull/merge Automerge，再执行正文上传或缺失修复；处理 tombstone 的设备可以
幂等重试远端删除，避免旧副本在尚未看到 tombstone 时短暂重传正文后永久留下文件。

用户在 WebDAV、OneDrive 或文件系统外部手动删掉正文，只表示源文件缺失，不等价于
`delete_book`，也不能由 `stat 404` 自动生成 tombstone。此时保留 catalog 和其他设备缓存，将该
文件报告为 `source_missing` 以便重试或修复。

待上传、待远端删除、`remote_only` 和 `source_missing` 都是现有 `file_state`/传输任务的设备本地
生命周期，不进入 Automerge catalog，也不参与书目冲突选择。实现可以扩展现有状态值，但不能为
正文再建一套 CRDT、ETag/LWW catalog 或第二个同步 document。

现有 `file_state.local_blake3` 来自已被取代的旧 Manifest/CAS 方案，当前也不构成有效的正文校验
合同。实施本决策时应迁移为 `local_sha256`；遗留 BLAKE3 值不能解释为 SHA-256，可以丢弃并在文件
下次校验时重新计算。正文 SHA-256 在共享 `my-reader-core` 中流式计算，桌面和移动端不得各自实现
不同算法。

正常 `delete_book` 的路径已由稳定 UUID 精确确定，因此不需要等待所有副本确认即可在 tombstone
持久化后删除该正文。它与全局 orphan GC 是两件事：上传完成但 catalog 未发布、或异常竞态留下的
“没有可见 catalog record 指向”的对象，仍由后续独立的保守清理决策处理，第一版不扫描并猜测
删除这些未知对象。

## Sidecar、同步与调度

- 每书库仍只有一个 `myreader.db` 和一个 Automerge document；
- marker/library UUID 继续作为 document ID；
- `books.id` 继续作为收藏、位置、书签、批注、session 和完成记录的 `book_id`；
- catalog、六个阅读 root、Automerge state、projection 和 durable outbox 在同一数据库事务中
  持久化；
- ADR-0020 的 StorageKey、snapshot/incremental、内容寻址、加载、压缩和故障恢复规则不变；
- ADR-0017 的事件驱动调度继续以同一个 outbox 为待发送的 Automerge 事实源；离线正文只使用设备
  本地 `pending_book_imports` 传输队列，正文上传完成前不产生 catalog change；
- 数据源 registry、书库 registry 和凭据仍不进入 Automerge document。

ADR-0012 的 sync scope 按书库类型解释：

- Calibre 书库：`calibre` 阶段刷新外部只读 `metadata.db`；`myreader` 阶段交换六个阅读 root；
- MyReader 书库：跳过 `calibre` 阶段；`myreader` 阶段一次交换 catalog 与六个阅读 root；
- `all` 继续编排当前书库实际需要的阶段。

不得为了 catalog 新增第二个 scope、第二个 CRDT document、第二个远端同步目录或第二套自动调度。

## 方案比较

| 方案 | 代码复用 | 多设备合并 | 第一版复杂度 | 结论 |
|---|---|---|---|---|
| 独立 MyReader schema 与 repository | 低；复制 Book/Author/Format 查询 | 需另行设计 | 中 | 不采用 |
| 维护完整 Calibre 书库 | 高 | Calibre 不提供本场景的合并 | 高且形成兼容承诺 | 不采用 |
| 同步整个 `metadata.db`，使用 ETag/LWW/command replay | 表面较高 | 另造协议，离线并发受限 | 高风险 | 不采用 |
| 为 catalog 新建第二个 Automerge document/同步器 | 中 | Automerge | 重复 storage、outbox 和调度 | 不采用 |
| 现有 Automerge document + `myreader.db` Calibre-shaped projection | 高；共享 entities、查询、DTO 和同步内核 | 复用现有 Automerge | 最低 | **采用** |
| 直接允许写任意 Calibre `metadata.db` | 表面最高 | 无所有权边界 | 风险不可接受 | 不采用 |

## 非目标

- 不实现 Calibre ↔ MyReader 书库转换。
- 不保证 MyReader 书库可由 Calibre 打开或维护。
- 不写入外部 Calibre `metadata.db`。
- 不创建或同步 MyReader `metadata.db`。
- 不实现一本书多格式。
- 不实现标签、系列、评分、出版社、语言、标识符或评论管理。
- 不实现自动书目联网搜索、模糊查重或版本合并。
- 不监控任意文件夹并原地维护索引。
- 不实现跨书库移动、复制或身份关联。
- 不增加 Automerge 之外的书目冲突策略。
- 不增加第二个 catalog document、中央服务或多人实时协作协议。
- 不在第一版清除 Automerge catalog tombstone。
- 不在第一版扫描并猜测删除“没有可见 catalog record 指向”的远端孤立对象。
- 不同步数据源配置、凭据、已添加书库列表或 Reader UI 设置。

## 与既有 ADR 的关系

- **扩展 [ADR-0010](./0010-remote-library-acceleration.md)。** 继续复用统一 RemoteBackend 和正文
  缓存/传输；远程 MyReader 书库不下载或条件写 `metadata.db`。
- **修正 [ADR-0012](./0012-mobile-sync-refactor.md) 的阶段语义。** Calibre 阶段只属于 Calibre
  书目刷新；MyReader 书库的 catalog 与阅读数据都在现有 `myreader` Automerge 阶段完成。
- **扩展 [ADR-0016](./0016-adopt-automerge-for-library-sidecar-sync.md)。** 同一 document 从六个
  阅读 domain 增加 catalog domain；书目并发直接使用已经实现的 Automerge 合并与候选读取能力。
- **扩展 [ADR-0017](./0017-event-driven-library-sidecar-sync-scheduling.md)。** catalog mutation
  进入同一 durable outbox，并由同一个事件调度器 push/pull。
- **修正 [ADR-0019](./0019-adopt-modular-my-reader-core.md) 的数据库边界。** 外部 Calibre
  `metadata.db` 仍完整只读；MyReader-owned catalog 表由 core 在现有 `myreader.db` 中迁移和
  投影。平台层仍不得直接操作数据库。
- **扩展 [ADR-0020](./0020-adopt-automerge-repo-storage-model.md)。** document ID 对 MyReader
  来自 marker 中的稳定 UUID；同一 document 增加 catalog root 并提升 schema version，其余
  StorageKey、snapshot/incremental、压缩和恢复规则不变。

## 实施顺序

### Phase 1：身份、document schema 与 projection

- `Library` 增加向后兼容的 `libraryType`；
- 冻结 marker schema 和 UUID 校验规则；
- 为现有 Automerge document 增加 catalog root 和 schema migration；
- 在 `myreader.db` migrator 中加入当前查询所需的 Calibre-shaped tables；
- 把 catalog repository 拆为共享查询实现、数据库连接和 content root；
- 证明旧配置及所有外部 Calibre `metadata.db` 永远只读。

### Phase 2：本地最小闭环

- 在用户通过系统选择器授权的父目录下，以书库名创建同名子目录作为空白 MyReader 书库；
- 拒绝同名目标；
- 通过 Automerge command 导入 EPUB、PDF、CBZ；
- 在 shared core 中提供桌面和移动共用的流式 SHA-256 文件摘要；
- 在同一事务中持久化 state、outbox 与 catalog projection；
- 列表、搜索、详情和 Reader 复用现有路径；
- 删除图书；
- 修改书名和作者；
- 收藏及全部现有阅读数据路径复用。

### Phase 3：远程 MyReader 书库

- 在可写 WebDAV/OneDrive 数据源创建空白书库；
- 通过 marker + Automerge StorageKey 打开已有书库；
- 正文先上传并确认 size、catalog 后发布，离线导入保留为设备本地待上传任务；
- OneDrive 大于 10 MiB 的正文使用可恢复 upload session；
- 正文按需下载到 `.part`，通过 `size + sha256` 校验后原子安装；
- tombstone 先持久化到共享 DataSource，再幂等删除远端正文和各设备缓存；
- 验证两台离线设备恢复联网后 catalog 与阅读数据由同一 Automerge document 收敛。

### Phase 4：入口收敛

- 首次导入或分享在没有 MyReader 书库时复用普通创建流程，创建后继续导入；
- 多 MyReader 书库管理；
- 文件选择器和系统分享统一调用 `import_book`；
- UI 只在 MyReader 书库显示新增、删除和编辑动作。

### Phase 5：平台文件入口与离线传输补齐

- iOS/Android 接收系统分享的 EPUB、PDF、CBZ，并复用文件导入用例；
- Android 使用 SAF 打开或创建外部 MyReader 书库，以应用私有镜像承载 SQLite 与 Reader 路径；
- 远程导入连接失败时保留设备本地正文与传输意图，恢复后按“正文先上传、catalog 后发布”重试；
- 远程创建流程允许在当前目录下指定一个新子目录，不另建目录管理后端。

## 验收约束

实施至少保护以下持久行为：

1. 旧 registry 记录升级后仍是只读 Calibre 书库。
2. 所有外部 Calibre `metadata.db` 都只以只读模式打开。
3. MyReader 创建、打开和同步流程不依赖、生成或上传 `metadata.db`。
4. marker、Automerge document 和 `library_id` projection 使用同一稳定 UUID；不一致时停止打开。
5. MyReader catalog command 在同一 `myreader.db` 事务中提交 Automerge state、outbox 和
   catalog projection；任一失败不产生部分提交。
6. 同一 Automerge snapshot 可以完整重建语义相同的 Calibre-shaped catalog rows；除
   `books.id` 外的 projection surrogate key 不构成跨设备身份。
7. 每本书是嵌套 Automerge map，metadata command 只更新目标字段；两台设备并发新增不同书籍后
   两本都可见，同字段冲突只遵循 Automerge，不执行 ETag、时间戳或自定义 LWW。
8. MyReader 每个可见 `books.id` 始终只有一条 `data` 记录。
9. 修改书名或作者不改变 `book_id`、`books.uuid`、`size + sha256` 或正文相对路径。
10. catalog add 对其他设备可见时，对应远端正文已经上传成功且 stat size 一致。
11. 下载只有在 `.part` 的 size 和 SHA-256 都通过后才原子安装；部分文件和错误摘要不能进入
    Reader，也不能被标记为 `present`。
12. `delete_book` 的 tombstone 在删除共享正文前已持久化到共享 DataSource；其他设备合并后删除
    本地缓存，且并发 metadata 修改不能复活该书。
13. 外部手动删除正文只产生 `source_missing`，不会自动删除 catalog 或其他设备文件。
14. 删除一本书不会删除其他书籍或改写外部 Calibre 源文件；无 catalog 引用的 orphan sweep
    不属于第一版。
15. Calibre 与 MyReader 书库返回相同 DTO，并复用同一分页、搜索、详情和 Reader 查询实现。
16. 收藏和阅读数据继续只依赖 `library UUID + book_id`，不因 `libraryType` 复制 schema。
17. 产品中不存在书库转换、升级或降级入口。
18. 系统分享和文件选择器进入同一导入用例，格式校验、目标书库选择和 catalog command 不分叉；
    没有 MyReader 书库时必须先完成普通创建流程，不能静默创建应用容器书库。
19. Android SAF 书库不会把活动 `myreader.db`、WAL 或 SHM 放进用户授权目录；control 文件按对象
    合并，不能用整目录覆盖破坏其他设备写入。
20. 离线远程导入在正文上传并校验成功前不投影可见书目；恢复联网后使用预分配的稳定
    `book_id + books.uuid` 幂等完成，且 catalog 冲突仍只由 Automerge 处理。
21. 在远程浏览器输入子目录名只改变创建用例的目标路径；打开已有 MyReader 或 Calibre 书库的
    路径语义不变。
22. 移除任意书库只删除应用注册及应用拥有的设备侧派生数据；本地授权目录、远程目录和源图书
    文件必须保留。
23. 创建 MyReader 书库时，用户选择的是父目录，书库根固定为 `<父目录>/<书库名>`；同名文件或
    目录已存在时，创建必须失败且不得改写已有内容。

针对本决策新增的测试只保护所有权、身份、单格式、事务、projection 重建、Automerge 收敛和正文
发布/校验/删除时序等持久合同，不锁定 UI 间距、文案排版或内部函数拆分。

## 后果

### 收益

- 不发明第二套 Library、Book、Author 或 Format 领域概念；
- 最大化复用当前 Calibre-shaped entities、catalog 查询、DTO、路径解析、Reader 和 sidecar；
- 书目与阅读数据共享已经实现的 Automerge、StorageKey、outbox、projection 和调度；
- 不需要同步可变 SQLite，也没有第二套 ETag/LWW 冲突协议；
- Calibre 用户继续获得严格只读保证；
- 非 Calibre 用户可以直接创建、导入和管理最小书库；
- local、WebDAV 和 OneDrive 继续共享同一数据源及内容传输基础设施；
- 正文摘要复用 shared core 已有的 SHA-256 依赖与算法约定，不延续旧 Manifest/CAS 的 BLAKE3
  协议；
- 同形空表和单格式约束为以后按真实需求扩展元数据留出迁移空间。

### 代价

- 现有 Automerge document 需要 schema migration，并从六个 root 扩展为七个；
- `myreader.db` migrator 需要拥有一组 Calibre-shaped catalog projection 表；
- catalog repository 需要把共享查询与固定 `metadata.db` 路径解耦；
- marker 现在承担 MyReader document bootstrap identity，必须和 Automerge 内容严格校验；
- 正文和 catalog 是不同对象，导入需要保证“正文先可读、书目后发布”，远程离线导入只能先进入
  设备本地待上传状态；
- 删除需要保证“tombstone 先共享、正文后删除”并保存可重试的传输状态；正常删除可以回收明确
  路径，但上传中断等异常仍可能留下第一版不主动扫描的孤立对象；
- 一部分现有 Calibre 命名需要渐进泛化，同时保留兼容 alias 避免大爆炸重构。

## 参考

- [ADR-0010：远程书库通用加速层](./0010-remote-library-acceleration.md)
- [ADR-0012：Mobile Sync Refactor](./0012-mobile-sync-refactor.md)
- [ADR-0016：采用 Automerge 作为书库 sidecar 的 CRDT 核心](./0016-adopt-automerge-for-library-sidecar-sync.md)
- [ADR-0017：使用事件驱动调度自动同步书库 sidecar](./0017-event-driven-library-sidecar-sync-scheduling.md)
- [ADR-0019：采用模块化 my-reader-core 统一跨端后端业务](./0019-adopt-modular-my-reader-core.md)
- [ADR-0020：采用 automerge-repo 存储模型重构书库 sidecar](./0020-adopt-automerge-repo-storage-model.md)
- [Calibre metadata SQLite schema](https://github.com/kovidgoyal/calibre/blob/master/resources/metadata_sqlite.sql)
- [Automerge：Modeling data](https://automerge.org/docs/cookbook/modeling-data/)
- [Automerge：Document storage](https://automerge.org/docs/reference/under-the-hood/storage/)
- [NIST FIPS 180-4：Secure Hash Standard](https://csrc.nist.gov/pubs/fips/180-4/upd1/final)
- [Git LFS specification](https://github.com/git-lfs/git-lfs/blob/main/docs/spec.md)
- [Microsoft Graph：Upload or replace driveItem content](https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0)
- [Microsoft Graph：Create an upload session](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0)
