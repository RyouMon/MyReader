import "@/i18n"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AddLibraryPanel } from "../AddLibraryPanel"

vi.mock("@/hooks/queries/useDataSourcesQuery", () => ({
  useDataSourcesQuery: () => ({
    data: [
      {
        id: "onedrive-1",
        name: "OneDrive",
        enabled: true,
        type: "onedrive",
      },
    ],
    isLoading: false,
  }),
}))

vi.mock("@/components/settings/OnedriveFolderBrowser", () => ({
  OnedriveFolderBrowser: () => null,
}))

vi.mock("@/components/settings/WebdavFolderBrowser", () => ({
  WebdavFolderBrowser: () => null,
}))

describe("AddLibraryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    })
  })

  it("should submit once when OneDrive form is submitted repeatedly while adding", async () => {
    const user = userEvent.setup()
    let finishAdding: (() => void) | undefined
    const onSubmitLibrary = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishAdding = resolve
        }),
    )

    render(<AddLibraryPanel onSubmitLibrary={onSubmitLibrary} />)

    await user.click(screen.getByRole("button", { name: "添加书库" }))
    act(() => {
      screen.getByRole("combobox", { name: "书库操作" }).focus()
    })
    await user.keyboard("{Enter}")
    await user.click(
      await screen.findByRole("option", { name: "连接 Calibre 书库" }),
    )
    await user.click(screen.getByRole("button", { name: /OneDrive/ }))
    fireEvent.change(screen.getByLabelText("书库路径"), {
      target: { value: "Library/CalibreLibrary" },
    })
    const form = screen.getByLabelText("书库路径").closest("form")
    expect(form).not.toBeNull()

    fireEvent.submit(form!)
    fireEvent.submit(form!)

    await waitFor(() => {
      expect(onSubmitLibrary).toHaveBeenCalledTimes(1)
    })
    expect(onSubmitLibrary).toHaveBeenCalledWith({
      operation: "connectCalibre",
      sourceType: "onedrive",
      dataSourceId: "onedrive-1",
      path: "Library/CalibreLibrary",
    })

    await act(async () => {
      finishAdding?.()
    })
  })
})
