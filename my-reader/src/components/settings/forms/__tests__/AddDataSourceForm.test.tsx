import "@/i18n"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AddDataSourceForm } from "../AddDataSourcePanel"

const onedriveStartAuth = vi.hoisted(() => vi.fn())

vi.mock("@/hooks/queries/useDataSourcesQuery", () => ({
  useDataSourceMutations: () => ({ testConnection: vi.fn() }),
}))

vi.mock("@/lib/tauri-api", () => ({
  api: { onedriveStartAuth },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("AddDataSourceForm", () => {
  it("validates S3 fields and keeps credential bytes intact on submission", async () => {
    const create = vi.fn().mockResolvedValue({ id: "s3-1", type: "s3" })
    render(<AddDataSourceForm type="s3" onCreateDataSource={create} />)
    fireEvent.click(screen.getByRole("button", { name: "保存" }))
    expect(screen.getByText("请输入 S3 地址")).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
    for (const [label, value] of [
      ["显示名称", " Archive "],
      ["S3 地址", " https://storage.example "],
      ["存储桶", " books "],
      ["区域", " us-east-1 "],
      ["根路径（可选）", " /Books "],
      ["Access Key ID", " key "],
      ["Secret Access Key", " secret "],
      ["会话令牌（可选）", " session "],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    expect(screen.getByLabelText("Secret Access Key")).toHaveAttribute(
      "type",
      "password",
    )
    fireEvent.click(screen.getByRole("button", { name: "保存" }))
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        id: "",
        type: "s3",
        enabled: true,
        name: "Archive",
        endpoint: "https://storage.example",
        bucket: "books",
        region: "us-east-1",
        rootPath: "/Books",
        virtualHostStyle: false,
        hasCredentials: true,
        accessKeyId: "key",
        secretAccessKey: " secret ",
        sessionToken: "session",
      }),
    )
  })

  it("should keep the WebDAV path in the server address", async () => {
    const onCreateDataSource = vi.fn().mockResolvedValue({
      id: "webdav-1",
      type: "webdav",
      name: "http://192.168.1.12:5244/dav/",
      enabled: true,
      endpoint: "http://192.168.1.12:5244/dav/",
      username: "reader",
      hasPassword: true,
      rootPath: null,
    })

    render(
      <AddDataSourceForm
        type="webdav"
        onCreateDataSource={onCreateDataSource}
      />,
    )

    expect(
      screen.queryByLabelText("远程根路径（可选）"),
    ).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("服务器地址"), {
      target: { value: "http://192.168.1.12:5244/dav/" },
    })
    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "reader" },
    })
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret" },
    })
    fireEvent.click(screen.getByRole("button", { name: "保存" }))

    await waitFor(() => {
      expect(onCreateDataSource).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: "http://192.168.1.12:5244/dav/",
          name: "http://192.168.1.12:5244/dav/",
          rootPath: null,
        }),
      )
    })
  })

  it("should keep WebDAV actions outside scrolling content when filling available height", () => {
    const { container } = render(
      <AddDataSourceForm
        type="webdav"
        fillAvailableHeight
        onCreateDataSource={vi.fn()}
      />,
    )

    const form = container.querySelector("form")
    const content = container.querySelector('[data-slot="webdav-form-content"]')
    const actions = container.querySelector('[data-slot="dialog-footer"]')
    const testButton = screen.getByRole("button", { name: "测试连接" })
    const saveButton = screen.getByRole("button", { name: "保存" })

    expect(form).toHaveClass("h-full", "min-h-0", "flex-col")
    expect(content).toHaveClass("min-h-0", "flex-1", "overflow-y-auto")
    expect(actions).toHaveClass("shrink-0", "justify-between")
    expect(content?.nextElementSibling).toBe(actions)
    expect(testButton.parentElement).toBe(actions)
    expect(saveButton.parentElement).toBe(actions)
    expect(testButton.querySelector("svg")).toBeInTheDocument()
  })

  it("should use the standard empty state when ready to add OneDrive", () => {
    const { container } = render(
      <AddDataSourceForm
        type="onedrive"
        fillAvailableHeight
        onCreateDataSource={vi.fn()}
      />,
    )

    const emptyState = container.querySelector('[data-slot="empty"]')
    expect(emptyState).toHaveClass("min-h-0", "flex-1")
    expect(screen.getByText("OneDrive")).toBeInTheDocument()
    expect(screen.queryByText("登录 Microsoft 账号。")).not.toBeInTheDocument()
    const signInButton = screen.getByRole("button", {
      name: "使用微软登录",
    })
    expect(signInButton).toBeInTheDocument()
    expect(
      signInButton.closest('[data-slot="dialog-footer"]'),
    ).toBeInTheDocument()
  })

  it("should show one error with recovery actions when adding OneDrive fails", async () => {
    const errorMessage = "ONEDRIVE_DATASOURCE_ALREADY_EXISTS"
    const onCreateDataSource = vi
      .fn()
      .mockRejectedValue(new Error(errorMessage))
    onedriveStartAuth.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      userName: "Wen Liang",
      userEmail: "reader@example.com",
    })

    render(
      <AddDataSourceForm
        type="onedrive"
        fillAvailableHeight
        onCreateDataSource={onCreateDataSource}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "使用微软登录" }))

    await waitFor(() => {
      expect(
        screen.getAllByText(`未能完成此操作，请重试。 Error: ${errorMessage}`),
      ).toHaveLength(1)
      expect(screen.queryByText(errorMessage)).not.toBeInTheDocument()
    })
    const changeAccountButton = screen.getByRole("button", {
      name: "更换其他账号",
    })
    const retryButton = screen.getByRole("button", { name: "重试添加" })
    expect(changeAccountButton.querySelector("svg")).toBeInTheDocument()
    expect(retryButton.querySelector("svg")).toBeInTheDocument()
  })

  it.each([
    ["gdrive", "Google Drive"],
    ["dropbox", "Dropbox"],
  ] as const)("should start %s OAuth without exposing application credentials", async (type, provider) => {
    const onCreateDataSource = vi.fn().mockResolvedValue({
      id: `${type}-1`,
      type,
      name: provider,
      enabled: true,
      clientId: "",
      hasRefreshToken: true,
    })

    render(
      <AddDataSourceForm type={type} onCreateDataSource={onCreateDataSource} />,
    )

    expect(screen.queryByLabelText("OAuth 客户端 ID")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Dropbox App Key")).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText("OAuth 客户端密钥（可选）"),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: `登录 ${provider}` }))

    await waitFor(() => expect(onCreateDataSource).toHaveBeenCalledTimes(1))
    expect(onCreateDataSource).toHaveBeenCalledWith(
      expect.objectContaining({ type }),
    )
    expect(onCreateDataSource.mock.calls[0][0]).not.toHaveProperty("clientId")
    expect(onCreateDataSource.mock.calls[0][0]).not.toHaveProperty(
      "clientSecret",
    )
  })

  it("does not expose Dropbox redirect configuration in the sign-in form", () => {
    render(<AddDataSourceForm type="dropbox" onCreateDataSource={vi.fn()} />)

    expect(
      screen.queryByText(/127\.0\.0\.1:53683\/oauth\/callback/),
    ).not.toBeInTheDocument()
  })
})
