jest.mock("react-native-notifier", () => ({
  Notifier: { showNotification: jest.fn() },
}))
jest.mock("@/src/domain/notifications/in-app-notification", () => ({
  InAppNotification: () => null,
}))

import { Notifier } from "react-native-notifier"
import { SyncFailureError } from "@/src/errors"
import i18n from "@/src/i18n"
import { notifySyncError } from "./notify-sync-error"

describe("background sync failure presentation", () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    jest.spyOn(console, "warn").mockImplementation(() => {})
    await i18n.changeLanguage("en")
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it.each([
    ["configuration", "Check library settings"],
    ["credential", "Check data source access"],
    ["data_integrity", "Sync data needs attention"],
  ] as const)("notifies about %s using category guidance and preserves original diagnostics", (kind, title) => {
    const error = new SyncFailureError(
      "network credential 503 INTERNAL_DIAGNOSTIC",
      kind,
    )
    notifySyncError(error, "automatic")
    expect(Notifier.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title,
        description: expect.any(String),
      }),
    )
    const notification = jest.mocked(Notifier.showNotification).mock
      .calls[0]?.[0]
    expect(notification?.description).toContain(
      "SyncFailureError: network credential 503 INTERNAL_DIAGNOSTIC",
    )
    expect(console.warn).toHaveBeenCalledWith(
      "[SyncRuntime] automatic sync failed",
      error,
    )
  })

  it.each([
    "connectivity",
    "unexpected",
  ] as const)("keeps background %s failures silent", (kind) => {
    notifySyncError(
      new SyncFailureError("INTERNAL_DIAGNOSTIC", kind),
      "automatic",
    )
    expect(Notifier.showNotification).not.toHaveBeenCalled()
  })

  it("translates notifications in the current language", async () => {
    await i18n.changeLanguage("zh-CN")
    notifySyncError(
      new SyncFailureError("INTERNAL_DIAGNOSTIC", "credential"),
      "automatic",
    )
    expect(Notifier.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "请检查数据源访问权限",
        description:
          "请重新登录或更新数据源凭据，并确认此账号有权访问书库。\nSyncFailureError: INTERNAL_DIAGNOSTIC",
      }),
    )
  })
})
