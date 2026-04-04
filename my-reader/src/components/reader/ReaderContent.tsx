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

/** 分页视口宽度不低于此值时启用自动双栏（与 {@link LayoutConfig.doubleColumn} 对应）。 */
const READER_WIDE_COLUMN_MIN_WIDTH_PX = 1300

function readerShouldUseDoubleColumn(viewportWidthPx: number): boolean {
  return viewportWidthPx >= READER_WIDE_COLUMN_MIN_WIDTH_PX
}

interface ReaderContentProps {
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

const readerPaginatedColumnClass =
  "reader-chapter-container reader-paginated-container reader-paginated-range-page reader-body-content reader-chapter-typography-host min-h-0 min-w-0 flex-1 overflow-hidden"

/**
 * 单章分页视口：测量与页码由 {@link BookReader}（经 `layout`）驱动，本组件只负责挂载测量宿主与绘制。
 */
export function ReaderContent({
  chapter,
  layout,
  fontFamily,
  fontSize,
  lineHeight,
  paddingX,
  onProgressChange,
  onPageStateChange,
  pageOffset,
}: ReaderContentProps) {
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
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 })
  const prevChapterIndexRef = useRef(chapter.index)

  const typoStyle = {
    "--reader-padding-x": `${paddingX}rem`,
    "--reader-font-family": fontFamily,
    "--reader-font-size": `${fontSize}px`,
    "--reader-line-height": String(lineHeight),
  } as CSSProperties

  const layoutDoubleColumn = readerShouldUseDoubleColumn(viewportSize.w)

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
    [
      layoutDoubleColumn,
      chapterMode,
      pages.length,
      pageCount,
      pageOffset,
    ],
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
    }

    const w = viewportSize.w
    const h = viewportSize.h
    if (w <= 0 || h <= 0) return

    const config: LayoutConfig = {
      fontFamily,
      fontSize,
      lineHeight,
      paddingX,
      viewPortWidth: w,
      viewPortHeight: h,
      doubleColumn: readerShouldUseDoubleColumn(w),
    }
    void layout(config, host)
      .then((next) => {
        if (!next) return
        if (cancelled) return
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
      })
      .catch(() => {
        if (cancelled) return
      })

    return () => {
      cancelled = true
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
    viewportSize.w,
    viewportSize.h,
  ])

  useLayoutEffect(() => {
    const v = viewportRef.current
    if (!v) return
    const w = v.clientWidth
    const h = v.clientHeight
    if (w > 0 && h > 0) {
      setViewportSize((prev) =>
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
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const w = viewport.clientWidth
        const h = viewport.clientHeight
        if (w <= 0 || h <= 0) return
        setViewportSize((prev) =>
          prev.w !== w || prev.h !== h ? { w, h } : prev,
        )
      })
    })
    ro.observe(viewport)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  const { spreadIndex, spreadCount, twoColumnShell } = viewportModel

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
      <main className="reader-paginated-main reader-text-surface flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={viewportRef}
          className={cn(
            "h-full w-full min-h-0 overflow-hidden",
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
                className={readerPaginatedColumnClass}
                style={typoStyle}
              />
              <div
                ref={rightColRef}
                className={readerPaginatedColumnClass}
                style={typoStyle}
              />
            </>
          ) : (
            <div
              ref={displayRef}
              className={readerPaginatedColumnClass}
              style={typoStyle}
            />
          )}
        </div>
      </main>
    </div>
  )
}
