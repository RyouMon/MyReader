import { act, render, screen } from "@testing-library/react-native"
import { FlatList, ScrollView, Text } from "react-native"
import { SelectPopover } from "./select-popover.ios"

jest.unmock("react-native/Libraries/Components/ScrollView/ScrollView")
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

it("keeps a popover list independent of the scrolling form that opened it", () => {
  const errors = jest.spyOn(console, "error").mockImplementation(() => {})
  try {
    render(
      <ScrollView>
        <SelectPopover
          visible
          onDismiss={jest.fn()}
          backgroundColor="white"
          trigger={<Text>Voice</Text>}
        >
          {() => (
            <FlatList
              data={Array.from({ length: 100 }, (_, id) => String(id))}
              renderItem={({ item }) => <Text>Voice {item}</Text>}
              keyExtractor={(item) => item}
            />
          )}
        </SelectPopover>
      </ScrollView>,
    )
    expect(screen.getByText("Voice 0")).toBeTruthy()
    expect(screen.queryByText("Voice 99")).toBeNull()
    expect(errors).not.toHaveBeenCalledWith(
      expect.stringContaining("VirtualizedLists should never be nested"),
    )
  } finally {
    errors.mockRestore()
  }
})
