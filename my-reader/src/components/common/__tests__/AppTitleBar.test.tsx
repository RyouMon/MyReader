import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider } from "@/components/ui/sidebar"
import AppTitleBar from "../AppTitleBar"

const platform = vi.hoisted(() => ({
  isMacPlatform: vi.fn(() => false),
  isWindowsPlatform: vi.fn(() => false),
}))
const win = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  close: vi.fn(async () => {}),
  minimize: vi.fn(async () => {}),
  toggleMaximize: vi.fn(async () => {}),
  isMaximized: vi.fn(async () => false),
  isFocused: vi.fn(async () => true),
  unlistenFocus: vi.fn(),
  onFocusChanged: vi.fn(
    async (_listener: (event: { payload: boolean }) => void) => vi.fn(),
  ),
  onResized: vi.fn(async (_listener: () => void) => vi.fn()),
}))

vi.mock("@/lib/platform", () => platform)
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@tauri-apps/api/core", () => ({ isTauri: win.isTauri }))
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => win }))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function renderTitleBar(showSidebarToggle = true) {
  return render(
    <SidebarProvider>
      <AppTitleBar showSidebarToggle={showSidebarToggle} />
    </SidebarProvider>,
  )
}

describe("AppTitleBar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    platform.isMacPlatform.mockReturnValue(false)
    platform.isWindowsPlatform.mockReturnValue(false)
    win.isTauri.mockReturnValue(true)
    win.isMaximized.mockResolvedValue(false)
    win.isFocused.mockResolvedValue(true)
    win.onFocusChanged.mockResolvedValue(win.unlistenFocus)
  })

  it("keeps one sidebar toggle in the title bar and updates its accessible state", () => {
    renderTitleBar()

    const header = screen.getByRole("banner")
    const toggle = screen.getByRole("button", { name: "sidebar.collapse" })
    expect(header).toContainElement(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    fireEvent.click(toggle)
    expect(
      screen.getByRole("button", { name: "sidebar.expand" }),
    ).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(toggle)
    expect(toggle).toHaveAccessibleName("sidebar.collapse")
  })

  it("leaves macOS window controls to the native title bar", () => {
    platform.isMacPlatform.mockReturnValue(true)
    renderTitleBar()

    expect(screen.getAllByRole("button")).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "reader.close" })).toBeNull()
  })

  it("places the Windows sidebar toggle first and connects the trailing window controls", async () => {
    platform.isWindowsPlatform.mockReturnValue(true)
    renderTitleBar()

    const buttons = screen.getAllByRole("button")
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "sidebar.collapse",
      "reader.minimize",
      "reader.maximize",
      "reader.close",
    ])
    fireEvent.click(buttons[1])
    fireEvent.click(buttons[2])
    fireEvent.click(buttons[3])
    expect(win.minimize).toHaveBeenCalledOnce()
    expect(win.toggleMaximize).toHaveBeenCalledOnce()
    expect(win.close).toHaveBeenCalledOnce()
    await waitFor(() => expect(win.isMaximized).toHaveBeenCalled())
  })

  it("updates the Windows restore action after a native resize", async () => {
    platform.isWindowsPlatform.mockReturnValue(true)
    renderTitleBar()
    await waitFor(() => expect(win.onResized).toHaveBeenCalled())

    win.isMaximized.mockResolvedValue(true)
    await act(async () => win.onResized.mock.calls[0][0]())
    fireEvent.click(screen.getByRole("button", { name: "reader.restore" }))
    expect(win.toggleMaximize).toHaveBeenCalledOnce()
  })

  it("keeps title-bar dragging and window controls when settings hide the library toggle", () => {
    platform.isWindowsPlatform.mockReturnValue(true)
    win.isTauri.mockReturnValue(false)
    renderTitleBar(false)

    expect(screen.queryByTestId("sidebar-toggle-button")).toBeNull()
    expect(screen.getByRole("banner")).toHaveAttribute("data-tauri-drag-region")
    for (const button of screen.getAllByRole("button")) {
      expect(button).not.toHaveAttribute("data-tauri-drag-region")
      fireEvent.click(button)
    }
    expect(win.close).not.toHaveBeenCalled()
    expect(win.minimize).not.toHaveBeenCalled()
    expect(win.toggleMaximize).not.toHaveBeenCalled()
  })

  it("tracks native Windows focus changes and releases the listener on unmount", async () => {
    platform.isWindowsPlatform.mockReturnValue(true)
    win.isFocused.mockResolvedValue(false)
    const view = renderTitleBar()
    const titlebar = screen.getByRole("banner")

    await waitFor(() =>
      expect(titlebar).toHaveAttribute("data-window-focused", "false"),
    )
    await waitFor(() => expect(win.onFocusChanged).toHaveBeenCalledOnce())
    act(() => win.onFocusChanged.mock.calls[0][0]({ payload: true }))
    expect(titlebar).toHaveAttribute("data-window-focused", "true")
    act(() => win.onFocusChanged.mock.calls[0][0]({ payload: false }))
    expect(titlebar).toHaveAttribute("data-window-focused", "false")

    view.unmount()
    expect(win.unlistenFocus).toHaveBeenCalledOnce()
  })
})
