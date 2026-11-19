import "@/i18n"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

import { FolderBrowser, type FolderBrowserProps } from "../FolderBrowser"

const browserProps: FolderBrowserProps = {
  title: "选择文件夹",
  open: true,
  onOpenChange: vi.fn(),
  currentPath: "/Books",
  folders: [],
  loading: false,
  error: null,
  loadingMessage: "正在加载",
  emptyMessage: "没有文件夹",
  errorMessage: "加载失败",
  selectLabel: "选择此文件夹",
  onNavigate: vi.fn(),
  onSelect: vi.fn(),
  embedded: true,
}

describe("FolderBrowser", () => {
  it("starts an empty draft inside the list and confirms without navigating", async () => {
    let complete!: (folder: { name: string; path: string }) => void
    const create = vi.fn(
      () =>
        new Promise<{ name: string; path: string }>((resolve) => {
          complete = resolve
        }),
    )
    const navigate = vi.fn()
    const select = vi.fn()
    render(
      <FolderBrowser
        {...browserProps}
        onNavigate={navigate}
        onSelect={select}
        onCreateDirectory={create}
      />,
    )
    expect(screen.queryByLabelText("文件夹名称")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "新建文件夹" }))
    const draft = within(screen.getByRole("list", { name: "选择文件夹" }))
    expect(draft.getByLabelText("文件夹名称")).toHaveValue("")
    expect(draft.getByLabelText("文件夹名称")).toHaveFocus()
    expect(draft.getByRole("button", { name: "确认" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "选择此文件夹" })).toBeDisabled()
    expect(create).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText("文件夹名称"), {
      target: { value: "新书库" },
    })
    expect(screen.getByRole("button", { name: "选择此文件夹" })).toBeDisabled()
    fireEvent.keyDown(screen.getByLabelText("文件夹名称"), {
      key: "Enter",
      isComposing: true,
    })
    expect(create).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "确认" }))
    expect(create).toHaveBeenCalledExactlyOnceWith("新书库")
    expect(screen.getByRole("button", { name: "正在创建…" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled()
    expect(navigate).not.toHaveBeenCalled()
    complete({ name: "新书库", path: "/Books/新书库" })
    await waitFor(() =>
      expect(screen.queryByLabelText("文件夹名称")).not.toBeInTheDocument(),
    )
    expect(navigate).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "选择此文件夹" })).toBeEnabled()
  })

  it.each([
    "button",
    "Escape",
  ])("cancels a draft with %s without creating a remote folder", (method) => {
    const create = vi.fn()
    render(<FolderBrowser {...browserProps} onCreateDirectory={create} />)
    fireEvent.click(screen.getByRole("button", { name: "新建文件夹" }))
    const input = screen.getByLabelText("文件夹名称")
    fireEvent.change(input, { target: { value: "不要创建" } })
    if (method === "button")
      fireEvent.click(screen.getByRole("button", { name: "取消" }))
    else fireEvent.keyDown(input, { key: "Escape" })
    expect(create).not.toHaveBeenCalled()
    expect(screen.queryByLabelText("文件夹名称")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "新建文件夹" }))
    expect(screen.getByLabelText("文件夹名称")).toHaveValue("")
  })

  it("rejects path traversal and keeps the name available for correction after a conflict", async () => {
    const navigate = vi.fn()
    const create = vi
      .fn()
      .mockRejectedValue(new Error("REMOTE_DIRECTORY_ALREADY_EXISTS"))
    render(
      <FolderBrowser
        {...browserProps}
        onNavigate={navigate}
        onCreateDirectory={create}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "新建文件夹" }))
    fireEvent.change(screen.getByLabelText("文件夹名称"), {
      target: { value: "../Books" },
    })
    expect(screen.getByRole("button", { name: "确认" })).toBeDisabled()
    fireEvent.change(screen.getByLabelText("文件夹名称"), {
      target: { value: "Books" },
    })
    fireEvent.keyDown(screen.getByLabelText("文件夹名称"), { key: "Enter" })
    await screen.findByText("已存在同名文件或文件夹。")
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.getByLabelText("文件夹名称")).toHaveValue("Books")
    expect(screen.getByRole("button", { name: "确认" })).toBeEnabled()
    create.mockResolvedValue({ name: "New", path: "/Books/New" })
    fireEvent.change(screen.getByLabelText("文件夹名称"), {
      target: { value: "New" },
    })
    fireEvent.click(screen.getByRole("button", { name: "确认" }))
    await waitFor(() =>
      expect(screen.queryByLabelText("文件夹名称")).not.toBeInTheDocument(),
    )
    expect(create).toHaveBeenLastCalledWith("New")
  })

  it.each([
    false,
    true,
  ])("Escape cancels the draft without closing its dialog (embedded: %s)", (embedded) => {
    const onOpenChange = vi.fn()
    const browser = (
      <FolderBrowser
        {...browserProps}
        embedded={embedded}
        onOpenChange={onOpenChange}
        onCreateDirectory={vi.fn()}
      />
    )
    render(
      embedded ? (
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>创建书库</DialogTitle>
            {browser}
          </DialogContent>
        </Dialog>
      ) : (
        browser
      ),
    )
    fireEvent.click(screen.getByRole("button", { name: "新建文件夹" }))
    fireEvent.keyDown(screen.getByLabelText("文件夹名称"), { key: "Escape" })
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.queryByLabelText("文件夹名称")).not.toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("should render without a nested dialog when embedded", () => {
    render(
      <FolderBrowser
        title="选择文件夹"
        open
        onOpenChange={vi.fn()}
        currentPath="/"
        folders={[]}
        loading={false}
        error={null}
        loadingMessage="正在加载"
        emptyMessage="没有文件夹"
        errorMessage="加载失败"
        selectLabel="选择此文件夹"
        onNavigate={vi.fn()}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
        embedded
      />,
    )

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: "选择文件夹" }),
    ).not.toBeInTheDocument()
    const parentButton = screen.getByRole("button", { name: "上一级文件夹" })
    const refreshButton = screen.getByRole("button", { name: "刷新" })
    expect(parentButton).toBeDisabled()
    expect(parentButton).toHaveAttribute("data-variant", "ghost")
    expect(refreshButton).toHaveAttribute("data-variant", "ghost")
    expect(parentButton).toHaveAttribute("data-size", "icon-sm")
    expect(refreshButton).toHaveAttribute("data-size", "icon-sm")
    expect(
      screen.queryByRole("button", { name: "取消" }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "选择此文件夹" }),
    ).toBeInTheDocument()
    const emptyState = screen.getByText("没有文件夹").parentElement
    expect(emptyState).toHaveClass("min-h-0", "flex-1")
    expect(emptyState).not.toHaveClass(
      "h-[220px]",
      "min-h-[220px]",
      "max-h-[320px]",
    )
  })
})
