# MyReader 架构决策与提案

本目录统一保存 MyReader 的架构决策及形成这些决策的历史架构提案。历史文件保留完整正文，
不再通过单独的摘要文件间接引用；文件编号按提案首次进入 Git 的时间排序。

## 状态

- `提议中`：正在讨论，尚不能作为实现依据。
- `已接受`：已经成为当前实现约束。
- `已实施`：计划的主体已经落地，正文保留实施时的原始上下文。
- `部分实施`：只有部分阶段落地，继续执行前需要以当前代码重新核对。
- `已撤回`：提案未被接受或实施，保留用于说明被否决的方案及后续演进。
- `已取代`：方案已经不再代表当前实现，保留用于追溯决策演进。

## 管理规则

1. 新的架构提案直接在本目录创建完整文件，不在其他目录创建正文后只放引用。
2. 编号按提案产生时间递增，不按实施完成时间或补录时间排序。
3. 已实施或已取代的提案保留原始正文；只允许补充归档元数据和状态，不回写历史结论。
4. 决策改变时新增后续 ADR，不覆盖旧提案。
5. 具体线协议可以放在 `docs/sync/`，但所属架构决策仍在本目录。
6. `ARCHITECTURE.md` 只描述当前事实和已接受的目标架构。
7. 页面交互计划、视觉规格、性能实验和一次性实施清单不是 ADR，保留在 feature 文档或
   工具计划目录。

## 索引

| 编号 | 提案 | 状态 | 提案日期 |
|---|---|---|---|
| [ADR-0001](./0001-reader-architecture.md) | Reader Architecture V1 | 已取代 | 2026-04-01 |
| [ADR-0002](./0002-reader-architecture-v2.md) | Reader Architecture V2 | 已取代 | 2026-04-10 |
| [ADR-0003](./0003-myreader-sync-technology-selection.md) | MyReader 同步技术选型 | 部分实施、部分已取代 | 2026-04-23 |
| [ADR-0004](./0004-library-sidecar-jsonl-sync.md) | 使用书库 sidecar JSONL 变更流同步应用数据 | 已接受（回溯） | 2026-05-03 |
| [ADR-0005](./0005-adopt-readium-reader-architecture.md) | 使用 Readium 取代自研 Reader V2 架构 | 已接受（回溯） | 2026-05-07 |
| [ADR-0006](./0006-desktop-typed-ipc-and-layered-backend.md) | 桌面端使用生成式类型 IPC 和分层 Rust 后端 | 已接受（回溯） | 2026-05-11 |
| [ADR-0007](./0007-pnpm-monorepo-and-shared-code-ownership.md) | 采用 pnpm monorepo 并按语义共享跨端代码 | 已接受（回溯） | 2026-05-17 |
| [ADR-0008](./0008-shared-database-schema-authority.md) | 以 Drizzle schema 和 SQL migrations 作为跨端数据库权威 | 已接受（回溯） | 2026-05-18 |
| [ADR-0009](./0009-store-refactor.md) | Store Refactor | 已实施 | 2026-05-27 |
| [ADR-0010](./0010-remote-library-acceleration.md) | 远程书库通用加速层 | 已实施 | 2026-05-28 18:21 |
| [ADR-0011](./0011-mobile-layer-refactor.md) | 移动端分层重构 | 已实施 | 2026-05-28 23:37 |
| [ADR-0012](./0012-mobile-sync-refactor.md) | Mobile Sync Refactor | 已实施 | 2026-05-31 |
| [ADR-0013](./0013-maintain-mobile-readium-integration.md) | 在 MyReader 仓库维护移动端 Readium 集成层 | 已接受（回溯） | 2026-06-18 |
| [ADR-0014](./0014-data-ownership-and-sync-storage.md) | 将应用数据拆分为书库域和用户域 | 已撤回（未实施） | 2026-07-22 |
| [ADR-0015](./0015-library-sidecar-crdt-reading-sync.md) | 将书库 sidecar 升级为类型化 CRDT 阅读数据同步 | 部分实施，已取代 | 2026-07-22 |
| [ADR-0016](./0016-adopt-automerge-for-library-sidecar-sync.md) | 采用 Automerge 作为书库 sidecar 的 CRDT 核心 | 部分实施 | 2026-07-25 |
