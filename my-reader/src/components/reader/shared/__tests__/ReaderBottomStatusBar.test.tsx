import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReaderBottomStatusBar } from "../ReaderBottomStatusBar"

describe("ReaderBottomStatusBar", () => {
  it("should size the position label to its content when text is shown", () => {
    render(
      <ReaderBottomStatusBar visible leftText="Page 1 / 12" progress={8} />,
    )

    const label = screen.getByText("Page 1 / 12")
    expect(label).toHaveClass("w-fit", "rounded-md")
    expect(label).not.toHaveClass("w-full", "rounded-full")
  })

  it("should emphasize the position label when emphasis is requested", () => {
    render(
      <ReaderBottomStatusBar
        visible
        emphasizePositionLabel
        leftText="Page 1 / 12"
        progress={8}
      />,
    )

    const label = screen.getByText("Page 1 / 12")
    expect(label).toHaveClass("font-semibold", "text-reader-chrome-fg")
    expect(label).not.toHaveClass("text-reader-chrome-muted/80")
  })

  it("should keep the full handle inside the track when progress reaches either edge", () => {
    const { rerender } = render(
      <ReaderBottomStatusBar visible leftText="0%" progress={0} />,
    )

    const handle = screen.getByRole("slider")
    expect(handle).toHaveStyle({
      left: "0%",
      transform: "translate(0%, -50%)",
    })

    rerender(<ReaderBottomStatusBar visible leftText="100%" progress={100} />)

    expect(handle).toHaveStyle({
      left: "100%",
      transform: "translate(-100%, -50%)",
    })
  })

  it("should keep the tooltip inside the track when dragging at the screen edge", () => {
    const getProgressPreview = vi.fn(() => ({ label: "100%" }))
    const { container } = render(
      <ReaderBottomStatusBar
        visible
        leftText="100%"
        progress={100}
        getProgressPreview={getProgressPreview}
      />,
    )
    const handle = screen.getByRole("slider")
    Object.defineProperty(handle, "setPointerCapture", { value: vi.fn() })

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1 })

    const tooltip = container.querySelector(".reader-progress-tooltip")
    expect(tooltip).toHaveStyle({
      left: "100%",
      transform: "translateX(-100%)",
    })
  })

  it("should show complete title and label on separate single lines when title is available", () => {
    const chapterTitle = "一个需要完整显示而不能被截断的章节标题"
    const label = "第 100 / 120 页"
    const { container } = render(
      <ReaderBottomStatusBar
        visible
        leftText={label}
        progress={50}
        getProgressPreview={() => ({ chapterTitle, label })}
      />,
    )
    const handle = screen.getByRole("slider")
    Object.defineProperty(handle, "setPointerCapture", { value: vi.fn() })

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1 })

    const titleLine = container.querySelector(".reader-progress-tooltip-title")
    const labelLine = container.querySelector(".reader-progress-tooltip-label")
    expect(titleLine).toHaveTextContent(chapterTitle)
    expect(labelLine).toHaveTextContent(label)
    expect(
      container.querySelector(".reader-progress-tooltip")?.children,
    ).toHaveLength(2)
  })

  it("should show the preview label once when chapter title repeats the label", () => {
    const label = "第 12 / 120 页"
    const { container } = render(
      <ReaderBottomStatusBar
        visible
        leftText={label}
        progress={10}
        getProgressPreview={() => ({ chapterTitle: label, label })}
      />,
    )
    const handle = screen.getByRole("slider")
    Object.defineProperty(handle, "setPointerCapture", { value: vi.fn() })

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1 })

    expect(
      container.querySelector(".reader-progress-tooltip-title"),
    ).not.toBeInTheDocument()
    expect(
      container.querySelector(".reader-progress-tooltip-label"),
    ).toHaveTextContent(label)
  })
})
