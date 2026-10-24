import { fireEvent, render } from "@testing-library/react-native"

import { readerChromePalette } from "@/src/design/reader-chrome-palette"
import { ReaderFloatingIconButton } from "./ReaderFloatingIconButton"

jest.mock("./ReaderChromeIcon", () => {
  const React = jest.requireActual("react")
  const { Text } = jest.requireActual("react-native")

  return {
    ReaderChromeIcon: ({ name }: { name: string }) =>
      React.createElement(Text, null, name),
  }
})

const palette = readerChromePalette("#FFFFFF", "#181842")

describe("ReaderFloatingIconButton", () => {
  it("clears the native busy state when loading finishes and enables the action", () => {
    const onPress = jest.fn()
    const button = (loading: boolean) => (
      <ReaderFloatingIconButton
        accessibilityLabel={loading ? "Generating speech" : "Pause narration"}
        icon="pause"
        loading={loading}
        onPress={onPress}
        palette={palette}
        visible
      />
    )
    const screen = render(button(true))
    expect(screen.getByRole("progressbar").props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    })
    screen.rerender(button(false))
    const pause = screen.getByRole("button", { name: "Pause narration" })
    expect(pause.props.accessibilityState).toEqual({
      busy: false,
      disabled: false,
    })
    fireEvent.press(pause)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("crossfades icon content when its semantic action changes", () => {
    const screen = render(
      <ReaderFloatingIconButton
        accessibilityLabel="Previous sentence"
        icon="previous"
        onPress={jest.fn()}
        palette={palette}
        visible
      />,
    )

    const initialTransition = screen.getByTestId(
      "reader-floating-icon-transition",
    )
    expect(initialTransition.props.entering).toBeDefined()
    expect(initialTransition.props.exiting).toBeDefined()

    screen.rerender(
      <ReaderFloatingIconButton
        accessibilityLabel="Return to narration"
        icon="returnBackward"
        onPress={jest.fn()}
        palette={palette}
        visible
      />,
    )

    expect(screen.getByText("returnBackward")).toBeTruthy()
    expect(screen.queryByText("previous")).toBeNull()
  })
})
