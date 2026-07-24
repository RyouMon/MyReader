# 阅读进度跨设备同步手工回归

本文记录桌面端与移动端通过同一个书库 sidecar 双向同步阅读进度的固定回归流程。
跨端 UI 自动化尚未覆盖完整链路，因此每次修改阅读进度、同步内核、远端存储或 reader 初始定位后，
都应执行本文的自动化测试和手工闭环。

## 覆盖范围

本流程验证一条 `reading_position.v1` 变更从产生到使用的完整路径：

1. reader 保存当前 Locator 和显示进度；
2. 本地 projection、HLC 和 outbox 在同一个事务中提交；
3. 写端把 JSON segment 发布到当前书库的
   `.myreader/changes-v4/<replica_id>/<sequence>-<hash>.json`；
4. 另一端枚举 replica、拉取并合并 segment、推进 cursor；
5. 书库列表和详情刷新为合并后的进度；
6. reader 使用合并后的 Locator 打开到正确位置。

它不验证 Calibre 书籍文件同步、其他同步 domain 或跨书库统计。

## 固定测试样本

- 书库：桌面端和移动端添加的同一个 OneDrive Calibre 书库。
- 书籍：`夜空中最亮的星 - 弹唱谱`。
- Calibre `book_id`：`542`。
- 格式：PDF。
- 页数：3 页。

若固定样本被移除，可以换用另一本至少有 3 个可稳定定位位置的书，但必须在测试记录中写明
书名、`book_id`、格式、总页数和两个目标位置。

## 前置条件

1. 两端使用包含待测改动的构建。
2. 两端配置同一个 OneDrive 数据源，并选择同一个书库根目录。
3. 两端读取到的 Calibre library UUID 相同。两端各自生成的本机 `library_id` 不要求相同。
4. OneDrive 中的协议路径是书库根目录下的 `.myreader`。Finder 中 OneDrive File Provider
   可能把本地镜像显示为 `.myreader 2`；这个本地名称不是协议路径，不能写入配置或代码。
5. 开始前关闭两端该书的 reader，等待尚未完成的同步结束。

## 自动化保护

先运行与本链路直接相关的测试：

```bash
pnpm --filter my-reader-mobile exec jest \
  src/services/remote/onedrive/backend.test.ts \
  src/domain/sync/library-sidecar/kernel.test.ts \
  --runInBand

cd my-reader/src-tauri
cargo test should_pull_reading_position_when_second_replica_syncs
cargo test should_advance_cursor_when_remote_segment_is_applied
```

这些测试分别保护：

- 移动端把第一个 `.myreader` 目录创建在配置的书库根目录下；
- 移动端使用规范的 Microsoft Graph item/children 路径读取共享 sidecar；
- 第二个 replica 可以从同一个 sidecar 拉取并投影阅读位置；
- segment 成功应用后才推进该 replica 的 cursor。

自动化测试通过后再执行下面的真实双端闭环。

## 桌面端到移动端

1. 在桌面端打开固定测试书，移动到第 3 页。
2. 关闭 reader，确保进度保存完成。
3. 回到书库，点击工具栏的“同步当前书库”，等待刷新和同步全部结束。
4. 在移动端书库页执行当前书库同步，等待成功反馈。
5. 确认移动端书库卡片显示 `100%` 或“已读”。
6. 在移动端打开该书，确认初始位置是第 3 页，而不是第 1 页。
7. 关闭移动端 reader。

成功判据：列表/详情的显示进度和 reader 初始位置都来自桌面端刚保存的第 3 页。

## 移动端到桌面端

1. 在移动端打开固定测试书，移动到第 2 页。
2. 关闭 reader，确保进度保存完成。
3. 在移动端执行当前书库同步，等待成功反馈。
4. 在桌面端点击“同步当前书库”，等待刷新和同步全部结束。
5. 确认桌面端书库卡片和详情都显示 `67%`。
6. 在桌面端打开该书，确认初始位置是第 2 页。
7. 再次确认移动端书库卡片也显示 `67%`。

成功判据：列表、详情和 reader 初始位置都收敛到移动端刚保存的第 2 页。

## 必须保留的证据

每次回归至少记录：

| 证据 | 预期 |
| --- | --- |
| 写端 reader 关闭后的目标位置 | 第 3 页或第 2 页 |
| 写端发布结果 | 新 segment 已写入当前 replica 目录 |
| 读端同步结果 | `pulled > 0`，没有 `sync.stage_failed` |
| 读端 `sync_cursors` | 对端 replica 的 sequence 和文件摘要已推进 |
| 读端 `reading_progress` | `locator_json`、`display_progression`、`sync_clock` 来自最新写端 |
| 读端列表/详情 | 第 3 页为 `100%`/已读；第 2 页为 `67%` |
| 读端 reader 初始位置 | 与最新同步 Locator 一致 |

必要时可以对两端 sidecar 数据库执行：

```sql
SELECT replica_id, sequence, file_hash
FROM sync_cursors
ORDER BY replica_id;

SELECT book_id, format, locator_json, display_progression, sync_clock
FROM reading_progress
WHERE book_id = 542;
```

桌面端数据库位于应用数据目录的
`libraries/<library_id>/.myreader/myreader.db`。iOS 模拟器数据库位于应用容器的
`Documents/libraries/<library_id>/.myreader/myreader.db`。

## 故障定位

按数据流从前向后排查，不要只看列表 UI：

1. **写端数据库没有变化**：检查 reader 关闭前是否保存 Locator，以及 projection/HLC/outbox
   是否同事务提交。
2. **写端数据库已变化但没有新 segment**：检查 outbox、prepared segment、凭据和远端写入日志。
3. **远端已有 segment，但读端没有对应 cursor**：检查 replica 目录枚举、规范路径、sequence
   连续性、摘要和协议校验。
4. **cursor 已推进，但 projection 未变化**：这是错误状态；cursor 和 projection 必须在同一事务
   提交。检查 projection rejection 和事务回滚日志。
5. **数据库已更新，但列表/详情仍旧**：检查同步完成后的 reading-progress query invalidation。
6. **列表已更新，但打开位置错误**：检查 reader 初始 Locator 的读取、格式匹配和原生/JS Locator
   转换。
7. **Finder 出现 `.myreader 2`**：先确认 OneDrive 远端逻辑路径，再检查
   `com.apple.fileprovider.before-bounce#PX`；不要把 File Provider 的本地冲突名当成远端目录名。

## 已验证基线

2026-07-24 使用上述固定样本完成真实双向闭环：

- 桌面端保存第 3 页并发布，iOS 拉取后列表显示已读，打开直接进入第 3 页；
- iOS 保存第 2 页并发布，桌面端拉取后列表和详情显示 `67%`，打开直接进入第 2 页；
- 两端最终数据库均保存第 2 页 Locator 和 `2/3` 显示进度，桌面端 cursor 已推进到移动端新
  replica 的 sequence 1。
