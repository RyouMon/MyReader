# 阅读数据跨设备同步手工回归

本文固定 desktop 与 iOS 通过同一个书库 sidecar 双向同步阅读数据的回归流程。跨端 UI
自动化尚未覆盖完整链路；修改 Automerge 文档模型、本地投影、远端存储、查询刷新或 reader
初始定位后，都必须先运行自动化门禁，再执行本文的真实双端闭环。

## 数据流

一次同步必须完整经过：

1. 产品操作在本地 Automerge document fork 上产生 change；
2. Automerge snapshot/change、durable outbox 和 SQLite 业务投影在同一事务中提交；
3. 写端把不可变增量发布到
   `.myreader/automerge/changes/<actor_id>/<sequence>-<change_hash>.am`；
4. 读端列举未处理对象，在临时 document 上导入、验证依赖与书库身份；
5. Automerge state、receipt、projection 和 projection metadata 在同一事务中提交；
6. 同步完成后刷新列表、详情、reader、收藏、书签、批注和阅读统计查询；
7. reader 从投影后的 canonical `ReaderLocator` 打开到同步位置。

两端只同步不可变 Automerge 增量，不同步 SQLite、WAL、SHM、凭据、缓存或 Calibre
`metadata.db`。

## 固定样本

- 书库：两端添加的同一个 OneDrive Calibre 书库 `CalibreLibrary`。
- 书籍：`夜空中最亮的星 - 弹唱谱`。
- Calibre `book_id`：`542`。
- 格式：PDF。
- 页数：3 页。
- 桌面到 iOS 目标：第 2 页，显示进度 `67%`。
- iOS 到桌面目标：第 3 页，显示进度 `100%`。

若样本被移除，可以换用另一本至少有三个稳定位置的书，但测试记录必须写明书名、
`book_id`、格式、总位置数和目标位置。

## 前置条件

1. 两端使用包含待测改动的构建。
2. 两端配置同一数据源和书库根目录。
3. 两端从 Calibre `library_id.uuid` 读取到相同的稳定书库 UUID；应用本地 `library_id`
   可以不同。
4. 两端 replica ID 不同，格式均为小写 UUIDv4。
5. 远端使用 `.myreader/automerge/changes/`；旧 `changes/` 与 `changes-v4/` 不兼容，
   不得双读或双写。
6. 开始前关闭两端 reader，等待前一次同步结束。

## 自动化门禁

```bash
pnpm test:automerge-fixtures
pnpm --filter @my-reader/tools test
pnpm --filter my-reader-mobile exec jest --runInBand
pnpm --filter my-reader run test:unit

cd my-reader/src-tauri
cargo test
```

重点确认以下用例通过：

- Rust 与 TypeScript 双向导入 canonical genesis 和 incremental fixture；
- 三个 actor 的 change 乱序、重复导入后收敛；
- 两个 replica 的并发位置保留候选，选择后由新 change 消除冲突；
- 第二个本地 SQLite 从同一对象存储拉取并立即投影进度；
- 初始化、产品写、远端导入和 projection rebuild 具有事务回滚保护；
- OneDrive backend 在书库根目录下读写规范的 Automerge 路径；
- 超大远端对象、书库身份不一致、损坏 binary 和缺失依赖不写 receipt 或 projection；
- iOS Metro/Hermes production export 或 release build 成功。

自动化通过后再执行真实双端闭环。

## 桌面端到 iOS

1. 桌面端打开固定样本并翻到第 2 页。
2. 保持 reader 打开，确认 `reading_progress` 已立即更新为第 2 页和 `0.666667`；关闭
   reader 不是保存进度的必要条件。
3. 回到书库执行“同步当前书库”，确认日志中的 `pushed > 0`、pending outbox 为 `0`。
4. iOS 执行当前书库同步，确认 `pulled > 0`。
5. 不打开书，先确认 iOS 列表和详情均显示 `67%`。
6. 打开该书，确认初始位置是第 2 页。
7. 检查当前书库阅读统计已刷新；本次会话时长不应因重复同步而重复累计。

成功判据：读端同步完成后，列表、详情和 reader 初始位置已经一致，不依赖“先打开一次书”
触发延迟投影。

## iOS 到桌面端

1. iOS 打开固定样本并翻到第 3 页。
2. 确认本地列表/详情更新为 `100%` 或已读。
3. iOS 执行当前书库同步，确认 `pushed > 0`。
4. 桌面端执行当前书库同步，确认 `pulled > 0`。
5. 不打开书，先确认桌面列表和详情显示 `100%` 或已读。
6. 打开该书，确认初始位置是第 3 页。
7. 重复同步两次，确认进度、session 时长和完成本数不再变化。

## 其他 domain

在同一轮回归中至少验证：

1. 桌面收藏，iOS 同步后收藏列表立即出现；iOS 取消收藏，desktop 同步后消失。
2. 一端新增书签，另一端同步后 reader 书签列表出现；删除后同步不会复活。
3. 一端新增高亮并填写短笔记，另一端可见；两端离线分别修改颜色和笔记后同步，两项修改都保留。
4. 删除批注后，另一端对普通字段的旧更新不能复活该批注。
5. 同一 session 的增量重复同步不会重复计时。
6. 多个 completion 存在时，两端投影都选择 `(completedAt, id)` 最小的合法记录。

## 并发进度

1. 两端先同步到相同 heads，然后离线。
2. desktop 移到第 2 页，iOS 移到第 3 页。
3. 两端分别恢复网络并同步。
4. 再次同步后，打开该书应出现两个位置候选；暂不选择时不得静默丢失任一候选。
5. 选择第 2 页并同步。
6. 另一端再次同步后，候选消失，列表、详情和 reader 均为第 2 页。

若两端在离线状态又并发作出不同选择，允许重新出现冲突；下一次看见所有候选后的选择才会
消除冲突。

## 证据

每次回归至少保留：

| 证据 | 预期 |
| --- | --- |
| 写端 `reading_progress` | Locator、展示进度和目标页一致 |
| 写端 `sync_automerge_outbox` | 新对象存在；发布后 `published_at` 非空 |
| 远端对象 | `.am` 路径符合 actor、20 位 sequence 和 change hash 规则 |
| 读端同步结果 | `pulled > 0`，没有 `sync.stage_failed` |
| 读端 `sync_automerge_receipts` | 对应对象仅记录一次 |
| 两端 state | `heads_json` 最终一致 |
| 读端 projection | 列表、详情、reader 初始位置在同步后立即一致 |
| 统计 projection | 重复同步不重复累计 session/completion |

必要时执行：

```sql
SELECT protocol, library_uuid, replica_id
FROM sync_local_meta;

SELECT change_hash, actor_id, actor_sequence, origin
FROM sync_automerge_changes
ORDER BY created_at;

SELECT object_path, published_at
FROM sync_automerge_outbox
ORDER BY object_path;

SELECT object_path, sha256, applied_at
FROM sync_automerge_receipts
ORDER BY applied_at;

SELECT heads_json, projection_version, rebuilt_at
FROM sync_automerge_projection_meta
WHERE id = 'local';

SELECT book_id, format, locator_json, display_progression, sync_conflict_count
FROM reading_progress
WHERE book_id = 542;
```

桌面数据库位于应用数据目录
`libraries/<library_id>/.myreader/myreader.db`；iOS 数据库位于应用容器
`Documents/libraries/<library_id>/.myreader/myreader.db`。

## 故障定位

1. **写端 projection 未变化**：检查产品入口是否调用 Automerge command；禁止绕过 document
   直接写 projection。
2. **本地身份错误**：`sync_local_meta.protocol` 必须是
   `library-sidecar-automerge`，`library_uuid` 必须等于当前 Calibre UUID。旧开发协议状态由
   breaking-change migration 丢弃，不转换旧 change。
3. **outbox 未发布**：检查数据源凭据、远端目录创建和 immutable object 摘要冲突。
4. **远端已有对象但 `pulled = 0`**：检查 actor 路径过滤、receipt、依赖和 library identity。
5. **receipt 已写但 projection 未更新**：这是事务不变量破坏；远端 state、receipt 与
   projection 必须一起提交。
6. **数据库已更新但 UI 仍旧**：检查同步完成后的 React Query invalidation。
7. **列表正确但打开位置错误**：检查格式匹配、canonical `ReaderLocator` 和 native/JS
   Locator 转换。
8. **Finder 出现 `.myreader 2`**：先确认 OneDrive 远端逻辑路径；不要把 File Provider
   的本地冲突名写入协议。

## 2026-07-25 实施验证记录

- canonical Automerge fixture、Rust/TypeScript 互操作、Rust 双 replica 本地对象存储闭环通过；
- iOS signed Debug 构建在 Hermes 中使用原生 Automerge backend，不再依赖全局
  `WebAssembly`；应用启动后的真实 OneDrive 同步成功；
- Tauri 真实打开固定 PDF 并定位到第 2 页，列表与详情立即投影为 `67%`；同步后 iOS 日志记录
  `pulled: 21, pushed: 0`，主页在打开书前已显示 `67%`，打开后 reader 显示
  `第 2 页` 和 `2 / 3`；
- iOS 将同一本书推进到第 3 页，本地日志记录 `position: 3`、
  `displayProgression: 1`；完整同步记录 `pulled: 0, pushed: 2`；
- Tauri 随后同步，列表与详情在打开书前更新为 `100%` / `已读完`，打开后 reader 显示
  `第 3 / 3 页`；
- 关闭两端 reader 后再次同步，双方 `heads_json` 收敛到同一个 head，进度均为
  `position: 3`、`displayProgression: 1`；下一次 iOS 同步为 `pulled: 0, pushed: 0`；
- Metro 模块重载后不会重复安装 UniFFI 全局绑定，Fast Refresh 不再触发
  `property is not configurable`；
- 真实运行暴露旧 `library-sidecar-v4` identity 阻止写入，已增加回归测试和一次性丢弃旧同步
  内部状态的 migration；业务 projection 保留。

本次真实闭环使用运行中的 Tauri 桌面端、iPhone 17 Pro iOS 26.5 模拟器和同一个 OneDrive
`CalibreLibrary`，已覆盖双向远端增量、同步后查询刷新和 reader 初始位置恢复。
