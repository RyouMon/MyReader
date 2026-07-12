import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
  ReaderSidePanelFrame,
  ReaderSidePanelScrollArea,
} from "../ReaderSidePanelChrome"

const useOverlayScrollbar = vi.hoisted(() => vi.fn())

vi.mock("@/hooks/use-overlay-scrollbar", () => ({
  useOverlayScrollbar,
}))

describe("ReaderSidePanelChrome", () => {
  it("should disable interaction and move offscreen when hidden", () => {
    const { container, rerender } = render(
      <ReaderSidePanelFrame visible={false} side="left">
        <div>Contents</div>
      </ReaderSidePanelFrame>,
    )
    const panel = container.querySelector("aside")

    expect(panel).toHaveAttribute("data-visible", "false")
    expect(panel).toHaveStyle({
      opacity: "0",
      pointerEvents: "none",
      transform: "translateX(-100%)",
    })

    rerender(
      <ReaderSidePanelFrame visible side="left">
        <div>Contents</div>
      </ReaderSidePanelFrame>,
    )
    expect(panel).toHaveAttribute("data-visible", "true")
    expect(panel).toHaveStyle({
      opacity: "1",
      pointerEvents: "auto",
      transform: "translateX(0)",
    })
  })

  it("should initialize the shared scrollbar for panel contents", () => {
    render(
      <ReaderSidePanelScrollArea>
        <div>Scrollable content</div>
      </ReaderSidePanelScrollArea>,
    )

    expect(screen.getByText("Scrollable content")).toBeInTheDocument()
    expect(useOverlayScrollbar).toHaveBeenCalledOnce()
  })
})
