import type { CalibreBook } from "@my-reader/tools/types/book"
import { act, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import BookGrid, { getGridLayoutMetrics } from "../BookGrid"

const virtualizer = vi.hoisted(() => ({
  getVirtualItems: () => [],
  getTotalSize: () => 1000,
  measure: () => {},
  scrollToOffset: () => {},
}))

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => virtualizer,
}))
vi.mock("@/hooks/use-overlay-scrollbar", () => ({
  useOverlayScrollbar: () => {},
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("BookGrid scroll restoration", () => {
  it("preserves the book anchor when data arrives while a view-mode change settles", () => {
    const frames = new Map<number, FrameRequestCallback>()
    let nextFrame = 0
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.set(++nextFrame, callback)
      return nextFrame
    })
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id)
    })
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    )
    const flushFrames = () =>
      act(() => {
        const pending = [...frames.values()]
        frames.clear()
        pending.forEach((callback) => callback(0))
      })
    const props = {
      books: new Map<number, CalibreBook>(),
      total: 100,
      libraryId: "library-1",
      ensureRange: vi.fn(),
    }
    const { getByTestId, rerender } = render(<BookGrid {...props} />)
    flushFrames()
    const scroll = getByTestId("library-scroll")
    scroll.scrollTop = 800
    fireEvent.scroll(scroll)

    rerender(<BookGrid {...props} viewMode="list" />)
    const restoredPosition = scroll.scrollTop
    expect(restoredPosition).toBeGreaterThan(0)

    // Simulate layout settling before the scheduled anchor restoration.
    scroll.scrollTop = 0
    const books = new Map([
      [9, { id: 9, title: "Newly loaded book" } as CalibreBook],
    ])
    rerender(<BookGrid {...props} books={books} viewMode="list" />)
    flushFrames()

    expect(scroll.scrollTop).toBe(restoredPosition)
  })
})

describe("getGridLayoutMetrics", () => {
  it("should keep two columns when content is narrower than two minimum cards", () => {
    const layout = getGridLayoutMetrics(260)

    expect(layout.cols).toBe(2)
    expect(layout.cardWidth).toBe(122)
    expect(layout.gap).toBe(16)
  })

  it("should cap column gap when two columns have leftover width", () => {
    const layout = getGridLayoutMetrics(430)

    expect(layout.cols).toBe(2)
    expect(layout.cardWidth).toBe(172)
    expect(layout.gap).toBe(28)
  })

  it("should delay adding a column when the next card width is too small", () => {
    expect(getGridLayoutMetrics(448).cols).toBe(2)

    const layout = getGridLayoutMetrics(496)
    expect(layout.cols).toBe(3)
    expect(layout.cardWidth).toBe(152)
  })

  it("should include twelve pixel row gap when calculating grid row height", () => {
    const layout = getGridLayoutMetrics(430)

    expect(layout.cardWidth).toBe(172)
    expect(layout.gridRowHeight).toBe(325)
  })
})
