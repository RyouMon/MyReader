import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ReaderTopBar } from "../ReaderTopBar"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const defaultProps = {
  visible: true,
  bookTitle: "疯传",
  bookmarked: false,
  onToggleToc: vi.fn(),
  onToggleBookmark: vi.fn(),
  onToggleSettings: vi.fn(),
}

describe("ReaderTopBar", () => {
  it("should remove the chapter label when no chapter is resolved", () => {
    const { rerender } = render(
      <ReaderTopBar {...defaultProps} chapterTitle="运动让人们共享" />,
    )

    expect(screen.getByText("运动让人们共享")).toBeInTheDocument()

    rerender(<ReaderTopBar {...defaultProps} chapterTitle="  " />)

    expect(screen.queryByText("运动让人们共享")).not.toBeInTheDocument()
    expect(screen.getByText("疯传")).toBeInTheDocument()
  })

  it("should use the settings panel icon and label for the settings trigger", () => {
    const onToggleSettings = vi.fn()
    render(
      <ReaderTopBar
        {...defaultProps}
        chapterTitle=""
        onToggleSettings={onToggleSettings}
      />,
    )

    const settingsButton = screen.getByTitle("reader.settings")
    expect(settingsButton.querySelector(".lucide-settings")).not.toBeNull()
    fireEvent.click(settingsButton)
    expect(onToggleSettings).toHaveBeenCalledOnce()
  })
})
