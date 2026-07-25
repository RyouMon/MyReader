---
adr: ADR-0016
proposal_date: 2026-07-25
decision_date: 2026-07-25
status: 已接受
name: 采用 Automerge 作为书库 sidecar 的 CRDT 核心
overview: 保留每书库 sidecar、本地 SQLite projection 和现有数据源边界，用 Automerge 的二进制 change、因果历史与冲突保留能力取代 ADR-0015 已部分实施的 HLC、自研 CRDT join 和普通 JSON segment；先验证 Rust、Expo iOS、Expo Android 跨端互操作，再按阅读进度、收藏、书签、批注、阅读会话与完成记录的顺序完成替换。
isProject: true
---

# 采用 Automerge 作为书库 sidecar 的 CRDT 核心

## 结论

采用以下目标架构：

1. **继续以每个 Calibre 书库自己的 sidecar 作为唯一同步边界。** 不新增中央 Profile、账户、
   服务器或第二个同步目录。
2. **使用 Automerge Core 负责 CRDT 因果历史、二进制 change、依赖、去重、冲突保留和收敛。**
   不继续维护 MyReader 自己的 HLC、通用 join primitive 或 JSON change codec。
3. **每台设备继续使用自己的每书库 SQLite。** Automerge state/change、同步 outbox 和现有业务
   projection 必须在同一个本地 SQLite 事务边界内持久化；不得同步 SQLite、WAL 或 SHM 文件。
4. **远端 sidecar 只交换不可变 Automerge 二进制增量和可选 bootstrap snapshot。** 现有
   OneDrive、WebDAV 和本地目录能力继续负责列举、下载和上传；本提案不重新定义数据源适配器接口。
5. **Automerge state 是同步与冲突的逻辑权威，SQLite 业务表是可重建的本地查询投影。** 所有参与
   同步的产品写必须同时产生 Automerge change 和 projection 更新，禁止直接修改投影后再异步补写
   change。
6. **只接入 ADR-0015 已冻结的六个现有 domain。** 不借本次替换新增评分、书架、分类、标签、阅读
   偏好、用户设置或其他尚不存在的功能。
7. **阅读进度保留真正并发的候选值。** 当当前设备看到两个互不具有因果先后的阅读位置时，允许
   用户选择继续哪一个；该选择产生一个因果上晚于两个候选的新 Automerge change，并同步到所有
   设备。

本决策对既有 ADR 的影响：

- [ADR-0015](./0015-library-sidecar-crdt-reading-sync.md) 已标记为“部分实施，已取代”，并添加
  `superseded_by: ADR-0016`；原正文只补充归档状态，不回写历史结论。
- ADR-0015 中关于书库 sidecar 所有权、本地 SQLite、六个业务 domain、ReaderLocator、无中央
  Profile 和当前书库统计口径的决策继续有效。
- ADR-0015 中关于 HLC、类型化自研 CRDT join、普通 JSON segment、自定义 change schema 和相关
  跨语言底层合并合同的决策由本提案取代。

实现只保留 Automerge 产品路径，不长期双轨。运行验证、已知限制和回归证据记录在同步回归文档，
不写入 ADR 状态。

## 背景

ADR-0015 已经完成或部分完成：

- 六个 domain、HLC、普通 JSON segment 和错误语义的合同；
- SQLite 事务 outbox、prepared segment、cursor 和崩溃恢复内核；
- 阅读进度与收藏的 desktop/mobile 产品纵向切片；
- 书签切片的部分实现。

这些工作证明了每书库 sidecar、不可变远端文件、本地 SQLite projection 和产品写入拦截的方向
可行，也暴露出自研 CRDT 内核需要长期承担的职责：

- TypeScript 与 Rust 必须分别实现并保持相同的 HLC、join、codec 和验证逻辑；
- change 因果依赖、重复、乱序、缺口、fork 和损坏输入需要由应用协议自己解释；
- 同一字段的离线并发被 HLC 强制排成一个总序，无法区分“明确发生在后”与“双方互不可见”；
- losing value 虽然可能仍存在于远端历史中，但本地 projection 不具备直接向用户展示并发候选的
  模型；
- 新增 domain 时容易同时扩张业务语义与通用分布式系统内核。

本提案接受二进制线路和 Automerge 依赖，以便把通用 CRDT 正确性收缩到成熟库中，同时保留
MyReader 特有的书库所有权、对象存储传输和阅读产品语义。

## 决策驱动因素

按优先级排序：

1. desktop、iOS、Android 在离线、多 replica、乱序和重复输入下确定收敛。
2. 不依赖设备墙上时钟来证明并发操作的先后，也不让错误未来时间长期压制其他设备。
3. 真正并发的阅读位置可以被检测、展示和显式解决，而不是在应用层提前丢失。
4. 本地业务写在网络不可用时立即成功，并在崩溃后仍有可重试的 durable outbox。
5. 列表、详情、搜索和阅读器继续使用高效的 SQLite 查询，不要求 UI 遍历完整 CRDT 文档。
6. 书库添加动作继续同时确定内容和阅读数据的同步位置。
7. 不引入中心服务、账户、权限服务器或共享活动 SQLite。
8. 协议故障可以诊断；接受二进制不等于接受不可观察。

## 方案比较

| 方案 | CRDT 正确性 | 当前 sidecar 与对象存储 | 跨端实现 | 并发进度候选 | 结论 |
|---|---|---|---|---|---|
| 继续 ADR-0015 自研 HLC/JSON 内核 | MyReader 全部负责 | 原生匹配 | TS/Rust 双实现 | HLC 提前选出唯一 winner | 不继续扩展 |
| Automerge Core + MyReader sidecar 传输 | Automerge 负责因果历史与收敛 | 保留现有传输，只交换二进制增量 | Rust 原生 + Expo WASM | 原生保留 conflict values | **采用** |
| Automerge Repo + WebSocket/中心服务 | Automerge 负责 | 要求新的在线 peer/service 拓扑 | JS 侧最完整 | 支持 | 不符合无中心服务范围 |
| 直接同步一个 Automerge 文件 | Automerge 负责文档合并 | 多设备覆盖同一路径，崩溃和并发发布边界不清 | 简单但不可靠 | 支持 | 禁止 |
| 回到 CR-SQLite/数据库级同步 | 通用关系 CRDT | 仍需传输和扩展打包 | 原生依赖复杂 | 不能自然表达阅读器 UX | 不采用 |

Automerge 的 peer sync protocol 假设可靠、有序的双向传输。OneDrive、WebDAV 和本地目录提供的是
对象列举与文件读写，因此本提案只采用 Automerge Core 的 document/change/storage format，不把
对象存储伪装成长连接，也不引入 Automerge Repo 服务器。

## 保留范围与非目标

### 继续同步的六个 domain

| Domain | 现有产品数据 | Automerge 中的基本表示 |
|---|---|---|
| `book_favorite` | 收藏或取消收藏 | 每书 register；因果更新覆盖，真正并发保留候选并使用确定性默认值 |
| `reading_position` | format、ReaderLocator、展示进度 | 每书每格式 register；真正并发的位置向用户提供选择 |
| `bookmark` | 书签存在状态、Locator、创建和删除信息 | 每自然键 presence register |
| `annotation` | 高亮、颜色、短笔记、删除状态 | immutable header；颜色、笔记独立字段；删除为不可逆 tombstone |
| `reading_session` | 设备产生的阅读会话及累计时长 | origin-owned session；时长只允许单调增长 |
| `reading_completion` | 每书完成记录 | 以记录 ID 保存候选，projection 选择最早合法记录 |

线路名称不再包含 `.v1` domain 版本；schema 由 Automerge document schema 和本提案的协议 metadata
共同版本化。改变实体身份、删除语义或字段冲突规则仍然需要新的 ADR 或显式 schema migration，
不能只因为 Automerge 能保存任意 map 就静默扩展。

### 不同步的数据

- 阅读偏好、应用设置、设备布局和平台专属设置；
- 数据源凭据、访问 token 和安全存储内容；
- 下载状态、缓存、封面缩略图、搜索索引和临时 reader state；
- 本地 outbox、上传状态、远端文件 receipt、错误记录和 projection version；
- Calibre `metadata.db` 内容。Calibre 数据库继续只读；
- 尚不存在的个人评分、书架、合集、分类、用户书籍标签和自定义排序。

### 不属于本提案

- 跨书库阅读统计聚合；
- 账户系统、中央服务器或共享用户 Profile；
- 多人实时协同编辑；
- 端到端加密、签名或密钥管理；
- 删除远端历史 change 的垃圾回收协议；
- 重新定义 OneDrive、WebDAV 或本地目录适配器接口；
- 兼容或迁移 ADR-0015 的测试期 JSON/HLC 同步数据。

## 目标架构

```text
                        当前 Calibre 书库
                ┌─────────────────────────────┐
                │ .myreader/                  │
                │   protocol metadata         │
                │   immutable Automerge data  │
                │   replica metadata          │
                └──────────────┬──────────────┘
                               │
                OneDrive / WebDAV / local-direct
                               │
             ┌─────────────────┴─────────────────┐
             │                                   │
      desktop 本地 SQLite                 mobile 本地 SQLite
      ├─ Automerge state/change            ├─ Automerge state/change
      ├─ durable outbox/receipt             ├─ durable outbox/receipt
      ├─ domain projections                 ├─ domain projections
      └─ projection metadata                └─ projection metadata
             │                                   │
          Rust Core                         Expo Automerge
```

每个设备只打开自己的本地 SQLite。远端目录不保存、不接收也不暴露任一设备的 SQLite、WAL 或 SHM
文件。

## Automerge 文档模型

### 文档粒度

每个 Calibre 书库使用一个独立 Automerge document。

选择一个书库一个 document 的原因：

- 当前六个 domain 都属于同一个书库；
- 添加书库时只需发现一个同步作用域；
- 同一用户动作可以在一个 change 中更新相关字段；
- 不需要额外维护“书库中有哪些 per-book document”的同步 manifest；
- SQLite projection 已负责查询和索引，document 不需要承担跨书库查询。

不得把多个书库放入同一个 document。若真实数据证明单书库文档的加载、内存或历史体积不可接受，
应以测量结果新增决策，不能在本提案中预先引入分片协议。

### Canonical genesis

Rust、TypeScript 必须从同一份版本化 canonical genesis binary fixture 初始化 document。Genesis
只创建 document schema 所需的稳定 root containers，不携带设备状态，也不使用普通 replica actor。

这样可以保证：

- 各端引用同一组 root object IDs；
- 两台设备在空 sidecar 中并发产生首批 change 时可以安全合并；
- 不会因为各端独立创建同名 child map，而让其中一个容器成为隐藏 conflict；
- 跨语言测试可以比较 genesis heads 和 hydrated schema。

每个书库的首批 change 必须声明该书库稳定的 Calibre `library_uuid`。导入后若所有可见或冲突的
library identity 不都等于当前书库 UUID，整个输入必须被隔离，不能更新 projection 或远端 receipt。
Genesis actor 永远不得用于普通产品写。

### Root schema

Canonical genesis 至少建立以下 root：

```text
schema
favorites
positions
bookmarks
annotations
sessions
completions
```

Automerge map key 必须是稳定字符串：

- 书籍使用当前 Calibre 书库内 `book_id` 的十进制字符串；
- 阅读位置使用 `book_id + format`；
- 书签使用当前 canonical `locatorKey`；
- 批注、session 和 completion 使用 compact UUIDv4；
- format 继续只允许当前已支持的 EPUB、PDF 和 CBZ 值。

文档中的值只使用 Automerge 跨 Rust/JavaScript 均有稳定语义的 map、list、boolean、string、整数、
timestamp、counter 和 byte array。不得依赖 JavaScript 专属对象、原型或未冻结的序列化行为。

### Actor 与 replica

当前安装针对当前书库生成并持久化一个 UUIDv4 replica identity；其 16 bytes 同时作为 Automerge
actor ID。不同书库可以使用不同 actor，同一 actor 在一个 document 内的 change 必须严格串行。

- 重装、恢复备份到并发运行的新设备或本地 identity 丢失时生成新 replica/actor；
- 不尝试从系统硬件 ID 恢复 actor；
- 设备型号、系统版本和 MyReader 版本只用于 replica metadata 与诊断，不参与冲突决胜；
- 同一进程内对一个书库的 Automerge 写必须串行化，禁止两个并发 writer 复用同一 actor。

## 冲突语义

### 因果更新

若 change B 已经看见 change A，再写同一字段，则 B 因果上晚于 A，直接成为当前值，不显示冲突。
这适用于用户在同步完成后继续阅读、取消收藏或修改笔记。

### 真正并发

若两个设备离线修改同一 register，双方 change 互不依赖。Automerge 保留所有 conflict values，并
提供一个基于 operation ID 的确定性默认 winner。`recordedAt` 只作为展示信息，不能重新充当全局
HLC，也不能自动覆盖 Automerge 的因果关系。

### 阅读进度手动选择

当 `reading_position` 存在两个或更多非等价 conflict values：

1. projection 保存默认 winner，并标记该书该格式存在未解决冲突；
2. 当前设备在用户打开对应书籍时展示各候选的设备、记录时间、章节/页码和展示进度；
3. 用户可以选择任一候选，也可以暂不处理；
4. 选择后在已经包含所有候选 heads 的 document 上重新写入选中位置；
5. 新 change 因果上晚于全部候选，因此消除当前冲突并进入 outbox；
6. 若两台设备又并发作出不同选择，新选择仍是一个可检测的并发冲突，直到后续 change 看见并解决
   所有候选。

候选 Locator 相同或 canonical key 等价时可以自动视为无产品冲突，但不得用“进度差很小”等未经
产品确认的阈值静默丢弃不同位置。

### 其他 domain

- 收藏和书签使用 Automerge 当前 winner 作为 projection；真正并发的 losing value仍保留在
  document 中，但第一阶段不增加用户选择界面。
- 批注颜色和笔记写入独立字段，避免互相覆盖。删除只写不可逆 `deleted=true`；重新创建相同内容
  必须使用新 UUID，普通字段写不能复活 tombstone。
- session 只能由其 origin actor 增加时长。不得让两个 actor 修改同一 session；重复导入 change
  由 Automerge 去重。
- completion 以独立记录保存，不在 CRDT register 中竞争“最早”；SQLite projection 从所有合法
  候选中选择 `(completedAt, id)` 最小值。

## 本地 SQLite 持久化

### 权威与投影

同一个每书库 SQLite 至少承担以下职责：

| 数据 | 职责 |
|---|---|
| Automerge snapshot/incremental bytes | 持久化 document 因果历史；同步逻辑权威 |
| Durable outbox | 保存已提交但尚未上传的不可变二进制 bytes 与目标身份 |
| Remote receipts | 避免反复列举后重复下载已处理对象；不能取代 Automerge 去重 |
| Domain projection tables | 为列表、详情、搜索、reader 和统计提供 SQL 查询 |
| Projection metadata | 记录 projection schema/version 和重建状态 |
| Sync errors | 保存不含凭据和明文笔记的可诊断错误 |

具体表名、索引和 ORM API 由实施 migration 决定，本 ADR 不冻结数据源适配器或 repository 接口。

SQLite projection 是派生读模型，但不是可随意丢失的临时缓存：正常写入和远端导入都必须与
Automerge durable state 同事务提交，保证应用随时可以离线读取一致状态。projection schema 改变
或检测到漂移时，允许从已验证的 Automerge state 重建。

### 本地产品写事务

```text
1. 读取当前已提交 document，创建临时 fork。
2. 在 fork 上验证 domain command 并生成 Automerge change。
3. 得到最终不可变 change/incremental bytes、hash 和 patches。
4. 开启 SQLite 事务。
5. 持久化 Automerge bytes 与 document heads。
6. 写入 durable outbox。
7. 将 patches/domain state 应用到业务 projection。
8. 提交 SQLite。
9. 仅在提交成功后用 fork 替换进程内当前 document。
```

任何一步失败都回滚 SQLite 并丢弃 fork。不得先修改唯一的内存 document，再在 SQLite 回滚后继续
使用已前进的 actor sequence。

### 远端导入事务

```text
1. 下载不可变 binary object，在临时 fork 上解码和应用。
2. 校验依赖、library identity、document schema、domain shape 和输入上限。
3. 读取 conflicts 并计算 patches/projection 结果。
4. 开启 SQLite 事务。
5. 持久化新 Automerge bytes、heads 和 remote receipt。
6. 更新业务 projection、冲突标记和 projection version。
7. 提交 SQLite。
8. 仅在提交成功后替换进程内当前 document。
```

缺少依赖的 change 可以由 Automerge 暂存，但不得在依赖完整、library identity 可验证之前更新业务
projection 或把远端对象记为已成功应用。

### Snapshot

本地允许周期性生成 Automerge compact snapshot，以缩短启动加载；增量 change 仍必须在 SQLite
中保持 durable，直到 snapshot 已在同一事务中持久化并能重新加载验证。

远端 snapshot 只是新设备 bootstrap 优化，不是第二权威。第一阶段不得自动删除历史 change；
快照发布、选择和远端垃圾回收必须在真实数据规模证明必要后单独冻结。即使 snapshot 缺失或损坏，
完整 change 集仍应能够恢复 document。

## 远端 sidecar

### 传输原则

- 使用新的、与 ADR-0015 JSON/HLC 线路不冲突的 `.myreader` 子命名空间；最终路径在 Phase 0
  fixture 中冻结，不复用 `.myreader/changes-v4/`。
- 每个远端对象不可变；重试必须上传完全相同的 bytes。
- 文件身份使用 Automerge actor sequence、ChangeHash 或 incremental bytes 的完整摘要，不再为
  每个业务 domain 计算第二套 change ID。
- 远端只负责最终送达。change 的依赖、重复和冲突由 Automerge document 解释。
- 对象列表顺序不参与业务语义；拉取必须能够处理乱序、重复和延迟可见。
- replica metadata 可以更新，但不能作为有效 Automerge change 的依赖。
- 不上传本地 SQLite、projection、outbox、receipt 或错误表。

Automerge `save_incremental`/`load_incremental` 可以生成和接收官方二进制增量。Phase 0 必须验证
TypeScript 与 Rust 对同一 bytes 的互操作，再决定一个远端对象对应一个 change 还是一个官方
incremental chunk；不得自创另一套二进制业务 envelope。

### Breaking change

本提案不兼容、不解析、不迁移：

- v3 `.myreader/changes/`；
- ADR-0015 `.myreader/changes-v4/`；
- 旧本地行中的 HLC、JSON outbox state 和 prepared segment；
- 当前开发阶段已经产生的远端测试数据。

不双读、不双写，不提供后台自动升级。遗留目录不自动删除，避免协议切换时隐式破坏用户数据；测试
环境由开发者显式清理并重新添加书库。

## Schema 与版本

- Automerge binary format 版本由锁定的 Automerge Rust/JavaScript 实现负责。
- MyReader document schema 使用独立整数版本，并由 canonical genesis fixture 固定。
- Phase 0 必须锁定 Rust crate 与 JavaScript package 的兼容版本，并以双向 binary fixtures 验证，
  不能只依赖版本号相似。
- 未知 document schema、缺失 canonical root、不同 library identity 或非法 domain shape 必须停止
  projection apply，记录明确错误，不得表现为“同步零条成功”。
- Automerge 能保留未知字段不代表旧客户端可以安全写新 schema；不支持的 schema 必须只读或停止
  同步。
- schema migration 必须是确定性的 Automerge changes，并有 Rust/TypeScript 共用 fixture；新增
  domain 或改变冲突语义仍需单独决策。

## 可观察性

接受二进制线路后必须提供开发诊断能力：

- 输出当前书库 scope、schema version、heads、change count、pending outbox、receipt count 和
  projection version；
- 查看指定 `reading_position` 的全部 conflict candidates；
- 同步失败日志记录 library、backend、阶段和错误，并同时输出上述本地元数据快照；
- 测试应校验本地 snapshot/change 能被 Rust 和 JavaScript 重新加载；
- 日志和诊断快照不得记录明文笔记、Locator text excerpt 或数据源凭据。

诊断快照只包含元数据，不导出 hydrated document，也不是同步输入。

## 安全与输入限制

- 本提案不增加加密、签名或用户密钥；权限继续由用户选择的数据源和书库访问权限决定。
- Automerge change 的内部校验不能替代业务校验。导入仍需限制文件大小、change 数、字符串长度、
  Locator shape、整数范围和当前支持的 format。
- 任何输入都先应用到临时 fork；验证失败不能污染当前 document、SQLite projection 或 receipt。
- library identity 不匹配、非法 actor sequence、缺失依赖超出重试边界、损坏 binary、未知 schema
  和 projection 失败必须分类报告。
- 对象存储返回的路径和文件名仍是不可信输入，不能直接用于本地任意文件访问。

## 实施阶段

### Phase 0：跨端可行性与文档冻结

在修改产品入口前完成：

- 锁定 Automerge Rust crate 与 JavaScript package；
- 生成唯一 canonical genesis binary fixture；
- 冻结 root schema、stable keys、library identity、actor/replica 和 conflict projection；
- Rust 生成 change，Expo iOS 与 Android 导入并得到相同 heads/hydrated state；
- Expo iOS/Android 生成 change，Rust 导入并得到相同结果；
- 三个 actor 以任意顺序和重复次数应用同一 change 集后收敛；
- 验证 Expo/Hermes 的初始化、冷启动、内存、包体和 release build，而不只验证 Jest/Node；
- 验证 SQLite 回滚时临时 fork 不会推进已提交 actor state；
- 验证并发阅读位置可以列出候选并由新 change 解决；
- 验证官方 incremental bytes 可以通过当前 local-direct、WebDAV 和 OneDrive 往返。

任一跨端 binary、actor durability 或 SQLite 原子性门禁失败，都必须停止实施并重新评估本决策，
不能以平台专属旁路掩盖。

### Phase 1：每书库 Automerge 持久化与 sidecar 交换

- 在共享 Drizzle schema/migration 中增加 Automerge durable storage、outbox、receipt 和
  projection metadata；
- desktop Rust 与 mobile TypeScript 实现同一事务算法，但不重新实现 Automerge binary codec；
- 复用现有数据源访问能力发布和拉取不可变增量；
- 完成崩溃恢复、重复上传、乱序拉取、缺失依赖、错误分类和结构化诊断快照；
- 本阶段不接入新的产品 domain。

### Phase 2：阅读进度纵向切片

- 本地保存进度时原子提交 Automerge change、outbox 和 `reading_progress` projection；
- 远端导入后立即更新列表、详情、搜索和 reader 初始位置；
- 支持向前和向后阅读，不取最大百分比；
- 实现真正并发位置的冲突标记、候选展示、手动选择和再次同步；
- 在 desktop、iOS、Android 与 local-direct、WebDAV、OneDrive 上完成真实闭环；
- 通过后删除阅读进度的 HLC/JSON 产品路径，不长期双轨。

### Phase 3：收藏、书签与批注

- 将现有收藏与取消收藏接入 Automerge register；
- 将书签存在状态接入稳定自然键；
- 将批注 immutable header、独立 color/note 和不可逆 tombstone 接入；
- 复用已有产品行为、SQLite projection 和查询刷新测试；
- 删除已无调用的 HLC、merge primitive、JSON segment validator 和旧 prepared state；
- 不在本阶段新增评分、书架、标签或其他产品域。

### Phase 4：阅读会话与完成记录

- session 继续遵守当前 tracker 的前后台、空闲、暂停和跨本地午夜语义；
- 每个 session 只有 origin actor 能增加时长，重复 change 不重复累计；
- completion 保存独立候选，projection 选择最早合法记录；
- 当前书库累计时长、连续阅读、年度热力图和已读本数从本地 projection 重算；
- 不引入跨书库统计聚合。

## 测试与验收

### Automerge 边界

- Rust/TypeScript 使用同一 genesis 和双向 binary fixtures；
- change 乱序、重复、依赖延迟和多 heads 收敛；
- actor identity 丢失、复用和并发 writer 被拒绝；
- snapshot + incrementals 与完整 change replay 得到相同 heads 和 hydrated state；
- binary 损坏、library mismatch 和未知 schema 不更新 projection/receipt。

### 事务与崩溃

- SQLite 失败时 Automerge document、outbox 和 projection 全部回滚；
- 提交后上传前崩溃，重启仍能上传相同 bytes；
- 上传成功但本地确认前崩溃，重试不产生新 change；
- 远端 change 应用成功但 projection 失败时不保存 receipt；
- projection 可以从 Automerge state 确定性重建。

### Domain 行为

- 因果上较新的阅读位置直接覆盖旧位置；
- 真正并发的阅读位置同时保留并可以手动选择；
- 选择产生的新 change 在所有设备消除原冲突；
- 较新的取消收藏不会被因果上较旧的收藏恢复；
- 书签添加、删除和重新添加遵守明确因果关系；
- 批注颜色与笔记并发编辑均保留；
- 批注删除后普通字段更新不能复活；
- session 重复导入不重复累计；
- completion projection 始终选择最早合法候选。

TypeScript 测试描述继续使用 `it("should ... when ...")`。Rust 测试函数使用
`should_xxx_when_xxx`。不测试 Automerge 内部实现细节，只测试 MyReader 文档模型、事务边界、
projection、存储交换和产品行为。

### 真实设备门禁

至少固定复测：

- desktop 写入，iOS 拉取并更新列表、详情和打开位置；
- iOS 写入，desktop 拉取并更新相同 projection；
- Android 与另一端双向交换；
- 两台设备离线修改同一本书进度，恢复在线后出现候选并完成手动选择；
- OneDrive、WebDAV、local-direct 各完成一次全新书库 bootstrap 和增量同步；
- 强制杀进程、网络中断、重复同步和乱序文件列表后仍收敛。

自动化门禁不能替代真实 Expo release build 和三端运行验证。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| Expo/Hermes WASM 初始化或 release build 不稳定 | Phase 0 作为接受本 ADR 的前置门禁；不以 Node/Jest 代替 |
| Automerge document 与 SQLite projection 双状态漂移 | 同一 SQLite 事务持久化；临时 fork；提供确定性重建 |
| 单书库 document 历史增长 | 本地 compact snapshot；先测量，再单独决定远端 snapshot/GC |
| 对象存储不是可靠有序 peer stream | 不使用 Automerge peer sync protocol；交换不可变增量并允许乱序 |
| Binary 难以排查 | 提供 heads/change/conflict 诊断和隐私过滤 JSON 导出 |
| Automerge 默认并发 winner 不符合“现实时间最后” | 阅读进度展示全部候选并由用户产生因果解决 change |
| 旧客户端写入不支持的 schema | protocol metadata 与 schema gate；未知版本停止写入 |
| 依赖库升级改变跨端格式或 API | 锁定版本，升级前重跑 Rust/iOS/Android binary fixtures |

## 取代本决策

未来若要取代本 ADR，后续决策必须至少说明：

- 是否仍保持每书库 sidecar 和无中央服务器；
- Automerge 历史、SQLite projection 与远端对象的迁移方式；
- 离线并发阅读位置是否仍可检测和由用户解决；
- 删除、session、completion 的新合并语义；
- desktop、iOS、Android 的兼容窗口和失败恢复；
- 用户未配置第二同步位置时数据由谁拥有。

在新的 ADR 被接受前，不得同时引入另一个 CRDT 核心或让 SQLite projection 成为绕过 Automerge 的
第二同步权威。

## 参考

- [Automerge Core Concepts](https://automerge.org/docs/tutorial/concepts/)
- [Automerge Rust crate](https://automerge.org/automerge/automerge/)
- [Automerge conflicts](https://automerge.org/docs/reference/documents/conflicts/)
- [Automerge storage adapters](https://automerge.org/docs/reference/repositories/storage/)
- [Automerge JavaScript initialization](https://automerge.org/docs/reference/library-initialization/)
- [Automerge JavaScript `saveIncremental`](https://automerge.org/automerge/api-docs/js/functions/saveIncremental.html)
- [ADR-0004：使用书库 sidecar JSONL 变更流同步应用数据](./0004-library-sidecar-jsonl-sync.md)
- [ADR-0015：将书库 sidecar 升级为类型化 CRDT 阅读数据同步](./0015-library-sidecar-crdt-reading-sync.md)
