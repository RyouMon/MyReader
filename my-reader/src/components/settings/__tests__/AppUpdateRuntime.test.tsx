import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { toast } from "sonner"
import { useAppUpdate } from "@/hooks/useAppUpdate"
import { AppUpdateRuntime } from "../AppUpdateRuntime"

vi.mock("@/hooks/useAppUpdate", () => ({ useAppUpdate: vi.fn() }))
vi.mock("sonner", () => ({ toast: { info: vi.fn() } }))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
const check = vi.fn()
let state: ReturnType<typeof useAppUpdate>
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  state = {
    supported: true,
    data: undefined,
    busy: false,
    error: null,
    check,
    download: vi.fn(),
    reveal: vi.fn(),
    setPreferences: vi.fn(),
  }
  vi.mocked(useAppUpdate).mockImplementation(() => state)
})
afterEach(() => vi.useRealTimers())

it("checks at startup, focus and hourly, then releases its listeners", () => {
  const view = render(<AppUpdateRuntime />)
  expect(check).toHaveBeenCalledWith(false)
  act(() => window.dispatchEvent(new Event("focus")))
  act(() => vi.advanceTimersByTime(60 * 60 * 1000))
  expect(check).toHaveBeenCalledTimes(3)
  view.unmount()
  act(() => window.dispatchEvent(new Event("focus")))
  act(() => vi.advanceTimersByTime(60 * 60 * 1000))
  expect(check).toHaveBeenCalledTimes(3)
})

it("announces each available and downloaded state once without starting installation", () => {
  const data = {
    currentVersion: "1.0.0",
    version: "1.1.0",
    autoCheck: true,
    autoDownload: false,
    status: "available",
    releaseUrl: null,
    notes: null,
    assetName: null,
    downloadedBytes: 0,
    totalBytes: 100,
    error: null,
  }
  state.data = data
  const view = render(<AppUpdateRuntime />)
  view.rerender(<AppUpdateRuntime />)
  expect(toast.info).toHaveBeenCalledTimes(1)
  state.data = { ...data, status: "downloaded" }
  view.rerender(<AppUpdateRuntime />)
  expect(toast.info).toHaveBeenLastCalledWith("appUpdates.status.downloaded")
  expect(toast.info).toHaveBeenCalledTimes(2)
  expect(state.reveal).not.toHaveBeenCalled()
})

it("does not schedule checks in the browser", () => {
  state.supported = false
  render(<AppUpdateRuntime />)
  act(() => vi.advanceTimersByTime(60 * 60 * 1000))
  expect(check).not.toHaveBeenCalled()
})
