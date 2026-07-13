import { act, fireEvent, render, screen } from "@testing-library/react"
import { createRef, useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FixedLayoutNativePager } from "../FixedLayoutNativePager"

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

describe("FixedLayoutNativePager", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock)
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 1000,
    })
    HTMLElement.prototype.scrollTo = vi.fn(function scrollTo(
      this: HTMLElement,
      options?: ScrollToOptions | number,
    ) {
      if (typeof options === "object" && typeof options.left === "number") {
        this.scrollLeft = options.left
      }
    }) as typeof HTMLElement.prototype.scrollTo
  })

  it("should render only nearby spread content when the document is large", () => {
    const scrollerRef = createRef<HTMLDivElement>()

    render(
      <FixedLayoutNativePager
        scrollerRef={scrollerRef}
        spreads={[[1], [2], [3], [4], [5]]}
        currentSpreadIndex={2}
        direction="ltr"
        zoomed={false}
        onSpreadIndexChange={() => {}}
        renderSpread={(_spread, index) => (
          <span data-testid={`rendered-${index}`} />
        )}
      />,
    )

    expect(screen.queryByTestId("rendered-0")).not.toBeInTheDocument()
    expect(screen.getByTestId("rendered-1")).toBeInTheDocument()
    expect(screen.getByTestId("rendered-2")).toBeInTheDocument()
    expect(screen.getByTestId("rendered-3")).toBeInTheDocument()
    expect(screen.queryByTestId("rendered-4")).not.toBeInTheDocument()
  })

  it("should commit the nearest native snap when scrolling ends", () => {
    const scrollerRef = createRef<HTMLDivElement>()
    const onSpreadIndexChange = vi.fn()

    render(
      <FixedLayoutNativePager
        scrollerRef={scrollerRef}
        spreads={[[1], [2], [3]]}
        currentSpreadIndex={0}
        direction="ltr"
        zoomed={false}
        onSpreadIndexChange={onSpreadIndexChange}
        renderSpread={() => null}
      />,
    )

    if (!scrollerRef.current) throw new Error("Scroller not mounted")
    scrollerRef.current.scrollLeft = 1000
    fireEvent(scrollerRef.current, new Event("scrollend"))

    expect(onSpreadIndexChange).toHaveBeenCalledWith(1)
  })

  it("should activate the snapped spread before the next input event", () => {
    const scrollerRef = createRef<HTMLDivElement>()

    function Harness() {
      const [currentSpreadIndex, setCurrentSpreadIndex] = useState(0)
      return (
        <FixedLayoutNativePager
          scrollerRef={scrollerRef}
          spreads={[[1], [2]]}
          currentSpreadIndex={currentSpreadIndex}
          direction="ltr"
          zoomed={false}
          onSpreadIndexChange={setCurrentSpreadIndex}
          renderSpread={() => null}
        />
      )
    }

    const { container } = render(<Harness />)
    if (!scrollerRef.current) throw new Error("Scroller not mounted")
    scrollerRef.current.scrollLeft = 1000
    act(() => {
      scrollerRef.current?.dispatchEvent(new Event("scrollend"))
      expect(
        container.querySelector('[data-fixed-layout-spread="1"]'),
      ).not.toHaveAttribute("aria-hidden")
    })
  })

  it("should reverse logical spread order when reading right to left", () => {
    const scrollerRef = createRef<HTMLDivElement>()
    const { container } = render(
      <FixedLayoutNativePager
        scrollerRef={scrollerRef}
        spreads={[[1], [2], [3]]}
        currentSpreadIndex={2}
        direction="rtl"
        zoomed={false}
        onSpreadIndexChange={() => {}}
        renderSpread={() => null}
      />,
    )

    expect(
      [...container.querySelectorAll("[data-fixed-layout-spread]")].map(
        (element) => element.getAttribute("data-fixed-layout-spread"),
      ),
    ).toEqual(["2", "1", "0"])
  })
})
