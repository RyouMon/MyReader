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
import type { BookAnchor } from "my-reader-tools/progress/BookAnchor"
import { isMainWebviewWindow, openReaderInNewWindow } from "@/lib/readerWindow"
import { buildBookFileUrl, resolveReadFormat } from "my-reader-tools/rendition/utils"
import type { BookDetail } from "my-reader-tools/types/book"

export type ReadBookPageProps = {
  bookId: string
  formatFromSearch?: string
}

/**
 * Á?¨Á´?È??ËØªÁ™?Âè£Ôº?Â?†ËΩΩ‰π¶Á±çÊ??‰ª∂„?ÅÈ©±Â?® useBookReaderÔº?Âπ∂Â?®Â?∫ÂÆ?Á??Âºè‰∏?ÊµÅÂºèÈ??ËØªÂ?®‰π?È?¥Â??Êç¢„??
 */
export function ReadBookPage({ bookId, formatFromSearch }: ReadBookPageProps) {
  const navigate = useNavigate()
  const { activeLibraryId, loading: libraryLoading } = useLibrary()

  const [bookTitle, setBookTitle] = useState("")
  const [format, setFormat] = useState("")
  /** ‰∏?È??ËØªËø?Â∫¶‰∏?Âπ∂Â∞±Áª™Âê?Â?ç‰∫§Áª? `useBookReader`Ôº?ÈÅøÂ?çÂ??Ê∏≤Ê??Á¨¨ 1 Á´†Â?çÁª≠ËØªË∑≥ËΩ¨ */
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
          setFetchError("Ê?™È??Ê?©‰π¶Â∫?Ôº?ËØ∑Â??Â?®‰∏ªÁ™?Âè£È??Ê?©‰π¶Â∫?Âê?Â?çÈ??ËØª")
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
          setFetchError("ËØ•‰π¶Á±çÊ≤°Ê??ÂèØÈ??ËØªÁ??Ê†ºÂºèÔº?È??Ë¶Å EPUB„?ÅCBZ Ê?? PDFÔº?")
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
          console.error(
            `Failed to fetch book file. url: "${url}", http status: ${resp.status}`,
          )
          setFetchError(`Ê?†Ê≥?Â?†ËΩΩ‰π¶Á±çÊ??‰ª∂: HTTP ${resp.status}`)
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
        console.info(
          `Success to load book file for reading. format: "${fmt}", bytes: ${arrayBuffer.byteLength}, has initial anchor: ${Boolean(row?.anchor)}`,
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
    buffer: bookPayload?.buffer ?? null,
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
    return <ReadBookLoading message="Ê≠£Â?®Ê??Âº?È??ËØªÁ™?Âè£‚?¶" />
  }

  if (fetchError || reader.error) {
    return (
      <ReadBookError
        message={fetchError ?? reader.error ?? ""}
        actionLabel={isTauri() ? "Â?≥È?≠Á™?Âè£" : "Ëø?Â??‰π¶Á±çËØ¶Ê??"}
        onAction={handleErrorClose}
      />
    )
  }

  if (!reader.chapter) {
    return <ReadBookLoading message="Ê≠£Â?®Â?†ËΩΩ‰π¶Á±çÂ??ÂÆπ‚?¶" />
  }

  if (reader.layoutMode === "fixedLayout") {
    return <FixedLayoutReader bookTitle={bookTitle} reader={reader} />
  }

  return <ReflowableReader bookTitle={bookTitle} reader={reader} />
}

/**
 * Â?®Â±èÂ±?‰∏≠Â?†ËΩΩÊ?ÅÔº?‰∏?È??ËØªÂ?®Â?•Âè£Â?∂ÂÆ?Âç†‰Ωç‰∏?Ë?¥Ôº?Ë??Ê?Ø„?ÅËæπË∑ù„?ÅÂ≠?Âè∑Ôº?„??
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
 * Ê??‰ª∂Ê??Ëß£Ê?êÂ§±Ë¥•Ê?∂Á??Â?®Â±èÈ??ËØØÊ?Å„??
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
      <p className="font-medium text-destructive">Â?†ËΩΩÂ§±Ë¥•</p>
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
