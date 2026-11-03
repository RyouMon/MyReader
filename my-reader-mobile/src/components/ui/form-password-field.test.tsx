import { fireEvent, render, screen } from "@testing-library/react-native"
import { FormPasswordField } from "./form-password-field"

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock("./platform-icon", () => ({ PlatformIcon: () => null }))
jest.mock("@/src/design/tokens", () => ({
  useTheme: () => ({
    colorScheme: "light",
    palette: {
      primary: "#c4622d",
      surface: "#f2eadf",
      text: "#342b25",
      textMuted: "#756b62",
      danger: "#b23b2a",
    },
  }),
}))

it("masks saved credentials and toggles visibility without changing the value", () => {
  const onChangeText = jest.fn()
  render(
    <FormPasswordField
      label="API key"
      value="fixture-key"
      onChangeText={onChangeText}
    />,
  )
  expect(screen.getByLabelText("API key").props.secureTextEntry).toBe(true)
  fireEvent.press(screen.getByLabelText("passwordField.show"))
  expect(screen.getByLabelText("API key").props.secureTextEntry).toBe(false)
  expect(screen.getByLabelText("API key").props.value).toBe("fixture-key")
  fireEvent.press(screen.getByLabelText("passwordField.hide"))
  expect(screen.getByLabelText("API key").props.secureTextEntry).toBe(true)
  expect(onChangeText).not.toHaveBeenCalled()
  fireEvent.changeText(screen.getByLabelText("API key"), "")
  expect(onChangeText).toHaveBeenCalledWith("")
})
