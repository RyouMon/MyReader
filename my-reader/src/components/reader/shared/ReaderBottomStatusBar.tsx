import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { cn } from "@/lib/utils"

export type ReaderProgressPreview = {
  label: string
  chapterTitle?: string
}

function clampProgress(progress: number): number {
  return Math.max(0, Math.min(100, progress))
}

interface ReaderBottomStatusBarProps {
  visible: boolean
  leftText?: string
  rightText?: string
  progress?: number
  getProgressPreview?: (progress: number) => ReaderProgressPreview
  resolveProgressCommit?: (progress: number) => number
  onProgressChange?: (progress: number) => void
  onProgressStepBackward?: () => void
  onProgressStepForward?: () => void
}

/**
 * 苹果 Books 风格底部状态栏：只保留居中页码/百分比与可拖动进度条。
 */
export function ReaderBottomStatusBar({
  visible,
  leftText,
  progress,
  getProgressPreview,
  resolveProgressCommit,
  onProgressChange,
  onProgressStepBackward,
  onProgressStepForward,
}: ReaderBottomStatusBarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const tooltipTitleRef = useRef<HTMLSpanElement | null>(null)
  const tooltipLabelRef = useRef<HTMLSpanElement | null>(null)
  const [draftProgress, setDraftProgress] = useState<number | null>(null)
  const [committedProgress, setCommittedProgress] = useState<number | null>(
    null,
  )
  const progressAtCommitRef = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const progressValue =
    typeof progress === "number" ? clampProgress(progress) : 0
  const displayProgress = draftProgress ?? committedProgress ?? progressValue
  const tooltipPreview = useMemo(
    () =>
      getProgressPreview?.(displayProgress) ??
      (leftText ? { label: leftText } : undefined),
    [displayProgress, getProgressPreview, leftText],
  )
  const tooltipLabel = tooltipPreview?.label.trim() ?? ""
  const tooltipChapterTitle = tooltipPreview?.chapterTitle?.trim()
  const showTooltipChapterTitle =
    Boolean(tooltipChapterTitle) && tooltipChapterTitle !== tooltipLabel
  const [tooltipFit, setTooltipFit] = useState({
    width: 0,
    titleScale: 1,
    labelScale: 1,
  })

  useLayoutEffect(() => {
    if (!dragging) return
    const track = trackRef.current
    const tooltip = tooltipRef.current
    if (!track || !tooltip) return

    const updateFit = () => {
      const trackWidth = track.getBoundingClientRect().width
      const titleWidth = tooltipTitleRef.current?.scrollWidth ?? 0
      const labelWidth = tooltipLabelRef.current?.scrollWidth ?? 0
      const contentWidth = Math.max(titleWidth, labelWidth)
      if (trackWidth <= 0 || contentWidth <= 0) return

      const tooltipStyle = window.getComputedStyle(tooltip)
      const horizontalPadding =
        Number.parseFloat(tooltipStyle.paddingLeft) +
        Number.parseFloat(tooltipStyle.paddingRight)
      const availableWidth = Math.max(1, trackWidth - 16)
      const availableContentWidth = Math.max(
        1,
        availableWidth - horizontalPadding,
      )
      const width = Math.min(availableWidth, contentWidth + horizontalPadding)
      const titleScale =
        titleWidth > 0 ? Math.min(1, availableContentWidth / titleWidth) : 1
      const labelScale =
        labelWidth > 0 ? Math.min(1, availableContentWidth / labelWidth) : 1

      setTooltipFit((current) =>
        Math.abs(current.width - width) < 0.5 &&
        Math.abs(current.titleScale - titleScale) < 0.001 &&
        Math.abs(current.labelScale - labelScale) < 0.001
          ? current
          : { width, titleScale, labelScale },
      )
    }

    updateFit()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(updateFit)
    observer.observe(track)
    return () => observer.disconnect()
  }, [dragging, tooltipChapterTitle, tooltipLabel.length])

  useEffect(() => {
    if (committedProgress == null || progressAtCommitRef.current == null) return
    if (Math.abs(progressValue - committedProgress) <= 0.1) {
      setCommittedProgress(null)
      progressAtCommitRef.current = null
    }
  }, [committedProgress, progressValue])

  useEffect(() => {
    if (committedProgress == null) return
    const timeout = window.setTimeout(() => {
      setCommittedProgress(null)
      progressAtCommitRef.current = null
    }, 1200)
    return () => window.clearTimeout(timeout)
  }, [committedProgress])

  const progressFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track) return progressValue
      const rect = track.getBoundingClientRect()
      if (rect.width <= 0) return progressValue
      const next = ((clientX - rect.left) / rect.width) * 100
      return clampProgress(next)
    },
    [progressValue],
  )

  const onTrackPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      const track = trackRef.current
      if (!track) return
      setDragging(false)
      setDraftProgress(null)
      setCommittedProgress(null)
      progressAtCommitRef.current = null
      const rect = track.getBoundingClientRect()
      const handleX = rect.left + (progressValue / 100) * rect.width
      if (event.clientX < handleX) {
        onProgressStepBackward?.()
      } else {
        onProgressStepForward?.()
      }
    },
    [onProgressStepBackward, onProgressStepForward, progressValue],
  )

  const onHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      setDragging(true)
      setDraftProgress(progressValue)
    },
    [progressValue],
  )

  useEffect(() => {
    if (!dragging) return

    const onMove = (event: PointerEvent) => {
      event.preventDefault()
      setDraftProgress(progressFromPointer(event.clientX))
    }
    const onUp = (event: PointerEvent) => {
      event.preventDefault()
      const rawProgress = progressFromPointer(event.clientX)
      const nextProgress = clampProgress(
        resolveProgressCommit?.(rawProgress) ?? rawProgress,
      )
      progressAtCommitRef.current = progressValue
      setCommittedProgress(nextProgress)
      setDragging(false)
      setDraftProgress(null)
      onProgressChange?.(nextProgress)
    }
    const onCancel = () => {
      setDragging(false)
      setDraftProgress(null)
    }

    window.addEventListener("pointermove", onMove, { capture: true })
    window.addEventListener("pointerup", onUp, { capture: true })
    window.addEventListener("pointercancel", onCancel, { capture: true })
    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true })
      window.removeEventListener("pointerup", onUp, { capture: true })
      window.removeEventListener("pointercancel", onCancel, { capture: true })
    }
  }, [
    dragging,
    onProgressChange,
    progressFromPointer,
    progressValue,
    resolveProgressCommit,
  ])

  return (
    <div
      className={cn(
        "grid h-full w-full grid-rows-[1fr_auto_1fr] transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {leftText ? (
        <span className="reader-position-label col-start-1 row-start-2 block w-full self-center justify-self-center select-none rounded-full px-2 text-center text-xs foxsnt-semibold tabular-nums text-reader-chrome-muted/80">
          {leftText}
        </span>
      ) : null}
      <div
        ref={trackRef}
        className="reader-progress-control relative col-start-1 row-start-3 w-full self-end"
        onPointerDown={onTrackPointerDown}
      >
        <div className="reader-progress-track" aria-hidden />
        {dragging && tooltipPreview ? (
          <div
            ref={tooltipRef}
            className="reader-progress-tooltip select-none"
            style={{
              left: `${displayProgress}%`,
              transform: `translateX(${-displayProgress}%)`,
              width: tooltipFit.width > 0 ? tooltipFit.width : undefined,
            }}
          >
            {showTooltipChapterTitle ? (
              <span
                ref={tooltipTitleRef}
                className="reader-progress-tooltip-title inline-block w-max whitespace-nowrap font-semibold"
                style={{
                  transform: `scaleX(${tooltipFit.titleScale})`,
                  transformOrigin: "center",
                }}
              >
                {tooltipChapterTitle}
              </span>
            ) : null}
            {tooltipLabel ? (
              <span
                ref={tooltipLabelRef}
                className="reader-progress-tooltip-label inline-block w-max whitespace-nowrap tabular-nums"
                style={{
                  transform: `scaleX(${tooltipFit.labelScale})`,
                  transformOrigin: "center",
                }}
              >
                {tooltipLabel}
              </span>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          className="reader-progress-handle"
          style={{
            left: `${displayProgress}%`,
            transform: `translate(${-displayProgress}%, -50%)`,
          }}
          aria-label={leftText}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(displayProgress)}
          role="slider"
          onPointerDown={onHandlePointerDown}
        />
      </div>
    </div>
  )
}
