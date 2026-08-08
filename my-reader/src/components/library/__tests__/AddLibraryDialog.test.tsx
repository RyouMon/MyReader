import "@/i18n"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AddLibraryDialog } from "../AddLibraryDialog"

const createDataSource = vi.fn()

vi.mock("@/hooks/queries/useDataSourcesQuery", () => ({
  useDataSourcesQuery: () => ({ data: [], isLoading: false }),
  useDataSourceMutations: () => ({ createDataSource }),
}))

vi.mock("@/hooks/queries/useLibrariesQuery", () => ({
  useLibraryMutations: () => ({
    createLocalMyreaderLibrary: vi.fn(),
    createRemoteMyreaderLibrary: vi.fn(),
    openExistingLocalLibrary: vi.fn(),
    openExistingRemoteLibrary: vi.fn(),
  }),
}))

vi.mock("@/components/settings/forms/AddDataSourcePanel", () => ({
  AddDataSourceForm: ({
    type,
    onCreated,
    fillAvailableHeight,
    autoStartOnedriveAuth,
  }: {
    type: "webdav" | "onedrive"
    fillAvailableHeight?: boolean
    autoStartOnedriveAuth?: boolean
    onCreated: (source: {
      id: string
      type: "webdav" | "onedrive"
      name: string
      enabled: boolean
    }) => void
  }) => (
    <button
      type="button"
      data-fill-available-height={fillAvailableHeight}
      data-auto-start-onedrive-auth={autoStartOnedriveAuth}
      onClick={() =>
        onCreated({
          id: `${type}-new`,
          type,
          name: `New ${type}`,
          enabled: true,
        })
      }
    >
      Complete {type}
    </button>
  ),
}))

vi.mock("@/components/settings/WebdavFolderBrowser", () => ({
  WebdavFolderBrowser: ({
    dataSourceId,
    embedded,
    selectLabel,
    onSelect,
  }: {
    dataSourceId: string
    embedded?: boolean
    selectLabel?: string
    onSelect?: (path: string) => void
  }) => (
    <div data-testid="webdav-browser" data-embedded={embedded}>
      Browse WebDAV {dataSourceId}
      <button type="button" onClick={() => onSelect?.("/")}>
        {selectLabel ?? "选择此文件夹"}
      </button>
    </div>
  ),
}))

vi.mock("@/components/settings/OnedriveFolderBrowser", () => ({
  OnedriveFolderBrowser: ({
    embedded,
    selectLabel,
    onSelect,
  }: {
    embedded?: boolean
    selectLabel?: string
    onSelect?: (path: string) => void
  }) => (
    <div data-testid="onedrive-browser" data-embedded={embedded}>
      Browse OneDrive
      <button type="button" onClick={() => onSelect?.("/")}>
        {selectLabel ?? "选择此文件夹"}
      </button>
    </div>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("AddLibraryDialog", () => {
  it("should keep data source creation inside the add-library flow", () => {
    render(<AddLibraryDialog open onOpenChange={vi.fn()} />)
    const flowDialog = screen.getByRole("dialog")
    expect(flowDialog).toHaveClass("h-[min(86vh,720px)]")
    expect(flowDialog).toHaveClass("grid-rows-[auto_minmax(0,1fr)]")

    expect(
      screen.getByText("打开已创建的 MyReader 书库或 Calibre 书库。"),
    ).toBeInTheDocument()
    expect(screen.getByText("创建 MyReader 书库")).toBeInTheDocument()
    expect(screen.getByText("什么是 MyReader 书库？")).toBeInTheDocument()
    expect(screen.getByText("什么是 Calibre 书库？")).toBeInTheDocument()
    expect(screen.getByText("关于阅读数据同步")).toBeInTheDocument()
    expect(
      screen.getByText(
        "两种书库都支持在设备间同步阅读数据。将书库存放在云存储中，再从不同设备打开同一个书库即可。",
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("我该选择哪一个？")).toBeInTheDocument()
    expect(
      screen.getByText(
        "如果你之前使用 Calibre 管理书库，推荐选择“打开已有书库”；否则，选择“创建新书库”。",
      ),
    ).toBeInTheDocument()
    const helpText =
      screen.getByText("我该选择哪一个？").parentElement?.parentElement
        ?.textContent ?? ""
    expect(helpText.indexOf("关于阅读数据同步")).toBeLessThan(
      helpText.indexOf("我该选择哪一个？"),
    )
    fireEvent.click(screen.getByRole("button", { name: /创建新书库/ }))

    expect(screen.getByRole("button", { name: /本地存储/ })).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /添加 WebDAV/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /添加 OneDrive/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("填写服务器地址和账号信息。"),
    ).not.toBeInTheDocument()
    expect(screen.queryByText("登录 Microsoft 账号。")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /添加 OneDrive/ }))
    expect(
      screen.getByRole("heading", { name: "添加 OneDrive" }),
    ).toBeInTheDocument()
    expect(screen.queryByText("登录 Microsoft 账号。")).not.toBeInTheDocument()
    const backButton = screen.getByRole("button", { name: "返回" })
    const closeButton = screen.getByRole("button", { name: "关闭" })
    expect(backButton).toHaveAttribute("data-variant", "ghost")
    expect(closeButton).toHaveAttribute("data-variant", "ghost")
    expect(backButton).toHaveAttribute("data-size", "icon-sm")
    expect(closeButton).toHaveAttribute("data-size", "icon-sm")
    expect(backButton.parentElement).toBe(closeButton.parentElement)
    expect(backButton.parentElement).toHaveClass("items-center")

    const completeOnedriveButton = screen.getByRole("button", {
      name: "Complete onedrive",
    })
    expect(completeOnedriveButton).toHaveAttribute(
      "data-fill-available-height",
      "true",
    )
    expect(completeOnedriveButton).toHaveAttribute(
      "data-auto-start-onedrive-auth",
      "true",
    )
    expect(completeOnedriveButton.parentElement).toHaveClass("overflow-hidden")

    fireEvent.click(completeOnedriveButton)
    expect(screen.getByRole("dialog")).toBe(flowDialog)
    expect(
      screen.getByRole("heading", { name: "浏览 OneDrive 文件夹" }),
    ).toBeInTheDocument()
    expect(screen.getByTestId("onedrive-browser")).toHaveAttribute(
      "data-embedded",
      "true",
    )
    expect(
      screen.getByRole("button", { name: "选择此文件夹" }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "选择此文件夹" }))
    expect(
      screen.getByRole("heading", { name: "命名新书库" }),
    ).toBeInTheDocument()
    const createLibraryButton = screen.getByRole("button", {
      name: "创建书库",
    })
    expect(
      createLibraryButton.closest('[data-slot="dialog-footer"]'),
    ).toBeInTheDocument()
    expect(
      createLibraryButton
        .closest('[data-slot="dialog-footer"]')
        ?.querySelector('[aria-label="返回"]'),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "返回" }))
    expect(screen.getByRole("dialog")).toBe(flowDialog)
    expect(screen.getByRole("button", { name: /本地存储/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /添加 WebDAV/ }))
    expect(
      screen.getByRole("heading", { name: "添加 WebDAV" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("填写服务器地址和账号信息。"),
    ).not.toBeInTheDocument()

    const completeWebdavButton = screen.getByRole("button", {
      name: "Complete webdav",
    })
    expect(completeWebdavButton).toHaveAttribute(
      "data-fill-available-height",
      "true",
    )
    expect(completeWebdavButton.parentElement).toHaveClass("overflow-hidden")

    fireEvent.click(completeWebdavButton)
    expect(screen.getByRole("dialog")).toBe(flowDialog)
    expect(
      screen.getByRole("heading", { name: "选择文件夹" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Browse WebDAV webdav-new")).toBeInTheDocument()
    expect(screen.getByTestId("webdav-browser")).toHaveAttribute(
      "data-embedded",
      "true",
    )
    expect(
      screen.getByRole("button", { name: "选择此文件夹" }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "返回" }))
    expect(screen.getByRole("dialog")).toBe(flowDialog)
    expect(screen.getByRole("button", { name: /本地存储/ })).toBeInTheDocument()
  })
})
