import { fireEvent, render, screen } from "@testing-library/react-native"
import { Button, IconButton } from "./button"

jest.mock("expo-router", () => ({ router: {} }))
jest.mock("@/src/design/tokens", () => ({
  useThemePalette: () => ({ primary: "#c4622d", textMuted: "#756b62" }),
}))

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
