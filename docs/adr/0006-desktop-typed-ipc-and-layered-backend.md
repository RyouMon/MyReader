# ADR-0006：桌面端使用生成式类型 IPC 和分层 Rust 后端

- 状态：已接受
- 决策日期：2026-05-11
- 主体完成日期：2026-05-12
- 边界收紧日期：2026-06-26
- 记录日期：2026-07-22
- 记录方式：根据 Git 历史和现存实现回溯补录

## 说明

这项决策由一组连续重构落地，当时没有单独 ADR。本文记录最终形成的桌面进程边界、Rust
依赖方向和生成代码所有权，不把当时每个 repository trait 或 service 名称永久化。

## 背景

MyReader 桌面端由 React WebView 和 Tauri Rust 后端组成。早期实现中，前端直接用字符串调用
`invoke()`，命令函数同时处理：

- IPC 参数与 Tauri state；
- 书库解析和路径校验；
- Calibre 与应用 SQLite 查询；
- WebDAV 请求和凭据；
- 缓存、下载和 reader 资源准备；
- 错误到前端字符串的转换。

这种结构造成几个问题：

- Rust command 改名或 DTO 变化无法在 TypeScript 编译期发现。
- 前端维护手写类型，与 `serde` 结构容易漂移。
- 业务逻辑依赖 `AppHandle`、Tauri state 和 IPC，难以写纯 Rust 单元测试。
- 数据访问、路径安全、缓存和网络编排混在 command 中，复用与错误处理不一致。
- command 数量和参数增加后，裸 `invoke()` 成为不受控制的应用内部协议。

## 决策驱动因素

1. 前后端接口变化必须尽可能在编译或生成检查阶段失败。
2. 业务逻辑应能脱离 Tauri runtime 进行 Rust 测试。
3. 数据访问与业务编排必须有明确、单向的依赖边界。
4. 前端只消费一个稳定 IPC facade，不理解 Rust 内部模块。
5. 错误要保留结构化类型，不能全部降级成不可判别字符串。
6. 路径校验、凭据和资源生命周期应集中在拥有它们的 service。

## 考虑过的方案

| 方案 | 优点 | 主要问题 |
|---|---|---|
| 保留裸 `invoke()` 和手写 TypeScript 类型 | 依赖少、局部修改快 | 命令名和 DTO 漂移只能在运行时发现 |
| 给每个 command 手写前端 wrapper | 可以集中调用 | 仍需重复维护 Rust/TypeScript 类型和错误协议 |
| 把业务逻辑继续放在 commands | 文件少、调用直接 | 与 Tauri 强耦合，测试困难，command 会不断膨胀 |
| 使用独立本地 HTTP/GraphQL 服务 | 契约工具成熟 | 增加端口、认证、序列化和生命周期复杂度，超出桌面本地 IPC 需求 |
| tauri-specta 生成契约 + Rust 分层 | 编译期类型、保留 Tauri IPC、业务可测试 | 需要管理生成文件和严格维护依赖方向 |

## 决策

### 前后端 IPC

所有 React 到 Rust 的业务调用都经过 tauri-specta 收集并生成的 TypeScript bindings：

```text
Rust command + DTO + ErrorKind
  → tauri-specta export
  → src/lib/tauri-specta.ts
  → src/lib/tauri-api.ts facade
  → hooks / UI
```

- Rust command、输入、输出和结构化错误是 IPC 契约源。
- `tauri-specta.ts` 是生成文件，不允许手工编辑。
- `tauri-api.ts` 可以提供稳定的前端 facade、结果解包和兼容适配，但不复制 DTO 定义。
- 产品代码不得新增裸 `invoke()` 绕过生成契约。
- bindings 生成或检查必须进入桌面端验证流程。

### Rust 后端分层

依赖方向为：

```text
commands
  ↓
services
  ↓
repositories
  ↓
entities / db / storage / utilities
```

职责如下：

- `commands/`：Tauri IPC 边界、参数接收、state 获取和结果返回；不拥有业务流程。
- `services/`：用例编排、路径与资源生命周期、跨 repository/storage 协作；尽量不依赖 Tauri。
- `repositories/`：SQLite/Calibre 表访问和持久化语义；不调用上层 service。
- `entities/`、`db/`、`storage/`：ORM 模型、连接、远端对象存储和基础设施。

`sync/` 等具有独立领域复杂度的模块可以由 command 或 service 调用，但不能借此把业务逻辑
重新塞回 IPC 层。是否增加 repository trait 由测试替换和多实现需求决定，不要求为每个文件
机械创建接口。

### 错误和 DTO

- Rust 内部使用结构化 `AppError`；暴露给前端时保留可判别的 `ErrorKind`。
- DTO 与数据库 entity 分离：IPC 不直接泄露 ORM ActiveModel、数据库连接或内部错误类型。
- 不可序列化或不适合 Specta 的第三方类型应在边界转换为应用 DTO，而不是在前端复制猜测类型。

### 前端调用边界

React UI 通过 hooks 调用 `lib/tauri-api`。组件不直接拼接 command 名称，也不依赖 Tauri plugin
内部返回结构。Demo 或测试实现必须匹配同一 facade，而不是形成第二套产品 API。

## 历史落地

| 日期 | 提交 | 历史动作 |
|---|---|---|
| 2026-05-11 | `7d4739c4` | 引入 tauri-specta，生成 TypeScript command、DTO 和 ErrorKind |
| 2026-05-12 | `dbc812e4` | 前端移除裸 `invoke()`，统一使用生成 API |
| 2026-05-12 | `7283141e` | 增加 repository 层和统一错误转换 |
| 2026-05-12 | `04b94801` | 增加不依赖 Tauri 的纯 Rust service 层 |
| 2026-05-12 | `b762064d` | commands 收缩为参数和委托边界，删除被取代模块 |
| 2026-05-15 | `1ff4e680` | 结构化错误、异步 state 和 IPC 面继续收紧 |
| 2026-06-26 | `1a21b035` | 将残留的下载、scope、streamer、progress 编排移回 services |

## 结果

### 正面结果

- command 和 DTO 变化可以通过 Rust/TypeScript 生成检查暴露。
- service 可以不启动 Tauri 窗口进行单元和集成测试。
- 路径、下载、书库和 reader 生命周期有明确所有者。
- 前端只有一个 IPC facade，Demo 与真实后端可以共享调用形状。
- repository 可以独立替换 raw SQL、SeaORM 或测试数据库而不改变 UI。

### 代价和风险

- 每次 IPC DTO 变化都必须重新生成并提交 bindings。
- 过度分层会制造空洞 wrapper，因此只在职责边界处拆分，不按文件数量追求层级。
- 部分基础设施操作可能跨 repository 和 storage，需要 service 明确编排事务与失败语义。
- Specta 或 Tauri 升级可能改变生成输出，必须作为契约变更审查。

## 长期约束

1. 桌面前端不得新增裸 Tauri `invoke()` 业务调用。
2. 生成的 `tauri-specta.ts` 不得手工编辑。
3. Commands 不直接实现数据库、网络、缓存或 reader 生命周期编排。
4. Services 不由 repositories 反向调用，repositories 不依赖 Tauri UI。
5. IPC 使用应用 DTO 和结构化错误，不直接暴露 ORM 或第三方内部类型。
6. 新增 command 时必须同时进入生成 bindings 与相关包的验证流程。
7. 只有存在真实替换或测试需求时才引入 trait，避免为分层而分层。

## 取代本决策

如果未来桌面端改用独立本地服务、Web 标准 RPC 或取消 Tauri Rust 后端，必须新增 ADR，说明
类型契约生成、错误模型、安全边界和现有 service/repository 的迁移方式。
