# Core 异步执行器性能

## 测量方法

基线业务代码为 `85b374108e156321e2f9ccadca7f5c4f21588e1f`（错误处理 PR #85 合入后）。
先构建并保留基线可执行文件，再修改实现；前后使用相同示例、数据规模、工具链和 release 配置。
测试数据与缓存全部位于临时目录，不接触用户书库。

环境：macOS 27.0.1（26A434），Apple M1 Pro（8 核），16 GiB，
`rustc 1.95.0 (59807616e 2026-04-14)`，`aarch64-apple-darwin`。
沿用工作区 release 配置：`opt-level = "s"`、LTO、单 codegen unit。

```bash
cargo build -p my-reader-core --release --features test-support --example executor_baseline
target/release/examples/executor_baseline current-thread 100 20
target/release/examples/executor_baseline current-thread 1000 20
target/release/examples/executor_baseline multi-thread 100 20
target/release/examples/executor_baseline multi-thread 1000 20
```

每个组合重复三次。`current-thread` 用于直接暴露不让出执行器的代码，`multi-thread` 固定两个
worker，用于观察有限 worker 下的竞争；后者不代表生产环境的固定线程配置。
负载通过 `tokio::spawn` 在 worker 内执行，避免把多线程 runtime 的 `block_on` 外部线程
误当作 worker。四个写入者是四个独立 Tokio task。

- 固定书库身份、设备 actor、书目内容和时间，批量建立 100 / 1,000 本书的真实 Automerge 文档
  和 SQLite 投影；初始化与预热不计入测量。
- `reading_write`：通过公开 ReadingService 顺序保存 20 次阅读位置。
- `four_reading_writers`：四个任务各保存 20 次阅读位置，共 80 次，检查同库竞争。
- `sync_pull`：源书库发布后，空的第二设备从本地文件对象存储完整同步一次；包含校验、合并及投影。
- `sqlite_busy_200ms`：外部线程持有真实 SQLite 写事务 200 ms，同时通过 ReadingService 写入。
- 每次负载旁运行 2 ms 定时器，记录实际唤醒相对计划时刻的延迟 P95 / 最大值。
  每次唤醒后重新安排下一次，不用补发 tick 人为稀释长时间阻塞；最后一个逾期 tick 也记录，
  包括 Tokio 定时器驱动还未来得及处理阻塞期间到期时间的情况。
  `mean_ms` 是总耗时 / 操作数，在并发场景表示摊销成本，不是单请求延迟。

JSON Lines 原始记录包括总耗时、操作数、定时器样本数、P95 和最大延迟。
这些结果是同机对比证据，不作为跨机器 CI 时间阈值，也不等同于手机或桌面 UI 帧率。

## 执行边界

依据 Tokio 官方的 [spawn_blocking 文档](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html)，
有限的同步计算和阻塞 I/O 适合交给阻塞线程；CPU 工作需限制并发。
已开始的阻塞任务无法通过 abort 强制停止，因此事务、排队锁及数据库生命周期的所有权必须
跟随实际工作直到完成，不能在外层 Future 被取消时提前释放。
SeaORM / SQLx 已有异步执行机制，保持原来的异步查询路径。
