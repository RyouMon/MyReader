import { describe, expect, it } from "vitest"
import { appUpdateErrorMessage, appUpdateMessage } from "../src/app-update"

describe("update messages", () => {
  it("keeps unsupported-package and integrity failures actionable", () => {
    expect(appUpdateErrorMessage("UPDATE_UNSUPPORTED_PACKAGE")).toBe(
      "appUpdates.missingPackage",
    )
    expect(appUpdateErrorMessage("UPDATE_INTEGRITY_FAILED")).toBe(
      "appUpdates.integrityFailed",
    )
    expect(appUpdateErrorMessage("UPDATE_DOWNLOAD_FAILED")).toBe(
      "appUpdates.actionFailed",
    )
  })
  it("maps progress and completion states and tolerates an unknown status", () => {
    expect(appUpdateMessage("downloading")).toBe(
      "appUpdates.status.downloading",
    )
    expect(appUpdateMessage("downloaded")).toBe("appUpdates.status.downloaded")
    expect(appUpdateMessage("unknown")).toBe("appUpdates.status.idle")
  })
})
