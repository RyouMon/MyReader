import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { isTauri } from "@tauri-apps/api/core"
import { api, type AppUpdateSnapshot } from "@/lib/tauri-api"
import { useAppUpdate } from "../useAppUpdate"

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => true) }))
vi.mock("@/lib/tauri-api", () => ({
  api: {
    getAppUpdate: vi.fn(),
    checkAppUpdate: vi.fn(),
    downloadAppUpdate: vi.fn(),
    openAppUpdateInstaller: vi.fn(),
    setAppUpdatePreferences: vi.fn(),
  },
}))

let data: AppUpdateSnapshot
let client: QueryClient
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isTauri).mockReturnValue(true)
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { gcTime: 0 },
    },
  })
  data = {
    currentVersion: "1.0.0",
    version: null,
    autoCheck: true,
    autoDownload: false,
    status: "idle",
    releaseUrl: null,
    notes: null,
    assetName: null,
    downloadedBytes: 0,
    totalBytes: 100,
    error: null,
  }
  vi.mocked(api.getAppUpdate).mockImplementation(async () => data)
  vi.mocked(api.checkAppUpdate).mockImplementation(async () => data)
  vi.mocked(api.setAppUpdatePreferences).mockImplementation(
    async (autoCheck, autoDownload) => {
      data = { ...data, autoCheck, autoDownload }
      return data
    },
  )
})
afterEach(() => client.clear())

it("checks on request, polls transfer progress, and opens the installer only after an explicit action", async () => {
  const { result } = renderHook(useAppUpdate, { wrapper })
  await waitFor(() => expect(result.current.data?.status).toBe("idle"))
  data = {
    ...data,
    version: "1.1.0",
    status: "available",
  }
  act(() => result.current.check())
  await waitFor(() => expect(result.current.data?.version).toBe("1.1.0"))
  expect(api.checkAppUpdate).toHaveBeenCalledWith(true)
  let complete!: (value: AppUpdateSnapshot) => void
  vi.mocked(api.downloadAppUpdate).mockImplementation(() => {
    data = { ...data, status: "downloading", downloadedBytes: 25 }
    return new Promise((resolve) => {
      complete = resolve
    })
  })
  act(() => result.current.download())
  await waitFor(() => expect(result.current.data?.downloadedBytes).toBe(25))
  expect(result.current.busy).toBe(true)
  data = { ...data, status: "downloaded", downloadedBytes: 100 }
  act(() => complete(data))
  await waitFor(() => expect(result.current.busy).toBe(false))
  expect(result.current.data?.status).toBe("downloaded")
  expect(api.openAppUpdateInstaller).not.toHaveBeenCalled()
  act(() => result.current.install())
  await waitFor(() => expect(api.openAppUpdateInstaller).toHaveBeenCalledOnce())
})

it("persists preferences before running an automatic check and recovers from failed actions", async () => {
  const { result } = renderHook(useAppUpdate, { wrapper })
  await waitFor(() => expect(result.current.data).toBeDefined())
  act(() => result.current.setPreferences(false, true))
  await waitFor(() => expect(result.current.data?.autoCheck).toBe(false))
  expect(api.setAppUpdatePreferences).toHaveBeenCalledWith(false, true)
  expect(api.checkAppUpdate).toHaveBeenCalledWith(false)
  vi.mocked(api.checkAppUpdate).mockRejectedValueOnce(new Error("offline"))
  act(() => result.current.check())
  await waitFor(() => expect(result.current.error?.message).toBe("offline"))
  act(() => result.current.check())
  await waitFor(() => expect(result.current.error).toBeNull())
})

it("does not fetch or check updates outside the native app", () => {
  vi.mocked(isTauri).mockReturnValue(false)
  const { result } = renderHook(useAppUpdate, { wrapper })
  act(() => result.current.check(false))
  expect(result.current.supported).toBe(false)
  expect(api.getAppUpdate).not.toHaveBeenCalled()
  expect(api.checkAppUpdate).not.toHaveBeenCalled()
})
