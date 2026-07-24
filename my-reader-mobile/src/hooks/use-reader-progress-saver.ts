import type { Locator } from "@my-reader/readium"
import { hrefRoughlyMatches } from "@my-reader/tools/reader-toc"
import { useEffect, useRef } from "react"

import { displayProgressionForPosition } from "@/src/domain/library/display-progression"
import { setReadingProgress } from "@/src/domain/library/reading-progress"
import type { Library } from "@/src/domain/types"
import type { ReaderState } from "@/src/features/reader/components/reader/types"
import { queryClient } from "@/src/services/query/query-client"
import { queryKeys } from "@/src/services/query/query-keys"
import { useAppStore } from "@/src/store/app-store"

const SAVE_DEBOUNCE_MS = 1600

type ReaderPositionSnapshot = {
  href: string
  position?: number
  progression?: number
  totalProgression?: number
  currentPage: number
}

function snapshotReaderPosition(
  locator: Locator,
  currentPage: number,
): ReaderPositionSnapshot {
  return {
    href: locator.href,
    position: locator.locations?.position,
    progression: locator.locations?.progression,
    totalProgression: locator.locations?.totalProgression,
    currentPage,
  }
}

function isSameNumber(left?: number, right?: number): boolean {
  return (
    typeof left === "number" &&
    typeof right === "number" &&
    Math.abs(left - right) <= 0.000001
  )
}

function isSameReaderPosition(
  initial: ReaderPositionSnapshot,
  locator: Locator,
  currentPage: number,
): boolean {
  if (initial.currentPage !== currentPage) return false

  const locations = locator.locations
  if (
    typeof initial.position === "number" &&
    typeof locations?.position === "number"
  ) {
    return initial.position === locations.position
  }
  if (!hrefRoughlyMatches(initial.href, locator.href)) return false
  if (
    typeof initial.totalProgression === "number" &&
    typeof locations?.totalProgression === "number"
  ) {
    return isSameNumber(initial.totalProgression, locations.totalProgression)
  }
  if (
    typeof initial.progression === "number" &&
    typeof locations?.progression === "number"
  ) {
    return isSameNumber(initial.progression, locations.progression)
  }
  return true
}

export function useReaderProgressSaver(
  activeLibraryId: string | null,
  loadState: { status: string; bookId?: number; format?: string } | null,
  readerState: ReaderState | null,
) {
  const bookContextRef = useRef<{
    library: Library
    bookId: number
    format: string
    key: string
  } | null>(null)
  const trackedPositionRef = useRef<{
    bookKey: string
    initial: ReaderPositionSnapshot | null
    moved: boolean
  } | null>(null)

  useEffect(() => {
    if (
      loadState?.status === "ready" &&
      loadState.bookId != null &&
      loadState.format != null
    ) {
      const state = useAppStore.getState()
      const lib = state.libraries.find((l) => l.id === activeLibraryId)
      if (lib) {
        const key = `${lib.id}:${loadState.bookId}:${loadState.format.toUpperCase()}`
        bookContextRef.current = {
          library: lib,
          bookId: loadState.bookId,
          format: loadState.format,
          key,
        }
        if (trackedPositionRef.current?.bookKey !== key) {
          trackedPositionRef.current = {
            bookKey: key,
            initial: null,
            moved: false,
          }
        }
      }
    }
  }, [activeLibraryId, loadState])

  const saveSeqRef = useRef(0)

  useEffect(() => {
    const ctx = bookContextRef.current
    if (!ctx) return
    if (!readerState?.ready || !readerState.locator) return

    const tracked = trackedPositionRef.current
    if (!tracked || tracked.bookKey !== ctx.key) return
    if (!tracked.initial) {
      tracked.initial = snapshotReaderPosition(
        readerState.locator,
        readerState.currentPage,
      )
      return
    }
    if (!tracked.moved) {
      if (
        isSameReaderPosition(
          tracked.initial,
          readerState.locator,
          readerState.currentPage,
        )
      ) {
        return
      }
      tracked.moved = true
    }

    const seq = ++saveSeqRef.current
    const t = setTimeout(() => {
      if (saveSeqRef.current !== seq) return
      void (async () => {
        try {
          await setReadingProgress(
            ctx.library,
            ctx.bookId,
            ctx.format,
            readerState.locator!,
            {
              displayProgression: displayProgressionForPosition(
                readerState.currentPage,
                readerState.totalPages,
              ),
              invalidate: false,
            },
          )
          console.info("[reading-sync] reader:progress-saved", {
            libraryId: ctx.library.id,
            bookId: ctx.bookId,
            format: ctx.format.toUpperCase(),
            href: readerState.locator?.href ?? null,
            position: readerState.locator?.locations?.position ?? null,
            totalProgression:
              readerState.locator?.locations?.totalProgression ?? null,
          })
        } catch (e) {
          console.error("[reading-sync] reader:progress-save-failed", {
            libraryId: ctx.library.id,
            bookId: ctx.bookId,
            format: ctx.format.toUpperCase(),
            error: e,
          })
        }
      })()
    }, SAVE_DEBOUNCE_MS)

    return () => clearTimeout(t)
  }, [
    readerState?.currentPage,
    readerState?.locator,
    readerState?.ready,
    readerState?.totalPages,
  ])

  useEffect(() => {
    return () => {
      const ctx = bookContextRef.current
      if (ctx) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.readingProgress(ctx.library.id),
        })
        queryClient.invalidateQueries({
          queryKey: queryKeys.recentlyReadBooks(ctx.library.id),
        })
        console.info(
          "[mobile-reader] Invalidated queryKey: reading-progress, recently-read-books.",
        )
      }
    }
  }, [])
}
