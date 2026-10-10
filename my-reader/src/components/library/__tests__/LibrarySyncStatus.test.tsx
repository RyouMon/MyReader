import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import LibrarySyncStatus from "@/components/library/LibrarySyncStatus"
import i18n from "@/i18n"
import { useSyncStatusStore } from "@/stores/syncStatusStore"

const library = {
  id: "library-1",
  name: "Shared Library",
  path: "/Books",
  bookCount: 12,
  libraryType: "myreader" as const,
  sourceType: "local",
}

function observe(
  observation: Parameters<
    ReturnType<typeof useSyncStatusStore.getState>["observeLibrarySync"]
  >[0],
) {
  useSyncStatusStore.getState().observeLibrarySync(observation)
}

describe("LibrarySyncStatus", () => {
  beforeEach(async () => {
    localStorage.clear()
    useSyncStatusStore.setState({
      librarySyncActivityById: {},
      librarySyncHistoryById: {},
      librarySyncTransientResultById: {},
      networkOnline: true,
    })
    await i18n.changeLanguage("en")
  })

  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("zh-CN")
    })
  })

  it("should show failure details and trigger a manual sync from the status bar", async () => {
    const onSync = vi.fn().mockResolvedValue(undefined)
    const now = Date.now()
    observe({
      type: "succeeded",
      libraryId: library.id,
      taskId: "success",
      completedAt: now - 60_000,
      reason: "manual",
    })
    observe({
      type: "failed",
      libraryId: library.id,
      taskId: "failure",
      completedAt: now,
      failureKind: "connectivity",
      failureStage: "pulling",
      message: "Request: 503 INTERNAL_DIAGNOSTIC /private/library",
      reason: "automatic_check",
    })

    render(<LibrarySyncStatus library={library} onSync={onSync} />)
    fireEvent.click(
      screen.getByRole("button", { name: "Sync status: Sync failed" }),
    )

    const details = await screen.findByRole("dialog", {
      name: "Sync details",
    })
    expect(within(details).getByText("Shared Library")).toBeInTheDocument()
    expect(within(details).getByText("Pulling changes")).toBeInTheDocument()
    expect(
      within(details).getByText(
        /Check your network connection and whether the data source is available, then try syncing again\./,
      ),
    ).toBeInTheDocument()
    expect(within(details).getByText(/INTERNAL_DIAGNOSTIC/).textContent).toBe(
      "Check your network connection and whether the data source is available, then try syncing again.\nconnectivity: Request: 503 INTERNAL_DIAGNOSTIC /private/library",
    )

    fireEvent.click(within(details).getByRole("button", { name: "Sync now" }))
    await waitFor(() => expect(onSync).toHaveBeenCalledTimes(1))
  })

  it("should translate stored failures at render time without replacing diagnostics", async () => {
    observe({
      type: "failed",
      libraryId: library.id,
      taskId: "failure",
      completedAt: Date.now(),
      failureKind: "credential",
      message: "network 503 INTERNAL_DIAGNOSTIC",
      reason: "manual",
    })

    render(<LibrarySyncStatus library={library} />)
    fireEvent.click(
      screen.getByRole("button", { name: "Sync status: Sync failed" }),
    )
    expect(
      await screen.findByText("Sync failed: Check data source access"),
    ).toBeInTheDocument()
    expect(screen.getByText(/INTERNAL_DIAGNOSTIC/).textContent).toBe(
      "Sign in again or update the data source credentials, and check that this account can access the library.\ncredential: network 503 INTERNAL_DIAGNOSTIC",
    )

    await act(async () => {
      await i18n.changeLanguage("zh-CN")
    })
    expect(
      screen.getByText("同步失败：请检查数据源访问权限"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("Sync failed: Check data source access"),
    ).toBeNull()
    expect(screen.getByText(/INTERNAL_DIAGNOSTIC/).textContent).toBe(
      "请重新登录或更新数据源凭据，并确认此账号有权访问书库。\ncredential: network 503 INTERNAL_DIAGNOSTIC",
    )
    expect(
      useSyncStatusStore.getState().librarySyncHistoryById[library.id]
        .lastFailure?.message,
    ).toBe("network 503 INTERNAL_DIAGNOSTIC")
  })

  it.each([
    undefined,
    "Config: INTERNAL_DIAGNOSTIC",
  ])("should show a generic failure for old history without a category (%s)", async (message) => {
    useSyncStatusStore.setState({
      librarySyncHistoryById: {
        [library.id]: { lastFailure: { completedAt: Date.now(), message } },
      },
    })
    render(<LibrarySyncStatus library={library} />)
    fireEvent.click(
      screen.getByRole("button", { name: "Sync status: Sync failed" }),
    )
    expect(
      await screen.findByText(
        /Try syncing again later\. If the problem continues, report it for help\./,
      ),
    ).toBeInTheDocument()
    if (message) {
      expect(screen.getByText(/INTERNAL_DIAGNOSTIC/).textContent).toContain(
        `\n${message}`,
      )
    } else {
      expect(screen.queryByText(/INTERNAL_DIAGNOSTIC/)).toBeNull()
    }
  })

  it("should keep a local library available when the host has no network", async () => {
    useSyncStatusStore.getState().setNetworkOnline(false)
    const onSync = vi.fn().mockResolvedValue(undefined)

    render(<LibrarySyncStatus library={library} onSync={onSync} />)
    fireEvent.click(screen.getByRole("button", { name: "Sync status: Idle" }))

    const details = await screen.findByRole("dialog", {
      name: "Sync details",
    })
    expect(
      within(details).getByRole("button", { name: "Sync now" }),
    ).toBeEnabled()
    expect(within(details).queryByText("Waiting for network")).toBeNull()
  })

  it("should use the standard empty state when no library can sync", async () => {
    render(<LibrarySyncStatus library={null} onSync={vi.fn()} />)
    fireEvent.click(
      screen.getByRole("button", {
        name: "Sync status: No library to sync",
      }),
    )

    const details = await screen.findByRole("dialog", {
      name: "Sync details",
    })
    expect(details.querySelector('[data-slot="empty"]')).toBeInTheDocument()
    expect(details.querySelector(".lucide-cloud-off")).toBeInTheDocument()
    expect(within(details).getByText("No library to sync")).toBeInTheDocument()
    expect(
      within(details).getByText("Add a library to start syncing."),
    ).toBeInTheDocument()
    expect(
      within(details).queryByRole("button", { name: "Sync now" }),
    ).toBeNull()
    expect(within(details).queryByText("Current status")).toBeNull()
  })

  it("should show the last successful sync time in the idle status bar", () => {
    observe({
      type: "succeeded",
      libraryId: library.id,
      taskId: "success",
      completedAt: Date.now() - 2 * 60_000,
      reason: "automatic_check",
    })

    render(<LibrarySyncStatus library={library} />)

    expect(
      screen.getByRole("button", {
        name: "Sync status: 2 minutes ago",
      }),
    ).toBeInTheDocument()
  })

  it("should refresh the idle status bar as the relative time changes", () => {
    const now = new Date(2026, 7, 7, 12, 0).getTime()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    observe({
      type: "succeeded",
      libraryId: library.id,
      taskId: "success",
      completedAt: now - 30_000,
      reason: "automatic_check",
    })

    const view = render(<LibrarySyncStatus library={library} />)
    try {
      expect(
        screen.getByRole("button", {
          name: "Sync status: just now",
        }),
      ).toBeInTheDocument()

      act(() => vi.advanceTimersByTime(30_020))

      expect(
        screen.getByRole("button", {
          name: "Sync status: a minute ago",
        }),
      ).toBeInTheDocument()
    } finally {
      view.unmount()
      vi.useRealTimers()
    }
  })
})
