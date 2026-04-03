import { useCallback, useEffect, useRef, useState } from "react"

import { BookReader } from "../../lib/rendition/BookReader"
import type { TextChapterPaginationResult } from "../../lib/rendition/types"
import type {
  ChapterData,
  ContentType,
  LayoutConfig,
  TocItem,
} from "../../lib/rendition/types"

export interface UseReaderOptions {
  /** Raw book file bytes — pass `null` while still loading. */
  buffer: ArrayBuffer | null
  /** Book format, e.g. `"EPUB"`, `"CBZ"`, `"PDF"`. */
  format: string
}

export interface UseReaderReturn {
  /** `true` after the book has been parsed and the first chapter is loaded. */
  ready: boolean
  /** Human-readable error, if any. */
  error: string | null
  /** `true` while a chapter is being fetched. */
  loading: boolean

  /** Whether the content is text-based or image-based. */
  contentType: ContentType
  /** Same as the `format` passed to {@link useBookReader}, e.g. `"EPUB"` / `"CBZ"`. */
  format: string
  toc: TocItem[]
  totalChapters: number

  /** 当前章节下标（0-based），与架构文档 curChapter 一致 */
  curChapter: number
  /** 当前章完整数据（文本或图页） */
  chapter: ChapterData | null
  /** 当前章内页偏移（0-based），与 BookReader.curPage.index 一致 */
  curPageIndex: number
  isChapterStartFromEnd: boolean

  gotoChapter: (index: number) => void
  gotoPage: (chapter: number, pageOffset: number) => Promise<void>
  gotoNextPage: () => Promise<void>
  gotoPrevPage: () => Promise<void>
  gotoPageInChapter: (totalPages: number, pageOffset: number) => void
  layout: (
    config: LayoutConfig,
    measureHost: HTMLDivElement,
  ) => Promise<TextChapterPaginationResult | undefined>
  getChapter: (index: number) => Promise<ChapterData | null>
}

/**
 * React hook that wraps {@link BookReader}.
 *
 * Inspired by TanStack Table's `useReactTable` — this hook owns the
 * headless reader instance and exposes reactive state + actions.
 */
export function useBookReader({
  buffer,
  format,
}: UseReaderOptions): UseReaderReturn {
  const coreRef = useRef<BookReader | null>(null)
  const mountedRef = useRef(true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [contentType, setContentType] = useState<ContentType>("text")
  const [toc, setToc] = useState<TocItem[]>([])
  const [totalChapters, setTotalChapters] = useState(0)
  const [curChapter, setCurChapter] = useState(0)
  const [chapter, setChapter] = useState<ChapterData | null>(null)
  const [curPageIndex, setCurPageIndex] = useState(0)
  const [isChapterStartFromEnd, setIsChapterStartFromEnd] = useState(false)

  const syncNavigationState = useCallback((core: BookReader) => {
    setCurChapter(core.curChapter)
    setCurPageIndex(core.curPage.index)
    setIsChapterStartFromEnd(core.chapterStartFromEnd)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!buffer) return

    const core = new BookReader()
    coreRef.current = core
    let cancelled = false

    async function init() {
      try {
        setLoading(true)
        setError(null)

        const book = await core.init(buffer!, format)
        if (cancelled) return

        setContentType(book.contentType)
        setToc(book.toc)
        setTotalChapters(book.chapters.length)

        const ch = await core.getChapter(0)
        if (cancelled) return

        setChapter(ch)
        syncNavigationState(core)
        setReady(true)
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()

    return () => {
      cancelled = true
      core.destroy()
      coreRef.current = null
      setReady(false)
      setChapter(null)
      setTotalChapters(0)
    }
  }, [buffer, format, syncNavigationState])

  const gotoChapter = useCallback(
    async (index: number) => {
      const core = coreRef.current
      if (!core?.ready) return

      setLoading(true)
      try {
        core.gotoChapter(index)
        const ch = await core.getChapter(index)
        setChapter(ch)
        syncNavigationState(core)
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    },
    [syncNavigationState],
  )

  const gotoPage = useCallback(
    async (chapterIndex: number, pageOffset: number) => {
      const core = coreRef.current
      if (!core?.ready) return
      setLoading(true)
      try {
        const ch = await core.gotoPage(chapterIndex, pageOffset)
        setChapter(ch)
        syncNavigationState(core)
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    },
    [syncNavigationState],
  )

  const gotoNextPage = useCallback(async () => {
    const core = coreRef.current
    if (!core?.ready) return
    setLoading(true)
    try {
      const ch = await core.gotoNextPage()
      if (ch) {
        setChapter(ch)
        syncNavigationState(core)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [syncNavigationState])

  const gotoPrevPage = useCallback(async () => {
    const core = coreRef.current
    if (!core?.ready) return
    setLoading(true)
    try {
      const ch = await core.gotoPrevPage()
      if (ch) {
        setChapter(ch)
        syncNavigationState(core)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [syncNavigationState])

  const gotoPageInChapter = useCallback(
    (totalPages: number, pageOffset: number) => {
      const core = coreRef.current
      if (!core?.ready) return
      core.gotoPageInChapter(totalPages, pageOffset)
      syncNavigationState(core)
    },
    [syncNavigationState],
  )

  const layout = useCallback(
    async (config: LayoutConfig, measureHost: HTMLDivElement) => {
      const core = coreRef.current
      if (!core?.ready) return undefined
      const result = await core.layout(config, measureHost)
      if (!mountedRef.current || coreRef.current !== core || !core.ready) {
        return undefined
      }
      syncNavigationState(core)
      return result
    },
    [syncNavigationState],
  )

  const getChapter = useCallback(
    async (index: number): Promise<ChapterData | null> => {
      const core = coreRef.current
      if (!core?.ready) return null
      return core.getChapter(index)
    },
    [],
  )

  return {
    ready,
    error,
    loading,
    contentType,
    format,
    toc,
    totalChapters,
    curChapter,
    chapter,
    curPageIndex,
    isChapterStartFromEnd,
    gotoChapter,
    gotoPage,
    gotoNextPage,
    gotoPrevPage,
    gotoPageInChapter,
    layout,
    getChapter,
  }
}
