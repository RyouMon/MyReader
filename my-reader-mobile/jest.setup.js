jest.mock("react-native-reanimated", () => {
  const ReactNative = require("react-native")

  const passthrough = (value) => value
  const createAnimatedComponent = (Component) => Component
  const createSharedValue = (initialValue) => {
    let currentValue = initialValue
    return {
      get value() {
        return currentValue
      },
      set value(nextValue) {
        currentValue = nextValue
      },
      get: () => currentValue,
      set: (nextValue) => {
        currentValue =
          typeof nextValue === "function" ? nextValue(currentValue) : nextValue
      },
    }
  }
  const makeLayoutAnimationBuilder = () => {
    const builder = {
      delay: () => builder,
      duration: () => builder,
      easing: () => builder,
      springify: () => builder,
    }
    return builder
  }

  const reanimated = {
    cancelAnimation: jest.fn(),
    createAnimatedComponent,
    Easing: {
      bezier: () => passthrough,
      ease: passthrough,
      inOut: () => passthrough,
      linear: passthrough,
      out: () => passthrough,
    },
    FadeIn: makeLayoutAnimationBuilder(),
    FadeOut: makeLayoutAnimationBuilder(),
    runOnUI: (callback) => callback,
    ScrollView: ReactNative.ScrollView,
    useAnimatedProps: (updater) => updater(),
    useAnimatedStyle: (updater) => updater(),
    useSharedValue: createSharedValue,
    makeMutable: jest.fn(createSharedValue),
    View: ReactNative.View,
    withDelay: (_delay, animation) => animation,
    withRepeat: jest.fn((animation) => animation),
    withSequence: (...animations) => animations[animations.length - 1],
    withSpring: passthrough,
    withTiming: passthrough,
  }

  return {
    __esModule: true,
    ...reanimated,
    default: reanimated,
  }
})

jest.mock("react-native-worklets", () => ({
  scheduleOnRN: (callback, ...args) => callback(...args),
}))

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: {
    SHA256: "SHA-256",
  },
  digest: async (_algorithm, data) => {
    if (!ArrayBuffer.isView(data)) {
      throw new TypeError("expo-crypto digest data must be a TypedArray")
    }
    const { createHash } = require("node:crypto")
    const input = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    const hash = createHash("sha256").update(input).digest()
    return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength)
  },
  randomUUID: () => "a1b2c3d4-e5f6-4890-abcd-ef1234567890",
}))

jest.mock("my-reader-core", () => ({
  appConfigInitialize: jest.fn(async (_path, initial) => initial),
  appConfigWriteMobile: jest.fn(async (_path, preferences, mobileJson) => ({
    schemaVersion: 1,
    deviceId: undefined,
    preferences,
    dataSources: [],
    libraries: [],
    activeLibraryId: undefined,
    mobileJson,
  })),
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
