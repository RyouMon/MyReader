import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ReaderPaginateEdgeTurnStrips } from "@/components/reader/shared/ReaderPaginateEdgeTurnStrips"
import { ReaderPanelsBackdrop } from "@/components/reader/shared/ReaderPanelsBackdrop"
import { ReaderTopBar } from "@/components/reader/shared/ReaderTopBar"
import { useReaderPaginateEdgeTurn } from "@/hooks/reader/useReaderPaginateEdgeTurn"
import { useReaderBookmark } from "@/hooks/reader/useReaderBookmark"
import { useReaderKeyboardNavigation } from "@/hooks/reader/useReaderKeyboardNavigation"
import { useReaderBookProgressSeek } from "@/hooks/reader/useReaderBookProgressSeek"
import { useReaderPanels } from "@/hooks/reader/useReaderPanels"
import { useReaderTts } from "@/hooks/reader/useReaderTts"
import { useReadingChrome } from "@/hooks/reader/useReadingChrome"
import { useReflowableInternalLinkCapture } from "@/hooks/reader/useReflowableInternalLinkCapture"
import { useReflowReaderSettings } from "@/hooks/reader/useReflowableReaderSettings"
import type { BookAnchor } from "my-reader-tools/progress/BookAnchor"
import {
  bookAnchorFromScrollViewport,
  fallbackBookAnchorFromFraction,
  scrollScrollContainerToBookAnchor,
} from "my-reader-tools/progress/reflowViewportAnchor"
import type { TextChapterData, TocItem } from "my-reader-tools/types"
import type { ReaderSurfaceProps, TocEntry } from "../types"
import { ReflowableBottomBar } from "./ReflowableBottomBar"
import { ReflowableContent } from "./ReflowableContent"
import {
  type ReflowableScrollAnchor,
  ReflowableScrollContent,
} from "./ReflowableScrollContent"
import { ReflowableSettingsPanel } from "./ReflowableSettingsPanel"
import { ReflowableTocPanel } from "./ReflowableTocPanel"
import { TtsPanel } from "./TtsPanel"

export function ReflowableReader({ bookTitle, reader }: ReaderSurfaceProps) {
  const chapter = reader.chapter as TextChapterData
  const {
    toc,
    totalChapters,
    totalPagesInChapter,
    curChapter,
    curPageIndex,
    isChapterStartFromEnd,
    getChapter,
    gotoPage,
    gotoNextPage,
    gotoPrevPage,
    gotoPageInChapter,
    layout: applyLayout,
    notifyInitialViewCommitted,
    layoutMode,
    ready: readerReady,
    resolveInternalTextLink,
    followInternalTextLink,
    syncChapterIndexFromScroll,
    applyCharOffsetResume,
    buildSaveBookAnchorMidSlice,
    format: bookFormat,
    getPendingTextResumeBoundary,
    clearPendingTextResumeBoundary,
  } = reader
  const panels = useReaderPanels()
  const bookmark = useReaderBookmark()
  const reflow = useReflowReaderSettings()
  const tts = useReaderTts()
  const { readerRootRef, chromeVisible, hideChrome } = useReadingChrome(
    tts.ttsActive,
  )
  const scrollRef = useRef<HTMLDivElement>(null)

  // 章节内页级进度（0-100），由 ReflowableContent.onProgressChange 驱动
  const [chapterProgressPct, setChapterProgressPct] = useState(0)

  // ── 滚动模式：全书章节列表 ─────────────────────────────────────────────
  const [scrollChapters, setScrollChapters] = useState<
    TextChapterData[] | null
  >(null)
  const [scrollLoadError, setScrollLoadError] = useState<string | null>(null)
  const [bookProgress, setBookProgress] = useState(0)
  const [scrollFocusIndex, setScrollFocusIndex] = useState(curChapter)

  const pendingScrollAnchorRef = useRef<ReflowableScrollAnchor | null>(null)
  const scrollChaptersRef = useRef(scrollChapters)
  scrollChaptersRef.current = scrollChapters
  const scrollToPaginateAnchorRef = useRef<BookAnchor | null>(null)
  const paginateToScrollAnchorRef = useRef<BookAnchor | null>(null)
  const syncScrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const hadScrollChaptersRef = useRef(false)

  const layout = reflow.settings.readingLayout
  const prevLayoutRef = useRef<typeof layout | null>(null)

  const { nearLeft, nearRight } = useReaderPaginateEdgeTurn(
    layout === "paginate",
    readerRootRef,
  )

  const topChapterLine = useMemo(() => {
    if (layout === "scroll" && scrollChapters?.length) {
      const c = scrollChapters.find((c) => c.index === scrollFocusIndex)
      if (c?.title) return c.title
    }
    return chapter.title
  }, [layout, scrollChapters, scrollFocusIndex, chapter.title])

  // ── TTS ──────────────────────────────────────────────────────────────────
  const ttsChapter = useMemo(() => {
    if (layout === "scroll" && scrollChapters?.length) {
      return scrollChapters.find((c) => c.index === scrollFocusIndex) ?? chapter
    }
    return chapter
  }, [layout, scrollChapters, scrollFocusIndex, chapter])

  const sentences = useMemo(
    () =>
      ttsChapter.text
        .split(/(?<=[。？！.?!]+["'」』）)】]*)/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    [ttsChapter.text],
  )

  const handleTtsTogglePlay = useCallback(
    () => tts.ttsTogglePlay(sentences.length),
    [tts, sentences.length],
  )

  const handleTtsNext = useCallback(
    () => tts.ttsNext(sentences.length),
    [tts, sentences.length],
  )

  // ── 章节导航 ─────────────────────────────────────────────────────────────
  /** 向前翻章：新章从末页开始 */
  const handlePrevChapter = useCallback(() => {
    if (curChapter <= 0) return
    void gotoPage(curChapter - 1, Number.MAX_SAFE_INTEGER)
  }, [curChapter, gotoPage])

  /** 向后翻章：新章从首页开始 */
  const handleNextChapter = useCallback(() => {
    if (curChapter >= totalChapters - 1) return
    void gotoPage(curChapter + 1, 0)
  }, [curChapter, totalChapters, gotoPage])

  /** 目录直跳：始终从首页开始 */
  const handleSelectChapter = useCallback(
    (idx: number) => {
      void gotoPage(idx, 0)
      panels.closePanels()
    },
    [gotoPage, panels],
  )

  // ── 翻页（分页模式） ──────────────────────────────────────────────────────
  /**
   * 分页模式翻页统一走 Reader 控制器 API。
   */
  const handlePaginateTurn = useCallback(
    (direction: "prev" | "next") => {
      if (layout !== "paginate") return
      if (direction === "prev") {
        void gotoPrevPage()
        return
      }
      void gotoNextPage()
    },
    [layout, gotoNextPage, gotoPrevPage],
  )

  const onKeyboardPaginatePrev = useCallback(
    () => handlePaginateTurn("prev"),
    [handlePaginateTurn],
  )
  const onKeyboardPaginateNext = useCallback(
    () => handlePaginateTurn("next"),
    [handlePaginateTurn],
  )

  useReaderKeyboardNavigation({
    readingLayout: layout,
    scrollContainerRef: scrollRef,
    scrollStepViewportRatio: 0.85,
    onPaginatePrev: onKeyboardPaginatePrev,
    onPaginateNext: onKeyboardPaginateNext,
    panels,
    hideChrome,
  })

  useReflowableInternalLinkCapture({
    readerRootRef,
    scrollContainerRef: scrollRef,
    readerReady,
    layoutMode,
    layout,
    scrollFocusChapterIndex: scrollFocusIndex,
    curChapter,
    resolveInternalTextLink,
    followInternalTextLink,
  })

  // ── 布局切换 ─────────────────────────────────────────────────────────────
  const handleLayoutChange = useCallback(
    (l: typeof layout) => {
      if (l === "paginate" && reflow.settings.readingLayout === "scroll") {
        let anchor: BookAnchor | null = null
        const root = scrollRef.current
        if (root) {
          anchor = bookAnchorFromScrollViewport(root)
        }
        if (!anchor) {
          const pend = pendingScrollAnchorRef.current
          if (pend) {
            const ch = scrollChaptersRef.current?.find(
              (c) => c.index === pend.chapterIndex,
            )
            anchor = fallbackBookAnchorFromFraction(
              pend.chapterIndex,
              pend.withinChapterFraction,
              ch,
            )
          }
        }
        scrollToPaginateAnchorRef.current = anchor
      }
      if (l === "scroll" && reflow.settings.readingLayout === "paginate") {
        paginateToScrollAnchorRef.current =
          buildSaveBookAnchorMidSlice(bookFormat)
      }
      reflow.updateSettings({ readingLayout: l })
    },
    [reflow, buildSaveBookAnchorMidSlice, bookFormat],
  )

  // ── 进度 ──────────────────────────────────────────────────────────────────
  /**
   * 翻页模式：全书进度 = 章节基础进度 + 章内页级进度。
   *   chapterBase   = curChapter / totalChapters          （0 → 1）
   *   withinChapter = (chapterProgressPct / 100) / totalChapters
   */
  const paginateBookProgress = useMemo(() => {
    if (totalChapters <= 0) return 0
    const chapterBase = curChapter / totalChapters
    const withinChapter = chapterProgressPct / 100 / totalChapters
    return Math.round((chapterBase + withinChapter) * 100)
  }, [curChapter, totalChapters, chapterProgressPct])

  const displayedBookProgress =
    layout === "scroll" ? bookProgress : paginateBookProgress

  useEffect(() => {
    if (layout !== "paginate") return
    setChapterProgressPct(isChapterStartFromEnd ? 100 : 0)
  }, [curChapter, isChapterStartFromEnd, layout])

  // ── 进度拖动/跳转 ─────────────────────────────────────────────────────────
  const handlePaginatePageStateChange = useCallback(
    (pageIndex: number, pageCount: number) => {
      gotoPageInChapter(pageCount, pageIndex)
    },
    [gotoPageInChapter],
  )

  const seekPaginateChapterStart = useCallback(
    (idx: number) => {
      void gotoPage(idx, 0)
    },
    [gotoPage],
  )

  const handleBookProgressSeek = useReaderBookProgressSeek({
    readingLayout: layout,
    scrollContainerRef: scrollRef,
    paginateUnitCount: totalChapters,
    seekPaginate: seekPaginateChapterStart,
  })

  // ── 滚动模式：加载全书 ────────────────────────────────────────────────────
  useEffect(() => {
    if (layout !== "scroll") {
      setScrollChapters(null)
      setScrollLoadError(null)
      return
    }
    let cancelled = false
    setScrollChapters(null)
    setScrollLoadError(null)
    ;(async () => {
      try {
        const list: TextChapterData[] = []
        for (let i = 0; i < totalChapters; i++) {
          const d = await getChapter(i)
          if (cancelled) return
          if (d?.type === "text") list.push(d)
        }
        if (!cancelled) setScrollChapters(list)
      } catch (e) {
        if (!cancelled) setScrollLoadError(String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [layout, totalChapters, getChapter])

  useEffect(() => {
    if (layout !== "scroll") return
    if (scrollLoadError) {
      notifyInitialViewCommitted()
      return
    }
    if (scrollChapters !== null) {
      notifyInitialViewCommitted()
    }
  }, [layout, scrollChapters, scrollLoadError, notifyInitialViewCommitted])

  useEffect(() => {
    if (layout === "paginate") {
      setScrollFocusIndex(curChapter)
    }
  }, [curChapter, layout])

  useEffect(() => {
    if (layout !== "scroll") {
      hadScrollChaptersRef.current = false
      return
    }
    if (!scrollChapters?.length) return
    const firstPaint = !hadScrollChaptersRef.current
    hadScrollChaptersRef.current = true
    if (!firstPaint) return
    const t = window.requestAnimationFrame(() => {
      const root = scrollRef.current
      if (!root) return
      let anchor = paginateToScrollAnchorRef.current
      paginateToScrollAnchorRef.current = null
      if (!anchor) {
        const built = buildSaveBookAnchorMidSlice(bookFormat)
        anchor =
          built.charOffset != null
            ? built
            : fallbackBookAnchorFromFraction(
                curChapter,
                totalPagesInChapter > 1
                  ? curPageIndex / (totalPagesInChapter - 1)
                  : 0,
                scrollChapters.find((c) => c.index === curChapter),
              )
      }
      if (anchor) {
        scrollScrollContainerToBookAnchor(root, anchor)
      }
    })
    return () => window.cancelAnimationFrame(t)
  }, [
    layout,
    scrollChapters,
    curChapter,
    curPageIndex,
    totalPagesInChapter,
    buildSaveBookAnchorMidSlice,
    bookFormat,
  ])

  useEffect(() => {
    const prev = prevLayoutRef.current
    prevLayoutRef.current = layout
    if (prev !== "scroll" || layout !== "paginate") return
    if (syncScrollDebounceRef.current) {
      clearTimeout(syncScrollDebounceRef.current)
      syncScrollDebounceRef.current = null
    }
    const captured = scrollToPaginateAnchorRef.current
    scrollToPaginateAnchorRef.current = null
    const anchor: BookAnchor = captured ?? {
      chapterIndex: curChapter,
      charOffset: 0,
    }
    void applyCharOffsetResume(
      anchor.chapterIndex,
      Math.max(0, anchor.charOffset ?? 0),
    )
  }, [layout, applyCharOffsetResume, curChapter])

  // ── 目录 ──────────────────────────────────────────────────────────────────
  const tocEntries = useMemo(() => flattenTocToPanelEntries(toc), [toc])

  const onVisibleChapterChange = useCallback(
    (idx: number) => setScrollFocusIndex(idx),
    [],
  )

  const handleScrollAnchor = useCallback(
    (anchor: ReflowableScrollAnchor) => {
      pendingScrollAnchorRef.current = anchor
      setScrollFocusIndex(anchor.chapterIndex)
      if (syncScrollDebounceRef.current) {
        clearTimeout(syncScrollDebounceRef.current)
      }
      syncScrollDebounceRef.current = setTimeout(() => {
        syncScrollDebounceRef.current = null
        syncChapterIndexFromScroll(anchor.chapterIndex)
      }, 90)
    },
    [syncChapterIndexFromScroll],
  )

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={readerRootRef}
      data-reader-theme={reflow.settings.theme}
      className="relative flex size-full flex-col overflow-hidden bg-reader-bg text-reader-fg transition-[background,color] duration-300 ease-out"
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        {!readerReady && (
          <div
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-reader-bg px-4"
            role="status"
            aria-live="polite"
          >
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <div
                className="size-8 animate-spin rounded-full border-2 border-muted-foreground border-t-primary"
                aria-hidden
              />
              <p className="text-sm">正在加载版式与内容…</p>
            </div>
          </div>
        )}
        {layout === "paginate" && (
          <ReaderPaginateEdgeTurnStrips
            nearLeft={nearLeft}
            nearRight={nearRight}
            onPrev={() => handlePaginateTurn("prev")}
            onNext={() => handlePaginateTurn("next")}
            prevLabel="上一页"
            nextLabel="下一页"
          />
        )}
        {layout === "scroll" && scrollLoadError && (
          <main className="flex flex-1 items-center justify-center px-6 text-center text-sm text-destructive">
            {scrollLoadError}
          </main>
        )}
        {layout === "scroll" && !scrollLoadError && scrollChapters === null && (
          <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            正在加载全书…
          </main>
        )}
        {layout === "scroll" && scrollChapters && scrollChapters.length > 0 && (
          <ReflowableScrollContent
            chapters={scrollChapters}
            fontFamily={reflow.settings.fontFamily}
            fontSize={reflow.settings.fontSize}
            lineHeight={reflow.settings.lineHeight}
            paddingX={reflow.settings.paddingX}
            scrollContainerRef={scrollRef}
            onBookProgress={setBookProgress}
            onVisibleChapterChange={onVisibleChapterChange}
            onScrollAnchor={handleScrollAnchor}
          />
        )}
        {layout === "paginate" && (
          <ReflowableContent
            chapter={chapter}
            layout={applyLayout}
            fontFamily={reflow.settings.fontFamily}
            fontSize={reflow.settings.fontSize}
            lineHeight={reflow.settings.lineHeight}
            paddingX={reflow.settings.paddingX}
            pageOffset={curPageIndex}
            onProgressChange={setChapterProgressPct}
            onPageStateChange={handlePaginatePageStateChange}
            getPendingTextResumeBoundary={getPendingTextResumeBoundary}
            clearPendingTextResumeBoundary={clearPendingTextResumeBoundary}
          />
        )}
      </div>

      <ReaderTopBar
        visible={chromeVisible}
        bookTitle={bookTitle}
        chapterTitle={topChapterLine}
        bookmarked={bookmark.bookmarked}
        onToggleToc={panels.toggleToc}
        onToggleBookmark={bookmark.toggleBookmark}
        onToggleSettings={panels.toggleSettings}
      />

      <TtsPanel
        visible={tts.ttsActive && chromeVisible}
        playing={tts.ttsPlaying}
        speed={tts.ttsSpeed}
        configId={tts.ttsConfigId}
        onTogglePlay={handleTtsTogglePlay}
        onPrev={tts.ttsPrev}
        onNext={handleTtsNext}
        onSpeedChange={tts.setTtsSpeed}
        onConfigChange={tts.setTtsConfigId}
      />

      <ReflowableBottomBar
        visible={chromeVisible}
        currentChapter={curChapter + 1}
        totalChapters={totalChapters}
        bookProgress={displayedBookProgress}
        readingLayout={layout}
        onReadingLayoutChange={handleLayoutChange}
        onBookProgressSeek={handleBookProgressSeek}
        ttsActive={tts.ttsActive}
        onPrevChapter={handlePrevChapter}
        onNextChapter={handleNextChapter}
        onToggleTts={tts.toggleTts}
      />

      <ReaderPanelsBackdrop
        open={panels.tocOpen || panels.settingsOpen}
        onClose={panels.closePanels}
      />

      <ReflowableTocPanel
        visible={panels.tocOpen}
        entries={tocEntries}
        currentChapter={
          layout === "scroll" ? scrollFocusIndex + 1 : curChapter + 1
        }
        onSelectChapter={(num) => handleSelectChapter(num - 1)}
      />

      <ReflowableSettingsPanel
        visible={panels.settingsOpen}
        settings={reflow.settings}
        onThemeChange={reflow.setTheme}
        onSettingsChange={reflow.updateSettings}
      />
    </div>
  )
}

/**
 * 将树形目录展开为侧栏列表，保留层级缩进（depth）。
 * number 为 1-based 章节序号，与底栏 {@link ReflowableBottomBar} 一致。
 */
function flattenTocToPanelEntries(items: TocItem[], depth = 0): TocEntry[] {
  const out: TocEntry[] = []
  for (const t of items) {
    out.push({
      number: t.index + 1,
      title: t.label,
      depth,
    })
    if (t.subitems?.length)
      out.push(...flattenTocToPanelEntries(t.subitems, depth + 1))
  }
  return out
}
