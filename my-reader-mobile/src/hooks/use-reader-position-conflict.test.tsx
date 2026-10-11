import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query"
import {
  act,
  cleanup,
  renderHook,
  waitFor,
} from "@testing-library/react-native"
import type { ReactNode } from "react"
import type { Library } from "@/src/domain/types"
import {
  getReadingPosition,
  listReadingPositionCandidates,
  selectReadingPositionCandidate,
} from "@/src/services/core/reading"
import { queryKeys } from "@/src/services/query/query-keys"
import { useReaderPositionConflict } from "./use-reader-position-conflict"

jest.mock("@/src/services/core/reading", () => ({
  getReadingPosition: jest.fn(),
  listReadingPositionCandidates: jest.fn(),
  selectReadingPositionCandidate: jest.fn(),
}))
jest.mock("@/src/services/query/query-client", () => ({
  queryClient: { invalidateQueries: jest.fn() },
}))

const library = { id: "library", sourceType: "local" } as Library
const locator = {
  href: "chapter",
  type: "application/xhtml+xml",
  locations: { position: 3, progression: 0 },
}
const candidates = [
  {
    operationId: "one",
    locator,
    displayProgression: 0.3,
    recordedAt: 1,
    replicaId: "device-one",
  },
  {
    operationId: "two",
    locator: { ...locator, locations: { position: 8, progression: 0 } },
    displayProgression: 0.8,
    recordedAt: 2,
    replicaId: "device-two",
  },
]
const position = {
  bookId: 4,
  format: "EPUB",
  locator,
  updatedAt: 1,
  conflictCount: 2,
  displayProgression: 0.3,
}
let client: QueryClient
let flush: jest.Mock<Promise<void>>
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      {children as never}
    </QueryClientProvider>
  )
}
beforeEach(() => {
  jest.resetAllMocks()
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  flush = jest.fn().mockResolvedValue(undefined)
  jest.mocked(getReadingPosition).mockResolvedValue(position)
  jest.mocked(listReadingPositionCandidates).mockResolvedValue(candidates)
  jest.mocked(selectReadingPositionCandidate).mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  client.clear()
  onlineManager.setOnline(true)
})

it("reads local conflicts while offline", async () => {
  onlineManager.setOnline(false)
  const { result } = renderHook(
    () => useReaderPositionConflict(library, 4, "EPUB", flush),
    { wrapper },
  )
  await waitFor(() => expect(result.current.candidates).toEqual(candidates))
})

it("discovers conflicts when sync invalidates reading progress", async () => {
  jest
    .mocked(getReadingPosition)
    .mockResolvedValue({ ...position, conflictCount: 1 })
  const { result } = renderHook(
    () => useReaderPositionConflict(library, 4, "EPUB", flush),
    { wrapper },
  )
  await waitFor(() => expect(result.current.pending).toBe(false))
  expect(listReadingPositionCandidates).not.toHaveBeenCalled()
  jest.mocked(getReadingPosition).mockResolvedValue(position)
  await act(() =>
    client.invalidateQueries({
      queryKey: queryKeys.readingProgress(library.id),
    }),
  )
  await waitFor(() => expect(result.current.candidates).toEqual(candidates))
})

it("flushes progress and navigates to the persisted local draft, including changes since the sheet opened", async () => {
  const { result } = renderHook(
    () => useReaderPositionConflict(library, 4, "EPUB", flush),
    { wrapper },
  )
  await waitFor(() => expect(result.current.candidates).toHaveLength(2))
  let finishSave!: () => void
  flush.mockReturnValue(
    new Promise<void>((resolve) => {
      finishSave = resolve
    }),
  )
  let choosing!: Promise<unknown>
  act(() => {
    choosing = result.current.select("local")
  })
  expect(selectReadingPositionCandidate).not.toHaveBeenCalled()
  const latest = { ...locator, locations: { position: 9, progression: 0 } }
  jest
    .mocked(getReadingPosition)
    .mockResolvedValue({ ...position, locator: latest, conflictCount: 1 })
  await act(async () => {
    finishSave()
    expect(await choosing).toEqual(latest)
  })
  expect(selectReadingPositionCandidate).toHaveBeenCalledWith(
    library,
    4,
    "EPUB",
    "local",
  )
  await waitFor(() => expect(result.current.candidates).toEqual([]))
})

it("keeps candidates available and exposes a failed selection", async () => {
  const { result } = renderHook(
    () => useReaderPositionConflict(library, 4, "EPUB", flush),
    { wrapper },
  )
  await waitFor(() => expect(result.current.candidates).toHaveLength(2))
  jest
    .mocked(selectReadingPositionCandidate)
    .mockRejectedValue(new Error("disk full"))
  await act(async () => expect(await result.current.select("two")).toBeNull())
  expect(result.current.error).toContain("disk full")
  expect(result.current.candidates).toEqual(candidates)
  expect(result.current.pending).toBe(false)
})

it("returns the committed position even if refreshing candidates fails", async () => {
  const { result } = renderHook(
    () => useReaderPositionConflict(library, 4, "EPUB", flush),
    { wrapper },
  )
  await waitFor(() => expect(result.current.candidates).toHaveLength(2))
  jest
    .mocked(listReadingPositionCandidates)
    .mockRejectedValue(new Error("refresh failed"))
  await act(async () =>
    expect(await result.current.select("two")).toEqual(locator),
  )
  await waitFor(() => expect(result.current.error).toContain("refresh failed"))
})

it("does not resolve a conflict if the latest local progress could not be saved", async () => {
  const { result } = renderHook(
    () => useReaderPositionConflict(library, 4, "EPUB", flush),
    { wrapper },
  )
  await waitFor(() => expect(result.current.candidates).toHaveLength(2))
  flush.mockRejectedValue(new Error("save failed"))
  await act(async () => expect(await result.current.select("two")).toBeNull())
  expect(selectReadingPositionCandidate).not.toHaveBeenCalled()
  expect(result.current.error).toContain("save failed")
})

it("ignores a selection response after switching books", async () => {
  const { result, rerender } = renderHook(
    ({ bookId }: { bookId: number }) =>
      useReaderPositionConflict(library, bookId, "EPUB", flush),
    { wrapper, initialProps: { bookId: 4 } },
  )
  await waitFor(() => expect(result.current.candidates).toHaveLength(2))
  let finishSelection!: () => void
  jest.mocked(selectReadingPositionCandidate).mockReturnValue(
    new Promise<void>((resolve) => {
      finishSelection = resolve
    }),
  )
  let choosing!: Promise<unknown>
  act(() => {
    choosing = result.current.select("two")
  })
  await waitFor(() => expect(selectReadingPositionCandidate).toHaveBeenCalled())
  rerender({ bookId: 5 })
  await act(async () => {
    finishSelection()
    expect(await choosing).toBeNull()
  })
  expect(result.current.error).toBeNull()
})

it("retains conflicts arriving while a selection commits", async () => {
  const { result } = renderHook(
    () => useReaderPositionConflict(library, 4, "EPUB", flush),
    { wrapper },
  )
  await waitFor(() => expect(result.current.candidates).toHaveLength(2))
  const arrived = [candidates[1]!, { ...candidates[0]!, operationId: "new" }]
  jest.mocked(listReadingPositionCandidates).mockResolvedValue(arrived)
  await act(async () => {
    await result.current.select("two")
  })
  expect(result.current.candidates).toEqual(arrived)
})
