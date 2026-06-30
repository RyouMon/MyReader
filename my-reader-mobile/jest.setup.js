jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
)

jest.mock("expo-crypto", () => ({
  randomUUID: () => "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
}))

const originalConsoleWarn = console.warn.bind(console)
console.warn = (...args) => {
  if (
    typeof args[0] === "string" &&
    args[0].includes("ExpoModulesCoreJSLogger")
  ) {
    return
  }
  originalConsoleWarn(...args)
}

jest.mock("@my-reader/readium", () => {
  const mockReact = require("react")
  const { View } = require("react-native")
  return {
    ReadiumView: mockReact.forwardRef(function ReadiumViewMock(_props, ref) {
      mockReact.useImperativeHandle(ref, () => ({
        goTo: jest.fn(),
        goForward: jest.fn(),
        goBackward: jest.fn(),
        destroy: jest.fn(),
      }))
      return mockReact.createElement(View, { testID: "readium-view-mock" })
    }),
  }
})
