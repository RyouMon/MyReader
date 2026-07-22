# ADR-0009：在 MyReader 仓库维护移动端 Readium 集成层

- 状态：已接受
- 决策日期：2026-06-18
- 记录日期：2026-07-22
- 记录方式：根据 Git 历史回溯补录
- 上层决策：[ADR-0004](./0004-adopt-readium-reader-architecture.md)
- 取代：`@ryoumon/react-native-readium` 私有 fork、Git submodule 和 Nitro Modules bridge

## 说明

这项决策在实施时没有单独的 ADR。本文根据 2026-05-09 至 2026-06-18 的提交、当时新增和
删除的依赖、submodule、patch、构建脚本，以及现存 `@my-reader/readium` 模块补录。

下文将直接可验证的迁移记录标记为**历史事实**；根据提交顺序和被替换结构归纳出的动机标记为
**回溯推断**。

## 背景

[ADR-0004](./0004-adopt-readium-reader-architecture.md) 决定使用 Readium 的 Publication、
Navigator 和 Locator 取代自研 Reader V2。移动端还需要一个 React Native 与 Readium
Swift/Kotlin Toolkit 之间的原生集成层。

采用 Readium 并不等于这个集成层已经解决。Readium Toolkit 提供原生出版物与 Navigator，
但 MyReader 仍需要：

- React Native View、props、events 和 imperative ref。
- iOS ViewController 与 Android Fragment 生命周期托管。
- 文件 URL、Publication、Locator 和偏好类型转换。
- EPUB、PDF、CBZ 的统一产品入口。
- 原生点击、选择、Decoration、搜索和 TTS 等能力的桥接。
- Expo autolinking、Pod、Gradle、Fabric 和测试环境集成。

## 历史演进

### 阶段一：采用社区包

2026-05-07，移动 EPUB 首次通过 `react-native-readium` 接入原生 Readium。社区包提供了可以
快速落地的 Reader View 和 Nitro Modules bridge，但当时主要覆盖 EPUB/PDF 的既有接口。

### 阶段二：使用自有 fork 补充功能

2026-05-09，提交 `3e9dae37` 将依赖切换为 `@ryoumon/react-native-readium`。这个 fork 在
上游实现之上增加 Divina/CBZ 支持，使移动 CBZ 可以删除手写的 `FlatList + zip extract`
阅读器、归档缓存和页面 URI 生命周期。

此后 fork 继续承载 MyReader 所需的原生变化：

- `f4769f52`：修正 Nitro Modules 与 Readium Android ABI 选择不一致。
- `e2584139`：patch NDK 27 下 Nitro 生成 C++ 的继承/构造问题。
- `4787d2a6`：从原生 Navigator 暴露 `onTap`，解决 React Native 手势无法穿过 Navigator。
- `f75c801c`：通过 `fontFamilyDeclarations` 注入 CJK 字体并处理 ReadiumCSS 规则。

这些提交证明 fork 已不只是临时补丁，而是在承担移动 Reader 产品所需的原生集成职责。

### 阶段三：把 fork 作为 submodule 本地维护

2026-06-12，提交 `a468683a` 把 `RyouMon/react-native-readium` 加入
`packages/react-native-readium` submodule，并将应用依赖改为本地 `link:`。

为了让 submodule 在本地、pnpm 和 EAS 中工作，仓库同时增加：

- `.gitmodules`。
- EAS 构建前的 `git submodule update --init --recursive`。
- `prepare-react-native-readium.mjs` 类型构建和 symlink 逻辑。
- 单独的 TypeScript build 配置。
- Jest 对 submodule 源码的路径映射。

这个阶段解决了“如何即时修改 fork”，但没有解决扩展边界和构建复杂度。

### 阶段四：移入应用仓库并重写 bridge

2026-06-18，提交 `684b9752` 删除 submodule、Nitro 依赖、prepare 脚本和 patch，新增仓库内的
`my-reader-mobile/modules/readium` Expo Module，并把包名改为 `@my-reader/readium`。

该提交保留并移植 fork 中已经工作的 EPUB/PDF/CBZ Reader Controller、Fragment、转换器和
工具代码，重写 React Native bridge，并明确保留来源、NOTICE 与许可证。它包含约 6,623 行
新增代码，说明这是对集成层所有权的正式迁移，而不是一次依赖版本升级。

## 原 fork 的结构性限制

以下限制由 `684b9752` 的提交说明和初版模块 README 直接记录：

- 原生层硬编码 `DefaultPublicationParser`。
- 没有 `onCreatePublication` 扩展点。
- 无法注册自定义 `PublicationParser`。
- JS 无法持有或调用原生 `Publication`。
- Publication services、搜索和 TTS 能力没有稳定 bridge。
- Nitro bridge 把扩展点封闭在生成的原生接口中。

这直接阻塞了当时规划的 MOBI/AZW3 自定义格式和与文件路径无关的 TTS 基础。

## 决策驱动因素

### 1. 集成层已经成为长期产品基础设施（历史事实）

CBZ、原生点击、字体、Fabric 生命周期和多格式进度都要求修改原生 bridge。等待第三方包发布
或长期维护 patch-package 已经不能满足迭代节奏。

### 2. fork 的公开抽象不足（历史事实）

问题不是缺少某一个 prop，而是 Publication、Streamer 和服务扩展点没有暴露。继续逐项给
fork 加私有接口，会让公共 TS API 和原生实现越来越依赖临时补丁。

### 3. Nitro 生成层增加了修改与构建成本（回溯推断）

ABI、NDK 27 和生成 C++ 的修复表明，Nitro 在本项目里形成了额外兼容面。增加一个原生能力
往往同时涉及 spec、生成绑定、C++、Swift/Kotlin 和 React Native 架构版本。

MyReader 已经采用 Expo，因此使用 Expo Modules API 可以减少一层桥接技术栈，并直接使用
Expo autolinking、`ExpoView`、`Prop`、`Events` 和 `AsyncFunction`。

### 4. submodule 只解决源码可达性，没有解决所有权边界（回溯推断）

submodule 让 fork 可以独立开发，但引入初始化、EAS、pnpm link、类型构建和提交指针同步。
当 bridge 已确定由 MyReader 长期维护，并需要与应用同步修改时，独立仓库边界带来的发布和
复用收益小于协调成本。

### 5. 需要区分 Toolkit、集成层和产品层

自行维护集成层不代表 fork Readium Toolkit 本身，也不代表把所有 MyReader 业务写入原生
模块。需要固定三层所有权：

```text
MyReader React Native 产品层
  ├─ 阅读流程、状态、数据库、同步、UI、字体目录和产品策略
  ↓ typed props / events / async API
MyReader 移动 Readium 集成层（@my-reader/readium）
  ├─ Expo Module、Navigator host、类型转换、原生系统交互
  ↓ Readium Toolkit public APIs
Readium Swift/Kotlin Toolkit
  └─ Publication、Streamer、Navigator、Locator、Decoration 与服务机制
```

## 决策

MyReader 在主仓库中维护移动端 Readium 集成层 `@my-reader/readium`，实现位于
`my-reader-mobile/modules/readium`，不再依赖 `@ryoumon/react-native-readium` 发布包、fork
submodule 或 Nitro Modules bridge。

### 1. 集成方式

- 使用 Expo Modules API 实现 iOS/Android 原生模块和原生 View。
- 通过 Expo autolinking 接入，不增加独立 submodule 初始化步骤。
- 应用使用 workspace `link:./modules/readium` 直接消费模块源码。
- iOS 通过 pod 依赖 Readium Swift Toolkit；Android 通过 Maven 依赖 Readium Kotlin Toolkit。
- 模块只支持 iOS 和 Android，不承担 Web/桌面 Readium 集成。

### 2. 保留 Reader 行为，重写 bridge

- 从原 fork 移植已经验证的 Reader Controller、Fragment、转换器和工具代码。
- 用 Expo Module 的 View、Prop、Events、AsyncFunction 重写 Nitro bridge。
- 迁移时保持 `ReadiumView` 的主要 TS contract 和 EPUB/PDF/CBZ 用户行为兼容。
- 通过 NOTICE 和第三方许可证记录移植来源，不抹去 fork 与 Readium Toolkit 的版权归属。

### 3. 开放 Publication 和 Streamer 扩展点

- 原生维护 Publication handle table，JS 只持有稳定 `publicationId`。
- 暴露 Publication metadata、TOC、reading order、positions 和内容服务。
- Streamer 支持 parser registry 与 `onCreatePublication` 类型的创建扩展。
- 自定义格式通过能力注册接入，不修改硬编码的默认 parser 分支。
- Search、TTS、Selection 和 Decoration 通过明确服务/API 演进，不继续堆叠 View props。

### 4. 明确模块边界

`@my-reader/readium` 可以拥有：

- Navigator host 和原生 View 生命周期。
- Readium 类型与 React Native 类型之间的转换。
- 原生 Selection、Decoration、系统菜单、手势和无障碍集成。
- Publication/Streamer/Search 等 Toolkit 能力的 bridge。
- Toolkit 依赖配置、平台补丁和格式适配。

产品层继续拥有：

- 阅读进度、书签、批注、笔记和阅读统计数据库。
- 同步、冲突合并和迁移。
- 阅读器 chrome、路由、设置界面和产品工作流。
- 字体资产、字体目录、主题和用户偏好策略。
- 文案、业务权限、数据源和书库生命周期。

模块不把 MyReader 的数据库表、store、业务实体或产品资产目录固化为 Readium Toolkit 的一部分。

### 5. 不 fork Readium Toolkit 作为默认策略

集成层优先使用 Readium Swift/Kotlin Toolkit 的公开 API 和扩展机制。只有上游确实没有能力、
且无法在应用适配层完成时，才维护最小平台补丁；不得把 MyReader 产品逻辑写入 Toolkit 私有
实现形成不可升级依赖。

## 考虑过的方案

### 方案 A：继续使用发布到 npm 的私有 fork

优点：

- 包边界清晰，可以独立版本和复用。
- 应用仓库保持较小。

放弃原因：

- 每次原生功能都要修改、发布、升级再联调。
- 封闭的 Publication/Streamer 接口仍需大改。
- ABI、NDK 和 React Native 新架构兼容仍依赖 patch。
- fork 实际只服务 MyReader，独立发布收益有限。

### 方案 B：继续使用 Git submodule 本地链接 fork

优点：

- 保持独立仓库和提交历史。
- 应用可以直接联调未发布源码。

放弃原因：

- EAS、pnpm、Jest 和本地环境需要额外初始化与构建脚本。
- 主仓库与 submodule 指针容易不同步。
- 跨仓修改、审查和回滚被拆成两次提交。
- 仍然保留 Nitro bridge 和封闭扩展点。

### 方案 C：只向社区包或上游 Readium 提交功能

优点：

- 减少长期自维护代码。
- 能让通用能力回馈社区。

没有作为唯一方案，因为 MyReader 需要按产品节奏交付原生桥接、系统 UI 和应用生命周期能力，
其中一部分不属于通用 Toolkit。通用修复仍应尽量上游化，但不能把应用交付阻塞在上游发布。

### 方案 D：仓库内维护应用集成层，继续依赖上游 Toolkit

采用。它把变化频繁、与 React Native/Expo 和产品交互紧密的 bridge 放回应用仓库，同时保留
Readium Toolkit 作为通用出版物与 Navigator 基础。

## 结果

### 正面结果

- Reader bridge 与应用可以在一次提交中原子演进。
- 删除 submodule 初始化、独立类型构建、Nitro 依赖和多个 patch。
- Publication、parser、search、TTS、selection 和 decoration 获得可扩展 API 边界。
- iOS/Android 原生实现可以直接适配 Fabric、系统菜单、手势和无障碍。
- 模块许可证和移植来源在仓库内可审计。

### 代价和风险

- MyReader 必须长期维护 Swift、Kotlin、TypeScript 和 Expo Module 集成代码。
- Readium Toolkit 升级不会自动完成，需分别验证 iOS、Android 和各格式。
- 模块不再天然具备独立发布和其他应用复用能力。
- 应用集成层容易吸收过多产品逻辑，需要持续维护层级边界。
- 原 fork 的新修复不能通过版本升级直接获得，需要人工审计和移植。

## 长期约束

1. `@my-reader/readium` 是 MyReader 拥有的移动原生集成层，不是应用数据库或业务状态层。
2. React Native 产品层与原生模块只通过公开、可测试的类型和方法交互。
3. 字体、主题、阅读记录和其他产品资产/策略由 MyReader 产品层持有；模块只提供注册和应用机制。
4. 原生 Publication 和 Navigator 等有状态对象通过稳定 handle 管理，不把不可序列化对象暴露给 JS。
5. 新能力优先扩展 Publication/Streamer/Search/TTS 等服务接口，不无限增加 Reader View props。
6. iOS 和 Android 行为变更必须分别验证 EPUB、PDF、CBZ 及 Locator 恢复。
7. 移植第三方或上游代码时必须更新 NOTICE、许可证和来源说明。
8. Readium Toolkit 的通用修复优先贡献或跟随上游；MyReader 只长期拥有应用集成层。
9. 如果未来重新拆成独立包或 submodule，必须先证明存在多个消费者或独立发布价值，并新增
   取代本 ADR 的决策。

## 后续演进

本 ADR 接受的是“主仓库内维护移动 Readium 集成层”的所有权边界，不冻结 2026-06-18 的 API。
后续已经在同一模块中实现或扩展搜索、批注、Selection/Decoration、字体注册、viewport anchor
和其他 Reader 能力；这些变化只要遵守上述分层，就不需要重新讨论模块归属。
