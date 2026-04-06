import { invoke, isTauri } from "@tauri-apps/api/core"
import { useEffect, useRef } from "react"

import type { UseReaderReturn } from "./useReader"
import type { BookAnchor } from "@/lib/progress/BookAnchor"

const SAVE_DEBOUNCE_MS = 1600

function summarizeAnchor(a: BookAnchor): Record<string, unknown> {
  return {
    chapterIndex: a.chapterIndex,
    charOffset: a.charOffset ?? null,
    hasSnippet: Boolean(a.textSnippet),
    hasSnippetAfter: Boolean(a.textSnippetAfter),
  }
}

export interface ReadingProgressDto {
  libraryId: string
  bookId: number
  format: string
  anchor: BookAnchor
  updatedAt: number
}

/**
 * MyReader 本地库 `my-reader.db`（表 `reading_progress`）：防抖写回当前 `BookAnchor`。
 * 续读由打开书时的 `initialOpenAnchor` + `BookReader.init` 完成，不在此 hook 内拉进度。
 * 主键为书库 id + 书籍 id + 格式（由后端与存储层保证）。
 */
export function useReadingProgressSync(params: {
  enabled: boolean
  libraryId: string | null
  bookId: number
  format: string
  reader: Pick<UseReaderReturn, "ready" | "buildSaveBookAnchor">
}): void {
  const { enabled, libraryId, bookId, format, reader } = params
  const saveSeqRef = useRef(0)

  useEffect(() => {
    if (!isTauri() || !enabled || !libraryId || !reader.ready) return

    const seq = ++saveSeqRef.current
    const t = window.setTimeout(() => {
      if (saveSeqRef.current !== seq) return
      void (async () => {
        try {
          const anchor = reader.buildSaveBookAnchor(format)
          console.info(
            `Start to save reading progress (debounced). library id: "${libraryId}", book id: ${bookId}, format: "${format}", anchor summary:`,
            summarizeAnchor(anchor),
          )
          await invoke("set_reading_progress", {
            libraryId,
            bookId,
            format,
            anchor,
          })
          console.info(
            `Success to save reading progress. library id: "${libraryId}", book id: ${bookId}, format: "${format}"`,
          )
        } catch (e) {
          console.error(
            `Failed to save reading progress. library id: "${libraryId}", book id: ${bookId}, format: "${format}", error:`,
            e,
          )
        }
      })()
    }, SAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(t)
  }, [enabled, libraryId, bookId, format, reader.ready, reader.buildSaveBookAnchor])
}
