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

  const parsedRootRef = useRef<HTMLDivElement | null>(null)
  const textsRef = useRef<Text[]>([])

  const [pages, setPages] = useState<TextChapterPaginationResult["pages"]>([])
  const [chapterMode, setChapterMode] = useState<"sliced" | "full">("full")
  const [pageCount, setPageCount] = useState(1)
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 })

  const displayPageIndex = useMemo(() => {
    const max = Math.max(0, pageCount - 1)
    if (typeof pageOffset !== "number") return 0
    return Math.max(0, Math.min(pageOffset, max))
  }, [pageOffset, pageCount])

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
    const el = displayRef.current
    if (!el) return

    BookReader.renderPaginatedTextPage(
      el,
      chapter,
      chapterMode,
      pages,
      displayPageIndex,
      parsedRootRef.current,
      textsRef.current,
    )
  }, [chapterMode, chapter, pages, displayPageIndex])

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
    const pct = Math.round((displayPageIndex / (pageCount - 1)) * 100)
    onProgressChange(pct)
  }, [displayPageIndex, pageCount, onProgressChange])

  useEffect(() => {
    onPageStateChange?.(displayPageIndex, pageCount)
  }, [onPageStateChange, displayPageIndex, pageCount])

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
