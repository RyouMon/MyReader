import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReaderSettingsRangeControl } from "../ReaderSettingsRangeControl"

function renderControl(onCommit = vi.fn()) {
  render(
    <ReaderSettingsRangeControl
      id="font-size"
      label="字号"
      value={16}
      min={14}
      max={28}
      step={1}
      className="range"
      labelClassName="label"
      valueClassName="value"
      formatValue={(value) => `${value}px`}
      rangeStyle={() => ({})}
      onCommit={onCommit}
    />,
  )
  return { input: screen.getByLabelText("字号"), onCommit }
}

describe("ReaderSettingsRangeControl", () => {
  it("should commit the draft only when pointer adjustment finishes", () => {
    const { input, onCommit } = renderControl()

    fireEvent.change(input, { target: { value: "20" } })

    expect(screen.getByText("20px")).toBeInTheDocument()
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.pointerUp(input, { target: { value: "20" } })

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(20)
  })

  it("should commit keyboard adjustment when the key is released", () => {
    const { input, onCommit } = renderControl()

    fireEvent.change(input, { target: { value: "18" } })
    fireEvent.keyUp(input, { key: "ArrowRight", target: { value: "18" } })

    expect(onCommit).toHaveBeenCalledWith(18)
  })
})
