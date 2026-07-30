---
adr: ADR-0020
proposal_date: 2026-07-30
decision_date: 2026-07-30
status: 已接受
name: 采用 automerge-repo 存储模型重构书库 sidecar
overview: 保留每书库 Automerge document、本地 SQLite projection、六个既有同步 domain 和事件调度，采用 automerge-repo 的 StorageKey、snapshot/incremental 加载及并发安全压缩模型；Rust 复用 Automerge Core，并按官方公开语义实现适配现有 OpenDAL 数据源的存储子系统。
supersedes: ADR-0016（远端存储与压缩部分）
isProject: true
---

# 采用 automerge-repo 存储模型重构书库 sidecar

## 结论

采用以下架构：

1. **保留每个 Calibre 书库一个 Automerge document。** Calibre `library_uuid` 继续作为跨设备稳定的
   document ID 和同步作用域。
2. **保留每台设备自己的本地 sidecar SQLite。** 本地 Automerge snapshot、durable outbox、
   业务 projection、调度状态和错误记录继续由 `my-reader-core` 统一持久化；不得直接共享活动
   SQLite、WAL 或 SHM。
3. **远端 sidecar 改用 automerge-repo 的 StorageKey 存储模型。** 所有设备向同一个
   `snapshot`/`incremental` key space 写入内容寻址对象。
4. **复用 Rust `automerge` crate 的原生文档能力。** 文档加载、增量应用、完整保存、按 heads
   保存增量、缺失依赖检测、CRDT 合并和冲突保留都由 Automerge Core 完成。
5. **在 Rust 中实现 automerge-repo 存储行为的受控子集。** 上游 `StorageSubsystem` 和
   `StorageAdapterInterface` 目前是 TypeScript 实现，没有可直接依赖的官方 Rust crate；
   MyReader 因此按冻结的上游源码语义实现 `StorageKey`、range load、snapshot-first 加载和压缩，
   再用 OpenDAL 接入 local-direct、WebDAV 和 OneDrive。
6. **接受一次 breaking change。** 不读取、不迁移、不双写旧远端协议；旧目录不自动删除。已有
   本地 Automerge document 和业务 projection 可以保留，并在新 key space 首次同步时发布完整
   snapshot。

本决策不新增产品 domain，也不改变收藏、阅读进度、书签、高亮和笔记、阅读 session、完成记录
六个既有 domain 的 CRDT 语义。

## 与既有 ADR 的关系

本 ADR **只取代** [ADR-0016](./0016-adopt-automerge-for-library-sidecar-sync.md) 的远端对象布局、
本地传输 bookkeeping、bootstrap 和压缩实现。当前实现统一使用
`[documentId, "snapshot" | "incremental", hash]` StorageKey。

ADR-0016 的以下决策继续有效：

- 每个书库自己的 sidecar 是同步边界，不引入中央 Profile；
- 每个书库一个 Automerge document；
- Automerge state 是同步与冲突的逻辑权威，SQLite 业务表是本地查询 projection；
- 产品写、Automerge state、durable outbox 与 projection 保持原子事务；
- 六个既有同步 domain 及其冲突、删除和累计语义；
- canonical genesis、书库身份校验、replica/actor identity 和 ReaderLocator；
- 阅读进度真正并发时保留候选并允许用户显式选择；
- 不同步设置、凭据、缓存和 Calibre `metadata.db`。

[ADR-0017](./0017-event-driven-library-sidecar-sync-scheduling.md) 的事件驱动调度继续有效；只是调度器
检查的 pending work 从旧 change object 变为 StorageKey outbox。
[ADR-0018](./0018-shared-rust-components.md) 和
[ADR-0019](./0019-adopt-modular-my-reader-core.md) 的共享 Rust 与薄平台 adapter 方向不变。

ADR-0016 继续记录采用 Automerge 作为 CRDT 核心的决策；本 ADR 是当前远端存储模型的权威。

## 背景

MyReader 的 sidecar 运行在 local-direct、WebDAV 和 OneDrive 等共享对象存储上。这些后端提供
列举、读取、写入和删除对象的能力，但不是可靠有序的在线 peer transport。跨设备存储需要满足：

- 多个离线设备可以并发写入同一个书库目录；
- 新设备可以从完整 snapshot bootstrap；
- 后续业务修改可以作为内容寻址增量发布；
- 压缩在并发写入和进程中断时不删除未覆盖数据；
- 三种数据源和两端应用使用同一套 Rust 实现。

`automerge-repo` 的存储模型以
`[documentId, chunkType, chunkId]` 保存多个 snapshot/incremental，加载时合并所有可见 chunks，
压缩时先保存新 snapshot，再只删除本次已经加载且被 snapshot 覆盖的旧 chunks。这个模型允许多个
Repo 并发使用同一个 storage，符合 MyReader 的对象存储拓扑。

## 决策驱动因素

按优先级排序：

1. 尽量复用 Automerge 官方已经验证的文档与存储语义。
2. 多设备离线写入同一个远端目录时无需锁、共享游标或设备目录，最终能够确定收敛。
3. 压缩中断最多留下冗余对象，不得先删除唯一可恢复数据。
4. local-direct、WebDAV 和 OneDrive 继续使用同一个 Rust 同步实现。
5. 保留本地 SQLite projection 的查询性能和离线产品体验。
6. 损坏对象必须可定位、可解释；无法无损恢复时明确停止，不能静默丢数据。
7. breaking change 应保持实现纯净，不为尚未稳定发布的测试协议长期维护兼容状态机。

## 上游依据与复用边界

本决策以 automerge-repo 提交
[`e7a281551d5ff8f787804dbaf8505cd01e2dc3f1`](https://github.com/automerge/automerge-repo/tree/e7a281551d5ff8f787804dbaf8505cd01e2dc3f1)
的以下公开实现为参考基线：

- [`StorageAdapterInterface`](https://github.com/automerge/automerge-repo/blob/e7a281551d5ff8f787804dbaf8505cd01e2dc3f1/packages/automerge-repo/src/storage/StorageAdapterInterface.ts)
  定义 `load`、`save`、`remove`、`loadRange` 和 `removeRange`；
- [`StorageSubsystem`](https://github.com/automerge/automerge-repo/blob/e7a281551d5ff8f787804dbaf8505cd01e2dc3f1/packages/automerge-repo/src/storage/StorageSubsystem.ts)
  定义 snapshot/incremental 加载、保存和压缩；
- [`keyHash`](https://github.com/automerge/automerge-repo/blob/e7a281551d5ff8f787804dbaf8505cd01e2dc3f1/packages/automerge-repo/src/storage/keyHash.ts)
  定义 incremental 内容摘要与 snapshot heads 摘要；
- [`NodeFSStorageAdapter`](https://github.com/automerge/automerge-repo/blob/e7a281551d5ff8f787804dbaf8505cd01e2dc3f1/packages/automerge-repo-storage-nodefs/src/index.ts)
  提供一种面向大量 document 的文件系统映射参考；该物理分片不属于 StorageKey 合同。

复用分为两层：

| 层 | MyReader 的做法 |
|---|---|
| Automerge Core | 直接依赖固定版本的 Rust `automerge` crate，复用 `load_incremental`、`save`、`save_after`、`get_missing_deps`、heads、change DAG、去重和冲突 |
| automerge-repo storage | 不复制整个 Repo；在 Rust 中按上游公开行为实现兼容子集，并用合同测试锁定 key、加载和压缩语义 |

这不是 Rust 类型系统中“实现了官方 trait”，也不是把 automerge-repo TypeScript 源码作为依赖。
它是对上游存储协议行为的移植。以后若出现成熟的官方 Rust `StorageSubsystem`，应新增评估并优先
替换这部分自维护算法。

MyReader 不使用以下 automerge-repo 能力：

- `Repo`、`DocHandle` 和 JavaScript 生命周期管理；
- `NetworkSubsystem`、NetworkAdapter 和 peer sync session；
- `[documentId, "sync-state", storageId]`，因为当前数据源是被周期列举的共享对象存储，不是
  可靠有序的在线 peer transport；
- `storage-adapter-id` 和通用 namespaced key/value storage；
- IndexedDB、Node runtime 或 WebAssembly。

## 方案比较

| 方案 | 官方能力复用 | 共享远端并发 | Rust/移动集成 | 协议复杂度 | 结论 |
|---|---|---|---|---|---|
| 直接在移动/桌面使用 TypeScript automerge-repo | 完整复用 Repo | 官方支持 | Hermes、UniFFI、SQLite projection 与双后端边界复杂 | 高 | 不采用 |
| Rust Automerge + automerge-repo 存储行为 | 复用 CRDT并移植官方 storage 算法 | 官方模型支持并发 storage | 与 `my-reader-core`、OpenDAL 和 SQLite 一致 | 最低 | **采用** |
| 中央 Automerge sync server | 可复用 Repo 网络协议 | 服务端协调 | 需要账户、服务和新拓扑 | 产品范围扩大 | 不属于本次 |

## 目标数据流

```text
产品 command
    │
    ▼
Rust Automerge document ── 同一 SQLite 事务 ──► state + projection + outbox
    │
    ▼
StorageSubsystem-compatible coordinator
    │
    ▼
StorageAdapter-compatible OpenDAL adapter
    │
    ├─ local-direct
    ├─ WebDAV
    └─ OneDrive
    │
    ▼
.myreader/automerge/<document_id>/<kind>/<hash>
```

desktop 和 mobile 都只调用 `my-reader-core`。Tauri command、Expo/UniFFI 和平台传输层不得重新
实现 StorageKey、chunk 合并、压缩或缺失依赖判断。

## StorageKey 与远端布局

### 逻辑 key

每个远端对象使用字符串数组 key：

```text
[<document_id>, "snapshot", <heads_hash>]
[<document_id>, "incremental", <content_hash>]
```

- `document_id` 当前直接使用 Calibre 原生稳定 `library_uuid`；
- `content_hash` 是 incremental bytes 的 SHA-256 小写十六进制；
- `heads_hash` 按上游 `headsHash`：依 Automerge 返回顺序连接各 head 的 UTF-8 bytes，再计算
  SHA-256 小写十六进制；
- key 中不出现 replica ID、actor ID、设备型号、sequence、业务 domain 或时间戳；
- 同一内容得到同一 key，重复上传是幂等覆盖；
- 不同设备产生不同内容时自然得到不同 key，不需要设备文件夹避免冲突。

### 物理路径映射

每个书库 sidecar 只保存该书库的一个 Automerge document，因此不采用 NodeFS adapter 面向大量
document 的前两字符目录分片。StorageKey 的各 component 直接保持层级：

```text
.myreader/automerge/
  <document_id>/
    snapshot/
      <heads_hash>
    incremental/
      <content_hash>
```

例如：

```text
["abcdef", "incremental", "1234"]
→ .myreader/automerge/abcdef/incremental/1234
```

逻辑 StorageKey 仍保留 `document_id`；这里只拒绝不适用于 MyReader 存储边界的
物理目录分片，不改变 automerge-repo 的 snapshot/incremental key 语义。

路径解析必须拒绝空 component、`.`、`..`、斜杠、反斜杠和越过
`.myreader/automerge/` 根目录的输入。

### Storage adapter 合同

Rust adapter 提供：

- `load(key)`：读取单个二进制值，不存在时返回空；
- `save(key, bytes)`：保存完整原始 Automerge bytes；
- `remove(key)`：删除单个 key；
- `loadRange(prefix)`：递归列举并读取所有以 prefix 开头的 key；
- `removeRange(prefix)`：只用于显式清理，不用于普通并发压缩。

`save` 只有在后端确认本次完整写入成功后才能返回。WebDAV 和 OneDrive 不得把 bytes 包装成
multipart form；数据源错误必须保留 backend、stage 和原始 cause。

## 加载与合并

一次 full sync：

1. 分别 `loadRange([documentId, "snapshot"])` 和
   `loadRange([documentId, "incremental"])`；
2. 先处理全部 snapshot，再处理全部 incremental；
3. 每一类内部的文件顺序不参与业务语义；
4. 使用 Automerge `load_incremental` 将所有 bytes 应用到临时 document；
5. 校验对象大小和数量上限、incremental 内容 hash、snapshot heads hash、书库 identity、
   document schema、domain shape 和缺失依赖；
6. 将临时 document 与本地 document 合并；
7. 在一个 SQLite 事务中持久化 snapshot、projection、projection metadata 和必要的本地 outbox；
8. 事务提交后才替换进程内 document，并通知 UI 刷新查询。

重复 snapshot、重复 incremental 和乱序列举依赖 Automerge 自身去重与合并。

任何 chunk 无法解码或仍有缺失依赖时，整个 apply 失败。本地 state 和 projection 不得部分前进。

## 保存与 outbox

本地产品写继续使用 ADR-0016 的原子事务边界：

1. 从已提交 snapshot 创建临时 document；
2. 执行业务 command；
3. 使用 Automerge `save_after(base_heads)` 产生官方 incremental bytes；
4. 计算 `content_hash` 和 incremental StorageKey；
5. 在同一 SQLite 事务中写入新 snapshot、业务 projection 和 durable outbox；
6. SQLite 提交成功后才允许调度 push。

远端 key space 为空时，首个 full sync 直接使用 Automerge `save()` 发布完整 snapshot。已有远端
chunks 时，push 保存 outbox 中的 incrementals。上传成功后按精确 StorageKey 删除对应 outbox
条目；上传后、本地确认前崩溃只会重试同一 key。

## 压缩与并发安全

压缩采用 automerge-repo `StorageSubsystem` 的规则：

```text
snapshot 总字节数 < 1024
或
incremental 总字节数 >= snapshot 总字节数
```

满足阈值时：

1. 保存包含当前完整 document 的新 snapshot，key 使用当前 heads hash；
2. 等待 `save` 成功；
3. 只删除本次同步已经加载，或由本设备在本轮成功发布并且已包含在 snapshot 中的旧 keys；
4. 不删除列举完成后由其他设备并发新增、因而本轮从未加载的 key；
5. 删除失败只留下冗余 chunks，下次加载仍能合并，不得回滚或删除新 snapshot。

普通压缩禁止对 `[documentId]`、`snapshot` 或 `incremental` prefix 直接执行 `removeRange`。这会
删除并发设备刚写入但当前设备尚未加载的数据。

多个设备可以分别留下不同 snapshot。加载者读取全部 snapshot 和 incrementals，并由 Automerge
完成合并。

## 本地 SQLite

继续保留：

| 数据 | 职责 |
|---|---|
| `sync_local_meta` | 协议、书库 identity 和本地 replica identity |
| `sync_automerge_state` | 当前完整 Automerge snapshot 与 heads |
| `sync_automerge_outbox` | 尚未保存到远端的 incremental StorageKey 和 bytes |
| `sync_automerge_projection_meta` | document 到业务 projection 的版本和重建状态 |
| 六张业务 projection | 列表、详情、reader 和统计查询 |
| `sync_schedule_state` | freshness、retry、backoff 和 suspension |
| `sync_errors` | 不含敏感正文的结构化错误 |

本地完整 snapshot 包含 Automerge 因果历史。远端幂等由内容寻址 key 和 Automerge 去重保证。

outbox 至少保存：

- 本地非业务代理主键；
- JSON 编码的 StorageKey；
- 原始 incremental bytes；
- bytes 的 SHA-256；
- 所含 Automerge change 数量。

## 故障检测与恢复

### 自动同步必须做什么

以下情况必须停止 apply，并报告具体 StorageKey：

- 路径不能还原为合法 StorageKey；
- incremental 文件名摘要与 bytes 不一致；
- snapshot 文件名 heads hash 与加载后的 document heads 不一致；
- Automerge binary 无法加载；
- 书库 identity、schema 或 domain shape 不合法；
- 加载所有可见 chunks 后仍存在 missing dependencies；
- projection 事务失败。

不得通过忽略坏对象、截断到“能加载的部分”、伪造 change、强行改文件名或调整 multipart 包装来
掩盖错误。Automerge `rescue` 也不是缺失因果历史的通用恢复算法。

### 可恢复路径

按优先级处理：

1. 从对象存储版本历史、备份或另一份完整副本恢复原来的损坏或缺失 chunk；
2. 若某台设备仍有经过验证的完整本地 Automerge document，用户可明确以该设备重新建立远端：
   暂停其他设备同步，清理该书库的新 StorageKey range，由完整设备发布一个 snapshot，再让其他
   设备重置本地同步内部状态并重新 bootstrap；
3. 测试或尚无保留价值的数据可以显式删除 `.myreader/automerge/` 新 key space，并从确认完整的
   本地设备重新开始。

清理必须是用户显式操作，不能由普通同步在遇到错误时自动执行。业务 projection 和 Calibre
`metadata.db` 不属于远端清理范围。

若没有远端版本历史、备份，也没有任何设备保留包含该依赖的完整 document，则不存在无损自动恢复
算法。产品必须明确告知数据已不可恢复，而不是声称“同步成功”。

## Breaking change

新实现只读取 ADR-0020 定义的 snapshot/incremental StorageKey。此前的远端 sidecar 布局和本地
传输状态不迁移、不双读、不双写。

旧远端目录不自动删除，以避免代码升级时隐式破坏用户数据。新实现只列举以当前
`[document_id, "snapshot" | "incremental"]` 映射得到的路径。

本地 migration：

- 保留 Automerge state、六张业务 projection、书库 identity 和调度信息；
- 删除旧 transport/recovery bookkeeping；
- 以 StorageKey schema 重建空 outbox；
- 将协议标记更新为 `library-sidecar-automerge-repo`。

本次 breaking change 不改变 Calibre 书库 UUID、业务实体身份或六个 domain 的数据模型。

## 非目标

- 不引入中央账户、中心服务器或第二个同步目录；
- 不引入新的评分、书架、标签、阅读偏好或用户设置同步；
- 不改变当前书库阅读统计口径；
- 不提供多人实时在线协作；
- 不把 OneDrive/WebDAV 假装成可靠有序的 peer stream；
- 不直接依赖 JavaScript automerge-repo 或在 Hermes 中引入 WebAssembly；
- 不让平台 UI 层解释 Automerge binary 或实现合并规则；
- 不保证旧开发期远端数据自动升级。

## 实施与验收

实施必须按以下边界完成：

### Phase 1：存储合同

- Rust `StorageKey` 和 hash 与冻结的上游语义一致，物理路径直接保留完整 document ID；
- OpenDAL adapter 实现单 key 与 prefix range 操作；
- 拒绝非法路径和摘要不匹配对象；
- 合同测试使用 `should_xxx_when_xxx` 命名。

### Phase 2：加载、保存和压缩

- snapshot-first 加载全部 chunks；
- 首次 bootstrap 保存完整 snapshot；
- 后续产品写发布 content-addressed incremental；
- 压缩先保存 snapshot，只删除本轮 covered keys；
- 两个并发 writer 不会互删未加载对象。

### Phase 3：SQLite 与平台收敛

- 本地同步存储迁移为完整 Automerge state、projection 和 StorageKey outbox；
- desktop/mobile 只保留当前 StorageKey 同步 API；
- Tauri 和 Expo 只调用共享 core；
- 旧远端数据不双读，旧本地 transport 状态不迁移。

### Phase 4：自动化与真实闭环

- 两个独立 SQLite 通过同一个 local filesystem operator 双向同步六个 domain；
- 重复、乱序、多 snapshot、并发 incrementals 和压缩中断后收敛；
- 缺失依赖、坏 hash、坏 snapshot 和 projection failure 不产生部分提交；
- WebDAV 完成 desktop ↔ iOS 双向闭环；
- OneDrive 与 local-direct 运行相同 core 路径；
- 列表、详情和 reader 初始位置在 pull 后立即读取新 projection；
- 自动调度与手动 full sync 都使用新 StorageKey 线路。

测试描述不得锁定内部函数拆分，只保护 key 合同、事务原子性、并发存储不丢数据、故障停止和六个
domain 的产品行为。真实跨端步骤记录在
[阅读数据跨端同步回归](../sync/reading-progress-cross-device-regression.md)。

## 后果

### 收益

- 多个设备使用同一个内容寻址 key space；
- 复用 Automerge 官方的 binary、heads、missing dependencies、去重和冲突能力；
- 压缩并发安全由“只删除已加载且已覆盖的 chunks”这一小组不变量保障；
- Rust core、SQLite projection 和现有 OpenDAL 数据源边界保持统一；
- 远端结构更容易检查，损坏对象可以由 StorageKey 精确定位。

### 代价

- automerge-repo 没有官方 Rust `StorageSubsystem`，MyReader 仍需维护一份小型行为移植；
- 上游 TypeScript 实现升级时必须评估 key、hash、加载和压缩语义是否变化；
- WebDAV/OneDrive 是被动共享存储，不提供 automerge-repo NetworkSubsystem 的即时 peer 通知；
- full sync 需要列举当前 document 的全部可见 chunks；
- 所有副本都丢失同一因果历史时仍无法无损恢复；
- breaking change 会遗留不再读取的旧远端目录，需要用户或开发者显式清理。

### 约束

- 上游参考 commit 改变前必须先更新合同 fixture 并评审差异；
- StorageKey、加载顺序或压缩不变量发生变化时必须先提出新的 ADR；
- 若要采用 automerge-repo NetworkSubsystem，必须先确定可靠有序传输、账户/发现、权限和离线
  拓扑，不能把对象存储 adapter 直接冒充 network adapter。

## 参考

- [Automerge：Storage](https://automerge.org/docs/reference/repositories/storage/)
- [Automerge：Under the hood / Storage](https://automerge.org/docs/reference/under-the-hood/storage/)
- [Automerge：StorageAdapterInterface](https://automerge.org/automerge-repo/interfaces/_automerge_automerge-repo.StorageAdapterInterface.html)
- [Automerge：Repositories](https://automerge.org/docs/reference/repositories/)
- [ADR-0016：采用 Automerge 作为书库 sidecar 的 CRDT 核心](./0016-adopt-automerge-for-library-sidecar-sync.md)
- [ADR-0017：使用事件驱动调度自动同步书库 sidecar](./0017-event-driven-library-sidecar-sync-scheduling.md)
- [ADR-0019：采用模块化 my-reader-core 统一跨端后端业务](./0019-adopt-modular-my-reader-core.md)
