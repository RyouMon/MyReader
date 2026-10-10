import { beforeEach, describe, expect, it, vi } from "vitest"
import mainCapability from "../../../src-tauri/capabilities/default.json"
import { READER_PREFERENCES_REFRESH_EVENT } from "../readerPreferencesEvents"
import { openReaderInNewWindow } from "../readerWindow"

const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  getByLabel: vi.fn(),
  createWindow: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({ isTauri: mocks.isTauri }))
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: Object.assign(
    function (label: string, options: unknown) {
      mocks.createWindow(label, options)
      return { once: vi.fn() }
    },
    { getByLabel: mocks.getByLabel },
  ),
}))
vi.mock("@/lib/platform", () => ({ isMacPlatform: () => true }))

describe("openReaderInNewWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isTauri.mockReturnValue(true)
    mocks.getByLabel.mockResolvedValue(null)
  })

  it.each([
    false,
    true,
  ])("restores and focuses the existing reader (minimized: %s)", async (minimized) => {
    const state = { minimized, visible: false, focused: false }
    const existing = {
      emitTo: vi.fn().mockResolvedValue(undefined),
      setTitle: vi.fn().mockResolvedValue(undefined),
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
    mocks.getByLabel.mockResolvedValue(existing)

    await openReaderInNewWindow("42", "PDF", "Existing book")

    expect(mocks.getByLabel).toHaveBeenCalledWith("reader-42")
    expect(mocks.createWindow).not.toHaveBeenCalled()
    expect(state).toEqual({ minimized: false, visible: true, focused: true })
    expect(existing.emitTo).toHaveBeenCalledWith(
      "reader-42",
      READER_PREFERENCES_REFRESH_EVENT,
    )
    expect(existing.setTitle).toHaveBeenCalledWith("Existing book")
  })

  it("allows the main window to restore and focus a reader", () => {
    expect(mainCapability.permissions).toEqual(
      expect.arrayContaining([
        "core:window:allow-show",
        "core:window:allow-unminimize",
        "core:window:allow-set-focus",
      ]),
    )
  })

  it("creates a focused reader when the book has no window", async () => {
    await openReaderInNewWindow("42", "EPUB", "New book")

    expect(mocks.createWindow).toHaveBeenCalledOnce()
    expect(mocks.createWindow).toHaveBeenCalledWith(
      "reader-42",
      expect.objectContaining({
        url: "/read/42?format=EPUB",
        title: "New book",
        focus: true,
      }),
    )
  })

  it("leaves browser navigation to the caller outside Tauri", async () => {
    mocks.isTauri.mockReturnValue(false)

    await openReaderInNewWindow("42")

    expect(mocks.getByLabel).not.toHaveBeenCalled()
    expect(mocks.createWindow).not.toHaveBeenCalled()
  })
})
