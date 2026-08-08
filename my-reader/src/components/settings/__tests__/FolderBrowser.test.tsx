import "@/i18n"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { FolderBrowser } from "../FolderBrowser"

describe("FolderBrowser", () => {
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
