import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useReaderPaginateEdgeHover } from "../useReaderPaginateEdgeHover"

describe("useReaderPaginateEdgeHover", () => {
  it("should expose edge state when iframe pointer positions are forwarded", () => {
    const root = document.createElement("div")
    root.getBoundingClientRect = () =>
      ({
        top: 20,
        right: 210,
        bottom: 220,
        left: 10,
        width: 200,
        height: 200,
      }) as DOMRect
    const { result } = renderHook(() =>
      useReaderPaginateEdgeHover(true, { current: root }),
    )

    act(() => result.current.handlePointerPosition(20, 100))
    expect(result.current.nearLeft).toBe(true)
    expect(result.current.nearRight).toBe(false)

    act(() => result.current.handlePointerPosition(200, 100))
    expect(result.current.nearLeft).toBe(false)
    expect(result.current.nearRight).toBe(true)
  })
})
