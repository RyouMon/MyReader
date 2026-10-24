# ADR-0024: 在 Rust Core 中编排书籍人物朗读

- 状态：Accepted
- 日期：2026-10-24
- 关联：[Issue #107](https://github.com/RyouMon/MyReader/issues/107)
- 基线：`ae605c76`（v0.19.0）

## 问题

人物朗读需要按书保存人物身份、别名、音色和固定指令，并利用有限的正文窗口识别说话人。
阅读期间需要恢复历史会话、压缩上下文和处理回读；人物不能随着模型摘要而改名或丢失。
桌面采用 Tauri，移动采用 Expo/React Native，共用 Rust Core 和 SQLite。

## 两种方案的试验

| 项目 | Pi durable 1.4.0 | Rust Core |
| --- | --- | --- |
| 实际试验 | Node SQLite、浏览器 IndexedDB、真实工具循环 | Core SQLite、真实 HTTP 传输、类型化服务 |
| 搜索与读取 | 模型工具调用驱动搜索、读取 | 固定的百科搜索、读取、结构化提取流程 |
| 会话恢复 | Harness 关闭、重开后恢复 conversation | 按书籍和正文版本恢复 session、entries、checkpoint |
| 压缩 | 调用 Harness compaction，人物存放在独立 Chord document | 按预算自动摘要，人物存放在独立书籍配置 |
| 平台代价 | 增加 JS 持久化适配和移动运行时验证 | 复用 Core 数据库、HTTP、Tauri/UniFFI 边界 |
| 原生兼容证据 | 浏览器成功；转换后的包可编译为 Hermes 字节码 | 在现有原生构建和测试链路中验证 |

Pi 不是只能在 Node 中运行。其 AI 层支持浏览器；`pi-agent-core` 提供 agent loop，
`pi-durable` 提供持久会话与 compaction，完整 coding-agent SDK 则包含额外的宿主能力。
试验没有将完整 CLI 嵌入阅读器。

Pi Node 试验成功执行搜索和读取，保留 10 条历史记录；压缩前后上下文序列化长度从
4,886 减少到 1,584 个 JavaScript 字符，重开后保持 1,584，重复 request ID 未重新执行。
浏览器 IndexedDB 试验对应为 4,819 → 1,586，试验包约 438 KiB（minified，未压缩）。
这些数字只描述 fixture，不代表正式应用体积、真实模型速度、成本或人物识别准确率。
Hermes 字节码编译也不等于 React Native 设备运行成功。

Core 试验覆盖：HTTP 搜索与来源约束、34 次连续分析及自动压缩、数据库关闭重开、缓存重放、
人物身份与音色独立修改、回读时排除未来文本、停止或修改配置后拒绝过期提交、Unicode 原文还原。
两种试验均使用固定模型响应，不读取用户密钥，不计费。

## 决定

采用 Rust Core 的有限流程和直接 LLM API 调用。当前只有百科导入、说话人分析和上下文压缩
三类明确任务，不需要通用 agent 的自主工具循环。Pi 能完成会话机制，但需要额外持久化与
移动运行时集成；它没有减少当前最重要的原文、身份、位置和取消约束。

保留 [Pi 试验](../../scripts/experiments/issue-107-pi/README.md) 供复现。
生产包不引入 Pi、Node sidecar 或额外后端。

## 产品与平台边界

- 全局设置管理 LLM 供应商：名称、协议、API 地址、密钥、模型；允许手工输入模型。
  连接测试和模型列表获取独立于保存。支持 Chat Completions 和 Responses 的结构化输出。
- 阅读器的 TTS 设置只显示本书人物朗读开关；开启后出现人物、添加和百科导入入口。
  开启时确认正文会发给所选 LLM；阅读器不提供 LLM 供应商配置表单。
- 人物和旁白分别先选 TTS 供应商，再选音色；可共用音色并使用不同固定指令。
  每段情绪指令由阅读计划补充。系统语音使用平台 API，不声称支持自然语言音色指令。
- 百科导入先搜索对应语言的 Wikipedia，读取最多三个候选页面，优先截取人物段落；
  LLM 提取人物介绍和别名，并且只能引用实际读取的来源。用户选择后导入，不覆盖已有人工设置。
  首版没有通用搜索引擎、登录网页或任意 URL 抓取能力；找不到时仍可手动录入。
- 密钥留在 keyring/SecureStore；Core 只保存 credential reference，请求时临时接收凭据。
- Core 保存人物、历史、摘要和分析计划，平台负责 Locator、UI、原生语音和音频播放。
  人物设置与分析历史目前保存于本设备书库 SQLite，不加入 Automerge 同步协议。

## 数据与会话约束

`book_narration` 保存独立配置：人物稳定 ID、姓名、别名、身份、来源、音色引用、固定指令。
`revision` 防止旧表单覆盖新值，`identity_revision` 区分身份变更与声音变更。
LLM 输出无权直接改写这份配置。

`narration_sessions` 按书籍 ID 和正文版本隔离。`narration_entries` 记录输入窗口与有效计划，
`narration_checkpoints` 记录压缩摘要的书中位置、历史序号和身份版本。
重新打开书籍时恢复同一会话；每次 API 请求携带恢复后的消息，并非每次无历史地提问。

输入最多 12,000 UTF-8 字节正文、前后各 4,000 字节；平台当前各提供最多 900 个上下文字符。
完整电子书不发送给模型。预算采用 UTF-8 字节数作保守上界，预留输出与 schema 空间；
接近预算或积累 32 段时压缩较早历史，并保留最近两段原始对话。摘要不能替代权威人物列表。
超预算或分析失败时退回旁白，该失败不写入计划缓存。

回读只使用目标之前的历史及摘要；摘要边界同时记录位置与序号，避免新回读记录遮蔽尚未压缩
的后续章节。书籍正文版本或身份修改隔离旧结果。每本书串行分析；设置变更增加 epoch，
提交时再次验证 epoch 和身份版本。平台停止、跳转和销毁会取消请求，并丢弃迟到的播放结果。

模型返回连续原文片段，不返回可信数值偏移。Core 验证每个字符和空白恰好覆盖一次，随后计算
UTF-16 范围；未知人物归旁白。平台不修改 Readium 原文或 Locator。一句可包含多个角色片段，
只有最后一个片段结束才通知 Readium 推进。角色模式先处理当前句，避免现有按文本索引的
预取缓存把同文异处的台词误认为同一人物；普通朗读的预取保留。

人物分析缓存包含正文版本、输入窗口、来源位置、人物身份版本和 LLM 配置版本；声音变化
复用有效分析。音频缓存额外包含供应商、音色和最终朗读指令，避免相同台词使用错误声音。

## 验收与限制

必须验证关闭后不调用 LLM、不同书隔离、人工修改优先、来源不可伪造、会话重开与自动压缩、
回读不带入未来信息、原文 Unicode 完整性、跨供应商连续播放、暂停/取消和旧结果隔离。
UI 验证入口位置、开启后展示、供应商切换清空旧音色，以及保存不依赖连接测试成功。

机制试验无法证明实际模型的人物识别质量。真实供应商、长篇含糊对话和各平台系统音色需要
在部署前用实际书籍与模型验证；供应商是否遵循音色指令也由其模型能力决定。

## 参考

- [Pi agent core](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)
- [Pi durable](https://github.com/earendil-works/pi/blob/main/packages/durable/README.md)
- [Pi browser usage](https://github.com/earendil-works/pi/blob/main/packages/ai/README.md#browser-usage)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [MediaWiki search API](https://www.mediawiki.org/wiki/API:Search)
- [MediaWiki revisions API](https://www.mediawiki.org/wiki/API:Revisions)
