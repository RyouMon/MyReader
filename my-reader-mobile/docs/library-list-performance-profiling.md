# Library List Performance Profiling

本文记录移动端书库列表性能分析的基准方案。实现必须优先基于官方 profiling 能力，项目内代码只做开关、日志整理和最小接入。

## App 内轻量观测

当前内置开关使用两类官方 API：

- React `<Profiler>`：包住 `LibraryScreen.FlashList`，通过 `onRender` 输出 `actualDuration`、`baseDuration`、`phase`、`commitTime`。
- FlashList callbacks：使用 `onLoad` 记录首批内容绘制耗时，使用 `onCommitLayoutEffect` 记录 FlashList layout commit，并通过 `renderItem.target` 统计渲染目标。

注意：React 官方说明 `<Profiler>` 在标准 production build 中默认禁用。EAS preview 如果走 production JS bundle，可能只能看到 FlashList callbacks；React render 细节需要 profiling build、Hermes sampling profiler 或平台 profiler。

设置入口：

- 开发构建：`__DEV__` 下显示。
- EAS preview：通过 `EXPO_PUBLIC_ENABLE_PERF_TOOLS=true` 显示。
- production：默认不显示。
- 卡片内部深度分段：默认关闭；需要定位 BookCard 内部成本时，额外设置 `EXPO_PUBLIC_ENABLE_LIBRARY_CARD_SEGMENT_PROFILER=true`。

打开后，在设备日志中搜索：

```text
[library-list-profiler]
```

采样前必须先通过书库页面门禁；reload JS、重新打开 dev client 或重新进入 app 后，不能沿用上一次的页面假设：

1. 先显式切到顶部 Tab 的“书库”，即使上一次采样停在书库页也要重新确认。
2. 用可访问性树或截图确认三个条件同时成立：`书库` Tab 选中、页面标题是“全部图书”、网格中有书籍封面。
3. 只在门禁通过后清空当前日志窗口并开始连续滚动；门禁前出现的 profiler 日志只可能用于启动/切页观察，不能作为书库滚动样本。
4. 如果停在“主页”、空状态或启动页，本轮样本作废，先回到第 1 步。

日志以聚合方式输出，滚动期间约每 2 秒一条 `summary`，包含：

- `react.renderCount`
- `react.phaseCounts`
- `react.actualDurationMs.avg/p90/p95/max`
- `react.baseDurationMs.avg/p90/p95/max`
- `react.slowRenderCount8Ms`：`actualDuration >= 8ms` 的 React render 次数，表示半帧级预警。
- `react.slowRenderCount12Ms`：`actualDuration >= 12ms` 的次数，表示接近 60fps 帧预算危险区。
- `react.slowRenderCount16Ms`：`actualDuration >= 16ms` 的次数，表示已经接近或超过 60fps 单帧预算。
- `react.maxActualDurationMs` / `react.maxActualDurationPhase`：当前 summary 窗口里最慢的一次 React render 及其 Profiler phase。
- `react.segmentSummary`：书库网格卡片内部的嵌套 Profiler 摘要，用于定位卡片内哪个子区域最重。格式如 `BookCard.total rc=40 p95=12 max=20 slow16=1; BookCard.cover rc=40 p95=3.5 max=4 slow16=0`，只在开发者 profiling 开关和 `EXPO_PUBLIC_ENABLE_LIBRARY_CARD_SEGMENT_PROFILER=true` 同时打开时存在。`BookCard.total` 表示整张卡片成本；其他 `BookCard.*` 字段表示卡片内子区域成本。
- `flashList.commitLayoutCount`
- `flashList.loadElapsedMs`
- `flashList.renderTargetCounts.Cell`：实际列表 Cell 渲染次数。
- `flashList.renderTargetCounts.Measurement`：FlashList 为测量尺寸触发的隐藏渲染次数。这个值高时，说明测量阶段也可能在支付完整书籍卡片的渲染成本。
- `flashList.renderTargetCounts.StickyHeader`：sticky header 渲染次数；当前书库列表通常不会出现。

## 2026-07-01 至 2026-07-03 阶段汇总

口径：

- 设备：iPad Pro 11-inch (M5) 模拟器，iOS 26.5，竖屏。
- App：development build，bundle id `ryoumon.myreadermobile`。
- 数据：446 本书，书库网格。
- 模拟器性能仅供参考，只用于同一环境下对比优化趋势；实际性能结论必须以真实设备上的 production/internal release 构建为准。
- 不同阶段的手势强度、冷/热缓存状态和录制窗口不完全一致。表格用于看趋势和热点迁移，不作为严格 benchmark。

图标口径：

- `↑`：比上一轮有效方案更好。
- `↓`：比上一轮有效方案更差。
- `→`：基本持平或收益不足。
- `≈`：指标混合、样本压力不同，不能直接判单向好坏。
- `∅`：没有同口径上一轮或没有采集。

表格只保留能指导下一步决策的指标：

- `React 峰值`：看滚动中 JS/React commit 是否会越过帧预算。
- `Base 成本`：看列表子树理论成本是否变轻。
- `列表提交`：看 FlashList commit 和 Cell render 压力，帮助解释为什么某轮数字不可直接横比。
- `Instruments 采样占比/热点`：只记录 sample share 和热点方向；Time Profiler sample weight 不写成“耗时 ms”。
- `综合评估`：给人读的阶段结论。

| 阶段 | 主要改动 | React 峰值 | Base 成本 | 列表提交 | Instruments 采样占比/热点 | 综合评估 |
| --- | --- | --- | --- | --- | --- | --- |
| S0 原始 iPad 基线 | 无；优化前状态 | `∅` slow16 37.8%，p95 峰值 70.00ms，max 79.22ms | `∅` max 140.53ms | `∅` 未记录 Cell renders | `∅` 未采集 | `∅` 明显卡顿；理论子树成本长期高于帧预算 |
| S1 热路径首轮 | 卡片改 RN primitives + StyleSheet；预计算 cell meta；加入 profiler | `↑` slow16 降到 26.0%，但 max 升到 113.45ms | `↑` max 降到 125.89ms | `∅` Cell 186，缺少 S0 对比 | `∅` 未采集 | `≈` 卡片成本开始下降，但仍有严重尖峰 |
| S2 同版本复测 | 无代码变化；确认 S1 是否稳定 | `↓` slow16 27.9%，max 112.41ms，仍不稳定 | `↓` max 升到 154.53ms | `↓` Cell 246，提交压力更高 | `↓` 最大 native 热点指向全尺寸封面 resize/解码 | `↓` 第一轮没有根治；确认下一刀应砍图片 resize |
| S3 缩略图缓存压力轮 | 新增 Expo cache 缩略图、sidecar DB manifest；滚动中只走快路径 | `≈` max 降到 94.08ms，但 slow16 升到 42.9% | `↑` max 降到 89.83ms | `↓` Cell 1207，样本压力显著更重 | `∅` 未重新采集；响应 S2 图片热点 | `↑` 方向正确：全尺寸 resize 移出滚动路径，但批量 Cell commit 仍重 |
| S4 缩略图复测 | 同版本，更短手势复测 | `↑` max 降到 89.68ms，slow16 38.7% | `↑` max 85.56ms | `↑` Cell 667，压力低于 S3 | `∅` 未重新采集 | `↑` 上限继续收敛，但仍明显超过 60fps 帧预算 |
| S5 落盘复测 | 同版本，保存 simulator log stream | `→` max 86.20ms，slow16 38.9% | `→` max 88.50ms | `→` Cell 621 | `∅` 未重新采集 | `→` 当前上限约 85-95ms；瓶颈转为批量 Cell commit |
| S6 冷缓存结构化 | 缩略图生成移到单例队列；滚动/失焦清 pending；fallback 样式缓存并 memo | `↑` slow16 降到 5.8%，max 37.45ms | `↑` max 78.66ms | `↑` Cell 335，提交压力下降 | `↑` Main/JS/Fabric 收敛；冷缓存热点转到后台 ImageManipulator/JPEG | `↑` 这一轮收益最明确：滚动路径变轻，后台生成成为主要剩余成本 |
| S7 冷缓存管线发布 | `Image.getSize` 快路径；可见优先 + 背景预热；生成完成批量 flush | `↓` slow16 12.5%，max 68.17ms | `↓` max 97.38ms | `↓` Cell 1445，样本压力显著更重 | `≈` ImageManipulator/JPEG 样本降到 149，但 `ShadowTree::commit` 仍高 | `≈` 缩略图吞吐更好，但 URI 发布仍让 FlashList 批量响应 |
| B0 结构瘦身前基线 | 新一轮基线；中速连续滚动 | `∅` p95 16.89ms，slow16 1.7% | `∅` p95 105.72ms | `∅` commits 55，Cell 165 | `∅` sample share：Main 69%，JS 28%；Hermes/Yoga/CoreAnimation/Fabric 是主热点，image resize/decode 很低 | `∅` 图片已不是主热点；主要问题变成 JS/布局/提交 |
| B1 封面结构瘦身 | 减少 press wrapper；列表封面关闭阴影；已加载封面跳过 fallback/transition | `↓` p95 升到 22.81ms，slow16 基本持平 | `↑` p95 降到 73.68ms | `→` commits 57，Cell 185 | `↑` Main sample share 下降；Hermes/Yoga 也下降 | `≈` 结构成本下降，但单轮 JS 峰值没有变好 |
| B2 iOS ActionSheet 实验，已回退 | 临时移除常驻 `MenuView`，改点击时 ActionSheet | `↑` p95 降到 11.77ms，slow16 0.5% | `↓` p95 升到 76.71ms | `↓` commits 107，Cell 160 | `↑` Main sample share 继续下降 | `↓` 性能数字有改善，但破坏菜单体验，作废，不作为有效方案 |
| B3 Skeleton loading | 回到有效交互；loading/loaded/fallback 三态；loading 只渲染静态 Skeleton | `↑` 相比 B1 p95 降到 14.63ms，slow16 2.6% | `↓` p95 94.61ms | `↓` commits 58，Cell 250 | `∅` 本轮 attach 失败，未得到有效 trace | `↑` 局部有效：loading 阶段不再渲染完整 fallback 文本/书脊，但整体瓶颈未解决 |
| B4 host Instruments 补采 | 清缓存后 host all-processes Time Profiler；同一代码补齐平台侧证据 | `↓` active p95 25.07ms，slow16 5.1%；样本更长更重 | `↑` p95 92.05ms，略低于 B3 | `↓` commits 79，Cell 345 | `↑` sample share：Main 27%，JS 69%，Image 约 3%；decode/resize 非主热点 | `≈` Main share 明显降低；当前瓶颈转到 JS/Hermes + React/Yoga/layout |

当前结论：

- 图片 resize/解码已经不是当前滚动主热点。S2 发现的全尺寸封面问题已经通过缩略图缓存和生成调度从滚动热路径里移走。
- 本次 fallback/Skeleton 重构有局部收益：它降低了 loading 阶段 React commit 峰值，但不能解释全部改善，也没有解决整体滚动瓶颈。
- B4 的 Main Thread sample share 明显低于 B0/B1/B2，支持“main thread 压力下降”的判断；但 JS thread sample share 升高，新的主要瓶颈是 JS/Hermes + React/Yoga/layout。
- 下一轮不应再猜图片或 fallback，应该沿着 JS/React 提交路径定位：缩略图 URI 发布、FlashList `extraData`、BookCover/BookCard 订阅边界、layout 计算和批量 Cell commit。

采样证据：

- S0：`4f812b49d74e2d7dd97ad97bcccd2306a7963c2f`，原始 iPad 基线。
- S1/S2：`9156215760ecfc4e1d773b59ff0b723a25f6b8b5`，热路径优化首轮及同版本复测。
- S3/S4/S5：`8b98b49da183168d1795c2ccd09953503575d926`，缩略图缓存/调度优化。
- S2：历史 Instruments 结论，最大 native 热点来自全尺寸封面 resize/解码。
- S6：`/tmp/myreader-structural-cold-scroll.trace`、`/tmp/myreader-structural-cold-time-profile.xml`、`/tmp/myreader-current-library-profiler.log`。
- S7：`/tmp/myreader-structural-retest.trace`、`/tmp/myreader-structural-retest-time-profile.xml`、`/tmp/myreader-structural-retest.log`。
- B0：`/tmp/myreader-js-profiler-longscroll-2026-07-02.ndjson`、`/tmp/myreader-longscroll-time-profile.xml`。
- B1：`/tmp/myreader-js-profiler-after-cover-structure-2026-07-02.ndjson`、`/tmp/myreader-after-cover-structure-time-profile.xml`。
- B2：`/tmp/myreader-js-profiler-after-menu-structure-2026-07-02.ndjson`、`/tmp/myreader-after-menu-structure-time-profile.xml`。该方案已回退。
- B3：`/tmp/myreader-skeleton-loading-profiler-live.log`。本轮没有有效 Instruments trace。
- B4：`/tmp/myreader-host-valid-cold-scroll.trace`、`/tmp/myreader-host-valid-cold-scroll-time-profile.xml`、`/tmp/myreader-host-valid-js-profiler.log`。

B4 Instruments 说明：

- `xctrace --device <simulator UDID>` 路径在当前环境不稳定：`--time-limit` 到点后不正常 finalize，trace 只包含 `Trace1.run/RunIssues.storedata`，导出时报 `Document Missing Template Error`。
- B4 改用 host all-processes：`xcrun xctrace record --template "Time Profiler" --all-processes --time-limit 35s --output /tmp/myreader-host-valid-cold-scroll.trace --no-prompt`。该路径正常 finalize 并成功导出 XML。
- Time Profiler sample weight 用于判断采样分布，不是墙钟耗时，也不是 exclusive time。B4 内部 MyReader 样本分布为 JS thread 约 69%、Main Thread 约 27%、Image 栈约 3%。

## 深度分析

App 内日志只能回答“列表子树是否有明显 React render/FlashList 首屏成本”。如果 release 构件仍有滚动卡顿，应继续使用平台 profiler：

- iOS：Instruments 观察 main thread、Time Profiler、Core Animation。
- Android：Perfetto / Android Studio Profiler 观察 UI thread、RenderThread、JS thread。
- React Native/Hermes：使用 Hermes sampling profiler 分析 JS 执行热点。

不要用 JS dev mode 的滚动表现判断最终性能；React Native 官方也建议在 release 模式下评估性能。

## 判断口径

- `actualDuration` 高：优先看 React 子树 render 成本。
- `baseDuration` 高但 `actualDuration` 低：memoization 有效，但列表子树理论成本偏高。
- `onLoad.elapsedTimeInMs` 高：首屏列表绘制慢。
- `onCommitLayoutEffect` 高频：FlashList layout commit 频繁，应检查 props 引用稳定性和外部状态更新。
- `renderTargetCounts.Measurement` 高频且 React render 慢：优先检查测量渲染是否在执行完整 BookCard 成本。
- `renderTargetCounts.Cell` 高频且 React render 慢：优先检查实际可见 Cell 的组件成本、props 稳定性和子树复杂度。
- `react.segmentSummary` 某个 BookCard 子段明显高：下一步优先精简该子组件；例如 `BookCard.cover` 高就看封面图片/fallback，`BookCard.actions` 高就看状态图标和 native menu。
- `BookCard.total` 明显高但各子段都低：优先看卡片根部 hooks、context/i18n/theme 订阅、menu action 计算、props 稳定性和 FlashList cell 回收成本。

## 官方参考

- React `<Profiler>`: https://react.dev/reference/react/Profiler
- React Native performance overview: https://reactnative.dev/docs/performance
- React Native profiling: https://reactnative.dev/docs/profiling
- FlashList usage/API: https://shopify.github.io/flash-list/docs/usage/
