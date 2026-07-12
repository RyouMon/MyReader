import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useReadingChrome } from "../useReadingChrome"

function readerRootRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    right: 100,
    bottom: 1000,
    left: 0,
    width: 100,
    height: 1000,
    toJSON: () => ({}),
  }
}

describe("useReadingChrome", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should hide after one delay when pointer keeps moving in content", () => {
    const { result } = renderHook(() => useReadingChrome(false))
    const root = document.createElement("div")
    root.getBoundingClientRect = readerRootRect
    Object.defineProperty(result.current.readerRootRef, "current", {
      configurable: true,
      value: root,
    })

    act(() => {
      result.current.handlePointerPosition(50, 1)
    })
    expect(result.current.chromeVisible).toBe(true)

    act(() => {
      result.current.handlePointerPosition(50, 500)
      vi.advanceTimersByTime(200)
      result.current.handlePointerPosition(51, 501)
      vi.advanceTimersByTime(80)
    })

    expect(result.current.chromeVisible).toBe(false)
  })

  it("should cancel pending hiding when pointer returns to an edge", () => {
    const { result } = renderHook(() => useReadingChrome(false))
    const root = document.createElement("div")
    root.getBoundingClientRect = readerRootRect
    Object.defineProperty(result.current.readerRootRef, "current", {
      configurable: true,
      value: root,
    })

    act(() => {
      result.current.handlePointerPosition(50, 1)
      result.current.handlePointerPosition(50, 500)
      vi.advanceTimersByTime(200)
      result.current.handlePointerPosition(50, 1)
      vi.advanceTimersByTime(100)
    })

    expect(result.current.chromeVisible).toBe(true)
  })
})
