# 共享 Rust Component 同步试点评审

评审日期：2026-07-27

本文记录 ADR-0018 Phase 5 的架构门禁。它评审已经实现的 sync domain 纵向试点，不扩展到
阅读进度、收藏、书签、批注、阅读统计或书库等后续 domain 的完整业务后端迁移。

## 结论

共享 Rust component 路线已经达到 sync 试点的主要目的：

- desktop、iOS 和 Android adapter 使用同一个 `myreader-sync` 源码和同一个 aggregation
  crate；
- Automerge 文档、六个既有同步 domain 的 CRDT 编码、SQLite 同步事务、sidecar 交换和调度
  状态由 Rust 单一实现拥有；
- desktop 与 iOS 已完成真实 WebDAV 双向闭环，列表 projection 和 reader 初始 Locator 在同步后
  立即一致；
- mobile 不再依赖 Hermes `WebAssembly`、JavaScript Automerge engine 或提交到 Git 的预编译
  Rust 二进制。

因此，**架构路线通过，sync domain 试点实现可以保留**。ADR-0018 的三平台完整验收仍有一个
明确延期项：Android 的干净构建与真实运行验证按当前实施范围暂不执行。这个延期不否定架构
结论，但在 Android 验证补齐前，不把试点表述为“三端全部验收通过”。

## 架构门禁

| 门禁 | 结论 | 证据与边界 |
| --- | --- | --- |
| 重复代码与可理解性 | 通过 | mobile JavaScript Automerge engine、通用 binary adapter 和同步表 writer 已删除；desktop/mobile 的 identity、schedule、document、outbox、receipt、projection、exchange 和 scheduler policy 都调用共享 Rust |
| bridge API 粒度 | 通过（试点范围） | native API 围绕数据库 identity、document command、sidecar sync、schedule、task progress/cancel 和 diagnostics；不暴露 raw SQL、Automerge object 或 document bytes |
| 构建、包体与运行成本 | 可接受但需继续观察 | iOS 构建可重复，Debug 运行无 native crash；当前只有试点后的绝对值，没有引入 Rust 前的同配置包体基线，因此不伪造“包体增量” |
| iOS 构建与调试 | 通过 | Pod script 从源码构建 Rust archive；完整签名 Simulator build 和随后增量 build 均通过；应用真实启动并进入自动同步 |
| Android 构建与调试 | 延期 | Kotlin binding 和 adapter 已由同一 UniFFI source 生成；按当前决定跳过 Android 构建与运行验证 |
| 错误与日志 | 通过（当前产品入口） | native task 保留失败 stage，Expo/Tauri 保留原始 cause；iOS 真实 OneDrive 失败返回 `[stage=pushing_failed]` 和完整 OpenDAL 请求原因 |
| 同表或同语义双实现 | 通过（sync 内部表） | `sync_local_meta`、`sync_schedule_state` 和 Automerge state/change/outbox/receipt/projection 的 runtime writer 均在共享 Rust；平台侧只保留 schema migration、生成 entity 和测试查询 |

`executeSyncDatabaseCommand` 是 sync 试点内部的 tagged command envelope，用于在迁移期间把现有
产品写入转换为原子 Automerge change、projection 和 outbox。它不是后续 domain API 的模板。
迁移阅读进度、收藏、书签或批注 domain 时，应暴露 `saveReadingPosition`、`setFavorite`、
`addBookmark`、`addAnnotation` 等用例级 API，并删除对应平台业务 writer。

## 构建与运行测量

测量环境为 Apple Silicon、iPhone 17 Pro iOS 26.5 Simulator、Debug 配置。以下数字只用于当前
架构成本判断，不能代表 App Store Release 包体：

| 项目 | 结果 |
| --- | --- |
| 隔离的 iOS Simulator Rust clean build | 55.99 秒 |
| 生成 binding 并增量构建 iOS Rust artifact | 21.06 秒 |
| CocoaPods 重新生成后的签名 Debug app build | 172.06 秒 |
| 不重新安装 Pods 的签名 Debug app incremental build | 38.85 秒 |
| `libmyreader_rust_components.a` | 64,551,800 bytes（61.56 MiB，未 strip 的静态 archive） |
| Simulator Debug `.app` | 187,140 KiB（182.75 MiB） |
| Simulator Debug 主 dylib | 141,238,352 bytes（134.70 MiB） |
| iOS Debug 启动到 React 页面可见 | 约 4 秒，连接本机 Metro |
| Tauri 当前 WebDAV 书库无变更同步 | 1.29 秒，`pushed: 0, pulled: 0` |

静态 archive 会被链接器裁剪，不能直接当作最终安装包增量。由于 Phase 0 没有保留相同依赖、
相同 Xcode 配置且未接入 Rust component 的 archive/app 基线，本次只记录绝对值。后续 Release
包体优化必须用同一 commit 的 feature 开关或可重复基线比较。

本轮构建发现并修复了一项可重复性问题：Pod target 的
`CONFIGURATION_BUILD_DIR`/`BUILT_PRODUCTS_DIR` 指向 target 子目录，而应用链接器从其父级产品
目录查找 `-lmyreader_rust_components`。旧脚本会留下过期 archive，导致新 UniFFI binding
出现 undefined symbols。构建脚本现在每次从源码检查 Rust artifact，并复制到实际链接目录；
完整构建与紧接着的增量构建都已验证。

## 真实运行证据

- 已有固定回归完成 Tauri → iOS 的 WebDAV 写入、发布、拉取、列表刷新和 EPUB reader 初始
  Locator 恢复；固定样本为 `Jane Eyre`，Calibre `book_id = 11`，位置由 `4 / 1023` 更新为
  `37 / 1023`，iOS 在打开书前显示 `4%`，打开后直接进入第三章。
- 已有自动调度回归完成 desktop ↔ iOS 的双向 WebDAV push/pull、进程终止恢复、网络失败恢复和
  并发位置选择。
- 本轮签名 iOS Debug 构建安装后，主页和 4% projection 正常加载，自动同步进入共享 Rust
  `pushing` stage；OneDrive 网络失败保留完整 cause，应用进程继续运行。
- 本轮运行中的 Tauri 应用通过真实 IPC 对当前 WebDAV 书库执行同步，返回
  `pushed: 0, pulled: 0`；桌面列表仍显示与 iOS 一致的 Jane Eyre 4% projection。
- Rust 双设备文件存储测试覆盖收藏、进度、书签、批注、阅读会话和完成记录六个冻结 domain，
  并验证目标数据库即时得到六张 projection。

完整手工步骤和历次真实闭环记录见
[`reading-progress-cross-device-regression.md`](reading-progress-cross-device-regression.md)。

## 所有权审计

共享 Rust 当前拥有：

- sync identity 与 schedule state；
- canonical Automerge document、heads、changes 和 schema validation；
- sync state/change/outbox/receipt/cursor/projection transaction；
- WebDAV、OneDrive、local-direct 的 sidecar push/pull；
- single-flight、debounce、retry/backoff 决策状态；
- native task progress、cancel 和失败 stage。

平台 adapter 当前仍合理拥有：

- app lifecycle、前后台、网络恢复和书库切换 trigger；
- OAuth、凭据、security-scoped URL 和平台文件能力；
- DTO 转换、UI query invalidation、日志展示和用户错误文案；
- 尚未迁移 domain 的产品用例与读取 projection。

schema migration 和生成 entity 中出现 sync 表名不构成第二个 runtime 实现。它们继续遵守
ADR-0008 的 schema 权威；Calibre `metadata.db` 保持只读。

## 后续门禁

在迁移下一个 domain 前：

1. 补齐 Android 从源码构建、adapter contract 和真实启动/同步验证；
2. 为 Release 配置建立可重复的 app 包体与启动基线；
3. 如果 UI 需要按错误类型采取不同恢复动作，再把当前稳定的 stage 与完整 cause 扩展为跨
   UniFFI/Tauri 一致的细分 error code；当前单一 `Sync` 类别不应被误当成最终错误分类；
4. 每次只迁移一个现有 domain，先定义用例 API 和事务不变量，再删除该 domain 的平台 writer。

这些是下一步迁移的进入条件，不授权提前创建新 domain 或尚不存在的产品功能。
