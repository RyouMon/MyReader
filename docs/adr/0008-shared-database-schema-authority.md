# ADR-0008：以 Drizzle schema 和 SQL migrations 作为跨端数据库权威

- 状态：已接受
- 初始决策日期：2026-05-18
- 修正日期：2026-07-21
- 记录日期：2026-07-22
- 记录方式：根据 Git 历史和现存实现回溯补录
- 上层决策：[ADR-0007](./0007-pnpm-monorepo-and-shared-code-ownership.md)
- 相关决策：[ADR-0004](./0004-library-sidecar-jsonl-sync.md)

## 说明

共享数据库模式在 2026-05-18 开始实施，但桌面端最初同时采用了 SeaORM Entity-First 运行时
建表。2026-07-21 的破坏性修正才把迁移权威完全收敛到 Drizzle SQL。本文同时记录最初目标、
错误分叉和最终边界。

## 背景

MyReader 的书库 sidecar 数据需要被移动端 TypeScript 和桌面端 Rust 共同读取：

- 移动端使用 Drizzle 和原生 SQLite 运行时。
- 桌面端使用 SeaORM 进行 Rust 查询。
- 两端同步相同的阅读进度、文件状态、书签和批注等逻辑记录。
- Calibre `metadata.db` 是外部数据库，只允许查询，不由 MyReader 迁移。

在共享 schema 之前，两端分别维护建表 SQL、查询字段和类型，容易出现列名、主键、时间单位、
可空性与 Locator 结构漂移。

2026-05-18 的 `4564accc` 创建 `packages/db`，把 MyReader 表定义为 Drizzle schema，并尝试从
共享 SQL 生成桌面 SeaORM entities。但桌面运行时随后使用 Entity-First schema sync 建表，导致
出现两个潜在权威：Drizzle migration history 和 SeaORM entity 定义。

这种分叉在新增多次 migration 后暴露问题：只从最新 migration 生成 entity 会缺表，Entity-First
创建的旧数据库也不能证明执行过完整历史。2026-07-21 的 `e878c670` 最终决定让桌面通过
SeaORM Migrator 执行同一组 Drizzle SQL，entities 仅保留查询职责。

## 决策驱动因素

1. 桌面和移动必须从同一业务 schema 推导表、类型和迁移。
2. 已发布数据库必须按有序 migration 升级，不能依赖当前 entity 快照猜测历史。
3. ORM 是平台查询实现，不应成为第二套业务模式权威。
4. Calibre 外部数据库与 MyReader 自有数据库必须保持所有权隔离。
5. 生成文件应可以从权威输入重建，不允许手工修补后产生漂移。
6. 平台专用缓存可以共享定义，但必须允许不进入另一平台的查询层。

## 考虑过的方案

| 方案 | 优点 | 主要问题 |
|---|---|---|
| 两端各自维护 schema 和 migration | 平台完全独立 | 主键、字段和升级顺序容易漂移，跨端同步无法可靠演进 |
| SeaORM entities 作为唯一真相 | Rust 侧使用直接 | 移动端仍需另一套 TypeScript schema；entity 快照不能表达完整迁移历史 |
| Drizzle schema 只生成类型，桌面 Entity-First 建表 | 查询类型可共享一部分 | 运行时仍有两个建表权威，历史数据库升级不可验证 |
| 手写中立 SQL，再分别维护 ORM 类型 | 迁移语言中立 | 类型和关系定义仍需重复维护，生成流程复杂 |
| Drizzle schema + SQL migrations 为权威，SeaORM entities 为生成查询模型 | 一套模式历史覆盖两端 | 需要可靠代码生成、migration 包装和生成物检查 |

## 决策

### 权威来源

MyReader 自有书库数据库的唯一权威链路是：

```text
packages/db/src/schema
  → drizzle-kit
  → packages/db/drizzle/*.sql
  ├── 移动端 Drizzle migrator
  └── 桌面 SeaORM LibraryMigrator
        → SeaORM generated entities for queries only
```

- Drizzle TypeScript schema 描述当前业务表结构。
- 有序 SQL migration 描述从旧版本到新版本的唯一合法升级路径。
- `meta/_journal.json` 和运行时 migration 注册必须与 SQL 文件一致。
- SeaORM entities 是生成输出，只用于类型安全查询，不生成、修正或拥有表结构。

### 桌面运行时

桌面端构建时发现并嵌入全部 Drizzle SQL migrations。运行时由 SeaORM `Migrator` 按顺序执行，
并在 `seaql_migrations` 中记录已经应用的版本。

不得恢复 Entity-First schema sync。新增或修改 Rust entity 不能替代 migration，也不能通过当前
entity 自动改变用户数据库。

### 生成规则

生成桌面 entities 时必须：

1. 新建临时 SQLite 数据库；
2. 按文件名顺序重放全部 `packages/db/drizzle/*.sql`；
3. 从最终数据库生成 `my-reader/src-tauri/src/entities/app/`；
4. 明确排除不属于桌面 repository 层的平台专用缓存表；
5. 将 schema、migration、journal、生成 entities 和查询改动一起提交。

不得手工编辑生成 entity 来修复 schema 问题。应修改 Drizzle schema 或生成脚本后重新生成。

### Calibre 数据库

`metadata.db` 由 Calibre 拥有：

- MyReader 只读查询，不执行应用 migration。
- `packages/db/src/schema/calibre/` 只提供类型和查询模型。
- Calibre schema 不进入 MyReader 的 Drizzle migration history。
- Calibre SeaORM entities 可以生成，但不能被应用 migrator 用来建表或改表。

### 平台专用表

共享 schema 可以包含业务上属于书库数据库、但只由某个平台消费的表。例如移动端缩略图缓存
元数据可以进入移动数据库 migration，但桌面 SeaORM codegen 必须显式忽略该表。

平台专用表不得反向变成跨端同步表；是否同步仍由 [ADR-0004](./0004-library-sidecar-jsonl-sync.md)
中的表规格决定。

## 历史落地

| 日期 | 提交 | 历史动作 |
|---|---|---|
| 2026-05-18 | `4564accc` | 创建 `packages/db`，统一 MyReader 表 schema，移动端改用 Drizzle，桌面引入 SeaORM |
| 2026-05-18 | `fbf68bef` | 增加 Calibre `metadata.db` 只读 schema 和 Rust entity 生成 |
| 2026-05-19 | `27f91926` | 桌面和移动查询迁移到共享 ORM schema |
| 2026-05-25 | `3a942ab2` | 将应用 entities 与 Calibre entities 分离 |
| 2026-07-14 | `ee1a98e1` | 修复生成脚本，按完整 migration 链生成 entities |
| 2026-07-21 | `e878c670` | 停止 Entity-First 建表，桌面改为通过 SeaORM 执行 Drizzle SQL |

## 结果

### 正面结果

- 两端数据库主键、字段和 migration history 有单一来源。
- Rust 和 TypeScript 可以保留各自适合的平台 ORM。
- 桌面新建数据库与移动端数据库执行相同业务 SQL。
- 历史升级可以按 migration 重放和测试，不依赖当前 entity 快照。
- Calibre 外部数据与 MyReader 自有数据的所有权边界更清楚。

### 代价和风险

- schema 变更必须同步维护生成输出和两端查询，提交范围比单端改表更大。
- 构建脚本需要把 JavaScript 生成的 migration 正确嵌入 Rust。
- SQLite 类型名称与 affinity 的差异可能使过度严格的 schema 测试误报。
- 平台专用表的忽略清单需要显式维护。
- 旧 Entity-First 数据库没有完整 migration state，2026-07-21 的修正选择不兼容并要求重建。

## 长期约束

1. MyReader 表只能从 `packages/db/src/schema` 和有序 Drizzle migrations 演进。
2. SeaORM entities 是生成查询模型，不是 migration 或建表权威。
3. 生成 entities 前必须重放完整 migration 链，不能只应用最新文件。
4. Calibre `metadata.db` 永远不由 MyReader migrator 修改。
5. schema、SQL migration、journal、运行时注册和生成输出必须保持一致。
6. 新增同步字段时必须同时检查两端持久化、JSONL 规格和旧记录兼容。
7. 任何破坏旧数据库兼容性的决定都必须提供迁移方案或明确记录重建要求。

## 取代本决策

如果未来改用独立 schema DSL、服务器数据库或另一套跨语言 migration 系统，必须新增 ADR，说明
现有 Drizzle 历史如何迁移、两端 ORM 如何生成，以及已发布 sidecar 数据库如何升级。
