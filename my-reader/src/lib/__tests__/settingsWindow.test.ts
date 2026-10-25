import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import readerCapability from "../../../src-tauri/capabilities/reader.json"
import { useSettingsWindowNavigation } from "@/hooks/useSettingsWindowNavigation"
import { openTtsProviderSettings } from "../settingsWindow"

const mocks = vi.hoisted(() => ({
  getByLabel: vi.fn(),
  navigate: vi.fn(),
  unlisten: vi.fn(),
  listener: undefined as (() => void) | undefined,
}))
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }))
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: { getByLabel: mocks.getByLabel },
}))
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event, listener) => {
    mocks.listener = listener
    return mocks.unlisten
  }),
}))
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }))

beforeEach(() => vi.clearAllMocks())

it("opens providers in the main window, restoring it before focusing, and handles repeated requests", async () => {
  const state = { visible: false, minimized: true, focused: false }
  const main = {
    emitTo: vi.fn(async () => mocks.listener?.()),
    show: vi.fn(async () => {
      state.visible = true
    }),
    unminimize: vi.fn(async () => {
      state.minimized = false
    }),
    setFocus: vi.fn(async () => {
      state.focused = state.visible && !state.minimized
    }),
  }
  mocks.getByLabel.mockResolvedValue(main)
  const { unmount } = renderHook(useSettingsWindowNavigation)
  await openTtsProviderSettings()
  await openTtsProviderSettings()
  expect(mocks.getByLabel).toHaveBeenCalledWith("main")
  expect(main.emitTo).toHaveBeenCalledWith(
    "main",
    "myreader://open-tts-providers",
  )
  expect(state).toEqual({ visible: true, minimized: false, focused: true })
  expect(mocks.navigate).toHaveBeenCalledTimes(2)
  expect(mocks.navigate).toHaveBeenLastCalledWith({
    to: "/settings",
    search: { section: "ttsProviders" },
  })
  expect(readerCapability.permissions).toEqual(
    expect.arrayContaining([
      "core:window:allow-show",
      "core:window:allow-unminimize",
      "core:window:allow-set-focus",
    ]),
  )
  unmount()
  await waitFor(() => expect(mocks.unlisten).toHaveBeenCalledOnce())
})

it("surfaces a missing main window instead of opening management in the reader", async () => {
  mocks.getByLabel.mockResolvedValue(null)
  await expect(openTtsProviderSettings()).rejects.toThrow(
    "MAIN_WINDOW_NOT_FOUND",
  )
})
