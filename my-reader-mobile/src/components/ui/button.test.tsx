import { fireEvent, render, screen } from "@testing-library/react-native"
import { Button, IconButton } from "./button"
import { Platform } from "react-native"

jest.mock("@expo/vector-icons/MaterialIcons", () => jest.fn(() => null))
jest.mock("expo-symbols", () => ({ SymbolView: jest.fn(() => null) }))

jest.mock("expo-router", () => ({ router: {} }))
jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({ primary: "#c4622d", textMuted: "#756b62" }),
}))

const initialPlatform = Platform.OS
afterEach(() => {
  Platform.OS = initialPlatform
  jest.clearAllMocks()
})

it.each([
  "ios",
  "android",
] as const)("uses %s icons for both text and icon-only actions", (platform) => {
  Platform.OS = platform
  render(
    <>
      <Button title="Add model" icon={{ ios: "plus", android: "add" }} />
      <IconButton
        label="Delete voice"
        icon={{ ios: "trash", android: "delete-outline" }}
      />
    </>,
  )
  const { SymbolView } = jest.requireMock("expo-symbols")
  const MaterialIcons = jest.requireMock("@expo/vector-icons/MaterialIcons")
  const chosen = platform === "ios" ? SymbolView : MaterialIcons
  const unused = platform === "ios" ? MaterialIcons : SymbolView
  expect(
    chosen.mock.calls.map(([props]: [{ name: string }]) => props.name),
  ).toEqual(platform === "ios" ? ["plus", "trash"] : ["add", "delete-outline"])
  expect(unused).not.toHaveBeenCalled()
})

it("names an icon-and-text action without reading the icon glyph and prevents repeat submission", () => {
  const onPress = jest.fn()
  const { rerender } = render(
    <Button title="Save" icon="check" onPress={onPress} />,
  )
  fireEvent.press(screen.getByRole("button", { name: "Save" }))
  expect(onPress).toHaveBeenCalledTimes(1)
  rerender(<Button title="Save" loading onPress={onPress} />)
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  fireEvent.press(screen.getByRole("button", { name: "Save" }))
  expect(onPress).toHaveBeenCalledTimes(1)
})

it("keeps a pending voice preview cancellable through its icon action", () => {
  const onPress = jest.fn()
  render(
    <IconButton label="Stop preview" icon="stop" loading onPress={onPress} />,
  )
  fireEvent.press(screen.getByRole("button", { name: "Stop preview" }))
  expect(onPress).toHaveBeenCalledTimes(1)
})
