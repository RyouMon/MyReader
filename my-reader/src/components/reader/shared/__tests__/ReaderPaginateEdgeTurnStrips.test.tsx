import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReaderPaginateEdgeTurnStrips } from "../ReaderPaginateEdgeTurnStrips"

describe("ReaderPaginateEdgeTurnStrips", () => {
  it("should advance from the left edge when reading from right to left", () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    render(
      <ReaderPaginateEdgeTurnStrips
        direction="rtl"
        showPrev={false}
        showNext
        onPrev={onPrev}
        onNext={onNext}
        prevLabel="Previous page"
        nextLabel="Next page"
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Next page" }))

    expect(onNext).toHaveBeenCalledOnce()
    expect(onPrev).not.toHaveBeenCalled()
  })

  it("should go backward from the right edge when reading from right to left", () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    render(
      <ReaderPaginateEdgeTurnStrips
        direction="rtl"
        showPrev
        showNext={false}
        onPrev={onPrev}
        onNext={onNext}
        prevLabel="Previous page"
        nextLabel="Next page"
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Previous page" }))

    expect(onPrev).toHaveBeenCalledOnce()
    expect(onNext).not.toHaveBeenCalled()
  })

  it("should let content receive pointer events outside the buttons", () => {
    render(
      <ReaderPaginateEdgeTurnStrips
        showPrev
        showNext={false}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        prevLabel="Previous page"
        nextLabel="Next page"
      />,
    )

    const button = screen.getByRole("button", { name: "Previous page" })
    expect(button.parentElement).toHaveClass("pointer-events-none")
    expect(button).toHaveClass("pointer-events-auto")
  })
})
