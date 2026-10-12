import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { Locator } from "@readium/shared"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { api } from "@/lib/tauri-api"
import { applySidecarSyncCompleted } from "@/hooks/useSidecarSync"
import { useReaderNavigationHistory } from "../useReaderNavigationHistory"

vi.mock("@/lib/tauri-api", () => ({
  api: { listReadingPositionCandidates: vi.fn() },
}))
const page = (position: number) => ({
  href: "publication.pdf",
  type: "application/pdf",
  locations: { position },
})

describe("reader session navigation", () => {
  it("retains incoming sync positions even if the following database query only sees a newer local save", async () => {
    vi.mocked(api.listReadingPositionCandidates).mockResolvedValue([])
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result, rerender, unmount } = renderHook(
      ({ bookId }) =>
        useReaderNavigationHistory({
          libraryId: "library",
          bookId,
          format: "PDF",
          currentLocator: Locator.deserialize(page(80))!,
          enabled: true,
        }),
      { wrapper, initialProps: { bookId: 7 } },
    )
    await waitFor(() =>
      expect(api.listReadingPositionCandidates).toHaveBeenCalled(),
    )
    const event = {
      libraryId: "library",
      mode: "full" as const,
      pushed: 0,
      pulled: 1,
      readingPositions: [
        {
          bookId: 7,
          format: "PDF",
          operationId: "remote",
          locator: page(20),
          recordedAt: 200,
        },
      ],
    }
    await act(() => applySidecarSyncCompleted(event, client))
    expect(
      result.current.getSnapshot().entries[result.current.getSnapshot().index],
    ).toMatchObject(page(80))
    expect(result.current.getSnapshot().remoteHint).toBe(true)
    act(() => result.current.dismissRemoteHint())
    await act(() => applySidecarSyncCompleted(event, client))
    expect(result.current.getSnapshot().remoteHint).toBe(false)
    act(() => {
      expect(result.current.move(1)).toMatchObject(page(20))
    })
    rerender({ bookId: 8 })
    expect(result.current.getSnapshot().entries).toHaveLength(1)
    expect(result.current.move(-1)).toBeNull()
    unmount()
    client.clear()
  })
})
