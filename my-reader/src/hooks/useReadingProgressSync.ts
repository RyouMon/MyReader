import { invoke, isTauri } from "@tauri-apps/api/core"
import { useEffect, useRef, useState } from "react"

import type { UseReaderReturn } from "@/components/reader/useReader"
import type { BookAnchor } from "@/lib/progress/BookAnchor"

const SAVE_DEBOUNCE_MS = 1600

const LOG_NS = "[MyReader][readingProgress]"

function logProgress(message: string, data?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return
  if (data !== undefined) {
    console.debug(LOG_NS, message, data)
  } else {
    console.debug(LOG_NS, message)
  }
}

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
 * MyReader 本地库 `my-reader.db`（表 `reading_progress`）：按 BookAnchor 恢复，防抖写回。
 * 主键为书库 id + 书籍 id + 格式（由后端与存储层保证）。
 */
export function useReadingProgressSync(params: {
  openBookKey: string
  enabled: boolean
  /** 为 true 时续读已在 `BookReader.init` + 打开流程中完成，不再调用 `get_reading_progress` 跳转 */
  resumeHandledAtReaderOpen: boolean
  libraryId: string | null
  bookId: number
  format: string
  reader: Pick<
    UseReaderReturn,
    | "ready"
    | "curChapter"
    | "curPageIndex"
    | "totalChapters"
    | "contentType"
    | "applyReadingResume"
    | "applyCharOffsetResume"
    | "buildSaveBookAnchor"
  >
}): void {
  const {
    openBookKey,
    enabled,
    resumeHandledAtReaderOpen,
    libraryId,
    bookId,
    format,
    reader,
  } = params
  const resumeAppliedRef = useRef(false)
  const saveSeqRef = useRef(0)
  const [resumeGateOpen, setResumeGateOpen] = useState(() => !isTauri())
  const readerRef = useRef(reader)
  readerRef.current = reader

  // biome-ignore lint/correctness/useExhaustiveDependencies: openBookKey 在同 enabled 下换书时仍需重置续读门闸
  useEffect(() => {
    resumeAppliedRef.current = false
    setResumeGateOpen(!isTauri() || !enabled || resumeHandledAtReaderOpen)
  }, [openBookKey, enabled, resumeHandledAtReaderOpen])

  // 续读仅在 reader.ready 时跑一轮；章数/类型/回调经 readerRef 读取，避免依赖抖动取消 in-flight 后 finally 不执行导致 resumeGateOpen 一直为 false
  useEffect(() => {
    if (resumeHandledAtReaderOpen) return
    if (!isTauri() || !enabled || !libraryId || !reader.ready) return
    if (resumeAppliedRef.current) return
    let cancelled = false
    void (async () => {
      const r = readerRef.current
      try {
        logProgress("resume: invoking get_reading_progress", {
          libraryId,
          bookId,
          format,
        })
        const row = await invoke<ReadingProgressDto | null>(
          "get_reading_progress",
          {
            libraryId,
            bookId,
            format,
          },
        )
        if (cancelled) return
        if (!row?.anchor) {
          logProgress("resume: no stored anchor", { libraryId, bookId, format })
        } else {
          logProgress("resume: loaded anchor", {
            ...summarizeAnchor(row.anchor),
            updatedAt: row.updatedAt,
          })
          const ch = Math.min(
            Math.max(0, Math.floor(row.anchor.chapterIndex)),
            Math.max(0, r.totalChapters - 1),
          )
          if (
            r.contentType === "text" &&
            row.anchor.charOffset != null &&
            Number.isFinite(row.anchor.charOffset)
          ) {
            const co = Math.max(0, Math.floor(row.anchor.charOffset))
            logProgress("resume: trying charOffset (UTF-16 in chapter body)", {
              chapterIndex: ch,
              charOffset: co,
            })
            const ok = await r.applyCharOffsetResume(ch, co)
            if (ok) {
              logProgress("resume: charOffset succeeded")
              resumeAppliedRef.current = true
              return
            }
            logProgress(
              "resume: charOffset failed, fallback applyReadingResume (chapter start)",
            )
          }
          logProgress("resume: applyReadingResume", { chapterIndex: ch })
          resumeAppliedRef.current = true
          await r.applyReadingResume(ch)
          logProgress("resume: applyReadingResume done")
        }
      } catch (e) {
        logProgress("resume: error", { error: String(e) })
      } finally {
        if (!cancelled) setResumeGateOpen(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    enabled,
    libraryId,
    bookId,
    format,
    reader.ready,
    resumeHandledAtReaderOpen,
  ])

  useEffect(() => {
    if (
      !isTauri() ||
      !enabled ||
      !libraryId ||
      !reader.ready ||
      !resumeGateOpen
    )
      return

    const seq = ++saveSeqRef.current
    const t = window.setTimeout(() => {
      if (saveSeqRef.current !== seq) return
      void (async () => {
        try {
          const anchor = reader.buildSaveBookAnchor(format)
          logProgress("save: debounced set_reading_progress", {
            libraryId,
            bookId,
            format,
            anchor: summarizeAnchor(anchor),
          })
          await invoke("set_reading_progress", {
            libraryId,
            bookId,
            format,
            anchor,
          })
          logProgress("save: succeeded")
        } catch (e) {
          logProgress("save: failed", { error: String(e) })
        }
      })()
    }, SAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(t)
  }, [
    enabled,
    libraryId,
    bookId,
    format,
    reader.ready,
    reader.buildSaveBookAnchor,
    resumeGateOpen,
  ])
}
