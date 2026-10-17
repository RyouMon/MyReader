import { act, fireEvent, render, screen } from "@testing-library/react-native"
import { PanResponder, View } from "react-native"
import { AlphabetRail } from "./alphabet-rail"

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { letter: string }) => options?.letter ?? key,
  }),
}))
jest.mock("@/src/design/tokens", () => ({ useThemePalette: () => ({}) }))

beforeEach(() => {
  const gesture = {
    stateID: 1,
    moveX: 0,
    moveY: 0,
    x0: 0,
    y0: 0,
    dx: 0,
    dy: 0,
    vx: 0,
    vy: 0,
    numberActiveTouches: 1,
    _accountsForMovesUpTo: 0,
  }
  jest.spyOn(PanResponder, "create").mockImplementation((handlers) => ({
    panHandlers: {
      onResponderGrant: (event) =>
        handlers.onPanResponderGrant?.(event, gesture),
      onResponderMove: (event) =>
        handlers.onPanResponderMove?.(event, {
          ...gesture,
          moveY: event.nativeEvent.pageY,
        }),
      onResponderRelease: (event) =>
        handlers.onPanResponderRelease?.(event, gesture),
      onResponderTerminate: (event) =>
        handlers.onPanResponderTerminate?.(event, gesture),
    },
  }))
  jest
    .spyOn(View.prototype, "measureInWindow")
    .mockImplementation((callback) => {
      callback(300, 100, 28, 540)
    })
})
afterEach(() => jest.restoreAllMocks())

function setup() {
  const onJump = jest.fn()
  render(<AlphabetRail onJump={onJump} />)
  const rail = screen.getByTestId("catalog-alphabet-rail")
  return { onJump, rail }
}

function preview() {
  return screen.queryByTestId("catalog-alphabet-preview", {
    includeHiddenElements: true,
  })
}

it("shows the current letter while dragging and hides it on release", () => {
  const { rail, onJump } = setup()
  expect(preview()).toBeNull()
  fireEvent(rail, "responderGrant", { nativeEvent: { pageY: 110 } }, {})
  expect(preview()).toHaveTextContent("A")
  expect(onJump).toHaveBeenLastCalledWith("A")
  fireEvent(rail, "responderMove", { nativeEvent: { pageY: 350 } })
  expect(preview()).toHaveTextContent("M")
  expect(onJump).toHaveBeenLastCalledWith("M")
  fireEvent(rail, "responderRelease", {}, {})
  expect(preview()).toBeNull()
})

it("keeps selection within the alphabet when the finger leaves the rail", () => {
  const { rail, onJump } = setup()
  fireEvent(rail, "responderGrant", { nativeEvent: { pageY: 110 } }, {})
  fireEvent(rail, "responderMove", { nativeEvent: { pageY: 10 } })
  expect(onJump).toHaveBeenLastCalledWith("A")
  fireEvent(rail, "responderMove", { nativeEvent: { pageY: 800 } })
  expect(onJump).toHaveBeenLastCalledWith("#")
})

it("hides the preview when a gesture is cancelled", () => {
  const { rail } = setup()
  fireEvent(rail, "responderGrant", { nativeEvent: { pageY: 110 } }, {})
  fireEvent(rail, "responderTerminate", {}, {})
  expect(preview()).toBeNull()
})

it("ignores a layout measurement that arrives after release", () => {
  let measure: Parameters<View["measureInWindow"]>[0] | undefined
  jest.mocked(View.prototype.measureInWindow).mockImplementation((callback) => {
    measure = callback
  })
  const { rail, onJump } = setup()
  fireEvent(rail, "responderGrant", { nativeEvent: { pageY: 110 } }, {})
  fireEvent(rail, "responderRelease", {}, {})
  act(() => measure?.(300, 100, 28, 540))
  expect(onJump).not.toHaveBeenCalled()
  expect(preview()).toBeNull()
})

it("tracks the letter under the finger when the rail moves during a drag", () => {
  const { rail, onJump } = setup()
  fireEvent(rail, "responderGrant", { nativeEvent: { pageY: 190 } }, {})
  expect(onJump).toHaveBeenLastCalledWith("E")

  jest.mocked(View.prototype.measureInWindow).mockImplementation((callback) => {
    callback(300, 60, 28, 540)
  })
  fireEvent(rail, "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 28, height: 540 } },
  })
  expect(onJump).toHaveBeenLastCalledWith("G")
  expect(preview()).toHaveTextContent("G")
})

it("uses the latest finger position when the initial measurement is delayed", () => {
  let measure: Parameters<View["measureInWindow"]>[0] | undefined
  jest.mocked(View.prototype.measureInWindow).mockImplementation((callback) => {
    measure = callback
  })
  const { rail, onJump } = setup()
  fireEvent(rail, "responderGrant", { nativeEvent: { pageY: 110 } }, {})
  fireEvent(rail, "responderMove", { nativeEvent: { pageY: 350 } })
  act(() => measure?.(300, 100, 28, 540))
  expect(onJump).toHaveBeenLastCalledWith("M")
  expect(preview()).toHaveTextContent("M")
})

it("supports selecting a letter through its accessible button", () => {
  const { onJump } = setup()
  fireEvent.press(screen.getByRole("button", { name: "M" }))
  expect(onJump).toHaveBeenCalledWith("M")
})
