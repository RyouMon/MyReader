import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react-native"
import type { ComponentProps } from "react"
import { Platform } from "react-native"
import * as updater from "@/src/services/core/app-update"
import { useAppUpdate } from "./use-app-update"

jest.mock("@/src/services/core/app-update", () => ({
  getAppUpdate: jest.fn(),
  checkAppUpdate: jest.fn(),
  downloadAppUpdate: jest.fn(),
  installAppUpdate: jest.fn(),
  setAppUpdatePreferences: jest.fn(),
}))
type Snapshot = Awaited<ReturnType<typeof updater.getAppUpdate>>
let data: Snapshot
let client: QueryClient
const originalPlatform = Platform.OS
function wrapper({
  children,
}: {
  children: ComponentProps<typeof QueryClientProvider>["children"]
}) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
beforeEach(() => {
  jest.clearAllMocks()
  Platform.OS = "android"
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { gcTime: 0 },
    },
  })
  data = {
    currentVersion: "1.0.0",
    version: undefined,
    autoCheck: true,
    autoDownload: false,
    status: "idle",
    releaseUrl: undefined,
    notes: undefined,
    assetName: undefined,
    downloadedBytes: 0,
    totalBytes: 100,
    error: undefined,
  }
  jest.mocked(updater.getAppUpdate).mockImplementation(async () => data)
  jest.mocked(updater.checkAppUpdate).mockImplementation(async () => data)
  jest
    .mocked(updater.setAppUpdatePreferences)
    .mockImplementation(async (autoCheck, autoDownload) => {
      data = { ...data, autoCheck, autoDownload }
      return data
    })
})
afterEach(() => {
  client.clear()
  Platform.OS = originalPlatform
})

it("checks and polls downloads without launching the Android installer automatically", async () => {
  const { result } = renderHook(useAppUpdate, { wrapper })
  await waitFor(() => expect(result.current.data?.status).toBe("idle"))
  data = {
    ...data,
    version: "1.1.0",
    status: "available",
  }
  act(() => result.current.check())
  await waitFor(() => expect(result.current.data?.version).toBe("1.1.0"))
  expect(updater.checkAppUpdate).toHaveBeenCalledWith(true)
  let complete!: (value: Snapshot) => void
  jest.mocked(updater.downloadAppUpdate).mockImplementation(() => {
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
  expect(updater.installAppUpdate).not.toHaveBeenCalled()
  act(() => result.current.install())
  await waitFor(() => expect(updater.installAppUpdate).toHaveBeenCalledTimes(1))
})

it("saves preferences and lets the user retry a failed check", async () => {
  const { result } = renderHook(useAppUpdate, { wrapper })
  await waitFor(() => expect(result.current.data).toBeDefined())
  act(() => result.current.setPreferences(false, true))
  await waitFor(() => expect(result.current.data?.autoDownload).toBe(true))
  expect(updater.setAppUpdatePreferences).toHaveBeenCalledWith(false, true)
  jest
    .mocked(updater.checkAppUpdate)
    .mockRejectedValueOnce(new Error("offline"))
  act(() => result.current.check())
  await waitFor(() => expect(result.current.error?.message).toBe("offline"))
  act(() => result.current.check())
  await waitFor(() => expect(result.current.error).toBeNull())
})

it("never starts the updater on iOS", () => {
  Platform.OS = "ios"
  const { result } = renderHook(useAppUpdate, { wrapper })
  act(() => result.current.check(false))
  expect(result.current.supported).toBe(false)
  expect(updater.getAppUpdate).not.toHaveBeenCalled()
  expect(updater.checkAppUpdate).not.toHaveBeenCalled()
})
