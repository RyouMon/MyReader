jest.mock("@/src/domain/sync", () => ({
  DEFAULT_SYNC_POLICY: {},
  resolveSyncOptions: () => ({ scope: "all", throwOnFailure: true }),
  syncLibrary: jest.fn(),
}))
jest.mock("@/src/store/app-store", () => ({
  useAppStore: {
    getState: () => ({
      activeLibraryId: "library-1",
      libraries: [
        { id: "library-1", name: "Library", path: "/library", bookCount: 0 },
      ],
      dataSources: [],
    }),
  },
}))
jest.mock("@/src/store/sync-status-observer", () => ({
  observeLibrarySync: jest.fn(),
}))
jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showErrorAlert: jest.fn(),
}))
jest.mock("./apply-sync-report", () => ({ applySyncReport: jest.fn() }))

import { showErrorAlert } from "@/src/constants/alert-with-status-bar"
import { syncLibrary } from "@/src/domain/sync"
import { SyncConnectivityError, SyncFailureError } from "@/src/errors"
import i18n from "@/src/i18n"
import type { LibrarySyncReport } from "../types"
import { applySyncReport } from "./apply-sync-report"
import { runLibrarySync } from "./run-library-sync"

describe("manual sync failure presentation", () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await i18n.changeLanguage("en")
  })

  it.each([
    ["connectivity", "Unable to connect"],
    ["credential", "Check data source access"],
    ["configuration", "Check library settings"],
    ["data_integrity", "Sync data needs attention"],
    ["unexpected", "Sync could not finish"],
  ] as const)("shows localized %s guidance and rethrows the original exception", async (kind, title) => {
    const error = new SyncFailureError(
      "network credential 503 INTERNAL_DIAGNOSTIC",
      kind,
    )
    jest.mocked(syncLibrary).mockRejectedValue(error)
    await expect(
      runLibrarySync({ libraryId: "library-1", trigger: "manual" }),
    ).rejects.toBe(error)
    expect(showErrorAlert).toHaveBeenCalledWith(title, expect.any(String), [
      { text: "Got it" },
    ])
    const message = jest.mocked(showErrorAlert).mock.calls[0]?.[1]
    expect(message).toContain(
      "SyncFailureError: network credential 503 INTERNAL_DIAGNOSTIC",
    )
    expect(message).not.toContain("syncStatus.")
  })

  it("uses the current language when showing an alert", async () => {
    const error = new SyncFailureError("INTERNAL_DIAGNOSTIC", "credential")
    jest.mocked(syncLibrary).mockRejectedValue(error)
    await i18n.changeLanguage("zh-CN")
    await expect(
      runLibrarySync({ libraryId: "library-1", trigger: "manual" }),
    ).rejects.toBe(error)
    expect(showErrorAlert).toHaveBeenCalledWith(
      "请检查数据源访问权限",
      "请重新登录或更新数据源凭据，并确认此账号有权访问书库。\nSyncFailureError: INTERNAL_DIAGNOSTIC",
      expect.any(Array),
    )
  })

  it("uses generic guidance for unexpected exceptions", async () => {
    const error = new Error("INTERNAL_DIAGNOSTIC")
    jest.mocked(syncLibrary).mockRejectedValue(error)
    await expect(
      runLibrarySync({ libraryId: "library-1", trigger: "manual" }),
    ).rejects.toBe(error)
    expect(showErrorAlert).toHaveBeenCalledWith(
      "Sync could not finish",
      "Try syncing again later. If the problem continues, report it for help.\nError: INTERNAL_DIAGNOSTIC",
      expect.any(Array),
    )
  })

  it("still applies the connectivity report when the status screen suppresses alerts", async () => {
    const report: LibrarySyncReport = {
      libraryId: "library-1",
      libraryName: "Library",
      durationMs: 10,
      calibre: {
        skipped: true,
        changed: false,
        library: {
          id: "library-1",
          name: "Library",
          path: "/library",
          bookCount: 0,
        },
      },
      myreader: { skipped: true, mode: "full", providers: {} },
    }
    const error = new SyncConnectivityError("INTERNAL_DIAGNOSTIC", report)
    jest.mocked(syncLibrary).mockRejectedValue(error)
    await expect(
      runLibrarySync({
        libraryId: "library-1",
        trigger: "manual",
        showFailureAlert: false,
      }),
    ).rejects.toBe(error)
    expect(applySyncReport).toHaveBeenCalledWith(report, { trigger: "manual" })
    expect(showErrorAlert).not.toHaveBeenCalled()
  })
})
