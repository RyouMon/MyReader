import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ReaderTopBar } from "../ReaderTopBar"

const platformMocks = vi.hoisted(() => ({
  isMacPlatform: vi.fn(() => false),
  isWindowsPlatform: vi.fn(() => false),
}))
const tauriMocks = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
  startDragging: vi.fn(),
  close: vi.fn(),
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  isMaximized: vi.fn(async () => false),
  onResized: vi.fn(async (_listener: () => void) => vi.fn()),
}))

vi.mock("@/lib/platform", () => platformMocks)
vi.mock("@tauri-apps/api/core", () => ({ isTauri: tauriMocks.isTauri }))
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => tauriMocks,
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
    platformMocks.isWindowsPlatform.mockReturnValue(false)
    tauriMocks.isTauri.mockReturnValue(false)
    tauriMocks.startDragging.mockReset()
    tauriMocks.close.mockReset()
    tauriMocks.minimize.mockReset()
    tauriMocks.toggleMaximize.mockReset()
    tauriMocks.isMaximized.mockReset().mockResolvedValue(false)
    tauriMocks.onResized.mockClear()
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

  it("should place leading right actions before search and reader settings", () => {
    render(
      <ReaderTopBar
        {...defaultProps}
        chapterTitle=""
        rightActionsStart={<div data-testid="right-actions-start" />}
        onToggleSearch={vi.fn()}
      />,
    )

    const rightActionsStart = screen.getByTestId("right-actions-start")
    const searchButton = screen.getByTitle("reader.search")
    const settingsButton = screen.getByTitle("reader.settings")

    expect(
      rightActionsStart.compareDocumentPosition(searchButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      searchButton.compareDocumentPosition(settingsButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
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

    fireEvent.mouseDown(container.querySelector("header") as Element, {
      button: 0,
    })

    expect(tauriMocks.startDragging).toHaveBeenCalledOnce()
  })

  it("should place Windows controls after reader actions in minimize, maximize, close order", async () => {
    platformMocks.isWindowsPlatform.mockReturnValue(true)
    tauriMocks.isTauri.mockReturnValue(true)
    render(<ReaderTopBar {...defaultProps} chapterTitle="" />)

    const controls = screen.getAllByRole("button").slice(-3)
    expect(controls.map((button) => button.getAttribute("aria-label"))).toEqual(
      ["reader.minimize", "reader.maximize", "reader.close"],
    )
    fireEvent.click(controls[0])
    fireEvent.click(controls[1])
    fireEvent.click(controls[2])
    expect(tauriMocks.minimize).toHaveBeenCalledOnce()
    expect(tauriMocks.toggleMaximize).toHaveBeenCalledOnce()
    expect(tauriMocks.close).toHaveBeenCalledOnce()
    expect(tauriMocks.startDragging).not.toHaveBeenCalled()
    await waitFor(() => expect(tauriMocks.isMaximized).toHaveBeenCalled())
  })

  it("should expose restore when Windows is already maximized and track window resizing", async () => {
    platformMocks.isWindowsPlatform.mockReturnValue(true)
    tauriMocks.isTauri.mockReturnValue(true)
    tauriMocks.isMaximized.mockResolvedValue(true)
    render(<ReaderTopBar {...defaultProps} chapterTitle="" />)

    fireEvent.click(
      await screen.findByRole("button", { name: "reader.restore" }),
    )
    expect(tauriMocks.toggleMaximize).toHaveBeenCalledOnce()
    tauriMocks.isMaximized.mockResolvedValue(false)
    await act(async () => tauriMocks.onResized.mock.calls[0][0]())
    expect(
      screen.getByRole("button", { name: "reader.maximize" }),
    ).toBeInTheDocument()
  })

  it("should keep Windows controls available when reader actions are unavailable", async () => {
    platformMocks.isWindowsPlatform.mockReturnValue(true)
    tauriMocks.isTauri.mockReturnValue(true)
    render(
      <ReaderTopBar
        {...defaultProps}
        chapterTitle=""
        showReaderActions={false}
      />,
    )

    expect(screen.getAllByRole("button")).toHaveLength(3)
    expect(
      screen.getByRole("button", { name: "reader.close" }),
    ).toBeInTheDocument()
    await waitFor(() => expect(tauriMocks.isMaximized).toHaveBeenCalled())
  })

  it("should keep macOS fallback controls before reader actions on other platforms", () => {
    render(<ReaderTopBar {...defaultProps} chapterTitle="" />)
    expect(
      screen
        .getAllByRole("button")
        .slice(0, 3)
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["reader.close", "reader.minimize", "reader.maximize"])
  })

  it("should preserve native macOS fullscreen controls in previews on Windows", () => {
    platformMocks.isWindowsPlatform.mockReturnValue(true)
    render(
      <ReaderTopBar
        {...defaultProps}
        chapterTitle=""
        previewNativeMacFullscreen
      />,
    )
    expect(
      screen.queryByRole("button", { name: "reader.close" }),
    ).not.toBeInTheDocument()
  })

  it.each([
    "疯传",
    "第一章",
  ])("should toggle maximization on the second title-bar mouse press on %s", (title) => {
    tauriMocks.isTauri.mockReturnValue(true)
    render(<ReaderTopBar {...defaultProps} chapterTitle="第一章" />)
    const titleLabel = screen.getByText(title)

    fireEvent.mouseDown(titleLabel, { button: 0, detail: 1 })
    expect(tauriMocks.startDragging).toHaveBeenCalledOnce()
    fireEvent.mouseDown(titleLabel, { button: 0, detail: 2 })
    expect(tauriMocks.toggleMaximize).toHaveBeenCalledOnce()
    expect(tauriMocks.startDragging).toHaveBeenCalledOnce()
  })

  it("should ignore secondary clicks and interactive controls when double-clicking the title bar", () => {
    tauriMocks.isTauri.mockReturnValue(true)
    render(
      <ReaderTopBar
        {...defaultProps}
        chapterTitle=""
        rightActionsStart={
          <span data-reader-window-no-drag="true">No drag</span>
        }
      />,
    )

    fireEvent.mouseDown(screen.getByText("疯传"), { button: 2, detail: 2 })
    fireEvent.mouseDown(screen.getByTitle("reader.settings"), {
      button: 0,
      detail: 2,
    })
    fireEvent.mouseDown(screen.getByText("No drag"), { button: 0, detail: 2 })
    expect(tauriMocks.toggleMaximize).not.toHaveBeenCalled()
    expect(tauriMocks.startDragging).not.toHaveBeenCalled()
  })

  it.each([
    "touch",
    "pen",
  ])("should preserve title-bar dragging for %s input", (pointerType) => {
    tauriMocks.isTauri.mockReturnValue(true)
    render(<ReaderTopBar {...defaultProps} chapterTitle="" />)
    fireEvent.pointerDown(screen.getByText("疯传"), { button: 0, pointerType })
    expect(tauriMocks.startDragging).toHaveBeenCalledOnce()
    expect(tauriMocks.toggleMaximize).not.toHaveBeenCalled()
  })

  it("should release the Windows resize listener when the title bar unmounts", async () => {
    platformMocks.isWindowsPlatform.mockReturnValue(true)
    tauriMocks.isTauri.mockReturnValue(true)
    const unlisten = vi.fn()
    tauriMocks.onResized.mockResolvedValueOnce(unlisten)
    const { unmount } = render(
      <ReaderTopBar {...defaultProps} chapterTitle="" />,
    )
    await waitFor(() => expect(tauriMocks.onResized).toHaveBeenCalled())
    unmount()
    expect(unlisten).toHaveBeenCalledOnce()
  })
})
