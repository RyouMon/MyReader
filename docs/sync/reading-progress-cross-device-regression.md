# 阅读数据跨端同步回归

本流程验证 desktop 与 mobile 通过同一书库 sidecar 交换 Automerge snapshot/incremental，并在同步
完成后立即更新 SQLite projection。它是固定的手工回归流程，不替代单元测试。

## 前置条件

- desktop 与 iOS 模拟器添加同一个 Calibre 书库；
- 两端读取到相同的 Calibre `library_uuid`；
- 两端使用同一个 local-direct、WebDAV 或 OneDrive 书库目录；
- 远端测试数据已经按 ADR-0020 的 breaking change 清理；
- 两端运行包含相同 Automerge document schema 的构建。

不要修改 `metadata.db`。阅读数据只写各端本地 sidecar SQLite 和书库中的 `.myreader/`。

## 预期远端结构

逻辑 key：

```text
[<document_id>, "snapshot", <heads_hash>]
[<document_id>, "incremental", <content_sha256>]
```

远端路径：

```text
.myreader/automerge/
  <document_id>/
    snapshot/
      <heads_hash>
    incremental/
      <content_sha256>
```

每个 `document_id` 目录只包含 `snapshot/` 和 `incremental/`，对象名分别使用 heads hash 和
内容 SHA-256。

## 首次 bootstrap

1. 删除测试书库中的旧 `.myreader` 同步数据，并在两端重新添加或重置该测试书库的本地 sidecar。
2. 在设备 A 执行 full sync。
3. 确认远端产生一个 snapshot StorageKey。
4. 在设备 B 执行 full sync。
5. 确认 B 能加载 snapshot，且同步不产生缺失依赖或摘要错误。

通过标准：

- 两端同步完成；
- 远端路径以完整 `document_id` 作为目录；当前值等于 Calibre `library_uuid`；
- B 的本地 projection 与 A 的初始状态一致。

## Desktop → iOS 阅读进度

1. 在 desktop 打开固定测试书籍《夜空中最亮的星》PDF。
2. 跳到一个容易识别且不是第一页的位置，等待进度保存日志出现后关闭阅读器。
3. 确认 desktop 列表或详情已显示新进度。
4. 等待自动 push，或手动执行同步；记录 `pushed` 数量。
5. 在 iOS 执行 full sync；记录 `pulled` 数量。
6. 不打开书，先检查 iOS 列表和详情中的阅读状态与进度。
7. 打开书，确认 reader 初始位置就是 desktop 保存的位置。

通过标准：

- desktop 写入后产生 durable outbox；
- 远端出现内容摘要命名的 incremental；
- iOS `pulled > 0`；
- iOS 列表、详情和 reader 均使用同步后的 projection；
- 不需要先打开书才能刷新进度。

## iOS → Desktop 阅读进度

反向重复上一流程：

1. iOS 移动到另一个明确位置并关闭 reader；
2. iOS push；
3. desktop full sync；
4. desktop 列表、详情立即更新；
5. desktop 打开书后定位到 iOS 保存的位置。

## 六个 domain

对同一本测试书依次验证：

| Domain | 设备 A 操作 | 设备 B 验收 |
|---|---|---|
| 收藏 | 收藏，再取消收藏 | 列表/详情状态一致 |
| 阅读进度 | 保存新位置 | 列表、详情、reader 初始位置一致 |
| 书签 | 添加、删除、重新添加 | reader 书签列表一致 |
| 高亮/笔记 | 新建高亮、编辑颜色与笔记、删除 | reader 批注立即一致 |
| 阅读会话 | 阅读一段可识别时长 | 当前书库统计累计一次 |
| 阅读完成 | 标记或读至完成 | 已读本数与完成状态一致 |

每个操作都要再反向验证一次。重复 full sync 不得重复累计 session 或 completion。

## 并发进度

1. A、B 都先同步到相同 heads。
2. 两端离线。
3. A 保存位置 P1，B 保存不同位置 P2。
4. A、B 分别恢复在线并同步。
5. 确认 Automerge 文档保留两个并发候选，projection 使用确定性默认候选并标记冲突。
6. 在一个设备选择 P1 或 P2，再同步两端。
7. 确认选择产生的新 change 因果上覆盖两个旧候选。

不得用“较大的百分比”或设备时间直接丢弃另一个候选。

## 自动同步时机

验证以下触发源：

- 本地阅读数据变更后计划 debounced push；
- reader 关闭或应用进入后台时 flush；
- 应用回到前台、网络恢复、切换书库时请求 contextual pull；
- 前台 active library 约每 60 秒带 jitter 执行一次 safety sweep；
- 手动同步执行 full sync。

直接横向/纵向 UI 操作不应改变这些同步语义。

## 故障回归

### 重复与乱序

1. 让两个设备分别产生多个 incremental。
2. 让对象存储以不同顺序返回文件。
3. 重复执行 full sync。
4. 确认文档 heads 和六张 projection 收敛，业务数据不重复。

### 摘要不匹配

1. 在隔离的测试目录修改一个 incremental 的 bytes，但保留文件名。
2. 执行 full sync。
3. 确认同步停止并报告具体 StorageKey 与摘要不匹配。
4. 确认本地 Automerge state 和 projection 没有部分更新。

### 缺失依赖

1. 在隔离的测试目录删除一个仍被后续 incremental 依赖的对象。
2. 执行 full sync。
3. 确认同步停止，错误列出相关 StorageKey 或缺失 change hash。
4. 从仍然完整的副本或备份恢复原对象，再次同步并确认收敛。

若所有副本都缺失该 change，不存在无损推导算法。必须清空损坏的远端测试 sidecar，并由确认完整
的设备重新 bootstrap；不能创建假的 change、截断文档或手改 Automerge binary。

### 压缩与中断

1. 产生足够多的 incrementals，使总量达到当前 snapshot 大小。
2. full sync 后确认先出现新 snapshot。
3. 确认只有 snapshot 保存成功后，旧 chunks 才被删除。
4. 在保存 snapshot 前、保存后删除前、删除过程中分别中断。
5. 重试后应保留可加载 snapshot；中断最多留下冗余对象，不得造成数据丢失。

### 崩溃恢复

- SQLite 提交后、上传前终止进程：重启后仍上传相同 outbox bytes；
- 上传后、删除对应 outbox 条目前终止：重试覆盖同一 StorageKey；
- 下载后、projection 提交前终止：本地事务回滚，重试后完整应用；
- 网络断开：按 scheduler 退避，网络恢复后继续。

## 记录模板

每轮记录：

```text
日期 / 构建：
书库 UUID：
数据源：local-direct | WebDAV | OneDrive
设备 A：
设备 B：
测试书籍与格式：
A heads：
B heads：
pushed / pulled：
列表进度：
详情进度：
reader 初始位置：
六个 domain：
远端路径检查：
异常日志：
结论：通过 | 失败
```
