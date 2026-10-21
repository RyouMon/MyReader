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
    vi.mocked(api.listReadingPositionCandidates).mockResolvedValue([
      {
        operationId: "already-synced",
        replicaId: "other",
        isLocal: false,
        locator: page(20),
        displayProgression: 0.2,
        recordedAt: 20,
      },
      {
        operationId: "latest-synced",
        replicaId: "other",
        isLocal: false,
        locator: page(80),
        displayProgression: 0.8,
        recordedAt: 80,
      },
    ])
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
    await waitFor(() => expect(client.isFetching()).toBe(0))
    expect(result.current.getSnapshot().entries).toHaveLength(1)
    expect(result.current.getSnapshot().remoteHint).toBe(false)
    vi.mocked(api.listReadingPositionCandidates).mockResolvedValue([])
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

it("keeps a sync event received before the opening query and initial viewport finish", async () => {
  let finishQuery!: (
    rows: Awaited<ReturnType<typeof api.listReadingPositionCandidates>>,
  ) => void
  vi.mocked(api.listReadingPositionCandidates).mockReturnValue(
    new Promise((resolve) => {
      finishQuery = resolve
    }),
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result, rerender, unmount } = renderHook(
    ({ ready }) =>
      useReaderNavigationHistory({
        libraryId: "library",
        bookId: 7,
        format: "PDF",
        currentLocator: ready ? Locator.deserialize(page(80))! : null,
        enabled: true,
      }),
    { wrapper, initialProps: { ready: false } },
  )
  let sync!: Promise<void>
  act(() => {
    sync = applySidecarSyncCompleted(
      {
        libraryId: "library",
        mode: "full",
        pulled: 1,
        pushed: 0,
        readingPositions: [
          {
            bookId: 7,
            format: "PDF",
            operationId: "late",
            locator: page(30),
            recordedAt: 300,
          },
        ],
      },
      client,
    )
  })
  await act(async () => {
    finishQuery([
      {
        operationId: "old",
        replicaId: "other",
        isLocal: false,
        locator: page(20),
        displayProgression: 0.2,
        recordedAt: 20,
      },
      {
        operationId: "late",
        replicaId: "other",
        isLocal: false,
        locator: page(30),
        displayProgression: 0.3,
        recordedAt: 300,
      },
    ])
    await sync
  })
  await waitFor(() => expect(client.isFetching()).toBe(0))
  rerender({ ready: true })
  expect(result.current.getSnapshot().entries).toHaveLength(2)
  expect(result.current.getSnapshot().entries[0]).toMatchObject(page(80))
  expect(result.current.getSnapshot().entries[1]).toMatchObject(page(30))
  expect(result.current.getSnapshot().remoteHint).toBe(true)
  unmount()
  client.clear()
})
