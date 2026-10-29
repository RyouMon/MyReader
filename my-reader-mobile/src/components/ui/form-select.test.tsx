import { fireEvent, render, screen } from "@testing-library/react-native"
import { FormSelect } from "./form-select"

const mockOpen = jest.fn()
jest.mock("./native-select-menu", () => ({
  NativeSelectMenu: ({ children }: any) => children(mockOpen),
}))
jest.mock("@/src/design/tokens", () => ({
  useTheme: () => ({
    colorScheme: "light",
    palette: {
      primary: "#c4622d",
      surface: "#f2eadf",
      text: "#342b25",
      textMuted: "#756b62",
    },
  }),
}))

it.each([
  "floating",
  "external",
  "hidden",
] as const)("keeps a named menu trigger in %s label mode without opening a keyboard", (labelMode) => {
  mockOpen.mockClear()
  render(
    <FormSelect
      label="Protocol"
      labelMode={labelMode}
      value="Responses"
      actions={[{ id: "responses", title: "Responses" }]}
      onSelect={jest.fn()}
    />,
  )
  const trigger = screen.getByRole("button", { name: "Protocol" })
  expect(trigger.props.accessibilityValue).toEqual({ text: "Responses" })
  fireEvent.press(trigger)
  expect(mockOpen).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole("textbox")).toBeNull()
})

it("disables unavailable selectors", () => {
  mockOpen.mockClear()
  render(
    <FormSelect
      label="Voice"
      value="Loading"
      actions={[]}
      onSelect={jest.fn()}
    />,
  )
  const trigger = screen.getByRole("button", { name: "Voice" })
  expect(trigger).toBeDisabled()
  fireEvent.press(trigger)
  expect(mockOpen).not.toHaveBeenCalled()
})

it("keeps long selected values on one line while exposing their complete accessible value", () => {
  const value = "Provider/a-model-with-a-long-identifier"
  render(
    <FormSelect
      label="Model"
      labelMode="external"
      value={value}
      actions={[{ id: "model", title: value }]}
      onSelect={jest.fn()}
    />,
  )
  expect(
    screen.getByText(value, { includeHiddenElements: true }).props
      .numberOfLines,
  ).toBe(1)
  expect(
    screen.getByRole("button", { name: "Model" }).props.accessibilityValue,
  ).toEqual({ text: value })
})
