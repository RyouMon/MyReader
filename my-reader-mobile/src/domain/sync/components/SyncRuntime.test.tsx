import { act, render, waitFor } from "@testing-library/react-native"
import { SyncRuntime } from "./SyncRuntime"
import { announceLocalSidecarWork } from "@/src/services/core/sync-events"
import { notifySyncError } from "@/src/domain/sync/notify-sync-error"

const mockRuntime = {
  recover: jest.fn(() => Promise.resolve()),
  requestContextualPull: jest.fn(() => Promise.resolve()),
  request: jest.fn(),
  startSafetySweep: jest.fn(() => jest.fn()),
  setLibraryOnline: jest.fn(),
  dispose: jest.fn(),
  flush: jest.fn(),
}
const mockState = {
  storeReady: true,
  activeLibraryId: "lib",
  libraries: [{ id: "lib", path: "file:///new", sourceType: "local" }],
  dataSources: [],
  settings: { enableAutoSync: true, syncOnStartup: true },
}
jest.mock("expo-router", () => ({ usePathname: () => "/settings" }))
jest.mock("expo-network", () => ({
  getNetworkStateAsync: () => Promise.resolve({ isConnected: true }),
  addNetworkStateListener: () => ({ remove: jest.fn() }),
}))
jest.mock("@/src/store/app-store", () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mockState) => unknown) => selector(mockState),
    { getState: () => mockState },
  ),
}))
jest.mock("@/src/domain/sync", () => ({ runSyncLibraries: jest.fn() }))
jest.mock("@/src/domain/sync/hooks/apply-sync-report", () => ({
  applySyncRunReports: jest.fn(),
}))
jest.mock("@/src/domain/sync/sidecar-sync-runtime", () => ({
  createSidecarSyncRuntime: () => mockRuntime,
}))
jest.mock("@/src/domain/sync/notify-sync-error", () => ({
  notifySyncError: jest.fn(),
}))
jest.mock("@/src/services/auth/onedrive", () => ({
  getValidAccessToken: jest.fn(),
}))
jest.mock("@/src/services/remote/auth-cache", () => ({
  setCachedAuth: jest.fn(),
}))
jest.mock("@/src/store/sync-status-observer", () => ({
  observeLibrarySync: jest.fn(),
}))
jest.mock("@/src/utils/common", () => ({
  scheduleIdleWork: jest.fn(),
  cancelIdleWork: jest.fn(),
}))
beforeEach(() => jest.clearAllMocks())
it("reloads the repaired schedule before requesting an automatic pull", async () => {
  const view = render(<SyncRuntime />)
  await waitFor(() => expect(mockRuntime.recover).toHaveBeenCalledTimes(1))
  let finish!: () => void
  mockRuntime.recover.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  act(() =>
    announceLocalSidecarWork("lib", { required: true, locationChanged: true }),
  )
  expect(mockRuntime.requestContextualPull).not.toHaveBeenCalled()
  await act(async () => finish())
  expect(mockRuntime.requestContextualPull).toHaveBeenCalledWith(
    "lib",
    "library_activated",
  )
  expect(mockRuntime.request).not.toHaveBeenCalled()
  view.unmount()
})
it("reports failed recovery and does not schedule stale work for another library", async () => {
  render(<SyncRuntime />)
  await waitFor(() => expect(mockRuntime.recover).toHaveBeenCalledTimes(1))
  act(() => announceLocalSidecarWork("other", { locationChanged: true }))
  expect(mockRuntime.recover).toHaveBeenCalledTimes(1)
  const error = new Error("recovery unavailable")
  mockRuntime.recover.mockRejectedValueOnce(error)
  act(() => announceLocalSidecarWork("lib", { locationChanged: true }))
  await waitFor(() =>
    expect(notifySyncError).toHaveBeenCalledWith(error, "recovery"),
  )
  expect(mockRuntime.requestContextualPull).not.toHaveBeenCalled()
})
