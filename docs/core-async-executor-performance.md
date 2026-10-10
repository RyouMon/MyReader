# Core 异步执行器性能

## 测量方法

基线业务代码为 `85b374108e156321e2f9ccadca7f5c4f21588e1f`（错误处理 PR #85 合入后）。
先构建并保留基线可执行文件，再修改实现；前后使用相同示例、数据规模、工具链和 release 配置。
测试数据与缓存全部位于临时目录，不接触用户书库。

环境：macOS 27.0.1（26A434），Apple M1 Pro（8 核），16 GiB，
`rustc 1.95.0 (59807616e 2026-04-14)`，`aarch64-apple-darwin`。
沿用工作区 release 配置：`opt-level = "s"`、LTO、单 codegen unit。

```bash
cargo build --locked -p my-reader-core --release --features test-support --example executor_baseline
target/release/examples/executor_baseline current-thread 100 20
target/release/examples/executor_baseline current-thread 1000 20
target/release/examples/executor_baseline current-thread 4 20
target/release/examples/executor_baseline multi-thread 100 20
target/release/examples/executor_baseline multi-thread 1000 20
target/release/examples/executor_baseline multi-thread 4 20
```

每个组合重复三次。`current-thread` 用于直接暴露不让出执行器的代码，`multi-thread` 固定两个
worker，用于观察有限 worker 下的竞争；后者不代表生产环境的固定线程配置。
负载通过 `tokio::spawn` 在 worker 内执行，避免把多线程 runtime 的 `block_on` 外部线程
误当作 worker。四个写入者是四个独立 Tokio task。

- 固定书库身份、设备 actor、书目内容和时间，批量建立 4 / 100 / 1,000 本书的真实 Automerge 文档
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
取消排队 Future 或等待阻塞池启动的任务时，尚未开始的工作不再执行；已经开始的事务原子完成
或回滚。异步调用中止不代表数据库事务已停止，书库删除通过连接 lease 等待实际完成。
SeaORM / SQLx 已有异步执行机制，保持原来的异步查询路径。

## 最终结果（2026-10-10）

基准程序提交为 `b3b03d87`，最终实现为 `dbc6af4e`。原版与新版交替运行三轮，
第二轮反转先后顺序；测量期间不并行运行本任务的编译、测试或 QA。每轮都重新创建相同内容的
独立临时书库。保留原版二进制后才开始实现。随后补充的缓存连接关闭位于所有计时结束后，
未改动测量负载。原始记录：

- [实现前最初 48 条基线](./benchmarks/core-executor-before.jsonl)
- [最终交替运行的 144 条记录](./benchmarks/core-executor-comparison.jsonl)
- [构建版本、环境及二进制 SHA-256](./benchmarks/core-executor-environment.json)

下表每个数值均为对应指标三轮的中位数。最大延迟一列是“每轮最大延迟的中位数”，
不是所有轮次的绝对最大值；每轮最大值和样本数均在原始记录中。

### 1,000 本书：操作耗时与执行器响应性

单位均为 ms。P95 / 最大延迟指旁路 2 ms 定时任务的逾期时间。

| Runtime | 场景 | 总耗时：原版 → 新版 | 定时延迟 P95：原版 → 新版 | 定时最大延迟：原版 → 新版 |
|---|---|---:|---:|---:|
| current-thread | 顺序保存 20 次 | 4431.74 → 4424.69 | 244.43 → 1.79 | 268.18 → 2.58 |
| current-thread | 4 个任务保存 80 次 | 18756.89 → 18734.49 | 940.86 → 1.79 | 972.44 → 8.04 |
| current-thread | 同步合并 1 次 | 728.90 → 721.63 | 718.62 → 1.79 | 718.62 → 6.51 |
| current-thread | 外部 SQLite 锁占用 200 ms | 463.83 → 456.69 | 461.84 → 1.79 | 461.84 → 2.47 |
| multi-thread | 顺序保存 20 次 | 4361.01 → 4443.19 | 1.79 → 1.79 | 3.54 → 2.56 |
| multi-thread | 4 个任务保存 80 次 | 18438.93 → 18583.83 | 509.59 → 1.79 | 700.31 → 33.47 |
| multi-thread | 同步合并 1 次 | 728.43 → 718.86 | 1.80 → 1.79 | 2.01 → 2.18 |
| multi-thread | 外部 SQLite 锁占用 200 ms | 475.69 → 477.58 | 1.80 → 1.79 | 2.54 → 1.80 |

### 轻量书库：调度开销检查

展示每次保存的摊销耗时（ms）；耗时变化为正代表新版更慢。并发请求的单请求延迟不能从摊销
耗时直接推导。少量重复的结果仍有系统调度和文件缓存波动，不将这些差异当作计算加速保证。

| Runtime | 书目数 | 场景 | 原版 | 新版 | 耗时变化 |
|---|---:|---|---:|---:|---:|
| current-thread | 4 | 顺序保存 20 次 | 4.857 | 3.284 | -32.4% |
| current-thread | 4 | 4 个任务保存 80 次 | 3.655 | 3.398 | -7.1% |
| current-thread | 100 | 顺序保存 20 次 | 22.699 | 23.172 | +2.1% |
| current-thread | 100 | 4 个任务保存 80 次 | 24.595 | 24.690 | +0.4% |
| multi-thread | 4 | 顺序保存 20 次 | 3.229 | 3.346 | +3.6% |
| multi-thread | 4 | 4 个任务保存 80 次 | 3.729 | 3.611 | -3.1% |
| multi-thread | 100 | 顺序保存 20 次 | 22.840 | 23.186 | +1.5% |
| multi-thread | 100 | 4 个任务保存 80 次 | 24.992 | 24.258 | -2.9% |

1,000 本书、四个写入任务竞争时，单线程定时最大延迟中位数下降 99.2%。
新版全部场景仍观测到最高 48.37 ms 的单次定时延迟，所以这不是实时调度保证。
改动的主要收益是执行器响应性；SQLite / Automerge 的实际计算与完整投影重建仍存在，
处理时间没有出现与定时延迟相同倍数的改善。增量投影属于后续独立优化类别。

## 验证

- `cargo test --locked --workspace`：506 项通过；1 项既有在线 TTS 配额测试按原标记忽略。
- `cargo clippy --locked --workspace --all-targets --features my-reader-core/test-support -- -D warnings -D clippy::cognitive_complexity`：通过，包含基准示例。
- `cargo fmt --all --check`：通过。
- `pnpm qa`：通过，包含 11 项 QA 脚本测试；未调整门禁或基线。
- 补充基准清理后，Core 完整 221 项测试、含示例的 Clippy、4 本书示例冒烟通过。
- 新增七项合同测试覆盖单线程活性、两种队列的取消、不同书库隔离、事务完成前保留锁与 lease、
  删除时拒绝排队写入、并发写入不丢失、错误分类及回滚。阻塞池排队取消测试另行单独运行通过。

未改变生产公共 API、FFI DTO 或数据库格式。这里是 macOS 上的 Rust Core 实测，
没有以此宣称 iOS / Android / Tauri UI 帧率或原生端到端性能已验证。
