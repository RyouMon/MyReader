import { Alert } from "react-native"
import { setStringAsync } from "expo-clipboard"
import { setStatusBarStyle } from "expo-status-bar"
import i18n from "@/src/i18n"
import {
  setAlertStatusBarPreferredStyle,
  showErrorAlert,
} from "./alert-with-status-bar"

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(async () => true),
}))
jest.mock("expo-status-bar", () => ({ setStatusBarStyle: jest.fn() }))

beforeEach(async () => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  jest.spyOn(Alert, "alert").mockImplementation(() => {})
  await i18n.changeLanguage("zh-CN")
  setAlertStatusBarPreferredStyle("dark")
})
afterEach(async () => {
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
  jest.restoreAllMocks()
  await i18n.changeLanguage("en")
})

it("copies the complete localized message and original diagnostics", async () => {
  showErrorAlert("连接失败", "请检查凭据。\nCredential: HTTP 401")
  const [title, message, buttons] = jest.mocked(Alert.alert).mock.calls[0]!
  expect([title, message]).toEqual([
    "连接失败",
    "请检查凭据。\nCredential: HTTP 401",
  ])
  expect(buttons?.map((button) => button.text)).toEqual(["复制", "确定"])
  buttons?.[0]?.onPress?.()
  expect(setStringAsync).toHaveBeenCalledWith(
    "连接失败\n请检查凭据。\nCredential: HTTP 401",
  )
  jest.runOnlyPendingTimers()
  expect(setStatusBarStyle).toHaveBeenCalledWith("dark", true)
})

it("preserves retry and cancel actions alongside copy and restores the status bar on dismissal", () => {
  const retry = jest.fn()
  const cancel = jest.fn()
  const dismiss = jest.fn()
  showErrorAlert(
    "Failed",
    "Details",
    [
      { text: "Retry", onPress: retry },
      { text: "Cancel", style: "cancel", onPress: cancel },
    ],
    { onDismiss: dismiss },
  )
  const [, , buttons, options] = jest.mocked(Alert.alert).mock.calls[0]!
  expect(buttons).toHaveLength(3)
  buttons?.[1]?.onPress?.()
  buttons?.[2]?.onPress?.()
  options?.onDismiss?.()
  expect(retry).toHaveBeenCalledTimes(1)
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(dismiss).toHaveBeenCalledTimes(1)
  jest.runOnlyPendingTimers()
  expect(setStatusBarStyle).toHaveBeenCalledWith("dark", true)
})
