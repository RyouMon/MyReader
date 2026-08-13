import "@/i18n"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { StrictMode } from "react"
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
    const addButton = screen.getByRole("button", { name: "添加" })

    expect(form).toHaveClass("h-full", "min-h-0", "flex-col")
    expect(content).toHaveClass("min-h-0", "flex-1", "overflow-y-auto")
    expect(actions).toHaveClass("shrink-0", "justify-between")
    expect(content?.nextElementSibling).toBe(actions)
    expect(testButton.parentElement).toBe(actions)
    expect(addButton.parentElement).toBe(actions)
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

  it("should start OneDrive authentication immediately when requested", async () => {
    onedriveStartAuth.mockReturnValue(new Promise(() => {}))

    render(
      <StrictMode>
        <AddDataSourceForm
          type="onedrive"
          fillAvailableHeight
          autoStartOnedriveAuth
          onCreateDataSource={vi.fn()}
        />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(onedriveStartAuth).toHaveBeenCalledTimes(1)
    })
    expect(
      screen.queryByRole("button", { name: "使用微软登录" }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toBeInTheDocument()
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
      expect(screen.getAllByText(errorMessage)).toHaveLength(1)
    })
    const changeAccountButton = screen.getByRole("button", {
      name: "更换其他账号",
    })
    const retryButton = screen.getByRole("button", { name: "重试添加" })
    expect(changeAccountButton.querySelector("svg")).toBeInTheDocument()
    expect(retryButton.querySelector("svg")).toBeInTheDocument()
  })
})
