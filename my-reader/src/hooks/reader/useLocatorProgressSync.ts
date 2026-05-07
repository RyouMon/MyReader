import { invoke, isTauri } from "@tauri-apps/api/core"
import { useEffect, useRef } from "react"
import type { Locator } from "@readium/shared"
import { locatorToJson } from "@/lib/readium/locator"

const SAVE_DEBOUNCE_MS = 1600

export interface ReadingProgressDto {
  libraryId: string
  bookId: number
  format: string
  locator: Record<string, unknown>
  updatedAt: number
}

export function useLocatorProgressSync(params: {
  enabled: boolean
  libraryId: string | null
  bookId: number
  format: string
  currentLocator: Locator | null
}): void {
  const { enabled, libraryId, bookId, format, currentLocator } = params
  const saveSeqRef = useRef(0)
  const locatorRef = useRef(currentLocator)
  locatorRef.current = currentLocator

  const locatorKey = currentLocator
    ? JSON.stringify(locatorToJson(currentLocator))
    : ""

  useEffect(() => {
    if (!isTauri() || !enabled || !libraryId || !locatorKey) return

    const seq = ++saveSeqRef.current
    const t = window.setTimeout(() => {
      if (saveSeqRef.current !== seq) return
      const loc = locatorRef.current
      if (!loc) return
      invoke("set_reading_progress", {
        libraryId,
        bookId,
        format,
        locator: locatorToJson(loc),
      }).catch((e: unknown) => {
        console.error("[useLocatorProgressSync] save failed:", e)
      })
    }, SAVE_DEBOUNCE_MS)

    return () => window.clearTimeout(t)
  }, [enabled, libraryId, bookId, format, locatorKey])
}
