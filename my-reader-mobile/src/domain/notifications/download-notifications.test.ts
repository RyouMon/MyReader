jest.mock("react-native", () => {
  const actual = jest.requireActual("react-native")
  return new Proxy(actual, {
    get(target, property) {
      if (property === "AppState") {
        return { ...target.AppState, currentState: "active" }
      }
      return target[property]
    },
  })
})

jest.mock("react-native-notifier", () => ({
  Notifier: { showNotification: jest.fn() },
}))

jest.mock("./in-app-notification", () => ({
  InAppNotification: () => null,
}))

jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: jest.fn(),
}))

import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"
import { Notifier } from "react-native-notifier"
import {
  initializeDownloadNotifications,
  notifyDownloadState,
} from "./download-notifications"

describe("download notifications", () => {
  beforeAll(() => {
    initializeDownloadNotifications()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should hide raw diagnostic details in a failed download alert", () => {
    notifyDownloadState(
      "error",
      "The Dispossessed · EPUB",
      "HTTP 404: file not found",
    )

    expect(showAlertWithStatusBarRestore).toHaveBeenCalledWith(
      "Download failed",
      "The Dispossessed · EPUB\nThis action could not be completed. Please try again.",
    )
    expect(Notifier.showNotification).not.toHaveBeenCalled()
  })

  it("should keep successful downloads as unobtrusive notifications", () => {
    notifyDownloadState("done", "The Dispossessed · EPUB")

    expect(Notifier.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Download complete",
        description: "The Dispossessed · EPUB",
      }),
    )
    expect(showAlertWithStatusBarRestore).not.toHaveBeenCalled()
  })
})
