import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ProfilerOnRenderCallback,
} from "react"
import type { RenderTarget } from "@shopify/flash-list"

import {
  LIBRARY_LIST_PROFILER_SUMMARY_INTERVAL_MS,
  LIBRARY_LIST_SLOW_RENDER_FRAME_BUDGET_MS,
  LIBRARY_LIST_SLOW_RENDER_RISK_MS,
  LIBRARY_LIST_SLOW_RENDER_WARNING_MS,
} from "@/src/config/library-list-performance"

type LibraryListPerformanceContext = {
  enabled: boolean
  libraryId?: string
  viewMode: string
  totalBooks: number
  visibleBooks: number
}

type RenderMetrics = {
  renderCount: number
  phaseCounts: Record<string, number>
  actualDurationMs: number[]
  baseDurationMs: number[]
  slowRenderCount8Ms: number
  slowRenderCount12Ms: number
  slowRenderCount16Ms: number
  maxActualDurationMs: number
  maxActualDurationPhase?: string
}

type ProfilerSummary = RenderMetrics & {
  startedAtMs: number
  flashListCommitLayoutCount: number
  flashListLoadElapsedMs?: number
  flashListRenderTargetCounts: Partial<Record<RenderTarget, number>>
  segmentRenderMetricsById: Record<string, RenderMetrics>
}

function roundMetric(value: number) {
  return Math.round(value * 100) / 100
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now()
}

function createRenderMetrics(): RenderMetrics {
  return {
    renderCount: 0,
    phaseCounts: {},
    actualDurationMs: [],
    baseDurationMs: [],
    slowRenderCount8Ms: 0,
    slowRenderCount12Ms: 0,
    slowRenderCount16Ms: 0,
    maxActualDurationMs: 0,
  }
}

function createSummary(): ProfilerSummary {
  return {
    ...createRenderMetrics(),
    startedAtMs: now(),
    flashListCommitLayoutCount: 0,
    flashListRenderTargetCounts: {},
    segmentRenderMetricsById: {},
  }
}

function summarizeSamples(samples: number[]) {
  if (samples.length === 0) {
    return undefined
  }

  const sorted = [...samples].sort((left, right) => left - right)
  const sum = sorted.reduce((total, value) => total + value, 0)
  const percentile = (ratio: number) =>
    sorted[Math.floor((sorted.length - 1) * ratio)] ?? 0

  return {
    avg: roundMetric(sum / sorted.length),
    p90: roundMetric(percentile(0.9)),
    p95: roundMetric(percentile(0.95)),
    max: roundMetric(sorted[sorted.length - 1] ?? 0),
  }
}

function recordRenderMetrics(
  metrics: RenderMetrics,
  phase: string,
  actualDuration: number,
  baseDuration: number,
) {
  metrics.renderCount += 1
  metrics.phaseCounts[phase] = (metrics.phaseCounts[phase] ?? 0) + 1
  metrics.actualDurationMs.push(actualDuration)
  metrics.baseDurationMs.push(baseDuration)
  if (actualDuration >= LIBRARY_LIST_SLOW_RENDER_WARNING_MS) {
    metrics.slowRenderCount8Ms += 1
  }
  if (actualDuration >= LIBRARY_LIST_SLOW_RENDER_RISK_MS) {
    metrics.slowRenderCount12Ms += 1
  }
  if (actualDuration >= LIBRARY_LIST_SLOW_RENDER_FRAME_BUDGET_MS) {
    metrics.slowRenderCount16Ms += 1
  }
  if (actualDuration > metrics.maxActualDurationMs) {
    metrics.maxActualDurationMs = actualDuration
    metrics.maxActualDurationPhase = phase
  }
}

function serializeRenderMetrics(metrics: RenderMetrics) {
  return {
    renderCount: metrics.renderCount,
    phaseCounts: metrics.phaseCounts,
    actualDurationMs: summarizeSamples(metrics.actualDurationMs),
    baseDurationMs: summarizeSamples(metrics.baseDurationMs),
    // Count React Profiler samples that consumed roughly half a 60fps frame.
    // Useful as an early warning for work that can hitch when native layout,
    // image decode, or Core Animation work lands in the same frame.
    slowRenderCount8Ms: metrics.slowRenderCount8Ms,
    // Count samples close to the danger zone for a 60fps frame budget.
    slowRenderCount12Ms: metrics.slowRenderCount12Ms,
    // Count samples at or above the 60fps frame budget neighborhood.
    slowRenderCount16Ms: metrics.slowRenderCount16Ms,
    // Worst React render in this summary window, plus its Profiler phase.
    maxActualDurationMs: roundMetric(metrics.maxActualDurationMs),
    maxActualDurationPhase: metrics.maxActualDurationPhase,
  }
}

function serializeSegmentRenderMetrics(
  metricsById: Record<string, RenderMetrics>,
) {
  return Object.entries(metricsById)
    .map(([id, metrics]) => {
      const actualDurationMs = summarizeSamples(metrics.actualDurationMs)
      const p95 =
        actualDurationMs == null ? "n/a" : actualDurationMs.p95.toString()
      const max =
        actualDurationMs == null ? "n/a" : actualDurationMs.max.toString()
      return `${id} rc=${metrics.renderCount} p95=${p95} max=${max} slow16=${metrics.slowRenderCount16Ms}`
    })
    .join("; ")
}

/**
 * Wires official React Profiler and FlashList timing callbacks to a single log
 * prefix so release/device sessions can be compared without custom sampling.
 */
export function useLibraryListPerformanceProfiler({
  enabled,
  libraryId,
  viewMode,
  totalBooks,
  visibleBooks,
}: LibraryListPerformanceContext) {
  const enabledRef = useRef(enabled)
  const contextRef = useRef({
    libraryId,
    viewMode,
    totalBooks,
    visibleBooks,
  })
  const summaryRef = useRef(createSummary())
  const summaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const context = useMemo(
    () => ({
      libraryId,
      viewMode,
      totalBooks,
      visibleBooks,
    }),
    [libraryId, totalBooks, viewMode, visibleBooks],
  )
  enabledRef.current = enabled
  contextRef.current = context

  const flushSummary = useCallback(
    (reason: "interval" | "disabled" | "unmount") => {
      if (summaryTimerRef.current) {
        clearTimeout(summaryTimerRef.current)
        summaryTimerRef.current = null
      }

      const summary = summaryRef.current
      const hasEvents =
        summary.renderCount > 0 ||
        summary.flashListCommitLayoutCount > 0 ||
        summary.flashListLoadElapsedMs != null ||
        Object.keys(summary.flashListRenderTargetCounts).length > 0 ||
        Object.keys(summary.segmentRenderMetricsById).length > 0

      if (!hasEvents) return

      console.info("[library-list-profiler]", "summary", {
        ...contextRef.current,
        reason,
        windowMs: roundMetric(now() - summary.startedAtMs),
        react: {
          ...serializeRenderMetrics(summary),
          // Nested React Profiler sections inside visible book cells. Compact
          // text keeps device logs from truncating the diagnostic segment data.
          segmentSummary: serializeSegmentRenderMetrics(
            summary.segmentRenderMetricsById,
          ),
        },
        flashList: {
          commitLayoutCount: summary.flashListCommitLayoutCount,
          loadElapsedMs:
            summary.flashListLoadElapsedMs == null
              ? undefined
              : roundMetric(summary.flashListLoadElapsedMs),
          // FlashList render targets separate real visible cells from internal
          // measurement renders. High Measurement counts mean sizing work may be
          // paying the same component cost as visible book cells.
          renderTargetCounts: summary.flashListRenderTargetCounts,
        },
      })

      summaryRef.current = createSummary()
    },
    [],
  )

  const scheduleSummaryFlush = useCallback(() => {
    if (!enabledRef.current || summaryTimerRef.current) return

    summaryTimerRef.current = setTimeout(() => {
      flushSummary("interval")
    }, LIBRARY_LIST_PROFILER_SUMMARY_INTERVAL_MS)
  }, [flushSummary])

  const onRender = useCallback<ProfilerOnRenderCallback>(
    (_id, phase, actualDuration, baseDuration, _startTime, _commitTime) => {
      if (!enabledRef.current) return

      recordRenderMetrics(
        summaryRef.current,
        phase,
        actualDuration,
        baseDuration,
      )
      scheduleSummaryFlush()
    },
    [scheduleSummaryFlush],
  )

  const onRenderSegment = useCallback<ProfilerOnRenderCallback>(
    (id, phase, actualDuration, baseDuration, _startTime, _commitTime) => {
      if (!enabledRef.current) return

      const metricsById = summaryRef.current.segmentRenderMetricsById
      const metrics = metricsById[id] ?? createRenderMetrics()
      metricsById[id] = metrics
      recordRenderMetrics(metrics, phase, actualDuration, baseDuration)
      scheduleSummaryFlush()
    },
    [scheduleSummaryFlush],
  )

  const onLoad = useCallback(
    ({ elapsedTimeInMs }: { elapsedTimeInMs: number }) => {
      if (!enabledRef.current) return

      summaryRef.current.flashListLoadElapsedMs = elapsedTimeInMs
      scheduleSummaryFlush()
    },
    [scheduleSummaryFlush],
  )

  const onCommitLayoutEffect = useCallback(() => {
    if (!enabledRef.current) return

    summaryRef.current.flashListCommitLayoutCount += 1
    scheduleSummaryFlush()
  }, [scheduleSummaryFlush])

  const recordRenderTarget = useCallback(
    (target: RenderTarget) => {
      if (!enabledRef.current) return

      const targetCounts = summaryRef.current.flashListRenderTargetCounts
      targetCounts[target] = (targetCounts[target] ?? 0) + 1
      scheduleSummaryFlush()
    },
    [scheduleSummaryFlush],
  )

  useEffect(() => {
    if (!enabled) {
      flushSummary("disabled")
    }
  }, [enabled, flushSummary])

  useEffect(() => {
    return () => flushSummary("unmount")
  }, [flushSummary])

  return {
    onCommitLayoutEffect: enabled ? onCommitLayoutEffect : undefined,
    onLoad: enabled ? onLoad : undefined,
    onRender: enabled ? onRender : undefined,
    onRenderSegment: enabled ? onRenderSegment : undefined,
    recordRenderTarget: enabled ? recordRenderTarget : undefined,
  }
}
