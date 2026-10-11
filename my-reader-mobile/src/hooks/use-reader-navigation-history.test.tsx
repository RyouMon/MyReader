import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react-native"
import type { ReactNode } from "react"
import type { Library } from "@/src/domain/types"
import { listReadingPositionCandidates } from "@/src/services/core/reading"
import { announceReadingPositions } from "@/src/services/core/reading-position-events"
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

it("adds a remote location without jumping and clears history only for another reading session", async () => {
  jest.mocked(listReadingPositionCandidates).mockResolvedValue([
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
  await waitFor(() => expect(listReadingPositionCandidates).toHaveBeenCalled())
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
  expect(result.current.buttonVisible(1, false)).toBe(true)
  act(() => result.current.dismissRemoteHint())
  expect(result.current.buttonVisible(1, false)).toBe(false)
  expect(result.current.buttonVisible(1, true)).toBe(true)
  rerender({ session: "first" })
  expect(result.current.getSnapshot().entries).toHaveLength(2)
  rerender({ session: "second" })
  expect(result.current.getSnapshot().entries).toHaveLength(1)
  unmount()
  client.clear()
})
