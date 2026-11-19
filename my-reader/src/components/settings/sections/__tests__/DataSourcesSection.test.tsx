import "@/i18n"
import type { DataSource } from "@my-reader/tools/types/data-source"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import DataSourcesSection from "../DataSourcesSection"

const dataSourceMocks = vi.hoisted(() => ({
  createDataSource: vi.fn(),
  deleteDataSource: vi.fn(),
  testConnection: vi.fn(),
}))
const queryState = vi.hoisted(() => ({
  dataSources: [] as DataSource[],
}))

vi.mock("@/hooks/queries/useDataSourcesQuery", () => ({
  useDataSourcesQuery: () => ({ data: queryState.dataSources }),
  useDataSourceMutations: () => dataSourceMocks,
}))

beforeEach(() => {
  vi.clearAllMocks()
  queryState.dataSources = []
})

describe("DataSourcesSection", () => {
  it("should identify each data source type with its own icon", () => {
    queryState.dataSources = [
      {
        id: "webdav-1",
        type: "webdav",
        name: "家庭存储",
        enabled: true,
        endpoint: "https://dav.example.com",
        username: "reader",
        hasPassword: true,
      },
      {
        id: "onedrive-1",
        type: "onedrive",
        name: "OneDrive",
        enabled: true,
        clientId: "client-id",
        displayName: "个人云盘",
        hasRefreshToken: true,
      },
      {
        id: "gdrive-1",
        type: "gdrive",
        name: "Google Drive",
        enabled: true,
        clientId: "client-id",
        displayName: "Google Reader",
        email: "reader@gmail.com",
        hasRefreshToken: true,
      },
      {
        id: "dropbox-1",
        type: "dropbox",
        name: "Dropbox",
        enabled: true,
        clientId: "app-key",
        displayName: "Dropbox Reader",
        email: "reader@dropbox.com",
        hasRefreshToken: true,
      },
      {
        id: "s3-1",
        type: "s3",
        name: "Archive",
        enabled: true,
        endpoint: "https://s3.example.com",
        bucket: "books",
        region: "us-east-1",
        virtualHostStyle: false,
        hasCredentials: true,
      },
    ]

    render(<DataSourcesSection />)

    expect(
      screen.getByRole("heading", { name: "已配置数据源", level: 2 }),
    ).toBeInTheDocument()
    const localIcon = screen.getByRole("img", { name: "本地" })
    expect(localIcon).toHaveAttribute("data-entity-icon", "localDataSource")
    expect(localIcon.querySelector("svg")).toHaveAttribute(
      "data-icon",
      "local-storage",
    )
    expect(localIcon.querySelector("svg")).toHaveAttribute(
      "fill",
      "currentColor",
    )
    expect(localIcon.querySelector("svg")).toHaveClass("text-data-source-local")
    const webdavIcon = screen.getByRole("img", { name: "WebDAV" })
    expect(webdavIcon).toHaveAttribute("data-entity-icon", "webdavDataSource")
    expect(webdavIcon.querySelector("svg")).toHaveAttribute(
      "data-icon",
      "webdav-server",
    )
    expect(webdavIcon.querySelector("svg")).toHaveAttribute(
      "fill",
      "currentColor",
    )
    expect(webdavIcon.querySelector("svg")).toHaveClass(
      "text-data-source-webdav",
    )
    const onedriveIcon = screen.getByRole("img", { name: "OneDrive" })
    expect(onedriveIcon).toHaveAttribute(
      "data-entity-icon",
      "onedriveDataSource",
    )
    expect(onedriveIcon.querySelector("svg")).toHaveAttribute(
      "fill",
      "currentColor",
    )
    expect(onedriveIcon.querySelector("svg")).toHaveClass("text-brand-onedrive")

    expect(screen.getByText("reader@gmail.com")).toBeInTheDocument()
    expect(screen.getByText("reader@dropbox.com")).toBeInTheDocument()
    expect(screen.getByText("Google Reader")).toBeInTheDocument()
    expect(screen.getByText("Dropbox Reader")).toBeInTheDocument()

    const gdriveIcon = screen.getByRole("img", { name: "Google Drive" })
    expect(gdriveIcon).toHaveAttribute("data-entity-icon", "gdriveDataSource")
    expect(gdriveIcon.querySelector("svg")).toHaveAttribute(
      "data-icon",
      "google-drive",
    )

    const dropboxIcon = screen.getByRole("img", { name: "Dropbox" })
    expect(dropboxIcon).toHaveAttribute("data-entity-icon", "dropboxDataSource")
    expect(dropboxIcon.querySelector("svg")).toHaveAttribute(
      "data-icon",
      "dropbox",
    )

    const s3Icon = screen.getByRole("img", { name: "S3 兼容存储" })
    expect(s3Icon).toHaveAttribute("data-entity-icon", "s3DataSource")
    expect(s3Icon.querySelector("svg")).toHaveAttribute(
      "data-icon",
      "s3-storage",
    )
    expect(screen.getByText("https://s3.example.com/books")).toBeInTheDocument()
  })

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
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "返回" }))
    expect(screen.getByRole("dialog")).toBe(dialog)
    expect(
      screen.getByRole("heading", { name: "添加数据源" }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "关闭" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})

it("confirms removal of the selected data source and preserves readonly sources", async () => {
  queryState.dataSources = [
    {
      id: "dav",
      type: "webdav",
      name: "家庭存储",
      enabled: true,
      endpoint: "https://dav.example.com",
      username: "reader",
      hasPassword: true,
    },
    {
      id: "readonly-dav",
      type: "webdav",
      name: "只读数据源",
      enabled: true,
      endpoint: "https://readonly.example.com",
      username: "reader",
      hasPassword: true,
      readonly: true,
    },
  ]
  dataSourceMocks.deleteDataSource.mockResolvedValue(undefined)
  render(<DataSourcesSection />)
  expect(
    screen.queryByRole("button", { name: "删除 只读数据源" }),
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "删除 家庭存储" }))
  expect(dataSourceMocks.deleteDataSource).not.toHaveBeenCalled()
  const dialog = within(screen.getByRole("alertdialog"))
  fireEvent.click(dialog.getByRole("button", { name: "删除" }))
  await waitFor(() =>
    expect(dataSourceMocks.deleteDataSource).toHaveBeenCalledWith("dav"),
  )
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  )
})
