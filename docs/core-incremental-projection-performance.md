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
