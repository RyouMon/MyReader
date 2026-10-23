import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import AppUpdateSection from "../AppUpdateSection"
import { useAppUpdate } from "@/hooks/useAppUpdate"
import i18n from "@/i18n"
import type { AppUpdateSnapshot } from "@/lib/tauri-api"

vi.mock("@/hooks/useAppUpdate", () => ({ useAppUpdate: vi.fn() }))
const check = vi.fn(),
  download = vi.fn(),
  install = vi.fn(),
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
    install,
    setPreferences,
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage("en")
  state()
})

describe("app updates", () => {
  it("hides release content when the installed version is current", () => {
    state({
      status: "upToDate",
      version: null,
      notes: "Improved library browsing",
      assetName: null,
    })
    render(<AppUpdateSection />)
    expect(screen.getByText("Current version: 0.18.0")).toBeVisible()
    expect(screen.queryByText(/Latest version:/)).toBeNull()
    expect(screen.queryByText("Improved library browsing")).toBeNull()
    expect(screen.queryByRole("region", { name: "Release notes" })).toBeNull()
    expect(screen.getByRole("status")).toHaveTextContent("You are up to date")
    expect(
      screen.queryByRole("button", { name: "Download installer" }),
    ).toBeNull()
  })
  it("groups the new version with rendered Markdown notes and safe external links", () => {
    state({
      notes:
        "## Improvements\n\n- **Faster browsing**\n- Fixed `EPUB` loading\n\n[Full changelog](https://github.com/RyouMon/MyReader/releases/tag/v0.19.0)\n\n<script>alert('unsafe')</script>\n\n[Unsafe](javascript:alert(1))",
    })
    render(<AppUpdateSection />)
    const release = within(
      screen.getByRole("region", { name: "Release notes" }),
    )
    expect(
      release.getByRole("heading", { name: "Latest version: 0.19.0" }),
    ).toBeVisible()
    expect(release.getByRole("heading", { name: "Improvements" })).toBeVisible()
    expect(release.getAllByRole("listitem")).toHaveLength(2)
    expect(release.getByText("Faster browsing").tagName).toBe("STRONG")
    expect(release.getByText("EPUB").tagName).toBe("CODE")
    const link = release.getByRole("link", { name: "Full changelog" })
    expect(link).toHaveAttribute("href", snapshot.releaseUrl)
    expect(link).toHaveAttribute("target", "_blank")
    expect(document.querySelector("script")).toBeNull()
    expect(release.getByText("Unsafe")).not.toHaveAttribute(
      "href",
      "javascript:alert(1)",
    )
  })
  it("explains when the latest release has no notes", () => {
    state({ notes: "  " })
    render(<AppUpdateSection />)
    expect(
      screen.getByText("No release notes were provided for this version."),
    ).toBeVisible()
  })
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
    expect(install).not.toHaveBeenCalled()
  })
  it("requires an explicit click to open a downloaded installer", () => {
    state({ status: "downloaded", downloadedBytes: 100 })
    render(<AppUpdateSection />)
    expect(screen.getByRole("status")).toHaveTextContent("0.19.0")
    expect(install).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Open installer" }))
    expect(install).toHaveBeenCalledTimes(1)
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
      screen.queryByRole("button", { name: "Open installer" }),
    ).not.toBeInTheDocument()
  })
})
