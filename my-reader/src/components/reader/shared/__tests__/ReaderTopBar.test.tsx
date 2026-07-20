import { fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ReaderTopBar } from "../ReaderTopBar"

const platformMocks = vi.hoisted(() => ({
  isMacPlatform: vi.fn(() => false),
}))
const tauriMocks = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
  startDragging: vi.fn(),
}))

vi.mock("@/lib/platform", () => platformMocks)
vi.mock("@tauri-apps/api/core", () => ({ isTauri: tauriMocks.isTauri }))
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ startDragging: tauriMocks.startDragging }),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>()
  return {
    ...actual,
    SquarePen: (props: ComponentProps<"svg">) => (
      <svg data-reader-icon="square-pen" {...props} />
    ),
  }
})

const defaultProps = {
  visible: true,
  bookTitle: "疯传",
  bookmarked: false,
  onToggleToc: vi.fn(),
  onToggleBookmark: vi.fn(),
  onToggleSettings: vi.fn(),
}

describe("ReaderTopBar", () => {
  beforeEach(() => {
    platformMocks.isMacPlatform.mockReturnValue(false)
    tauriMocks.isTauri.mockReturnValue(false)
    tauriMocks.startDragging.mockReset()
  })

  it("should remove the chapter label when no chapter is resolved", () => {
    const { rerender } = render(
      <ReaderTopBar {...defaultProps} chapterTitle="运动让人们共享" />,
    )

    expect(screen.getByText("运动让人们共享")).toBeInTheDocument()

    rerender(<ReaderTopBar {...defaultProps} chapterTitle="  " />)

    expect(screen.queryByText("运动让人们共享")).not.toBeInTheDocument()
    expect(screen.getByText("疯传")).toBeInTheDocument()
  })

  it("should use the settings panel icon and label when rendering the settings trigger", () => {
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

  it("should expose highlights and notes as a separate reader action", () => {
    const onToggleAnnotations = vi.fn()
    render(
      <ReaderTopBar
        {...defaultProps}
        chapterTitle=""
        annotationsOpen
        onToggleAnnotations={onToggleAnnotations}
      />,
    )

    const annotationsButton = screen.getByTitle("reader.annotations")
    expect(annotationsButton).toHaveAttribute("data-active", "true")
    fireEvent.click(annotationsButton)
    expect(onToggleAnnotations).toHaveBeenCalledOnce()
  })

  it("should expose bookmarks between contents and highlights", () => {
    const onToggleBookmarks = vi.fn()
    render(
      <ReaderTopBar
        {...defaultProps}
        chapterTitle=""
        bookmarksOpen
        onToggleBookmarks={onToggleBookmarks}
        onToggleAnnotations={vi.fn()}
      />,
    )

    const contentsButton = screen.getByTitle("reader.navigation")
    const bookmarksButton = screen.getByTitle("reader.bookmarks")
    const annotationsButton = screen.getByTitle("reader.annotations")

    expect(bookmarksButton).toHaveAttribute("data-active", "true")
    expect(
      bookmarksButton.querySelector(".lucide-folder-bookmark"),
    ).not.toBeNull()
    expect(
      contentsButton.compareDocumentPosition(bookmarksButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      bookmarksButton.compareDocumentPosition(annotationsButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    fireEvent.click(bookmarksButton)
    expect(onToggleBookmarks).toHaveBeenCalledOnce()
  })

  it("should use the square pen icon for highlights and notes", () => {
    render(
      <ReaderTopBar
        {...defaultProps}
        chapterTitle=""
        onToggleAnnotations={vi.fn()}
      />,
    )

    const annotationsButton = screen.getByTitle("reader.annotations")
    expect(
      annotationsButton.querySelector('[data-reader-icon="square-pen"]'),
    ).not.toBeNull()
  })

  it("should expose pressed and disabled state when bookmark mutation is unavailable", () => {
    const onToggleBookmark = vi.fn()
    render(
      <ReaderTopBar
        {...defaultProps}
        chapterTitle=""
        bookmarked
        bookmarkDisabled
        onToggleBookmark={onToggleBookmark}
      />,
    )

    const bookmarkButton = screen.getByTitle("reader.bookmark")
    expect(bookmarkButton).toHaveAttribute("aria-pressed", "true")
    expect(bookmarkButton).toBeDisabled()
    fireEvent.click(bookmarkButton)
    expect(onToggleBookmark).not.toHaveBeenCalled()
  })

  it("should keep window controls and dragging when reader actions are unavailable", () => {
    tauriMocks.isTauri.mockReturnValue(true)
    const { container } = render(
      <ReaderTopBar
        {...defaultProps}
        chapterTitle=""
        showReaderActions={false}
      />,
    )

    expect(screen.getByTitle("reader.close")).toBeInTheDocument()
    expect(screen.queryByTitle("reader.navigation")).not.toBeInTheDocument()
    expect(screen.queryByTitle("reader.settings")).not.toBeInTheDocument()
    expect(screen.queryByTitle("reader.bookmark")).not.toBeInTheDocument()

    fireEvent.pointerDown(container.querySelector("header") as Element, {
      button: 0,
    })

    expect(tauriMocks.startDragging).toHaveBeenCalledOnce()
  })
})
