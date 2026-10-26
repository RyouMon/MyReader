import { act, render } from "@testing-library/react-native"
import { IosSelectMenu } from "./ios-select-menu"

jest.mock("@expo/ui/swift-ui", () => ({
  Host: ({ children }: { children: React.ReactNode }) => children,
  RNHostView: ({ children }: { children: React.ReactNode }) => children,
  Menu: jest.fn(({ label, children }) => (
    <>
      {label}
      {children}
    </>
  )),
  Button: jest.fn(() => null),
  Toggle: jest.fn(() => null),
}))
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  accessibilityLabel: (label: string) => ({ label }),
  disabled: (disabled: boolean) => ({ disabled }),
}))
jest.mock("@/src/design/tokens", () => ({
  useTheme: () => ({ colorScheme: "light" }),
}))

it("names the native trigger, preserves selection and availability, and forwards a single choice", () => {
  const onSelect = jest.fn()
  render(
    <IosSelectMenu
      label="Protocol"
      onSelect={onSelect}
      actions={[
        { id: "chat", title: "Chat", state: "on" },
        {
          id: "disabled",
          title: "Unavailable",
          attributes: { disabled: true },
        },
        { id: "hidden", title: "Hidden", attributes: { hidden: true } },
      ]}
    >
      {null}
    </IosSelectMenu>,
  )
  const { Menu, Button, Toggle } = jest.requireMock("@expo/ui/swift-ui")
  expect(Menu.mock.calls[0][0].modifiers).toContainEqual({ label: "Protocol" })
  expect(Toggle.mock.calls[0][0].isOn).toBe(true)
  expect(Button).toHaveBeenCalledTimes(1)
  expect(Button.mock.calls[0][0].modifiers).toContainEqual({ disabled: true })
  act(() => Toggle.mock.calls[0][0].onIsOnChange(false))
  expect(onSelect).toHaveBeenCalledTimes(1)
  expect(onSelect).toHaveBeenCalledWith("chat")
})
