# ADR-0007：采用 pnpm monorepo 并按语义共享跨端代码

- 状态：已接受
- 决策日期：2026-05-17
- 记录日期：2026-07-22
- 记录方式：根据 Git 历史和现存实现回溯补录
- 后续决策：[ADR-0008](./0008-shared-database-schema-authority.md)

## 说明

这项决策不只是将 npm 切换为 pnpm。它同时确定了桌面、移动和共享包如何一起版本化，以及
“跨端共享”应以领域语义和可生成源为边界，而不是强迫平台运行时、Store、UI 或 Reader
Surface 使用相同实现。

## 背景

MyReader 最初由桌面应用、移动应用和 `my-reader-tools` 三个相邻但独立安装的 Node 项目组成：

- 各目录维护自己的 lockfile 和安装生命周期。
- 内部依赖通过 `file:` 路径连接。
- 测试、Tauri、Playwright、WebdriverIO 和 Expo/EAS 命令分别维护。
- 共享包曾暴露 Store 接口、Reader Core 和平台相关类型，要求两端实现相同形状。
- Metro、Vite、Jest 和 TypeScript 对符号链接与包解析的要求不完全一致。

随着数据库契约、Reader 语义、设计颜色、字体和跨端测试算法增加，独立安装和模糊共享边界
开始造成版本漂移与循环依赖。另一方面，桌面 React/WebView 与移动 React Native/原生模块
又不适合共享所有实现。

2026-05-17 的 `172e9033` 将仓库迁移为 pnpm workspaces，并把 `my-reader-tools` 移入
`packages/tools`。同日 `ae8c5019` 删除未被实际复用的 Reader Core、Foliate 代码和旧 reader
类型，表明 monorepo 的目标不是扩大共享面，而是让共享边界可验证。

## 决策驱动因素

1. 一个提交中的跨端契约、消费者和生成物必须原子演进。
2. 内部包需要稳定名称和 workspace 解析，不能依赖脆弱的相对 `file:` 安装。
3. 桌面与移动可以使用不同 React、构建工具和原生依赖版本。
4. 共享代码必须是两端语义真正一致的部分，不能共享平台生命周期或 UI 偶合。
5. Metro/EAS、Vite/Tauri 和测试工具必须能在同一依赖图下工作。
6. 仓库级脚本、格式化、Git hooks 和代码生成应有单一入口。

## 考虑过的方案

| 方案 | 优点 | 主要问题 |
|---|---|---|
| 保持三个独立 npm 项目 | 安装边界简单 | lockfile、工具链和内部版本漂移，跨端改动难以原子验证 |
| 将共享代码复制到两端 | 平台不受 workspace 约束 | 语义和 bug 修复持续分叉 |
| 发布私有 npm 包 | 消费方式稳定 | 本地开发与原子提交变慢，需要版本发布流程 |
| 共享全部 Store、UI 和 Reader 实现 | 表面复用率高 | 平台能力不同，抽象被迫取最低公分母，依赖方向混乱 |
| pnpm workspace + 有限共享包 | 原子演进、稳定包名、允许平台差异 | 需要维护 Metro hoisting、包导出和跨包验证规则 |

## 决策

### 仓库与依赖管理

- 根目录使用 pnpm workspaces 管理桌面、移动和 `packages/*`。
- 内部依赖使用 `workspace:*`，由同一 `pnpm-lock.yaml` 锁定。
- 根目录拥有共享脚本、格式化配置、Git hooks 和生成入口。
- 为兼容 Metro，当前使用 hoisted node linker；改变该策略前必须验证 Expo/EAS 和原生依赖解析。
- 桌面和移动可以各自声明 React、测试运行时和平台依赖，不要求统一版本。

### 共享代码准入原则

只有满足以下条件的代码才进入 `packages/*`：

1. 两个平台具有相同业务语义；
2. 不依赖 React DOM、React Native、Tauri、Expo 或原生生命周期；
3. API 可以独立测试，或是权威输入生成的平台产物；
4. 共享能减少语义漂移，而不是只减少几行重复代码。

适合共享的内容包括：

- 纯领域类型和算法；
- Reader Locator、目录、书签、批注排序等跨端语义；
- 数据库 schema 与 migration 源；
- 字体目录、许可元数据和生成流程；
- 从单一源生成 Swift、Kotlin、Rust 或 TypeScript 适配代码的输入。

不应共享的内容包括：

- Zustand Store 或 React Query cache 的完整实现；
- 桌面 DOM 与移动原生 Reader Surface；
- 平台 UI 组件、导航、手势和生命周期；
- 只因文件名相似但行为不同的数据源或下载编排。

### 包所有权

- `@my-reader/tools`：纯领域类型、Reader 产品语义和跨端算法。
- `@my-reader/db`：MyReader/Calibre schema、类型和 Drizzle migration 输入；具体规则见
  [ADR-0008](./0008-shared-database-schema-authority.md)。
- `@my-reader/fonts`：跨端字体目录、字体资产准备和许可信息。
- 桌面与移动应用包：平台适配、UI、存储运行时、Reader Surface 和产品编排。

共享包不得通过反向依赖调用任一应用。需要平台能力时，由应用从上层注入，或在各平台保留
独立 adapter。

### 生成物

共享包可以作为多端代码生成的权威输入。生成的 Swift、Kotlin、Rust 或 TypeScript 文件留在
各自消费包，并通过检查脚本防止过期；不得在多个生成输出中手工同步同一算法。

## 历史落地

| 日期 | 提交 | 历史动作 |
|---|---|---|
| 2026-05-17 | `172e9033` | 创建 pnpm workspace、根 lockfile 和 hoisted Metro 安装策略 |
| 2026-05-17 | `172e9033` | `my-reader-tools` 迁移为 `packages/tools` 和 `@my-reader/tools` |
| 2026-05-17 | `ae8c5019` | 删除未形成真实跨端复用的 Reader Core、Foliate 和旧类型 |
| 2026-05-18 | `4564accc` | 新增 `@my-reader/db`，schema 开始跨端共享 |
| 2026-05-27 | `ac78e85e` | 删除强迫两端同形的共享 Store 接口，只保留纯领域类型 |
| 2026-06-28 | `91ca8e95` | 格式化和仓库工具配置收敛到根目录 |
| 2026-07-08 | `73bc0f1e` | 增加 `@my-reader/fonts`，共享字体目录而保留平台适配 |

## 结果

### 正面结果

- 跨端 schema、类型和算法可以在同一个提交中修改和验证。
- 桌面和移动保留各自适合的平台实现，不再追求伪共享 Store 或渲染内核。
- 依赖版本、代码生成和仓库工具有统一入口。
- 新共享包具有明确准入条件，减少应用层反向依赖。
- 共享语义发生变化时，两端消费者更容易被编译和测试同时约束。

### 代价和风险

- Metro、EAS 和原生包对 workspace/hoisting 的支持需要持续验证。
- 根 lockfile 的依赖更新可能影响多个包，必须按受影响包运行完整测试。
- 共享包如果吸收平台行为，会重新制造最低公分母抽象。
- 生成输入和生成输出跨包分布，需要稳定的检查脚本和提交纪律。
- 桌面与移动不同 React 版本要求避免错误的 peer dependency 提升。

## 长期约束

1. 内部包使用 workspace 依赖并由根 lockfile 管理，不恢复独立 `file:` 安装。
2. 共享包只承载真正一致的领域语义、schema、资产目录或生成源。
3. 平台 UI、Reader Surface、Store 和生命周期默认留在应用包。
4. `packages/*` 不得依赖桌面或移动应用目录。
5. 跨包修改必须运行每个受影响包的完整验证套件。
6. 生成算法只修改权威源，平台生成文件不得手工分叉。
7. 改变 node linker、workspace 布局或内部包边界前必须验证 Metro/EAS 和 Tauri 构建。

## 取代本决策

如果未来拆分为多个仓库、发布独立 SDK，或统一为单一平台运行时，必须新增 ADR，说明内部包
版本、生成物、跨端契约和历史提交如何迁移。
