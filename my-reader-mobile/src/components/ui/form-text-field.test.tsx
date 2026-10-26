import { createRef, type ComponentRef } from "react"
import { fireEvent, render, screen } from "@testing-library/react-native"
import { FormTextField } from "./form-text-field"

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

it("preserves the field label and native secure-entry and keyboard callbacks", () => {
  const onChangeText = jest.fn()
  const onSubmitEditing = jest.fn()
  render(
    <FormTextField
      label="API key"
      value="secret"
      secureTextEntry
      returnKeyType="next"
      onChangeText={onChangeText}
      onSubmitEditing={onSubmitEditing}
    />,
  )
  const input = screen.getByLabelText("API key")
  expect(input.props.secureTextEntry).toBe(true)
  expect(input.props.value).toBe("secret")
  fireEvent.changeText(input, "new-secret")
  fireEvent(input, "submitEditing")
  expect(onChangeText).toHaveBeenCalledWith("new-secret")
  expect(onSubmitEditing).toHaveBeenCalledTimes(1)
})

it("announces validation errors without changing the accessible field name", () => {
  const { rerender } = render(
    <FormTextField label="Endpoint" required value="" error="Enter a URL" />,
  )
  expect(screen.getByLabelText("Endpoint")).toBeTruthy()
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a URL")
  rerender(
    <FormTextField label="Endpoint" required value="https://example.com" />,
  )
  expect(screen.queryByRole("alert")).toBeNull()
})

it("exposes the input handle for next-field focus and keeps read-only fields immutable", () => {
  const ref = createRef<ComponentRef<typeof FormTextField>>()
  render(
    <FormTextField ref={ref} label="Model ID" value="model" editable={false} />,
  )
  expect(ref.current?.focus).toEqual(expect.any(Function))
  expect(ref.current?.blur).toEqual(expect.any(Function))
  expect(screen.getByLabelText("Model ID").props.editable).toBe(false)
})
