import "@/i18n"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BookMoreMenu } from "../BookMoreMenu"

const tauriApiMock = vi.hoisted(() => ({
  checkBookFileState: vi.fn(),
  downloadBookFile: vi.fn(),
  cancelBookDownload: vi.fn(),
  deleteLocalBookFile: vi.fn(),
  setBookReadingFormat: vi.fn(),
}))

const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
}))

vi.mock("@/lib/tauri-api", () => ({
  api: tauriApiMock,
}))

vi.mock("sonner", () => ({
  toast: toastMock,
}))

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function renderWithClient(children: ReactNode) {
  return render(
    <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>,
  )
}

describe("BookMoreMenu", () => {
  beforeEach(() => {
    tauriApiMock.checkBookFileState.mockResolvedValue({
      path: "book.epub",
      localState: "remote_only",
      localSize: null,
    })
    tauriApiMock.downloadBookFile.mockRejectedValue(new Error("network failed"))
    tauriApiMock.setBookReadingFormat.mockResolvedValue(null)
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    toastMock.error.mockClear()
    tauriApiMock.checkBookFileState.mockReset()
    tauriApiMock.downloadBookFile.mockReset()
    tauriApiMock.cancelBookDownload.mockReset()
    tauriApiMock.deleteLocalBookFile.mockReset()
    tauriApiMock.setBookReadingFormat.mockReset()
  })

  it("should show global failure toast when home download fails", async () => {
    const user = userEvent.setup()

    renderWithClient(
      <BookMoreMenu
        book={{
          id: 42,
          title: "下载状态测试书",
          formats: ["EPUB"],
          readableFormats: ["EPUB"],
          preferredFormat: "EPUB",
        }}
        fileActionsEnabled
        libraryId="lib-1"
        triggerVariant="row"
      />,
    )

    await user.click(screen.getByRole("button", { name: "更多操作" }))
    const downloadItem = await screen.findByRole("menuitem", {
      name: "下载文件",
    })
    await user.click(downloadItem)

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        "下载失败",
        expect.objectContaining({
          description: expect.stringContaining("network failed"),
        }),
      )
    })
  })

  it("should set default reading format when a multi-format book uses home more menu", async () => {
    const user = userEvent.setup()

    renderWithClient(
      <BookMoreMenu
        book={{
          id: 42,
          title: "下载状态测试书",
          formats: ["EPUB", "PDF"],
          readableFormats: ["EPUB", "PDF"],
          preferredFormat: "EPUB",
        }}
        fileActionsEnabled
        libraryId="lib-1"
        selectedFormat="EPUB"
        triggerVariant="row"
      />,
    )

    await user.click(screen.getByRole("button", { name: "更多操作" }))
    const defaultFormatItem = await screen.findByRole("menuitem", {
      name: "默认阅读格式",
    })
    defaultFormatItem.focus()
    fireEvent.keyDown(defaultFormatItem, { key: "ArrowRight" })
    await user.click(await screen.findByRole("menuitem", { name: "PDF" }))

    await waitFor(() => {
      expect(tauriApiMock.setBookReadingFormat).toHaveBeenCalledWith(
        "lib-1",
        42,
        "PDF",
      )
    })
  })

  it("should hide default reading format menu when book has one format", async () => {
    const user = userEvent.setup()

    renderWithClient(
      <BookMoreMenu
        book={{
          id: 42,
          title: "下载状态测试书",
          formats: ["EPUB"],
          readableFormats: ["EPUB"],
          preferredFormat: "EPUB",
        }}
        fileActionsEnabled
        libraryId="lib-1"
        selectedFormat="EPUB"
        triggerVariant="row"
      />,
    )

    await user.click(screen.getByRole("button", { name: "更多操作" }))

    expect(
      screen.queryByRole("menuitem", { name: "默认阅读格式" }),
    ).not.toBeInTheDocument()
  })

  it("should keep parent menu icons when default format submenu renders", async () => {
    const user = userEvent.setup()
    tauriApiMock.checkBookFileState.mockResolvedValue({
      path: "book.epub",
      localState: "present",
      localSize: 1024,
    })

    renderWithClient(
      <BookMoreMenu
        book={{
          id: 42,
          title: "下载状态测试书",
          formats: ["EPUB", "PDF"],
          readableFormats: ["EPUB", "PDF"],
          preferredFormat: "EPUB",
        }}
        fileActionsEnabled
        libraryId="lib-1"
        selectedFormat="EPUB"
        triggerVariant="row"
      />,
    )

    await user.click(screen.getByRole("button", { name: "更多操作" }))
    const defaultFormatItem = await screen.findByRole("menuitem", {
      name: "默认阅读格式",
    })
    const deleteItem = await screen.findByRole("menuitem", {
      name: "删除本地文件",
    })

    expect(defaultFormatItem.querySelector(".lucide-book-open")).not.toBeNull()
    expect(deleteItem.querySelector(".lucide-trash-2")).not.toBeNull()
    expect(deleteItem).toHaveClass("text-destructive")

    deleteItem.focus()
    fireEvent.keyDown(deleteItem, { key: "ArrowRight" })

    const epubItem = await screen.findByRole("menuitem", { name: "EPUB" })
    expect(epubItem.querySelector(".lucide-trash-2")).toBeNull()
  })

  it("should expose catalog edit and delete only when managed callbacks are provided", async () => {
    const user = userEvent.setup()
    const onEditMetadata = vi.fn()
    const onDeleteBook = vi.fn()

    renderWithClient(
      <BookMoreMenu
        book={{
          id: 42,
          title: "可写书库测试书",
          formats: ["EPUB"],
          readableFormats: ["EPUB"],
          preferredFormat: "EPUB",
        }}
        fileActionsEnabled={false}
        libraryId="lib-1"
        onEditMetadata={onEditMetadata}
        onDeleteBook={onDeleteBook}
        triggerVariant="row"
      />,
    )

    await user.click(screen.getByRole("button", { name: "更多操作" }))
    await user.click(screen.getByRole("menuitem", { name: "修改书名与作者" }))
    expect(onEditMetadata).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "更多操作" }))
    await user.click(screen.getByRole("menuitem", { name: "从书库删除图书" }))
    expect(onDeleteBook).toHaveBeenCalledTimes(1)
  })
})
