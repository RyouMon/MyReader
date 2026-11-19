import { act, renderHook, waitFor } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { api } from "@/lib/tauri-api"
import { useRemoteFolderBrowser } from "../useRemoteFolderBrowser"

vi.mock("@/lib/tauri-api", () => ({
  api: { remoteListFolders: vi.fn(), remoteCreateFolder: vi.fn() },
}))

it("adds a confirmed folder to the current listing and preserves it after a conflict", async () => {
  const existing = { name: "Existing", path: "/Existing" }
  const created = { name: "新书库", path: "/新书库" }
  vi.mocked(api.remoteListFolders).mockResolvedValue([existing])
  vi.mocked(api.remoteCreateFolder).mockResolvedValueOnce(created)
  const { result } = renderHook(() => useRemoteFolderBrowser("source", true))
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => {
    await result.current.createFolder("新书库")
  })
  expect(api.remoteCreateFolder).toHaveBeenCalledWith("source", "/", "新书库")
  expect(result.current.folders).toEqual([created, existing])
  expect(result.current.currentPath).toBe("/")
  vi.mocked(api.remoteCreateFolder).mockRejectedValueOnce(
    new Error("REMOTE_DIRECTORY_ALREADY_EXISTS"),
  )
  await act(async () => {
    await expect(result.current.createFolder("新书库")).rejects.toThrow(
      "REMOTE_DIRECTORY_ALREADY_EXISTS",
    )
  })
  expect(result.current.folders).toEqual([created, existing])
})
