import "@/i18n"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BookMoreMenu } from "../BookMoreMenu"

const tauriApiMock = vi.hoisted(() => ({
  checkBookFileState: vi.fn(),
  downloadBookFile: vi.fn(),
  cancelBookDownload: vi.fn(),
  deleteLocalBookFile: vi.fn(),
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
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    toastMock.error.mockClear()
    tauriApiMock.checkBookFileState.mockReset()
    tauriApiMock.downloadBookFile.mockReset()
    tauriApiMock.cancelBookDownload.mockReset()
    tauriApiMock.deleteLocalBookFile.mockReset()
  })

  it("首页下载任务启动失败时显示全局失败通知", async () => {
    const user = userEvent.setup()

    renderWithClient(
      <BookMoreMenu
        book={{ id: 42, title: "下载状态测试书", formats: ["EPUB"] }}
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
})
