import type { Locator } from "@my-reader/readium"
import { act, renderHook } from "@testing-library/react-native"

import { setReadingProgress } from "@/src/domain/library/reading-progress"
import type { Library } from "@/src/domain/types"
import type { ReaderState } from "@/src/features/reader/components/reader/types"
import { useAppStore } from "@/src/store/app-store"

import { useReaderProgressSaver } from "./use-reader-progress-saver"

jest.mock("@/src/domain/library/reading-progress", () => ({
  setReadingProgress: jest.fn(),
}))

jest.mock("@/src/services/query/query-client", () => ({
  queryClient: {
    invalidateQueries: jest.fn(),
  },
}))

jest.mock("@/src/store/app-store", () => {
  const useAppStore = Object.assign(jest.fn(), {
    getState: jest.fn(),
  })
  return { useAppStore }
})

const library = {
  id: "library-1",
  name: "Library",
  path: "file:///library",
  sourceType: "local",
} as Library

const loadState = {
  status: "ready",
  bookId: 7,
  format: "EPUB",
}

function locator(position: number): Locator {
  return {
    href: `chapter-${position}.xhtml`,
    type: "application/xhtml+xml",
    locations: {
      progression: 0,
      position,
      totalProgression: position / 10,
    },
  }
}

function readerState(position: number): ReaderState {
  return {
    ready: true,
    currentPage: position - 1,
    totalPages: 10,
    progress: position / 10,
    chapterTitle: "",
    loading: false,
    error: null,
    locator: locator(position),
  }
}

describe("useReaderProgressSaver", () => {
  it("drains a newer page queued while closing waits for an earlier save", async () => {
    const { result, rerender } = renderHook(
      ({ state }: { state: ReaderState }) =>
        useReaderProgressSaver(library.id, loadState, state),
      { initialProps: { state: readerState(1) } },
    )
    let finish!: () => void
    jest.mocked(setReadingProgress).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    rerender({ state: readerState(3) })
    let closing!: Promise<void>
    await act(async () => {
      closing = result.current.flush()
    })
    rerender({ state: readerState(5) })
    await act(async () => {
      finish()
      await closing
    })
    expect(setReadingProgress).toHaveBeenCalledTimes(2)
    expect(jest.mocked(setReadingProgress).mock.calls[1]?.[3]).toEqual(
      readerState(5).locator,
    )
  })

  it("retains the latest failed save for an explicit retry", async () => {
    const { result, rerender } = renderHook(
      ({ state }: { state: ReaderState }) =>
        useReaderProgressSaver(library.id, loadState, state),
      { initialProps: { state: readerState(1) } },
    )
    rerender({ state: readerState(3) })
    jest
      .mocked(setReadingProgress)
      .mockRejectedValueOnce(new Error("disk full"))
    await act(async () =>
      expect(result.current.flush()).rejects.toThrow("disk full"),
    )
    await act(() => result.current.flush())
    expect(setReadingProgress).toHaveBeenCalledTimes(2)
    expect(jest.mocked(setReadingProgress).mock.calls[1]?.[3]).toEqual(
      readerState(3).locator,
    )
  })

  it("flushes pending progress once and cancels the scheduled duplicate save", async () => {
    const { result, rerender } = renderHook(
      ({ state }: { state: ReaderState }) =>
        useReaderProgressSaver(library.id, loadState, state),
      { initialProps: { state: readerState(1) } },
    )
    rerender({ state: readerState(3) })
    await act(() => result.current.flush())
    await act(async () => jest.advanceTimersByTime(1600))
    expect(setReadingProgress).toHaveBeenCalledTimes(1)
    expect(setReadingProgress).toHaveBeenCalledWith(
      library,
      7,
      "EPUB",
      readerState(3).locator,
      {
        displayProgression: 0.3,
        invalidate: false,
      },
    )
  })

  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    jest.mocked(useAppStore.getState).mockReturnValue({
      libraries: [library],
    } as ReturnType<typeof useAppStore.getState>)
    jest.mocked(setReadingProgress).mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("saves the latest page when the reader closes before the debounce", async () => {
    const { rerender, unmount } = renderHook(
      ({ state }: { state: ReaderState }) =>
        useReaderProgressSaver(library.id, loadState, state),
      { initialProps: { state: readerState(1) } },
    )
    rerender({ state: readerState(2) })
    rerender({ state: readerState(3) })

    await act(async () => unmount())

    expect(setReadingProgress).toHaveBeenCalledTimes(1)
    expect(setReadingProgress).toHaveBeenCalledWith(
      library,
      7,
      "EPUB",
      readerState(3).locator,
      { displayProgression: 0.3, invalidate: false },
    )
  })

  it("saves movement within the same publication position", async () => {
    const initial = readerState(1)
    const next = {
      ...initial,
      locator: {
        ...initial.locator!,
        locations: { ...initial.locator!.locations, progression: 0.5 },
      },
    }
    const { rerender } = renderHook(
      ({ state }: { state: ReaderState }) =>
        useReaderProgressSaver(library.id, loadState, state),
      { initialProps: { state: initial } },
    )
    rerender({ state: next })
    await act(async () => jest.advanceTimersByTime(1600))
    expect(setReadingProgress).toHaveBeenCalledWith(
      library,
      7,
      "EPUB",
      next.locator,
      { displayProgression: 0.1, invalidate: false },
    )
  })

  it("should not overwrite initial progress when a book opens", async () => {
    const { rerender, unmount } = renderHook(
      ({ state }: { state: ReaderState }) =>
        useReaderProgressSaver(library.id, loadState, state),
      { initialProps: { state: readerState(1) } },
    )

    await act(async () => {
      jest.advanceTimersByTime(1600)
    })
    expect(setReadingProgress).not.toHaveBeenCalled()

    rerender({ state: readerState(1) })
    await act(async () => {
      jest.advanceTimersByTime(1600)
    })
    expect(setReadingProgress).not.toHaveBeenCalled()

    rerender({ state: readerState(2) })
    await act(async () => {
      jest.advanceTimersByTime(1600)
    })
    expect(setReadingProgress).toHaveBeenCalledWith(
      library,
      7,
      "EPUB",
      expect.objectContaining({
        locations: expect.objectContaining({ position: 2 }),
      }),
      {
        displayProgression: 0.2,
        invalidate: false,
      },
    )

    unmount()
  })
})
