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
import type { TextChapterData, TocItem } from "@/lib/rendition"
import type { ReaderSurfaceProps, TocEntry } from "../types"
import { ReflowableBottomBar } from "./ReflowableBottomBar"
import { ReflowableContent } from "./ReflowableContent"
import { ReflowableScrollContent } from "./ReflowableScrollContent"
import { ReflowableSettingsPanel } from "./ReflowableSettingsPanel"
import { ReflowableTocPanel } from "./ReflowableTocPanel"
import { TtsPanel } from "./TtsPanel"

export function ReflowableReader({ bookTitle, reader }: ReaderSurfaceProps) {
  const chapter = reader.chapter as TextChapterData
  const {
    toc,
    totalChapters,
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

  const layout = reflow.settings.readingLayout
  const prevLayoutRef = useRef<typeof layout | null>(null)

  const { nearLeft, nearRight } = useReaderPaginateEdgeTurn(
    layout === "paginate",
    readerRootRef,
  )

  const topChapterLine = useMemo(() => chapter.title, [chapter.title])

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
      reflow.updateSettings({ readingLayout: l })
    },
    [reflow],
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

  // 切章/切布局时将章内进度重置为起始端，避免短暂显示旧章进度。
  // 起始端由 Reader 控制器提供。
  useEffect(() => {
    if (layout !== "paginate") return
    setChapterProgressPct(isChapterStartFromEnd ? 100 : 0)
  }, [layout, isChapterStartFromEnd])

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

  // ── 滚动模式：同步焦点章节 ───────────────────────────────────────────────
  const scrollFocusIndexRef = useRef(scrollFocusIndex)
  scrollFocusIndexRef.current = scrollFocusIndex

  useEffect(() => {
    if (layout !== "scroll") return
    setScrollFocusIndex(curChapter)
  }, [curChapter, layout])

  const scrollToChapterStart = useCallback((chapterIndex: number) => {
    const root = scrollRef.current
    if (!root) return
    const el = root.querySelector<HTMLElement>(
      `[data-chapter-index="${chapterIndex}"]`,
    )
    el?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  useEffect(() => {
    if (layout !== "scroll" || !scrollChapters?.length) return
    const t = window.requestAnimationFrame(() =>
      scrollToChapterStart(curChapter),
    )
    return () => window.cancelAnimationFrame(t)
  }, [layout, scrollChapters, curChapter, scrollToChapterStart])

  // ── 滚动 → 翻页切换时保留焦点章节 ──────────────────────────────────────
  useEffect(() => {
    const prev = prevLayoutRef.current
    prevLayoutRef.current = layout
    if (prev === "scroll" && layout === "paginate") {
      const target = scrollFocusIndexRef.current
      if (target !== curChapter) {
        void gotoPage(target, 0)
      }
    }
  }, [layout, curChapter, gotoPage])

  // ── 目录 ──────────────────────────────────────────────────────────────────
  const tocEntries = useMemo(() => flattenTocToPanelEntries(toc), [toc])

  const onVisibleChapterChange = useCallback(
    (idx: number) => setScrollFocusIndex(idx),
    [],
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
