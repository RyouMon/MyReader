import { fireEvent, render, screen } from "@testing-library/react-native"
import { Modal, View as NativeView } from "react-native"
import * as mockReact from "react"
import { Pressable as mockPressable, View as mockView } from "react-native"
import { VoiceSelect } from "./voice-select"

jest.mock("./select-popover", () => jest.requireActual("./select-popover.tsx"))
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock("react-native-paper", () => ({
  ...jest.requireActual("react-native-paper"),
  PaperProvider: ({ children }: any) => children,
  Menu: ({ visible, children, onDismiss }: any) =>
    visible
      ? mockReact.createElement(
          mockView,
          null,
          children,
          mockReact.createElement(mockPressable, {
            accessibilityLabel: "Dismiss menu",
            onPress: onDismiss,
          }),
        )
      : null,
}))

beforeEach(() => {
  jest
    .spyOn(NativeView.prototype, "measureInWindow")
    .mockImplementation((callback) => callback(20, 160, 340, 56))
})
afterEach(() => jest.restoreAllMocks())

it("keeps the selected voice and menu unchanged when previewing, then selects only on a row press", () => {
  const onSelect = jest.fn()
  const onPreview = jest.fn()
  const onStopPreview = jest.fn()
  render(
    <VoiceSelect
      label="Voice"
      value="One"
      actions={[
        { id: "one", title: "One", state: "on" },
        { id: "two", title: "Two", state: "off" },
      ]}
      previewVoiceId={null}
      onPreview={onPreview}
      onStopPreview={onStopPreview}
      onSelect={onSelect}
    />,
  )
  fireEvent.press(screen.getByRole("button", { name: "Voice" }))
  fireEvent(screen.UNSAFE_getByType(Modal), "show")
  fireEvent.press(
    screen.getByRole("button", { name: "settings.tts.previewAction · Two" }),
  )
  expect(onPreview).toHaveBeenCalledWith("two")
  expect(onSelect).not.toHaveBeenCalled()
  expect(onStopPreview).not.toHaveBeenCalled()
  expect(
    screen.getByRole("radio", { name: "One" }).props.accessibilityState,
  ).toMatchObject({ checked: true })
  fireEvent.press(screen.getByRole("radio", { name: "Two" }))
  expect(onSelect).toHaveBeenCalledWith("two")
  expect(onStopPreview).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole("radio", { name: "Two" })).toBeNull()
})

it("stops the active preview independently and cancels it when dismissing", () => {
  const onSelect = jest.fn()
  const onStopPreview = jest.fn()
  render(
    <VoiceSelect
      label="Voice"
      value="One"
      actions={[{ id: "one", title: "One", state: "on" }]}
      previewVoiceId="one"
      onPreview={jest.fn()}
      onStopPreview={onStopPreview}
      onSelect={onSelect}
    />,
  )
  fireEvent.press(screen.getByRole("button", { name: "Voice" }))
  fireEvent(screen.UNSAFE_getByType(Modal), "show")
  fireEvent.press(
    screen.getByRole("button", { name: "settings.tts.previewPlaying · One" }),
  )
  expect(onStopPreview).toHaveBeenCalledTimes(1)
  fireEvent.press(screen.getByLabelText("Dismiss menu"))
  expect(onStopPreview).toHaveBeenCalledTimes(2)
  expect(onSelect).not.toHaveBeenCalled()
})
