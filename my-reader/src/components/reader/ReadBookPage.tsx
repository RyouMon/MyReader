import { FixedLayoutReader } from "@/components/reader/fixed-layout/FixedLayoutReader"
import { ReflowableReader } from "@/components/reader/reflowable/ReflowableReader"
import {
  type ReadingProgressDto,
  useReadingProgressSync,
} from "@/hooks/reader/useReadingProgressSync"
import { isMainWebviewWindow, openReaderInNewWindow } from "@/lib/readerWindow"
import { useLibrary } from "@/stores/libraryStore"
import { useNavigate } from "@tanstack/react-router"
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core"
import { WebviewWindow } from "@tauri-apps/api/webviewWindow"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { useBookReader } from "my-reader-tools/hooks/useReader"
import type { BookAnchor } from "my-reader-tools/progress/BookAnchor"
import {
  resolveReadFormat,
} from "my-reader-tools/utils"
import type { BookDetail } from "my-reader-tools/types/book"
import { useCallback, useEffect, useMemo, useState } from "react"

export type ReadBookPageProps = {
  bookId: string
  formatFromSearch?: string
}

/**
 * �?��?�??读�?口�?�?�载书籍�??件�?�驱�?� useBookReader�?并�?��?��?�??式�?流式�??读�?��?�?��??换�??
 */
export function ReadBookPage({ bookId, formatFromSearch }: ReadBookPageProps) {
  const navigate = useNavigate()
  const { activeLibraryId, loading: libraryLoading } = useLibrary()

  const [bookTitle, setBookTitle] = useState("")
  const [format, setFormat] = useState("")
  /** �?�??读�?度�?并就绪�?�?�交�? `useBookReader`�?避�?��??渲�??第 1 章�?�续读跳转 */
  const [bookPayload, setBookPayload] = useState<{
    source: {
      filePath: string
      extractedDirPath?: string
      extractedEntries?: string[]
    }
    initialOpenAnchor: BookAnchor | null
  } | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const mainHandoff = useMemo(() => isMainWebviewWindow(), [])

  useEffect(() => {
    if (!mainHandoff) return
    let cancelled = false
    void (async () => {
      console.info(
        `Start to open dedicated reader window from main route. book id: "${bookId}", format from search: "${formatFromSearch ?? ""}"`,
      )
      try {
        await openReaderInNewWindow(bookId, formatFromSearch)
        if (cancelled) return
        console.info(
          `Success to open dedicated reader window from main route. book id: "${bookId}"`,
        )
        navigate({ to: "/book/$bookId", params: { bookId } })
      } catch (e) {
        console.error(
          `Failed to open dedicated reader window from main route. book id: "${bookId}", error:`,
          e,
        )
      }
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
          console.error(
            `Failed to load book for reading. reason: no active library, book id: "${bookId}"`,
          )
          setFetchError("�?��??�?�书�?�?请�??�?�主�?口�??�?�书�?�?�?��??读")
        }
        return
      }
      setBookPayload(null)
      console.info(
        `Start to load book for reading. book id: "${bookId}", library id: "${activeLibraryId}", format hint: "${formatFromSearch ?? ""}"`,
      )
      try {
        const detail = await invoke<BookDetail>("get_book_detail", {
          libraryId: activeLibraryId,
          bookId: Number(bookId),
        })
        if (cancelled) return

        console.info(
          `Success to load book detail for reading. book id: ${detail.id}, title: "${detail.title}"`,
        )
        setBookTitle(detail.title)
        if (isTauri()) {
          void WebviewWindow.getCurrent().setTitle(detail.title)
        }

        const fmt = resolveReadFormat(detail.formats, formatFromSearch)
        if (!fmt) {
          console.error(
            `Failed to load book for reading. reason: no supported format, book id: "${bookId}", formats: "${detail.formats.join(", ")}"`,
          )
          setFetchError("该书籍没�??可�??读�??格式�?�??要 EPUB�?�CBZ �?? PDF�?")
          return
        }
        setFormat(fmt)

        const progressP: Promise<ReadingProgressDto | null> =
          isTauri() && activeLibraryId
            ? invoke<ReadingProgressDto | null>("get_reading_progress", {
                libraryId: activeLibraryId,
                bookId: Number(bookId),
                format: fmt,
              }).catch(() => null)
            : Promise.resolve(null)

        const [row, preparedSource] = await Promise.all([
          progressP,
          invoke<{
            format: string
            filePath: string
            extractedDirPath: string | null
            extractedEntries: string[]
          }>("prepare_book_source", {
            libraryId: activeLibraryId,
            bookId: Number(bookId),
            format: fmt,
          }),
        ])
        if (cancelled) return

        const source = {
          filePath: convertFileSrc(preparedSource.filePath),
          extractedDirPath: preparedSource.extractedDirPath
            ? convertFileSrc(preparedSource.extractedDirPath)
            : undefined,
          extractedEntries: preparedSource.extractedEntries ?? [],
        }
        setBookPayload({
          source,
          initialOpenAnchor: row?.anchor ?? null,
        })
        console.info(
          `Success to prepare book file source for reading. format: "${fmt}", extracted entries: ${source.extractedEntries.length}, has initial anchor: ${Boolean(row?.anchor)}`,
        )
      } catch (e) {
        if (!cancelled) {
          console.error(
            `Failed to load book for reading. book id: "${bookId}", library id: "${activeLibraryId}", error:`,
            e,
          )
          setFetchError(String(e))
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [bookId, activeLibraryId, formatFromSearch, mainHandoff, libraryLoading])

  const reader = useBookReader({
    source: bookPayload?.source ?? null,
    format,
    initialOpenAnchor: bookPayload?.initialOpenAnchor ?? null,
  })

  useReadingProgressSync({
    enabled:
      isTauri() &&
      !mainHandoff &&
      Boolean(activeLibraryId && format && bookPayload),
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
    return <ReadBookLoading message="正�?��??�?�??读�?口�?�" />
  }

  if (fetchError || reader.error) {
    return (
      <ReadBookError
        message={fetchError ?? reader.error ?? ""}
        actionLabel={isTauri() ? "�?��?��?口" : "�?�??书籍详�??"}
        onAction={handleErrorClose}
      />
    )
  }

  if (!reader.chapter) {
    return <ReadBookLoading message="正�?��?�载书籍�??容�?�" />
  }

  if (reader.layoutMode === "fixedLayout") {
    return <FixedLayoutReader bookTitle={bookTitle} reader={reader} />
  }

  return <ReflowableReader bookTitle={bookTitle} reader={reader} />
}

/**
 * �?�屏�?中�?�载�?��?�?�??读�?��?�口�?��?占位�?�?��?�??�?��?�边距�?��?号�?�??
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
 * �??件�??解�?�失败�?��??�?�屏�??误�?��??
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
      <p className="font-medium text-destructive">�?�载失败</p>
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
