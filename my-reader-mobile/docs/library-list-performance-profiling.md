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
