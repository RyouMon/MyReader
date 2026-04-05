/* biome-ignore-all lint/security/noDangerouslySetInnerHtml: 阅读器需要渲染已解析的 HTML 与样式 */
import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type {
  LayoutConfig,
  TextChapterData,
  TextChapterPaginationResult,
} from "@/lib/rendition"
import { BookReader } from "@/lib/rendition/BookReader"
import { cn } from "@/lib/utils"
import {
  ReflowableSkeleton,
  reflowablePaginatedColumnClass,
} from "./ReflowableSkeleton"

/** 分页视口宽度不低于此值时启用自动双栏（与 {@link LayoutConfig.doubleColumn} 对应）。 */
const REFLOWABLE_WIDE_COLUMN_MIN_WIDTH_PX = 1300

/** 视口尺寸停止变化后再跑分页测量，避免拖拽窗口时连续触发布局。 */
const REFLOWABLE_VIEWPORT_RESIZE_DEBOUNCE_MS = 160

function reflowableShouldUseDoubleColumn(viewportWidthPx: number): boolean {
  return viewportWidthPx >= REFLOWABLE_WIDE_COLUMN_MIN_WIDTH_PX
}

interface ReflowableContentProps {
  chapter: TextChapterData
  layout: (
    config: LayoutConfig,
    measureHost: HTMLDivElement,
  ) => Promise<TextChapterPaginationResult | undefined>
  fontFamily: string
  fontSize: number
  lineHeight: number
  paddingX: number
  onProgressChange: (pct: number) => void
  onPageStateChange?: (pageIndex: number, pageCount: number) => void
  pageOffset?: number
}

/**
 * 单章分页视口：测量与页码由 {@link BookReader}（经 `layout`）驱动，本组件只负责挂载测量宿主与绘制。
 */
export function ReflowableContent({
  chapter,
  layout,
  fontFamily,
  fontSize,
  lineHeight,
  paddingX,
  onProgressChange,
  onPageStateChange,
  pageOffset,
}: ReflowableContentProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const measureHostRef = useRef<HTMLDivElement>(null)
  const displayRef = useRef<HTMLDivElement>(null)
  const leftColRef = useRef<HTMLDivElement>(null)
  const rightColRef = useRef<HTMLDivElement>(null)

  const parsedRootRef = useRef<HTMLDivElement | null>(null)
  const textsRef = useRef<Text[]>([])

  const [pages, setPages] = useState<TextChapterPaginationResult["pages"]>([])
  const [chapterMode, setChapterMode] = useState<"sliced" | "full">("full")
  const [pageCount, setPageCount] = useState(1)
  const [viewportLive, setViewportLive] = useState({ w: 0, h: 0 })
  const [viewportLayout, setViewportLayout] = useState({ w: 0, h: 0 })
  const [awaitingLayoutAfterResize, setAwaitingLayoutAfterResize] =
    useState(false)
  const prevChapterIndexRef = useRef(chapter.index)
  const viewportLiveRef = useRef({ w: 0, h: 0 })
  const layoutViewportSizeRef = useRef<{ w: number; h: number } | null>(null)
  const resizeSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  const typoStyle = {
    "--reader-padding-x": `${paddingX}rem`,
    "--reader-font-family": fontFamily,
    "--reader-font-size": `${fontSize}px`,
    "--reader-line-height": String(lineHeight),
  } as CSSProperties

  const layoutDoubleColumn = reflowableShouldUseDoubleColumn(viewportLayout.w)

  const viewportModel = useMemo(
    () =>
      BookReader.paginatedViewportModel({
        wideViewport: layoutDoubleColumn,
        layoutDoubleColumn,
        mode: chapterMode,
        columnSliceCount: pages.length,
        pageCountState: pageCount,
        pageOffset,
      }),
    [layoutDoubleColumn, chapterMode, pages.length, pageCount, pageOffset],
  )

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const host = measureHostRef.current
    if (!viewport || !host) return
    let cancelled = false

    if (prevChapterIndexRef.current !== chapter.index) {
      prevChapterIndexRef.current = chapter.index
      setPages([])
      setChapterMode("full")
      setPageCount(1)
      parsedRootRef.current = null
      textsRef.current = []
      layoutViewportSizeRef.current = null
    }

    const w = viewportLayout.w
    const h = viewportLayout.h
    if (w <= 0 || h <= 0) return

    const prevCommitted = layoutViewportSizeRef.current
    if (
      prevCommitted !== null &&
      (prevCommitted.w !== w || prevCommitted.h !== h)
    ) {
      setAwaitingLayoutAfterResize(true)
    }

    const config: LayoutConfig = {
      fontFamily,
      fontSize,
      lineHeight,
      paddingX,
      viewPortWidth: w,
      viewPortHeight: h,
      doubleColumn: reflowableShouldUseDoubleColumn(w),
    }
    void layout(config, host)
      .then((next) => {
        if (cancelled) return
        if (!next) {
          setAwaitingLayoutAfterResize(false)
          return
        }
        if (next.mode === "full") {
          setChapterMode("full")
          setPages([])
        } else {
          setChapterMode("sliced")
          setPages(next.pages)
        }
        parsedRootRef.current = next.sourceRoot
        textsRef.current = next.texts
        setPageCount(next.pageCount)
        layoutViewportSizeRef.current = { w, h }
        setAwaitingLayoutAfterResize(false)
      })
      .catch(() => {
        if (cancelled) return
        setAwaitingLayoutAfterResize(false)
      })

    return () => {
      cancelled = true
      setAwaitingLayoutAfterResize(false)
      host.replaceChildren()
      parsedRootRef.current = null
      textsRef.current = []
    }
  }, [
    layout,
    fontFamily,
    fontSize,
    lineHeight,
    paddingX,
    chapter.index,
    viewportLayout.w,
    viewportLayout.h,
  ])

  useLayoutEffect(() => {
    const v = viewportRef.current
    if (!v) return
    const w = v.clientWidth
    const h = v.clientHeight
    if (w > 0 && h > 0) {
      viewportLiveRef.current = { w, h }
      setViewportLive((prev) =>
        prev.w !== w || prev.h !== h ? { w, h } : prev,
      )
      setViewportLayout((prev) =>
        prev.w !== w || prev.h !== h ? { w, h } : prev,
      )
    }
  }, [])

  useLayoutEffect(() => {
    BookReader.renderPaginatedViewport(
      {
        single: displayRef.current,
        left: leftColRef.current,
        right: rightColRef.current,
      },
      {
        chapter,
        mode: chapterMode,
        pages,
        leftColumnIndex: viewportModel.leftColumnIndex,
        sourceRoot: parsedRootRef.current,
        texts: textsRef.current,
        twoColumnShell: viewportModel.twoColumnShell,
      },
    )
  }, [chapterMode, chapter, pages, viewportModel])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    let raf = 0
    const scheduleLayoutSize = () => {
      if (resizeSettleTimerRef.current !== null) {
        clearTimeout(resizeSettleTimerRef.current)
      }
      resizeSettleTimerRef.current = setTimeout(() => {
        resizeSettleTimerRef.current = null
        const { w, h } = viewportLiveRef.current
        if (w <= 0 || h <= 0) return
        setViewportLayout((prev) =>
          prev.w !== w || prev.h !== h ? { w, h } : prev,
        )
      }, REFLOWABLE_VIEWPORT_RESIZE_DEBOUNCE_MS)
    }
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const w = viewport.clientWidth
        const h = viewport.clientHeight
        if (w <= 0 || h <= 0) return
        viewportLiveRef.current = { w, h }
        setViewportLive((prev) =>
          prev.w !== w || prev.h !== h ? { w, h } : prev,
        )
        scheduleLayoutSize()
      })
    })
    ro.observe(viewport)
    return () => {
      cancelAnimationFrame(raf)
      if (resizeSettleTimerRef.current !== null) {
        clearTimeout(resizeSettleTimerRef.current)
        resizeSettleTimerRef.current = null
      }
      ro.disconnect()
    }
  }, [])

  const { spreadIndex, spreadCount, twoColumnShell } = viewportModel

  const viewportResizeInProgress =
    viewportLive.w !== viewportLayout.w || viewportLive.h !== viewportLayout.h
  const showReflowableSkeleton =
    viewportResizeInProgress || awaitingLayoutAfterResize
  const skeletonTwoColumnShell = reflowableShouldUseDoubleColumn(viewportLive.w)

  useEffect(() => {
    if (spreadCount <= 1) {
      onProgressChange(100)
      return
    }
    onProgressChange(Math.round((spreadIndex / (spreadCount - 1)) * 100))
  }, [spreadIndex, spreadCount, onProgressChange])

  useEffect(() => {
    onPageStateChange?.(spreadIndex, spreadCount)
  }, [onPageStateChange, spreadIndex, spreadCount])

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={measureHostRef}
        aria-hidden
        className="pointer-events-none z-0"
      />
      <main
        className="reader-paginated-main reader-text-surface flex h-full min-h-0 flex-1 flex-col overflow-hidden"
        aria-busy={showReflowableSkeleton}
      >
        <div
          ref={viewportRef}
          className={cn(
            "relative h-full w-full min-h-0 overflow-hidden",
            twoColumnShell && "flex min-h-0 flex-row",
          )}
          style={
            twoColumnShell
              ? { gap: `${BookReader.PAGINATION_DOUBLE_COLUMN_GAP_PX}px` }
              : undefined
          }
        >
          {twoColumnShell ? (
            <>
              <div
                ref={leftColRef}
                className={reflowablePaginatedColumnClass}
                style={typoStyle}
              />
              <div
                ref={rightColRef}
                className={reflowablePaginatedColumnClass}
                style={typoStyle}
              />
            </>
          ) : (
            <div
              ref={displayRef}
              className={reflowablePaginatedColumnClass}
              style={typoStyle}
            />
          )}
          {showReflowableSkeleton ? (
            <div
              className="reader-text-surface pointer-events-none absolute inset-0 z-10 flex min-h-0 flex-col"
              aria-hidden
            >
              <ReflowableSkeleton
                fontSize={fontSize}
                lineHeight={lineHeight}
                typoStyle={typoStyle}
                twoColumnShell={skeletonTwoColumnShell}
              />
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}
