import { act, render } from "@testing-library/react-native"
import { SelectPopover } from "./select-popover.ios"

jest.mock("@expo/ui/swift-ui", () => ({
  Host: ({ children }: { children: React.ReactNode }) => children,
  RNHostView: ({ children }: { children: React.ReactNode }) => children,
  Group: ({ children }: { children: React.ReactNode }) => children,
  Popover: Object.assign(
    jest.fn(({ children }) => children),
    {
      Trigger: ({ children }: { children: React.ReactNode }) => children,
      Content: ({ children }: { children: React.ReactNode }) => children,
    },
  ),
}))
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  presentationBackground: (color: string) => ({ color }),
}))
jest.mock("@/src/design/tokens", () => ({
  useTheme: () => ({ colorScheme: "light" }),
}))

it("forwards native dismissal so the voice preview can stop when tapping outside", () => {
  const onDismiss = jest.fn()
  render(
    <SelectPopover
      visible
      onDismiss={onDismiss}
      backgroundColor="white"
      trigger={null}
    >
      {() => null}
    </SelectPopover>,
  )
  const { Popover } = jest.requireMock("@expo/ui/swift-ui")
  const { isPresented, onIsPresentedChange } = Popover.mock.calls[0][0]
  expect(isPresented).toBe(true)
  act(() => onIsPresentedChange(true))
  expect(onDismiss).not.toHaveBeenCalled()
  act(() => onIsPresentedChange(false))
  expect(onDismiss).toHaveBeenCalledTimes(1)
})
