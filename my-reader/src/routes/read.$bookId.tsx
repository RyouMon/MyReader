import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { invoke } from "@tauri-apps/api/core"
import { useCallback, useEffect, useState } from "react"

import { ComicReader } from "@/components/reader/ComicReader"
import { TextReader } from "@/components/reader/TextReader"
import { useBookReader } from "@/components/reader/useReader"
import { useLibrary } from "@/contexts/LibraryContext"
import type { TextChapterData } from "@/lib/rendition"
import { buildBookFileUrl, resolveReadFormat } from "@/lib/rendition/utils"
import type { BookDetail } from "@/types/book"

export const Route = createFileRoute("/read/$bookId")({
  validateSearch: (search: Record<string, unknown>): { format?: string } => {
    const raw = search.format
    if (typeof raw !== "string") return {}
    const t = raw.trim()
    if (!t) return {}
    return { format: t.toUpperCase() }
  },
  component: ReadPage,
})

function ReadPage() {
  const { bookId } = useParams({ from: "/read/$bookId" })
  const { format: formatFromSearch } = Route.useSearch()
  const navigate = useNavigate()
  const { activeLibraryId } = useLibrary()

  const [bookTitle, setBookTitle] = useState("")
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)
  const [format, setFormat] = useState("")
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const detail = await invoke<BookDetail>("get_book_detail", {
          libraryId: activeLibraryId,
          bookId: Number(bookId),
        })
        if (cancelled) return

        setBookTitle(detail.title)

        const fmt = resolveReadFormat(detail.formats, formatFromSearch)
        if (!fmt) {
          setFetchError("该书籍没有可阅读的格式（需要 EPUB、CBZ 或 PDF）")
          return
        }
        setFormat(fmt)

        const url = buildBookFileUrl(activeLibraryId!, Number(bookId), fmt)
        const resp = await fetch(url)
        if (!resp.ok) {
          setFetchError(`无法加载书籍文件: HTTP ${resp.status}`)
          return
        }
        if (cancelled) return
        setBuffer(await resp.arrayBuffer())
      } catch (e) {
        if (!cancelled) setFetchError(String(e))
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [bookId, activeLibraryId, formatFromSearch])

  const reader = useBookReader({ buffer, format })

  const handleBack = useCallback(() => {
    navigate({ to: "/book/$bookId", params: { bookId } })
  }, [navigate, bookId])

  if (fetchError || reader.error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background text-center">
        <p className="text-base font-medium text-destructive">加载失败</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {fetchError || reader.error}
        </p>
        <button
          type="button"
          onClick={handleBack}
          className="mt-2 text-sm text-primary hover:underline"
        >
          返回书籍详情
        </button>
      </div>
    )
  }

  if (!reader.ready || !reader.chapter) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="size-8 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
          <p className="text-sm">正在加载书籍内容…</p>
        </div>
      </div>
    )
  }

  if (reader.contentType === "image") {
    return (
      <ComicReader
        bookTitle={bookTitle}
        format={format}
        reader={reader}
        onBack={handleBack}
      />
    )
  }

  const textChapter = reader.chapter as TextChapterData

  return (
    <TextReader
      bookTitle={bookTitle}
      chapter={textChapter}
      toc={reader.toc}
      totalChapters={reader.totalChapters}
      curChapter={reader.curChapter}
      curPageIndex={reader.curPageIndex}
      isChapterStartFromEnd={reader.isChapterStartFromEnd}
      applyLayout={reader.layout}
      getChapter={reader.getChapter}
      gotoPage={reader.gotoPage}
      gotoNextPage={reader.gotoNextPage}
      gotoPrevPage={reader.gotoPrevPage}
      gotoPageInChapter={reader.gotoPageInChapter}
      onBack={handleBack}
    />
  )
}
