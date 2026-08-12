import { showAlertWithStatusBarRestore } from "@/src/constants/alert-with-status-bar"

import { promptLibraryAdded } from "./library-notifications"

jest.mock("@/src/constants/alert-with-status-bar", () => ({
  showAlertWithStatusBarRestore: jest.fn(),
}))
jest.mock("@/src/i18n", () => ({
  t: (key: string, options?: { name?: string }) =>
    options?.name ? `${key}:${options.name}` : key,
}))

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
        onPress: onSwitch,
      },
    ],
  )
})
