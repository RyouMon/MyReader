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
      message: "The server could not be reached.",
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
      within(details).getByText("The server could not be reached."),
    ).toBeInTheDocument()

    fireEvent.click(within(details).getByRole("button", { name: "Sync now" }))
    await waitFor(() => expect(onSync).toHaveBeenCalledTimes(1))
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
