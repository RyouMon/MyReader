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

  it("should not overwrite initial progress when a book opens", () => {
    const { rerender, unmount } = renderHook(
      ({ state }: { state: ReaderState }) =>
        useReaderProgressSaver(library.id, loadState, state),
      { initialProps: { state: readerState(1) } },
    )

    act(() => {
      jest.advanceTimersByTime(1600)
    })
    expect(setReadingProgress).not.toHaveBeenCalled()

    rerender({ state: readerState(1) })
    act(() => {
      jest.advanceTimersByTime(1600)
    })
    expect(setReadingProgress).not.toHaveBeenCalled()

    rerender({ state: readerState(2) })
    act(() => {
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
