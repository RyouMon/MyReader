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
  })

  it("should submit once when OneDrive form is submitted repeatedly while adding", async () => {
    const user = userEvent.setup()
    let finishAdding: (() => void) | undefined
    const onAddOnedriveLibrary = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishAdding = resolve
        }),
    )

    render(
      <AddLibraryPanel
        onAddLibrary={vi.fn()}
        onAddWebdavLibrary={vi.fn()}
        onAddOnedriveLibrary={onAddOnedriveLibrary}
      />,
    )

    await user.click(screen.getByRole("button", { name: "添加书库" }))
    await user.click(screen.getByRole("button", { name: /OneDrive/ }))
    fireEvent.change(screen.getByLabelText("书库路径"), {
      target: { value: "Library/CalibreLibrary" },
    })
    const form = screen.getByLabelText("书库路径").closest("form")
    expect(form).not.toBeNull()

    fireEvent.submit(form!)
    fireEvent.submit(form!)

    await waitFor(() => {
      expect(onAddOnedriveLibrary).toHaveBeenCalledTimes(1)
    })
    expect(onAddOnedriveLibrary).toHaveBeenCalledWith(
      "onedrive-1",
      "Library/CalibreLibrary",
    )

    await act(async () => {
      finishAdding?.()
    })
  })
})
