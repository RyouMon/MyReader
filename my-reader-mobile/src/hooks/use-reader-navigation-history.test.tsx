import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react-native"
import type { ReactNode } from "react"
import type { Library } from "@/src/domain/types"
import { listReadingPositionCandidates } from "@/src/services/core/reading"
import { announceReadingPositions } from "@/src/services/core/reading-position-events"
import { queryKeys } from "@/src/services/query/query-keys"
import { useReaderNavigationHistory } from "./use-reader-navigation-history"

jest.mock("@/src/services/core/reading", () => ({
  listReadingPositionCandidates: jest.fn(),
}))
jest.mock("@/src/services/query/query-client", () => ({
  queryClient: { invalidateQueries: jest.fn() },
}))
const page = (position: number) => ({
  href: "publication.pdf",
  type: "application/pdf",
  locations: { position, progression: 0 },
})
const library = { id: "library" } as Library

const candidate = (operationId: string, position: number) => ({
  operationId,
  replicaId: "other-device",
  isLocal: false,
  locator: page(position),
  displayProgression: 0.5,
  recordedAt: position,
})

it("adds a remote location without jumping and clears history only for another reading session", async () => {
  jest.mocked(listReadingPositionCandidates).mockResolvedValue([
    candidate("already-synced", 20),
    candidate("latest-synced", 80),
    {
      operationId: "own",
      replicaId: "own",
      isLocal: true,
      locator: page(1),
      displayProgression: 0,
      recordedAt: 1,
    },
  ])
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      {children as never}
    </QueryClientProvider>
  )
  const { result, rerender, unmount } = renderHook(
    ({ session }: { session: string }) =>
      useReaderNavigationHistory(session, library, 7, "PDF", page(80)),
    {
      wrapper,
      initialProps: { session: "first" },
    },
  )
  await waitFor(() => expect(client.isFetching()).toBe(0))
  expect(result.current.getSnapshot().remoteHint).toBe(false)
  expect(result.current.getSnapshot().entries).toHaveLength(1)
  act(() =>
    announceReadingPositions("library", [
      {
        bookId: 7,
        format: "PDF",
        operationId: "remote",
        locator: page(20),
        recordedAt: 200,
      },
    ]),
  )
  expect(result.current.getSnapshot().index).toBe(0)
  expect(result.current.getSnapshot().entries).toHaveLength(2)
  expect(result.current.getSnapshot().remoteHint).toBe(true)
  act(() => result.current.dismissRemoteHint())
  expect(result.current.getSnapshot().remoteHint).toBe(false)
  rerender({ session: "first" })
  expect(result.current.getSnapshot().entries).toHaveLength(2)
  rerender({ session: "second" })
  expect(result.current.getSnapshot().entries).toHaveLength(1)
  unmount()
  client.clear()
})

it("preserves sync received during the opening query, even before the first locator", async () => {
  let finishQuery!: (rows: ReturnType<typeof candidate>[]) => void
  jest.mocked(listReadingPositionCandidates).mockReturnValue(
    new Promise((resolve) => {
      finishQuery = resolve
    }),
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      {children as never}
    </QueryClientProvider>
  )
  const { result, rerender, unmount } = renderHook(
    ({ ready }: { ready: boolean }) =>
      useReaderNavigationHistory(
        "opening",
        library,
        7,
        "PDF",
        ready ? page(80) : null,
      ),
    { wrapper, initialProps: { ready: false } },
  )
  act(() =>
    announceReadingPositions("library", [
      {
        bookId: 7,
        format: "PDF",
        operationId: "late",
        locator: page(30),
        recordedAt: 300,
      },
    ]),
  )
  await act(async () =>
    finishQuery([candidate("old", 20), candidate("late", 30)]),
  )
  await waitFor(() => expect(client.isFetching()).toBe(0))
  rerender({ ready: true })
  expect(result.current.getSnapshot().entries).toEqual([page(80), page(30)])
  expect(result.current.getSnapshot().remoteHint).toBe(true)
  act(() => result.current.dismissRemoteHint())
  jest
    .mocked(listReadingPositionCandidates)
    .mockResolvedValue([candidate("old", 20), candidate("late", 30)])
  await act(async () => {
    await client.invalidateQueries({
      queryKey: queryKeys.readingProgress(library.id),
    })
  })
  expect(result.current.getSnapshot().remoteHint).toBe(false)
  expect(result.current.getSnapshot().entries).toHaveLength(2)
  unmount()
  client.clear()
})
