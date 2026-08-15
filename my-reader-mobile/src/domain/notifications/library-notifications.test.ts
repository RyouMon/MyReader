import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"

import {
  promptLibraryAdded,
  promptLibraryAddedAfterNavigation,
} from "./library-notifications"

jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: jest.fn(),
}))
jest.mock("@/src/i18n", () => ({
  t: (key: string, options?: { name?: string }) =>
    options?.name ? `${key}:${options.name}` : key,
}))

beforeEach(() => {
  jest.clearAllMocks()
})

it("should present native stay and switch actions after a library is added", () => {
  const onStay = jest.fn()
  const onSwitch = jest.fn()

  promptLibraryAdded("New Library", { onStay, onSwitch })

  expect(showAlertWithStatusBarRestore).toHaveBeenCalledWith(
    "notifications.libraryAdded:New Library",
    "addLibrary.addedPrompt.detail:New Library",
    [
      {
        text: "addLibrary.addedPrompt.stay",
        style: "cancel",
        onPress: onStay,
      },
      {
        text: "addLibrary.addedPrompt.switch",
        isPreferred: true,
        onPress: onSwitch,
      },
    ],
  )
})

it("should present the added-library prompt after the navigation update commits", () => {
  jest.useFakeTimers()
  const onStay = jest.fn()
  const onSwitch = jest.fn()

  promptLibraryAddedAfterNavigation("New Library", { onStay, onSwitch })

  expect(showAlertWithStatusBarRestore).not.toHaveBeenCalled()

  jest.runOnlyPendingTimers()

  expect(showAlertWithStatusBarRestore).toHaveBeenCalledTimes(1)
  expect(showAlertWithStatusBarRestore).toHaveBeenCalledWith(
    "notifications.libraryAdded:New Library",
    "addLibrary.addedPrompt.detail:New Library",
    expect.any(Array),
  )
  jest.useRealTimers()
})
