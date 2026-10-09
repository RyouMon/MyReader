# 质量工程与验证入口

本文是测试策略、QA 命令和债务管理的维护入口。包的 `package.json`、各工具配置和
`.github/workflows/quality.yml` 是执行权威；Agent 规则只负责引导，不另存一套配置示例。

Quality 在 PR 和手动执行时运行，普通推送不触发。两种入口均运行静态门禁、完整单测、
变异测试、联网依赖审计，以及 JS / Rust 覆盖率报告。

主分支要求 `QA` 和 `Unit tests` 两个聚合检查成功；所依赖的任务失败、取消或意外跳过均不会
放行。`QA` 汇总静态检查、变异测试、Rust 门禁和安全审计，`Unit tests` 汇总五包 JS 与
Cargo workspace 完整单测及覆盖率任务的执行结果。覆盖率任务独立运行、上传报告，CI 不设
覆盖率百分比门槛；其中的测试、编译、采集或报告上传失败仍会阻止合入。
通过后仍需人工审核合入。

## 日常命令

从仓库根目录执行；使用 `packageManager` 指定的 pnpm 和 `pnpm install --frozen-lockfile`。

| 命令 | 用途 | 定位 |
|---|---|---|
| `pnpm qa` | Lint、五个 JS 包类型检查、依赖边界、未使用代码、重复率、文档、生成漂移、QA 脚本测试 | PR 静态门禁 |
| `pnpm qa:docs` | markdownlint 格式与 Lychee 本地链接、图片引用、标题锚点 | 离线门禁；需安装 Lychee |
| `pnpm test:unit` | 五个 JS 包的完整单元测试及 QA 脚本测试 | 回归门禁 |
| `pnpm qa:coverage` | 五包完整测试及显式源码范围的 Vitest/Jest 覆盖率 | 基线报告，非合入硬指标 |
| `pnpm qa:mutation` | 共享路径、进度、计时、TTS 状态与语言逻辑的 Stryker 变异测试 | 测试有效性门禁 |
| `pnpm qa:rust` | rustfmt、Clippy、Cargo workspace 完整测试 | Rust 门禁 |
| `pnpm qa:rust:complexity` | Rust 认知复杂度检查 | 超限返回非零；同时纳入 Rust 门禁 |
| `pnpm qa:rust:coverage` | Core 与移动 FFI 的 cargo-llvm-cov LCOV | PR 报告；需工具及 llvm-tools-preview |
| `pnpm qa:unused` | Knip 扫描未使用文件、依赖、导出与未解析引用 | PR 门禁；新增发现需核实用途 |
| `pnpm lint:report` | 输出原始 ESLint JSON | 有发现时返回非零 |
| `pnpm qa:security` | npm 生产依赖漏洞审计 | PR 门禁；中危及以上返回非零 |
| `pnpm qa:rust:security` | Cargo 锁文件通告与撤包状态审计 | PR 门禁；需 cargo-audit 和联网 |
| `pnpm qa:workflows` | actionlint 校验 Actions 语法、表达式与 action 输入 | 需安装 actionlint；CI 使用官方固定版本镜像 |
| `pnpm format:check` | Biome 全仓格式检查 | PR 检查改动文件；历史差异单独治理 |

PR 的 Biome 格式门禁使用 `pnpm exec biome format --changed --since=origin/main --no-errors-on-unmatched`
（工作流按实际目标分支替换 `main`），检查本次改动的受支持文件。Rust 格式由 rustfmt 检查，
Markdown 格式由 markdownlint 检查；不通过重写全仓格式或扩大排除范围处理历史差异。

`reports/` 和包内 `coverage/` 是忽略的本地报告。GitHub Actions 上传报告制品，不上传源码到
SonarCloud、Codecov 或 Stryker Dashboard。Knip 报告不能直接用作删除原生模块、动态路由、
生成绑定或对外契约的依据；隐藏 UI 控件也不意味着后端能力可以删除。

Knip 的入口包含 Expo 路由、原生模块和字体准备脚本；动态加载的字体资源、原生构建 CLI
在配置中说明保留原因。模块内部仍在使用的导出、共享 UI/CSS 适配器接口和明确的语义别名
不作为死代码删除。单纯去掉 `export` 不代表性能或安全提升；确认无人使用的实现应连同
失去用途的导入一起移除，再经过类型检查、全包测试及适用的平台构建。

文档门禁与 `pnpm test:qa` 使用真实的 Lychee CLI。当前验证版本为 **0.24.2**；macOS 可用
`brew install lychee`，其他平台使用 [官方安装方式](https://lychee.cli.rs/guides/getting-started/)
安装同一版本。CI 固定该版本并校验发布二进制的 SHA-256。工具缺失、配置错误或扫描失败都会
返回非零，不会静默跳过；升级版本时应重新运行 `pnpm test:qa` 和 `pnpm qa:docs`。

## 每个指标回答什么

| 检查 | 能回答的问题 | 不能证明的事情 |
|---|---|---|
| ESLint / Clippy | 是否触犯明确的语言、Hooks 和代码规范 | 业务结果必然正确 |
| TypeScript / Rust 类型检查 | 调用、数据形状和类型是否一致 | 数据来自网络时一定有效 |
| 覆盖率 | 哪些语句、分支、函数和行执行过 | 断言足够强；执行过不等于测对了 |
| 圈复杂度 | 单个函数有多少独立控制流路径 | 代码是否易懂；可选链也会增加计数 |
| 认知复杂度 | 嵌套、分支等控制流给阅读增加多少负担 | 算法运行速度或产品质量总分 |
| jscpd | 是否存在足够长的重复 token 片段 | 两段跨语言代码的业务语义一定相同 |
| dependency-cruiser | 导入是否越过边界、出现运行时循环或解析失败 | Rust 内部语义分层、运行时调用图正确 |
| Knip | 是否存在静态不可达文件、导出、依赖 | 动态加载、FFI 或插件注册一定不需要它 |
| Stryker | 故意改坏比较符、返回值等之后，测试能否失败 | 所有现实故障都已覆盖 |
| 生成漂移 / 文档校验 | 提交的派生文件和链接是否仍可复现 | 文档描述的功能已经在设备上验证 |
| actionlint | 工作流语法、表达式、action 参数是否合法 | 托管 runner 上的实际构建已成功 |

例如，覆盖率 100% 的 `return price > 0`，如果测试只断言返回值存在，变成 `price >= 0`
后仍可能通过。变异测试会暴露这种断言缺口。等价变异需人工解释，不能为了提高分数机械地
添加断言或屏蔽整个文件。

## 基线与新增问题

- ESLint 历史问题已清零，不保留 `eslint-suppressions.json`；所有启用规则直接以 `error`
  阻断新增问题。`pnpm lint:report` 输出未经豁免的原始结果，不能通过重建基线接受超限。
- 覆盖率基线来自全包实测，四项指标保留原有参考值；未运行文件也计入。独立覆盖率命令
  未达参考值仍返回非零以便发现回退。CI 通过 Vitest CLI 将四项数值门槛设为零、Jest CLI
  使用空 `coverageThreshold`，只取消数值阻断，保留测试失败的退出码并要求报告存在。
  既有桌面 70/65/60/70 目标并未达到，仍作为后续提升方向，不能把基线通过宣称为该目标达标。
- 重复扫描阈值、最小片段和排除项见 `.jscpd.json`。生成绑定、实体、翻译表、第三方 UI
  模板与独立测试文件不进入产品重复率。Rust 内联测试仍随源文件参与扫描。
- 圈复杂度阈值 22，TS 认知复杂度 16；Rust 认知复杂度阈值 27。
  项目选择在原阈值 20/15/25 上最多提高 10%，整数阈值向下取整，实际增幅分别为
  10%/6.7%/8%，容纳合理的分支密度，避免机械拆分；这不是已被评测证明的 AI 能力增幅。
  [相关研究](https://arxiv.org/abs/2602.07882) 未给出可通用换算的阈值比例。
  超限整改应分离职责、降低嵌套并保留行为测试，不继续提高阈值以消除剩余发现。
- Rust 使用 Clippy 官方 `cognitive_complexity`，在本地与 CI 显式设为 `deny`。
  [Clippy 的说明](https://rust-lang.github.io/rust-clippy/rust-1.95.0/index.html#cognitive_complexity)
  明确指出它不能准确衡量理解难度；其计数方式也不同于 SonarJS。这里将其作为项目的函数拆分
  信号，不将分数解释为人的认知负担，也不跨语言比较分数。

覆盖率分母采用配置中的 authored source：排除声明、测试、生成文件、第三方 UI 模板；移动端
另外排除 Expo Router 路由装配，i18n 排除翻译 JSON 与入口 re-export。没有被测试导入的范围内
源码仍计入分母。i18n 的翻译完整性另有单元测试，100% 覆盖率不表示翻译质量已经验证。
Rust LCOV 当前覆盖 Core/FFI 两个 crate，没有为尚未测量的 Tauri 原生 UI 设置覆盖率门槛。
actionlint 当前仅校验工作流本身，显式关闭其可选 ShellCheck / Pyflakes 集成，以保持本地与 CI 范围一致。
无补丁的已接受风险按通告编号配置在 `pnpm-workspace.yaml` 的 `audit.ignore` 和
`.cargo/audit.toml`，本地与 CI 使用相同配置；升级依赖时复核并移除已解决的豁免。
其他漏洞继续按原严重度门槛阻断，扫描失败和网络错误仍返回非零。
若 registry 撤包查询超时，可在已刷新漏洞库后使用 `cargo audit --no-fetch --no-yanked` 单独检查
已知漏洞，并明确记录没有检查撤包状态，不能将其称为完整的联网安全检查。

dependency-cruiser 使用独立的 `scripts/quality/tsconfig.mobile.json` 适配 Expo 的路径解析；
它继承应用配置，只为分析器提供 baseUrl，不改变移动应用的编译配置。

## 按风险选择验证

- 桌面 React：完整 `pnpm test:desktop`；交互流程使用现有 Playwright + IPC mock。
  这不验证 Tauri 原生窗口、系统对话框或原生权限；macOS 需另行启动实际应用，通过调试构建的
  Tauri MCP Bridge 或原生界面完成验证。
- 移动 React Native：完整 `pnpm test:mobile`；原生模块用模拟器验证。测试放在路由目录之外。
  [Maestro runbook](../my-reader-mobile/e2e/README.md) 维护 fixture、选择器、平台差异和已知限制。
- Rust / FFI：`cargo test --locked --workspace`。Swift/Kotlin 改动还需原生单元测试及消费端编译；
  详见 [开发指南](./DEVELOPMENT.md) 和 [Readium 模块](../my-reader-mobile/modules/readium/README.md)。
- 数据库、Automerge、文件路径与校验、TTS 终态/取消属于高价值测试对象。先确定行为或合同，
  再决定测试层；不为每个组件强制建测试，不固定容易调整的像素或 utility class。
- 改动包必须运行完整单元套件。聚焦测试可用于开发，不能替代最终全包回归。

当前变异集合只覆盖配置中指定的共享 TS 模块（实际列表见
[`packages/tools/stryker.config.json`](../packages/tools/stryker.config.json)），不代表全部 UI、Rust、
Swift/Kotlin 都经过变异测试。原生 E2E、跨设备收敛和性能评测也不能由 JS 单元测试替代。

## 文档与 Agent 信息分工

- README：项目介绍和开始使用；DEVELOPMENT：环境与实际操作；ARCHITECTURE：当前所有权。
- ADR：历史背景、决策和替代关系。保留历史正文；旧源文件链接不能被理解为当前模块位置。
- AGENTS：短小、跨工具的项目约束；`.agents/rules/`：按路径加载的项目差异。
- SKILL：按任务加载的工作流；导入技能保留来源，本地技能引用当前项目文档。
- `.claude` 用符号链接复用共享内容；`.cursor` 的入口只链接权威文件。
- Markdown 格式由 markdownlint-cli2 检查；本地引用、图片目标和标题锚点由 Lychee 检查。
  配置位于 `.lychee.toml`；`scripts/quality/docs.mjs` 只选择输入、调用 CLI 和传递失败退出码，
  不再自行解析文档或判定链接。
- 编号 ADR 沿用历史源码引用不阻断的边界，由 `scripts/quality/lychee-adr.toml` 配置实现；
  文档间链接和标题锚点仍检查。上游技能教程的示例路径不当成仓库真实文件。
- `offline = true` 阻止网络请求，外部网址可用性不属于这个门禁。
- 暂不扫描技能元数据、跨文件重名或技能锁文件与安装目录的一致性。

## 官方依据

- [圈复杂度定义](https://eslint.org/docs/latest/rules/complexity)
- [Vitest 覆盖率范围](https://vitest.dev/guide/coverage.html)
- [Stryker Vitest runner](https://stryker-mutator.io/docs/stryker-js/vitest-runner/)
- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
- [jscpd](https://github.com/kucherenko/jscpd)
- [Knip monorepo 配置](https://knip.dev/features/monorepos-and-workspaces)
- [actionlint 官方用法](https://github.com/rhysd/actionlint/blob/main/docs/usage.md)
- [markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2)
- [Lychee CLI：离线、锚点与配置](https://lychee.cli.rs/guides/cli/)
- [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Codex skills](https://learn.chatgpt.com/docs/build-skills)
