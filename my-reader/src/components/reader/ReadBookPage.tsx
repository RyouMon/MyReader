import { useNavigate } from "@tanstack/react-router"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useCallback, useEffect, useMemo, useState } from "react"

import { FixedLayoutReader } from "@/components/reader/fixed-layout/FixedLayoutReader"
import { ReflowableReader } from "@/components/reader/reflowable/ReflowableReader"
import { useLibrary } from "@/stores/libraryStore"
import {
  type ReadingProgressDto,
  useReadingProgressSync,
} from "@/hooks/reader/useReadingProgressSync"
import { useBookReader } from "@/hooks/reader/useReader"
import type { BookAnchor } from "@/lib/progress/BookAnchor"
import { isMainWebviewWindow, openReaderInNewWindow } from "@/lib/readerWindow"
import { buildBookFileUrl, resolveReadFormat } from "@/lib/rendition/utils"
import type { BookDetail } from "@/types/book"

export type ReadBookPageProps = {
  bookId: string
  formatFromSearch?: string
}

/**
 * 独立阅读窗口：加载书籍文件、驱动 useBookReader，并在固定版式与流式阅读器之间切换。
 */
export function ReadBookPage({ bookId, formatFromSearch }: ReadBookPageProps) {
  const navigate = useNavigate()
  const { activeLibraryId, loading: libraryLoading } = useLibrary()

  const [bookTitle, setBookTitle] = useState("")
  const [format, setFormat] = useState("")
  /** 与阅读进度一并就绪后再交给 `useBookReader`，避免先渲染第 1 章再续读跳转 */
  const [bookPayload, setBookPayload] = useState<{
    buffer: ArrayBuffer
    initialOpenAnchor: BookAnchor | null
  } | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const mainHandoff = useMemo(() => isMainWebviewWindow(), [])

  useEffect(() => {
    if (!mainHandoff) return
    let cancelled = false
    void (async () => {
      await openReaderInNewWindow(bookId, formatFromSearch)
      if (cancelled) return
      navigate({ to: "/book/$bookId", params: { bookId } })
    })()
    return () => {
      cancelled = true
    }
  }, [mainHandoff, bookId, formatFromSearch, navigate])

  useEffect(() => {
    if (mainHandoff) return
    let cancelled = false

    async function load() {
      if (libraryLoading) return
      if (!activeLibraryId) {
        if (!cancelled) {
          setFetchError("未选择书库，请先在主窗口选择书库后再阅读")
        }
        return
      }
      setBookPayload(null)
      try {
        const detail = await invoke<BookDetail>("get_book_detail", {
          libraryId: activeLibraryId,
          bookId: Number(bookId),
        })
        if (cancelled) return

        setBookTitle(detail.title)
        if (isTauri()) {
          void WebviewWindow.getCurrent().setTitle(detail.title)
        }

        const fmt = resolveReadFormat(detail.formats, formatFromSearch)
        if (!fmt) {
          setFetchError("该书籍没有可阅读的格式（需要 EPUB、CBZ 或 PDF）")
          return
        }
        setFormat(fmt)

        const url = buildBookFileUrl(activeLibraryId, Number(bookId), fmt)
        const progressP: Promise<ReadingProgressDto | null> =
          isTauri() && activeLibraryId
            ? invoke<ReadingProgressDto | null>("get_reading_progress", {
                libraryId: activeLibraryId,
                bookId: Number(bookId),
                format: fmt,
              }).catch(() => null)
            : Promise.resolve(null)

        const resp = await fetch(url)
        if (!resp.ok) {
          setFetchError(`无法加载书籍文件: HTTP ${resp.status}`)
          return
        }
        if (cancelled) return

        const [row, arrayBuffer] = await Promise.all([
          progressP,
          resp.arrayBuffer(),
        ])
        if (cancelled) return

        setBookPayload({
          buffer: arrayBuffer,
          initialOpenAnchor: row?.anchor ?? null,
        })
      } catch (e) {
        if (!cancelled) setFetchError(String(e))
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [bookId, activeLibraryId, formatFromSearch, mainHandoff, libraryLoading])

  const reader = useBookReader({
    buffer: bookPayload?.buffer ?? null,
    format,
    initialOpenAnchor: bookPayload?.initialOpenAnchor ?? null,
  })

  useReadingProgressSync({
    openBookKey: `${activeLibraryId ?? ""}:${bookId}:${format}`,
    enabled:
      isTauri() &&
      !mainHandoff &&
      Boolean(activeLibraryId && format && bookPayload),
    resumeHandledAtReaderOpen: Boolean(bookPayload),
    libraryId: activeLibraryId,
    bookId: Number(bookId),
    format,
    reader,
  })

  const handleErrorClose = useCallback(() => {
    if (isTauri()) {
      void getCurrentWindow().close()
    } else {
      navigate({ to: "/book/$bookId", params: { bookId } })
    }
  }, [navigate, bookId])

  if (mainHandoff) {
    return <ReadBookLoading message="正在打开阅读窗口…" />
  }

  if (fetchError || reader.error) {
    return (
      <ReadBookError
        message={fetchError ?? reader.error ?? ""}
        actionLabel={isTauri() ? "关闭窗口" : "返回书籍详情"}
        onAction={handleErrorClose}
      />
    )
  }

  if (!reader.chapter) {
    return <ReadBookLoading message="正在加载书籍内容…" />
  }

  if (reader.layoutMode === "fixedLayout") {
    return <FixedLayoutReader bookTitle={bookTitle} reader={reader} />
  }

  return <ReflowableReader bookTitle={bookTitle} reader={reader} />
}

/**
 * 全屏居中加载态，与阅读器入口其它占位一致（背景、边距、字号）。
 */
function ReadBookLoading({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-4">
      <div
        className="flex flex-col items-center gap-3 text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <div
          className="size-8 animate-spin rounded-full border-2 border-muted-foreground border-t-primary"
          aria-hidden
        />
        <p className="text-sm">{message}</p>
      </div>
    </div>
  )
}

/**
 * 文件或解析失败时的全屏错误态。
 */
function ReadBookError({
  message,
  actionLabel,
  onAction,
}: {
  message: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-background px-4 text-center">
      <p className="font-medium text-destructive">加载失败</p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-2 text-sm text-primary underline-offset-4 hover:underline"
      >
        {actionLabel}
      </button>
    </div>
  )
}
