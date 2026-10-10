import "@/i18n"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { BookContextMenu, BookMoreMenu } from "../BookMoreMenu"
import { BookShareMenu } from "../BookShareMenu"

const mocks = vi.hoisted(() => ({
  api: {
    checkBookFileState: vi.fn(),
    copyBookFilePath: vi.fn(),
    revealBookFile: vi.fn(),
    saveBookFileAs: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/tauri-api", () => ({
  api: mocks.api,
  formatApiError: String,
}))
vi.mock("sonner", () => ({ toast: mocks.toast }))

const book = {
  id: 42,
  title: "分享测试书",
  formats: ["EPUB", "MOBI"],
  readableFormats: ["EPUB"],
  preferredFormat: "EPUB",
}

function renderWithClient(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  )
}

async function openSubMenu(name: string) {
  const item = await screen.findByRole("menuitem", { name })
  act(() => {
    item.focus()
    fireEvent.keyDown(item, { key: "ArrowRight" })
  })
}

describe("book file sharing", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.api.checkBookFileState.mockResolvedValue({
      path: "作者/书名/book.epub",
      localState: "present",
      localSize: 1024,
    })
    mocks.api.copyBookFilePath.mockResolvedValue(null)
    mocks.api.revealBookFile.mockResolvedValue(null)
    mocks.api.saveBookFileAs.mockResolvedValue(true)
  })

  it("copies the selected local format even when the reader cannot open it", async () => {
    const user = userEvent.setup()
    renderWithClient(
      <BookMoreMenu
        book={book}
        libraryId="local-library"
        fileActionsEnabled={false}
        triggerVariant="row"
      />,
    )
    await user.click(screen.getByRole("button", { name: "更多操作" }))
    await openSubMenu("分享")
    await openSubMenu("MOBI")
    const copy = await screen.findByRole("menuitem", { name: "复制文件路径" })
    await waitFor(() => expect(copy).not.toHaveAttribute("aria-disabled"))
    await user.click(copy)
    await waitFor(() => {
      expect(mocks.api.copyBookFilePath).toHaveBeenCalledWith(
        "local-library",
        42,
        "MOBI",
      )
      expect(mocks.toast.success).toHaveBeenCalledWith("已复制文件路径")
    })
    expect(mocks.api.revealBookFile).not.toHaveBeenCalled()
  })

  it("reveals a downloaded book from its context menu", async () => {
    const user = userEvent.setup()
    renderWithClient(
      <BookContextMenu
        book={{ ...book, formats: ["EPUB"] }}
        libraryId="remote-library"
      >
        <div>Book row</div>
      </BookContextMenu>,
    )
    fireEvent.contextMenu(screen.getByText("Book row"))
    await openSubMenu("分享")
    const reveal = await screen.findByRole("menuitem", {
      name: "打开文件所在位置",
    })
    await waitFor(() => expect(reveal).not.toHaveAttribute("aria-disabled"))
    await user.click(reveal)
    await waitFor(() =>
      expect(mocks.api.revealBookFile).toHaveBeenCalledWith(
        "remote-library",
        42,
        "EPUB",
      ),
    )
    expect(mocks.api.copyBookFilePath).not.toHaveBeenCalled()
  })

  it.each([
    "local_only",
    "dirty_push",
  ])("shares a complete %s file before upload finishes", async (localState) => {
    const user = userEvent.setup()
    mocks.api.checkBookFileState.mockResolvedValue({
      path: "book.pdf",
      localState,
      localSize: 1024,
    })
    renderWithClient(
      <BookShareMenu libraryId="lib-1" bookId={42} format="pdf" />,
    )
    await user.click(screen.getByRole("button", { name: "分享 pdf 文件" }))
    const copy = await screen.findByRole("menuitem", { name: "复制文件路径" })
    await waitFor(() => expect(copy).not.toHaveAttribute("aria-disabled"))
    await user.click(copy)
    await waitFor(() =>
      expect(mocks.api.copyBookFilePath).toHaveBeenCalledWith(
        "lib-1",
        42,
        "PDF",
      ),
    )
  })

  it.each([
    "remote_only",
    "starting",
    "downloading",
    "source_missing",
  ])("disables file actions for a %s file", async (localState) => {
    const user = userEvent.setup()
    mocks.api.checkBookFileState.mockResolvedValue({
      path: "book.epub",
      localState,
      localSize: null,
    })
    renderWithClient(
      <BookShareMenu libraryId="lib-1" bookId={42} format="EPUB" />,
    )
    await user.click(screen.getByRole("button", { name: "分享 EPUB 文件" }))
    expect(await screen.findByText("文件尚未下载到本地")).toBeInTheDocument()
    for (const name of ["复制文件路径", "打开文件所在位置", "另存为…"]) {
      const action = screen.getByRole("menuitem", { name })
      expect(action).toHaveAttribute("aria-disabled", "true")
      await user.click(action)
    }
    expect(mocks.api.copyBookFilePath).not.toHaveBeenCalled()
    expect(mocks.api.revealBookFile).not.toHaveBeenCalled()
    expect(mocks.api.saveBookFileAs).not.toHaveBeenCalled()
  })

  it.each([
    ["copyBookFilePath", "复制文件路径", "复制文件路径失败"],
    ["revealBookFile", "打开文件所在位置", "打开文件所在位置失败"],
    ["saveBookFileAs", "另存为…", "另存文件失败"],
  ] as const)("reports native %s failure and refreshes file availability", async (method, label, message) => {
    const user = userEvent.setup()
    mocks.api[method].mockRejectedValue(new Error("File was removed"))
    renderWithClient(
      <BookShareMenu libraryId="lib-1" bookId={42} format="EPUB" />,
    )
    await user.click(screen.getByRole("button", { name: "分享 EPUB 文件" }))
    const action = await screen.findByRole("menuitem", { name: label })
    await waitFor(() => expect(action).not.toHaveAttribute("aria-disabled"))
    await user.click(action)
    await waitFor(() => {
      expect(mocks.toast.error).toHaveBeenCalledWith(message, {
        description: "未能完成此操作，请重试。",
      })
      expect(mocks.api.checkBookFileState).toHaveBeenCalledTimes(2)
    })
    expect(mocks.toast.success).not.toHaveBeenCalled()
  })

  it.each([
    true,
    false,
  ])("only reports a saved file when the native save dialog completes: %s", async (saved) => {
    const user = userEvent.setup()
    mocks.api.saveBookFileAs.mockResolvedValue(saved)
    renderWithClient(
      <BookShareMenu libraryId="lib-1" bookId={42} format="PDF" />,
    )
    await user.click(screen.getByRole("button", { name: "分享 PDF 文件" }))
    const action = await screen.findByRole("menuitem", { name: "另存为…" })
    await waitFor(() => expect(action).not.toHaveAttribute("aria-disabled"))
    await user.click(action)
    expect(mocks.api.saveBookFileAs).toHaveBeenCalledWith("lib-1", 42, "PDF")
    if (saved) {
      await waitFor(() =>
        expect(mocks.toast.success).toHaveBeenCalledWith("文件已保存"),
      )
    } else {
      expect(mocks.toast.success).not.toHaveBeenCalled()
    }
    expect(mocks.toast.error).not.toHaveBeenCalled()
  })
})
