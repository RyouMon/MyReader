import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"
import { FormSlider } from "../FormSlider"

const props = {
  label: "Speed",
  min: 0.5,
  max: 3,
  step: 0.1,
  value: 1,
  formatValue: (value: number) => `${value.toFixed(1)}×`,
}

it("shows the drag value immediately and commits only on release", () => {
  const onCommit = vi.fn()
  render(<FormSlider {...props} onCommit={onCommit} />)
  const input = screen.getByRole("slider", { name: "Speed" })
  const track = input.closest(".MuiSlider-root")!
  Object.assign(track, {
    hasPointerCapture: () => false,
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  })
  vi.spyOn(track, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 250, 40),
  )
  fireEvent.pointerDown(track, {
    pointerType: "mouse",
    button: 0,
    clientX: 100,
    clientY: 20,
  })
  fireEvent.pointerMove(document, {
    pointerType: "mouse",
    buttons: 1,
    clientX: 150,
    clientY: 20,
  })
  expect(screen.getByText("2.0×")).toBeInTheDocument()
  expect(input).toHaveAttribute("aria-valuetext", "2.0×")
  expect(onCommit).not.toHaveBeenCalled()
  fireEvent.pointerUp(document, {
    pointerType: "mouse",
    clientX: 150,
    clientY: 20,
  })
  expect(onCommit).toHaveBeenCalledExactlyOnceWith(2)
})

it("supports keyboard steps, bounds, and updated saved values", async () => {
  const user = userEvent.setup()
  const onCommit = vi.fn()
  const { rerender } = render(<FormSlider {...props} onCommit={onCommit} />)
  const input = screen.getByRole("slider", { name: "Speed" })
  act(() => input.focus())
  await user.keyboard("{ArrowRight}")
  expect(onCommit).toHaveBeenLastCalledWith(1.1)
  await user.keyboard("{End}{ArrowRight}")
  expect(input).toHaveValue("3")
  await user.keyboard("{Home}{ArrowLeft}")
  expect(input).toHaveValue("0.5")
  rerender(<FormSlider {...props} value={1.8} onCommit={onCommit} />)
  expect(input).toHaveValue("1.8")
  expect(screen.getByText("1.8×")).toBeInTheDocument()
})
