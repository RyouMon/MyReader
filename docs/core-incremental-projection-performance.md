# Core 增量投影性能

## 基线与复现

基线为 PR #86 合入后的 `7c88354e9cbc1cf45c18a60e8dbe931580373d11`。
沿用 [`executor_baseline`](../my-reader-core/examples/executor_baseline.rs) 的真实 SQLite / Automerge
工作负载：顺序保存阅读位置、四个并发写入者、首次同步拉取和外部 SQLite 写锁等待。
数据规模为 4 / 100 / 1,000 本书，分别使用单线程与两个 worker 的 Tokio runtime。

修改实现前构建并保存原版 release 二进制，SHA-256 为
`dab1f390e594ddab48aa69b2ef542bd26a0890072f2b4cdb7970f26743f0619b`。
最初六组运行的 [24 条原始记录](./benchmarks/core-projection-before.jsonl) 保留为基线。
每次运行创建独立临时书库，不读取或修改用户数据；初始化和清理不计时。

```bash
cargo build --locked -p my-reader-core --release --features test-support --example executor_baseline
target/release/examples/executor_baseline current-thread 1000 20
target/release/examples/executor_baseline multi-thread 1000 20
```

将 `1000` 换成 `4`、`100` 可复现其他规模。前后使用同一工具链、机器与工作负载。
`elapsed_ms` 是整个场景耗时，`mean_ms` 是总耗时除以操作次数，不能把并发摊销成本当作
单请求延迟；`tick_lateness_*` 是旁路 2 ms 定时器的逾期时间，不是 UI 帧率。

## 实现与一致性边界

- 变更粒度是七个 domain：catalog、positions、favorites、bookmarks、annotations、sessions、
  completions。普通阅读写入不再解析整份 catalog 或删除并重建书目、作者、关联和文件表。
  一个事务同时修改阅读位置和完成记录时，两者一起提交。
- 从实际 Automerge 操作及父路径推导变更领域，包含未胜出的冲突值；不通过命令名称、
  commit message 或可见值差异猜测。三个并发位置中的第三个未胜出值仍更新冲突数量和候选。
- 只有 SQLite 投影的版本及 heads 与事务开始时的文档一致，才应用增量。初始化、schema 迁移、
  根对象变更和投影标记失效走完整投影；未变化的重复拉取不重写业务表。
- 文档状态、outbox、选中领域的 SQLite 行和投影 heads 仍在同一事务提交，任何投影失败全部回滚。
  不增加跨事务内存缓存，不改变数据库或同步序列化格式。完整查询仍返回全部领域。
- 当前是领域级增量，受影响领域内部仍完整投影；书目元数据变更仍重建 catalog。
  Automerge 快照加载、保存及远端对象完整校验仍然存在，首次同步不是纯增量更新。

新增十项契约测试，以拒绝无关表写入的 SQLite trigger 验证隔离，再与强制完整重建结果比较。
覆盖六类阅读数据、组合写入、书目编辑与删除、重复交付、冲突与解决、标记失效恢复及回滚。
本地 Cargo workspace 完整测试 516 项通过，另有一项原有的实时 TTS 测试因需要付费凭据而忽略；
Clippy（含认知复杂度）、rustfmt 和 `pnpm qa` 通过。

## 最终前后对比

实现版本为 `dc7377a2`。环境为 macOS 27.0.1（26A434）、
Apple M1 Pro（8 核）、16 GiB、rustc 1.95.0（aarch64-apple-darwin）；使用工作区 release 配置
`opt-level = "s"`、LTO 和单 codegen unit。前后基准源文件完全相同。

交替运行原版和新版三轮，第二轮反转先后顺序；本任务测量期间没有并行运行编译、测试或 QA。
系统其他活动未完全隔离，保留全部样本，不把少量重复的差异当作跨设备保证或 CI 时间门槛。
下表每个数值均为该指标三轮的中位数。

- [144 条最终原始记录](./benchmarks/core-projection-comparison.jsonl)
- [工具链、构建版本与二进制 SHA-256](./benchmarks/core-projection-environment.json)

### 阅读写入：不同书库规模

单位为每次操作的摊销耗时（ms）。并发场景有四个任务，各保存 20 次，总计 80 次。

| Runtime | 书目数 | 场景 | 原版 | 新版 | 耗时减少 |
|---|---:|---|---:|---:|---:|
| current-thread | 4 | 顺序保存 20 次 | 3.220 | 1.949 | 39.5% |
| current-thread | 4 | 4 个任务保存 80 次 | 3.474 | 2.367 | 31.9% |
| current-thread | 100 | 顺序保存 20 次 | 23.540 | 5.360 | 77.2% |
| current-thread | 100 | 4 个任务保存 80 次 | 24.600 | 5.703 | 76.8% |
| current-thread | 1000 | 顺序保存 20 次 | 225.107 | 35.944 | 84.0% |
| current-thread | 1000 | 4 个任务保存 80 次 | 232.526 | 36.123 | 84.5% |
| multi-thread | 4 | 顺序保存 20 次 | 3.318 | 2.106 | 36.5% |
| multi-thread | 4 | 4 个任务保存 80 次 | 3.469 | 2.299 | 33.7% |
| multi-thread | 100 | 顺序保存 20 次 | 23.236 | 5.389 | 76.8% |
| multi-thread | 100 | 4 个任务保存 80 次 | 24.805 | 5.608 | 77.4% |
| multi-thread | 1000 | 顺序保存 20 次 | 230.174 | 35.843 | 84.4% |
| multi-thread | 1000 | 4 个任务保存 80 次 | 236.642 | 36.163 | 84.7% |

### 1,000 本书：完整场景与执行器响应性

单位为 ms；P95 指旁路定时任务的逾期时间。

| Runtime | 场景 | 总耗时：原版 → 新版 | 定时延迟 P95：原版 → 新版 |
|---|---|---:|---:|
| current-thread | 顺序保存 20 次 | 4502.14 → 718.88 | 1.41 → 1.64 |
| current-thread | 4 个任务保存 80 次 | 18602.10 → 2889.87 | 1.41 → 1.43 |
| current-thread | 首次完整同步 | 717.42 → 535.33 | 1.41 → 1.42 |
| current-thread | 外部写锁占用 200 ms | 500.05 → 294.12 | 1.42 → 1.55 |
| multi-thread | 顺序保存 20 次 | 4603.47 → 716.85 | 1.42 → 1.43 |
| multi-thread | 4 个任务保存 80 次 | 18931.35 → 2893.04 | 1.42 → 1.45 |
| multi-thread | 首次完整同步 | 737.48 → 537.95 | 1.42 → 1.42 |
| multi-thread | 外部写锁占用 200 ms | 501.28 → 273.50 | 1.42 → 1.78 |

新版全部样本的最大单次定时延迟为 8.62 ms，不宣称实时调度保证。
首次拉取仍需要远端文档校验与完整 catalog 投影，不能用阅读写入的改善比例推断其收益。
这些测量仅覆盖本机 Rust Core；未测量原生 UI 帧率、移动设备或真实网络同步性能。
