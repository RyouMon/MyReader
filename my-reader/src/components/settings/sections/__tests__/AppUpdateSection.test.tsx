import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import AppUpdateSection from "../AppUpdateSection"
import { useAppUpdate } from "@/hooks/useAppUpdate"
import i18n from "@/i18n"
import type { AppUpdateSnapshot } from "@/lib/tauri-api"

vi.mock("@/hooks/useAppUpdate", () => ({ useAppUpdate: vi.fn() }))
const check = vi.fn(),
  download = vi.fn(),
  reveal = vi.fn(),
  setPreferences = vi.fn()
const snapshot: AppUpdateSnapshot = {
  currentVersion: "0.18.0",
  autoCheck: true,
  autoDownload: false,
  status: "available",
  version: "0.19.0",
  releaseUrl: "https://github.com/RyouMon/MyReader/releases/tag/v0.19.0",
  notes: "A new release",
  assetName: "MyReader_0.19.0_x64-setup.exe",
  downloadedBytes: 0,
  totalBytes: 100,
  error: null,
}
function state(patch: Partial<AppUpdateSnapshot> = {}, busy = false) {
  vi.mocked(useAppUpdate).mockReturnValue({
    data: { ...snapshot, ...patch },
    error: null,
    busy,
    supported: true,
    check,
    download,
    reveal,
    setPreferences,
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage("en")
  state()
})

describe("app updates", () => {
  it("lets the user check, download, and opt into automatic downloads independently", () => {
    render(<AppUpdateSection />)
    expect(download).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }))
    fireEvent.click(screen.getByRole("button", { name: "Download installer" }))
    fireEvent.click(
      screen.getByRole("switch", { name: "Automatically download installers" }),
    )
    expect(check).toHaveBeenCalled()
    expect(download).toHaveBeenCalledTimes(1)
    expect(setPreferences).toHaveBeenCalledWith(true, true)
    expect(reveal).not.toHaveBeenCalled()
  })
  it("requires an explicit click to reveal a downloaded installer", () => {
    state({ status: "downloaded", downloadedBytes: 100 })
    render(<AppUpdateSection />)
    expect(screen.getByRole("status")).toHaveTextContent("0.19.0")
    expect(reveal).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole("button", { name: "Show installer in folder" }),
    )
    expect(reveal).toHaveBeenCalledTimes(1)
  })
  it("shows download progress and disables conflicting actions during transfer", () => {
    state({ status: "downloading", downloadedBytes: 25 }, true)
    render(<AppUpdateSection />)
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "25")
    expect(
      screen.getByRole("button", { name: "Download installer" }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "Check for updates" }),
    ).toBeDisabled()
  })
  it("offers a fresh download after verification fails", () => {
    state({ status: "error", error: "UPDATE_INTEGRITY_FAILED" })
    render(<AppUpdateSection />)
    expect(screen.getByRole("alert")).toHaveTextContent("Download it again")
    fireEvent.click(screen.getByRole("button", { name: "Download installer" }))
    expect(download).toHaveBeenCalledOnce()
    expect(
      screen.queryByRole("button", { name: "Show installer in folder" }),
    ).not.toBeInTheDocument()
  })
})
