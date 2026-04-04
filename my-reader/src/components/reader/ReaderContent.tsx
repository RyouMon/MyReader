/* biome-ignore-all lint/security/noDangerouslySetInnerHtml: 阅读器需要渲染已解析的 HTML 与样式 */
import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import type {
  LayoutConfig,
  TextChapterData,
  TextChapterPaginationResult,
} from "@/lib/rendition"
import { renderTextChapterPage } from "@/lib/rendition/pagination/ProgressivePaginator"

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
  /**
   * 从末页开始渲染（向前翻章时使用），每次挂载只生效一次。
   * 每次 chapter.index 变化时组件会被完全重新挂载（key 驱动），
   * 因此不需要对 prop 变化做额外处理。
   */
  startFromEnd?: boolean
}

/**
 * 单章分页：Range 测量 scrollHeight + 二分得到页边界，每屏只挂载当前页对应的 DOM 片段。
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
  startFromEnd = false,
}: ReaderContentProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const measureHostRef = useRef<HTMLDivElement>(null)
  const displayRef = useRef<HTMLDivElement>(null)

  const parsedRootRef = useRef<HTMLDivElement | null>(null)
  const textsRef = useRef<Text[]>([])
  const pageIndexRef = useRef(0)
  const pageCountRef = useRef(1)

  const [pages, setPages] = useState<TextChapterPaginationResult["pages"]>([])
  const [chapterMode, setChapterMode] = useState<"sliced" | "full">("full")
  const [pageCount, setPageCount] = useState(1)
  const [pageIndex, setPageIndex] = useState(0)
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 })

  const startFromEndRef = useRef(startFromEnd)
  startFromEndRef.current = startFromEnd
  const startFromEndAppliedRef = useRef(false)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const host = measureHostRef.current
    if (!viewport || !host) return
    let cancelled = false

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
        pageCountRef.current = next.pageCount
        setPageCount(next.pageCount)

        let nextIdx = 0
        if (startFromEndRef.current && !startFromEndAppliedRef.current) {
          startFromEndAppliedRef.current = true
          nextIdx = Math.max(0, next.pageCount - 1)
        } else {
          nextIdx = Math.min(
            pageIndexRef.current,
            Math.max(0, next.pageCount - 1),
          )
        }
        pageIndexRef.current = nextIdx
        setPageIndex(nextIdx)
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
    viewportSize.w,
    viewportSize.h,
  ])

  /** 与父级 BookReader 页指针同步须在绘制前完成，否则会出现一帧旧页 → 抖动 */
  useLayoutEffect(() => {
    if (typeof pageOffset !== "number") return
    const next = Math.max(
      0,
      Math.min(pageOffset, Math.max(0, pageCountRef.current - 1)),
    )
    if (next === pageIndexRef.current) return
    pageIndexRef.current = next
    setPageIndex(next)
  }, [pageOffset])

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
    const el = displayRef.current
    if (!el) return

    renderTextChapterPage(
      el,
      chapter,
      chapterMode,
      pages,
      pageIndex,
      parsedRootRef.current,
      textsRef.current,
    )
  }, [chapterMode, chapter, pages, pageIndex])

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

  useEffect(() => {
    if (pageCount <= 1) {
      onProgressChange(100)
      return
    }
    const pct = Math.round((pageIndex / (pageCount - 1)) * 100)
    onProgressChange(pct)
  }, [pageIndex, pageCount, onProgressChange])

  useEffect(() => {
    onPageStateChange?.(pageIndex, pageCount)
  }, [onPageStateChange, pageIndex, pageCount])

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
          className="h-full w-full min-h-0 overflow-hidden"
        >
          <div
            ref={displayRef}
            className="reader-chapter-container reader-paginated-container reader-paginated-range-page reader-body-content reader-chapter-typography-host"
            style={
              {
                "--reader-padding-x": `${paddingX}rem`,
                "--reader-font-family": fontFamily,
                "--reader-font-size": `${fontSize}px`,
                "--reader-line-height": String(lineHeight),
              } as CSSProperties
            }
          />
        </div>
      </main>
    </div>
  )
}
