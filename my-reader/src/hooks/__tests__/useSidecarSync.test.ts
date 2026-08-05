import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
import { bookFileStateKeys } from "@/hooks/queries/useBookFileState"
import { favoriteBookKeys } from "@/hooks/queries/useFavoriteBooksQuery"
import { readingProgressKeys } from "@/hooks/queries/useReadingProgressQuery"
import {
  applySidecarSyncCompleted,
  SIDECAR_SYNC_COMPLETED_EVENT,
} from "@/hooks/useSidecarSync"

describe("sidecar sync events", () => {
  it("should invalidate synced library data when a full pull completes", async () => {
    const queryClient = new QueryClient()
    const progressKey = readingProgressKeys.list("library-1")
    const favoriteKey = favoriteBookKeys.list("library-1")
    const fileStateKey = bookFileStateKeys.detail("library-1", 42, "EPUB")
    const otherFileStateKey = bookFileStateKeys.detail("library-2", 42, "EPUB")
    queryClient.setQueryData(progressKey, {})
    queryClient.setQueryData(favoriteKey, [])
    queryClient.setQueryData(fileStateKey, {
      path: "Books/book-42/book.epub",
      localState: "present",
      localSize: 1024,
    })
    queryClient.setQueryData(otherFileStateKey, {
      path: "Books/book-42/book.epub",
      localState: "present",
      localSize: 1024,
    })
    const onCompleted = vi.fn()
    window.addEventListener(SIDECAR_SYNC_COMPLETED_EVENT, onCompleted)

    await applySidecarSyncCompleted(
      {
        libraryId: "library-1",
        mode: "full",
        pushed: 0,
        pulled: 1,
      },
      queryClient,
    )

    expect(queryClient.getQueryState(progressKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(favoriteKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(fileStateKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(otherFileStateKey)?.isInvalidated).toBe(
      false,
    )
    expect(onCompleted).toHaveBeenCalledTimes(1)
    window.removeEventListener(SIDECAR_SYNC_COMPLETED_EVENT, onCompleted)
  })
})
