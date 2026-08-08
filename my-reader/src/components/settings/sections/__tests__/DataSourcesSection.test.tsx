import "@/i18n"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import DataSourcesSection from "../DataSourcesSection"

const dataSourceMocks = vi.hoisted(() => ({
  createDataSource: vi.fn(),
  deleteDataSource: vi.fn(),
  testConnection: vi.fn(),
}))

vi.mock("@/hooks/queries/useDataSourcesQuery", () => ({
  useDataSourcesQuery: () => ({ data: [] }),
  useDataSourceMutations: () => dataSourceMocks,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("DataSourcesSection", () => {
  it("should open data source creation as a continuous dialog flow", () => {
    render(<DataSourcesSection />)

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "添加数据源" }))

    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveClass("h-[min(86vh,720px)]")
    expect(dialog).toHaveClass("grid-rows-[auto_minmax(0,1fr)]")
    expect(
      screen.getByRole("heading", { name: "添加数据源" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "添加 WebDAV" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "添加 OneDrive" }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "添加 WebDAV" }))

    expect(screen.getByRole("dialog")).toBe(dialog)
    expect(
      screen.getByRole("heading", { name: "添加 WebDAV" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "返回" })).toHaveAttribute(
      "data-variant",
      "ghost",
    )
    expect(screen.getByRole("button", { name: "关闭" })).toHaveAttribute(
      "data-variant",
      "ghost",
    )
    expect(screen.getByRole("button", { name: "测试连接" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "添加" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "返回" }))
    expect(screen.getByRole("dialog")).toBe(dialog)
    expect(
      screen.getByRole("heading", { name: "添加数据源" }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "关闭" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
