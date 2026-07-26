---
adr: ADR-0017
proposal_date: 2026-07-26
decision_date: 2026-07-26
status: 已接受
name: 使用事件驱动调度自动同步书库 sidecar
overview: 保留手动同步执行 Calibre 与 MyReader 全范围同步；以 durable outbox 作为待发送事实源，在阅读数据提交后自动安排 sidecar push，并结合前台恢复、网络恢复、书库切换、可选远端变化提示和低频安全扫描决定 pull 时机，取代 ADR-0012 中固定 60 秒与 180 秒的被动同步 tick。
isProject: true
---

# 使用事件驱动调度自动同步书库 sidecar

## 结论

采用以下调度模型：

1. **手动“同步当前书库”继续执行 `scope: "all"`。** 用户主动同步时立即刷新 Calibre
   书目并完整 push/pull MyReader sidecar，不改变 ADR-0012 的产品语义。
2. **MyReader 本地数据提交后自动安排 sidecar push。** Automerge change、projection 和
   durable outbox 先在 SQLite 事务中提交；只有事务成功后才发出调度提示。
3. **durable outbox 是待发送工作的唯一事实源。** 内存事件、timer 和生命周期通知都只是唤醒
   提示。进程终止或提示丢失后，下一次启动通过查询 outbox 恢复工作，不另建一套待上传队列。
4. **pull 由远端变化提示和用户上下文共同驱动。** 优先响应可用的远端提示；没有提示时，在应用
   进入前台、恢复网络、切换书库等有价值的时机检查远端，并保留带抖动的低频安全扫描。
5. **固定周期不再直接发起 push。** 原先阅读页每 60 秒 push、书库页每 180 秒 full sync 的
   `setInterval` 被事件调度取代。安全扫描只负责唤醒“是否需要 pull”的判断，不无条件同步。
6. **每个书库 single-flight，多个请求可合并和升级。** `full` 覆盖 `push_only`，立即请求覆盖
   debounce 请求；运行期间出现新工作时，当前轮结束后再次检查 outbox 并按需重跑。
7. **临时错误自动退避，永久配置错误停止自旋。** 网络、限流和服务暂不可用采用带随机抖动的指数
   退避；凭据或配置错误等待用户修复。网络恢复、配置更新和手动同步可以提前唤醒。
8. **后台执行是尽力而为，不承诺精确时间。** iOS/Android 可能挂起进程；本地事务和 outbox 保证
   数据不会丢失，前台恢复后继续同步。

本提案只改变 sidecar 的自动调度。它不改变 ADR-0016 的 Automerge 文档、合并规则、远端对象
格式、每书库 SQLite 和数据源边界。

## 与历史提案的关系

[ADR-0012](./0012-mobile-sync-refactor.md) 来自 2026-05-31 的
`refactor(mobile): unify library sync pipeline`（`4dc5f541`）。现有 ADR 正文与该提交中的
`.cursor/plans/mobile_sync_refactor_5d46f090.plan.md` 完整一致，只增加了 ADR 编号、日期和
状态；按首次提案时间排在 ADR-0011 与 ADR-0013 之间，序号正确。

ADR-0012 已经确立且继续保留：

- `syncLibrary` 是单库同步的统一 domain 入口；
- `SyncScope` 分为 `all`、`calibre` 和 `myreader`；
- Calibre 与 MyReader 是可独立执行的两个阶段；
- 本地、WebDAV 和 OneDrive 使用同一编排、不同 backend；
- manual、add、startup 和 automatic trigger 使用策略决定 scope；
- UI 写回与同步 domain 分离。

本提案只取代 ADR-0012 的以下调度细节：

- 阅读路由每 60 秒执行一次 `myreader/push_only`；
- 书库路由每 180 秒执行一次 `myreader/full`；
- 用当前路由和固定 interval 推断“何时有同步工作”。

ADR-0012 作为已实施的历史提案不回写；新的调度决策由本 ADR 单独演进。

## 背景

当前 mobile `SyncRuntime` 使用两个固定 interval：

- reader 路由每 60 秒 push 当前书库的 MyReader 数据；
- library 路由每 180 秒对书库执行 MyReader full sync；
- 其他路由不执行 scheduled sync；
- desktop 没有自动 sidecar scheduler，只能通过书库刷新按钮手动触发。

这个模型可以定期送达数据，但调度依据与真实工作不一致：

- 阅读数据已经提交并进入 outbox 后，可能还要等待下一次 tick；
- 没有本地变化时仍会周期唤醒并检查；
- 在 tick 之间关闭应用，最新 change 只能等到下次启动或手动同步；
- pull 是否有价值取决于其他设备是否产生变化，而不是当前页面停留了多少秒；
- route 变化会重建 timer，不能表达 pending work、优先级、退避或重试；
- desktop 与 mobile 的自动同步语义不一致。

ADR-0016 已经提供 durable outbox、immutable remote object、receipt 和可重建 projection。
调度器应围绕这些持久化事实工作，而不是把固定 timer 当作同步状态。

## 调研结论

### CloudKit

Apple 的 `CKSyncEngine` 提供了本提案最重要的参考模型：

- 应用把本地修改加入 pending changes 后，引擎会自动安排发送，不要求应用按固定周期扫描；
- pending changes 和内部同步状态需要持久化，以便跨启动恢复；
- 引擎根据网络、电量和系统负载选择执行时机，正常场景通常很快，但不保证精确时间；
- CloudKit 通过 push notification 提示其他设备存在远端变化，再由系统 scheduler 安排 fetch；
- 临时网络、限流和服务错误由引擎保留工作并自动重试；
- `sendChanges` / `fetchChanges` 仍作为用户明确要求立即同步或测试时的手动通道。

参考：

- [CKSyncEngine](https://developer.apple.com/documentation/cloudkit/cksyncengine-5sie5)
- [CKSyncEngine.State](https://developer.apple.com/documentation/cloudkit/cksyncengine-5sie5/state-swift.class)
- [WWDC23：Sync to iCloud with CKSyncEngine](https://developer.apple.com/videos/play/wwdc2023/10188/)

MyReader 应复制“pending work → 自动排程 → 条件合适时执行 → 持久化恢复”的模型，但不能假装
当前对象存储具备 CloudKit 的 server push。

### Joplin

Joplin 与 MyReader 一样支持 WebDAV、OneDrive、本地文件系统等文件式同步目标。它的同步规范明确
区分两个时机：

- 本地内容变化后数秒内上传，以降低冲突窗口；
- 每隔数分钟轮询远端并下载变化。

参考：[Joplin synchronisation specification](https://joplinapp.org/help/dev/spec/sync/)。

这说明对于没有统一远端通知能力的文件式 backend，合理方案不是只靠固定轮询，也不是完全取消
轮询，而是“变化后快速发送 + 低频远端检查”。

### Syncthing

Syncthing 以文件系统 watcher 快速发现本地变化，默认先积累约 10 秒再扫描，同时保留低频完整扫描，
因为 watcher 可能丢事件；完整扫描还加入随机区间，避免所有目录同时执行。

参考：[Syncthing — Understanding Synchronization](https://docs.syncthing.net/users/syncing)。

对应到 MyReader：

- 本地 mutation event 应 debounce 和合并；
- event 只是提示，outbox 才是事实；
- 仍需低频、带 jitter 的恢复检查，防止生命周期事件或远端提示遗漏。

### Couchbase Lite

Couchbase Lite 的 continuous replication 区分 `offline`、`connecting`、`idle` 和 `busy`，临时错误
采用指数退避；网络重新可达时可以立即重试，永久认证或配置错误停止无意义重连。

参考：[Couchbase Lite replication and retry](https://docs.couchbase.com/couchbase-lite/current/java/replication.html)。

MyReader 不需要复制持续 WebSocket，但应采用相同的错误分类、退避和网络恢复唤醒原则。

### Automerge Repo

Automerge Repo 在持久网络 adapter 存在时，会把本地 change 自动发给已连接 peer，并在恢复连接后
继续收敛；但它依赖 peer 消息通道，官方 WebSocket 方案需要运行 sync server。

参考：

- [Automerge Repo repositories](https://automerge.org/docs/reference/repositories/)
- [Automerge network sync](https://automerge.org/docs/tutorial/network-sync/)

MyReader 已决定使用用户选择的 WebDAV、OneDrive 或本地书库作为对象存储，不新增中心 sync
server，因此采用 Automerge Core 与自有调度器仍然合理。

## 为什么不能完全复制 CloudKit 的拉取时机

CloudKit server 在远端 record 变化时向其他设备发送 push notification。当前 MyReader 的三个
backend 没有等价的统一能力：

- **WebDAV** 没有跨供应商可靠的移动端 push 通道；
- **OneDrive** 可以使用 delta token 降低检查成本，但没有自建公网回调服务时，设备仍需在某个
  时机主动检查；
- **local-direct** 在 desktop 可以监听文件系统，但 iOS security-scoped / File Provider 目录
  不能假设提供持续可靠 watcher；
- mobile 应用进入 suspended 后，JavaScript timer 不继续运行。

所以，当前约束下最接近 CloudKit 的真实方案是：

```text
本地变化
  → durable outbox
  → commit 后事件提示
  → debounce / 合并
  → 条件允许时 push

远端变化
  → backend hint（若存在）
     或 foreground / reconnect / library activation
     或低频安全扫描
  → full sidecar sync
  → projection + UI 立即更新
```

若未来引入统一的远端通知服务，可以把通知作为新的 pull hint 接入，不需要改变 outbox、Automerge
或同步 domain。

## 调度模型

### 调度请求

自动调度只接受 sidecar 意图：

```typescript
type SidecarSyncMode = "push_only" | "full"

type SidecarSyncReason =
  | "local_change"
  | "reader_closed"
  | "app_backgrounding"
  | "app_foregrounded"
  | "network_reconnected"
  | "library_activated"
  | "remote_change_hint"
  | "recovery_sweep"
```

manual、add 和 startup 继续经过现有 `syncLibrary` policy；调度器不得把它们偷偷改成 sidecar-only。

请求合并规则：

1. 同一书库同时只运行一个 sidecar sync；
2. `full` 的能力包含 `push_only`，合并时保留 `full`；
3. immediate 请求覆盖 debounce 请求；
4. 同类重复请求只保留一个；
5. 运行期间收到新请求时标记 rerun；当前轮完成后重新读取 outbox 和合并后的 intent；
6. 一个书库失败不阻塞其他书库；
7. mobile 默认串行执行书库，desktop 使用有上限的并发，不能无限并发打向同一数据源。

### 本地变化后的 push

所有能够创建 Automerge change 的入口最终经过统一 commit 边界。事务成功后发布
`sidecar-work-available(libraryId)`：

1. 第一次变化启动短 debounce；
2. debounce 窗口内的后续变化只延后同一个任务，不创建多个 timer；
3. 设置最大等待时间，持续翻页也不能无限推迟；
4. reader 关闭、应用即将进入后台时将 pending push 升级为 immediate；
5. 无网络时不执行请求，保留 outbox；网络恢复后立即唤醒所有存在 pending outbox 的书库；
6. push 成功后再次查询 outbox，防止上传期间产生的新 change 遗漏。

初始参数使用集中 policy 常量，建议：

- quiet debounce：2 秒；
- foreground 最大等待：10 秒；
- transient retry：从 2 秒开始，full jitter，最大 5 分钟；
- 服务端提供 `Retry-After` 时优先遵守服务端时间。

这些是调度参数，不是协议，允许根据真实遥测调整，不写入远端 metadata。

### pull 时机

没有远端 push notification 时，pull 使用以下优先级：

| 时机 | 范围 | 行为 |
|---|---|---|
| remote change hint | 受影响书库 | immediate `full` |
| 网络从离线恢复 | active library | 若超过 freshness window，执行 `full` |
| 应用进入前台 | active library | 异步 `full`，fresh 时跳过，不阻塞首屏 |
| 切换 active library | 新书库 | fresh 时跳过，否则 `full` |
| reader 打开前 | 当前书库 | 复用已在运行的 full；不额外制造并发请求 |
| foreground safety sweep | due libraries | 带 jitter 的低频 `full` |

建议初始 freshness window 为 30 秒，foreground safety sweep 的最大陈旧时间为 5 分钟并加入
±20% jitter。安全 sweep 使用按 `lastSuccessfulPullAt` 计算的单次 deadline，不使用永久
`setInterval`。

pull 不阻塞应用激活和书库列表首帧。UI 先展示本地 projection；远端变化应用后通过现有 query
invalidation 更新列表、详情、统计和 reader 冲突候选。

### 持久化状态

现有表继续承担：

- `sync_automerge_outbox`：尚未确认发布的本地不可变对象；
- `sync_automerge_receipts`：已应用的远端对象；
- `sync_automerge_state`：当前 document 与 heads；
- projection tables：当前 UI 读模型。

调度器不新增第二份 pending queue 或 `dirty` 布尔值。每书库本地 SQLite 只增加一个
`id = "local"` 的轻量调度状态：

| 字段 | 含义 |
|---|---|
| `last_successful_pull_at` | 判断是否仍在 freshness window |
| `next_retry_at` | 避免重启或重复事件绕过当前退避 |
| `transient_failure_count` | 计算下一次指数退避 |
| `suspended_reason` | 凭据或配置错误时停止自动自旋；配置变更或手动同步后清除 |

timer、当前运行 promise、debounce deadline 和合并中的 intent 只保存在内存。进程重启时：

1. 读取所有书库的 pending outbox；
2. pending 非空的书库安排 push；
3. active library 根据 `last_successful_pull_at` 决定是否安排 full；
4. 不恢复过期 timer，只按当前网络和生命周期重新计算 deadline。

### 错误与重试

| 错误 | 自动行为 |
|---|---|
| offline、timeout、5xx | 保留 outbox，指数退避 |
| 429 / 服务端限流 | 遵守 `Retry-After`，否则指数退避 |
| 应用进入后台导致取消 | 不计为数据失败；前台或后台机会恢复 |
| 凭据缺失/失效 | 设置 `suspended_reason`，停止自动重试并提示用户 |
| backend 配置非法 | 同上，等待配置更新或 manual |
| 数据损坏、library identity mismatch、未知 schema | 停止该书库自动同步，保留诊断，不自动跳过坏对象 |
| projection 失败 | 保持 state/receipt/projection 的现有事务回滚语义 |

manual `scope: "all"` 绕过 freshness window 和普通 backoff，但不能绕过 identity、schema 或数据
完整性校验。

## 平台执行策略

### Mobile

- `AppState` 提供 foreground/background 提示；
- NetInfo/online manager 提供离线和重新联网提示；
- commit 后的 domain event 触发 foreground push；
- 进入 background 时只尝试完成已经 pending 的短 push，不启动全量 pull；
- iOS 普通 background transition 的执行时间很短，必要时用 native background task assertion
  完成已开始的关键上传；到期立即取消网络任务，outbox 留待恢复；
- `BGAppRefreshTask` / Android background task 只能作为额外执行机会，不能成为正确性的前提。

Apple 明确说明应用进入后台后通常很快被挂起，关键任务应在有限后台时间内完成：
[Extending your app’s background execution time](https://developer.apple.com/documentation/uikit/extending-your-app-s-background-execution-time)。

### Desktop

- Tauri 启动时初始化长期存在的 sidecar scheduler；
- Rust 产品写事务 commit 后向 scheduler channel 发送 library ID；
- 窗口重新获得焦点、系统网络恢复时安排 pull；
- 应用进程运行期间可以在窗口隐藏时继续执行，但仍遵守退避和 bounded concurrency；
- local-direct 后续可以用文件 watcher 提供 remote change hint，receipt/Automerge 继续负责去重。

两端共享调度语义和验收 fixture，不要求 TypeScript 与 Rust 共享同一个 scheduler 实现。

## 可选 backend hint

第一阶段不扩张现有 backend 接口。完成通用事件调度并取得真实数据后，再按收益增加可选能力：

- local-direct desktop：监听 `.myreader/automerge/` 新对象；
- OneDrive：使用 delta token 降低远端目录检查成本；
- WebDAV：仅在服务端明确支持时使用增量 collection 能力；
- 未来远端通知服务：将通知映射为 `remote_change_hint`。

hint 可以减少 pull 延迟和列举成本，但永远不是正确性的唯一来源；安全 sweep 和 manual 必须仍能
恢复漏掉的通知。

## 非目标

- 不改变 manual 同步的 `scope: "all"`；
- 不让自动 sidecar scheduler 刷新 Calibre `metadata.db`；
- 不同步阅读偏好或应用设置；
- 不新增中心服务器、账户系统或 WebSocket sync server；
- 不承诺 mobile 被系统挂起后仍按秒执行；
- 不因采用 Automerge 而引入 Automerge Repo 网络协议；
- 不把 React Query refetch 当作 durable sync queue；
- 不为尚不存在的产品 domain 预留调度类型。

## 实施计划

### Phase 0：冻结调度合同

- 定义 sidecar intent、reason、优先级、合并和错误分类；
- 将 fixed interval 仅视为当前实现，不在新合同中保留；
- 为纯 scheduler state machine 使用 fake clock 和 fake executor；
- 验证 single-flight、mode upgrade、debounce、最大等待、rerun 和 backoff；
- 明确 manual/add/startup 仍通过现有 `syncLibrary` policy。

### Phase 1：Mobile 事件驱动 push

- 在 Automerge mutation 事务成功后发送 library-scoped work event；
- scheduler 订阅事件并按 debounce/max-wait 安排 `push_only`；
- 启动时扫描 pending outbox，恢复进程终止前未发布的 change；
- 接入 network reconnect，恢复所有存在 pending outbox 的书库；
- reader close/app background 将 pending push 升级为 immediate；
- 删除 reader 路由 60 秒 push tick。

### Phase 2：Mobile 上下文驱动 pull

- 持久化 `last_successful_pull_at` 与 retry state；
- 接入 foreground、active library change 和 recovery sweep；
- 使用 freshness window 去重频繁 foreground/library event；
- 保证 pull 后立即刷新列表、详情、统计和 reader 初始位置；
- 删除书库路由 180 秒 full tick；
- 保留 manual `all`、add `all` 和 startup policy。

### Phase 3：Desktop 自动调度

- 在 Tauri state 中建立 per-library scheduler；
- Rust sidecar mutation commit 后唤醒 scheduler；
- 启动时从 outbox 恢复 pending push；
- 接入窗口 focus、网络恢复和低频 pull safety sweep；
- 保留桌面刷新按钮当前的 Calibre refresh + sidecar full 行为；
- desktop/mobile 使用相同的状态机案例验证合并、重试和恢复。

### Phase 4：平台后台机会与 backend hint

- 真实设备验证 iOS background task assertion 的收益和取消语义；
- 评估 BGAppRefreshTask 与 Android background task，只作为机会性执行；
- 测量远端 list 成本后决定是否实现 OneDrive delta、WebDAV 增量能力和 local-direct watcher；
- 不因后台任务未准时运行而改变 outbox 正确性。

## 测试与验收

自动化至少覆盖：

- 本地 mutation 事务回滚时不发送 work event；
- commit 成功后在 debounce 窗口结束时安排一次 push；
- 连续多次进度、session、收藏、书签和批注写入合并为一次执行机会；
- 持续写入达到 max wait 后仍会执行；
- push 运行期间新增 change 会在结束后再次读取并发布；
- 进程重启只凭 pending outbox 即可恢复上传；
- `full` 请求可以升级已排队的 `push_only`；
- fresh foreground event 不拉取，stale event 拉取；
- 网络恢复提前唤醒 pending outbox；
- transient error 使用可预测 fake clock 验证退避范围；
- credential/config error 不形成重试风暴；
- manual 仍调用 `scope: "all"`；
- automatic sidecar sync 从不调用 `syncCalibre`；
- pull 后 projection 与 UI query 立即更新；
- 两个书库的状态、退避和 single-flight 互不污染。

真实闭环至少覆盖：

1. desktop 连续翻页后数秒内自动发布，mobile 前台恢复后自动拉取；
2. mobile 修改收藏/书签/批注后自动发布，desktop focus 后自动拉取；
3. 离线修改后保持 outbox，联网后无需手动操作即可发布；
4. 上传期间强制终止进程，重启后自动发布相同 immutable object；
5. 快速切换前后台不会发起并发重复同步；
6. WebDAV、OneDrive、local-direct 分别验证自动 push 与机会性 pull；
7. iOS 后台时间到期不会丢失 change，下一次前台继续；
8. automatic sync 不触发 Calibre 书目刷新，manual sync 仍执行两阶段。

TypeScript 测试描述使用 `it("should ... when ...")`；Rust 测试函数使用
`should_xxx_when_xxx`。不以精确 debounce 毫秒断言 UI 实现细节，而验证调度合同、持久化恢复和
网络调用次数。

## 可观察性

结构化日志至少记录：

- `library_id`、platform、reason、requested mode；
- debounce/coalesced/upgraded/rerun；
- outbox pending count；
- scheduled/started/completed/backoff/suspended；
- pushed/pulled、duration 和 next retry；
- foreground/background/network/focus 等唤醒来源。

不得记录明文笔记、Locator text excerpt、数据源凭据或 Automerge hydrated document。

## 成功标准

- 有本地 sidecar change 时，不再依赖 60 秒 tick 才开始发送；
- 没有 pending outbox 时，不因固定 push interval 发起网络请求；
- 远端变化在应用获得合理执行机会后自动拉取；
- 漏掉事件、离线、崩溃或后台到期不会丢失待发送数据；
- manual `all` 行为保持不变；
- mobile 与 desktop 对同一调度场景给出一致结果；
- 固定 interval 仅保留为带 jitter 的低频 pull 恢复手段，而不是主要同步机制。
