const mockRequireNativeModule = jest.fn()

function loadModule(): typeof import("./index") {
  let bridge: typeof import("./index") | undefined
  jest.isolateModules(() => {
    jest.doMock("expo", () => ({
      requireNativeModule: (name: string) => mockRequireNativeModule(name),
    }))
    bridge = require("./index")
  })
  return bridge!
}

const frame = { x: 1, y: 2, width: 100, height: 140 }

describe("book transition native bridge", () => {
  beforeEach(() => {
    mockRequireNativeModule.mockReset()
  })

  afterEach(() => {
    jest.dontMock("expo")
  })

  test("should forward bridge calls when native module is available", () => {
    const nativeModule = {
      startTransition: jest.fn(() => true),
      isReduceMotionEnabled: jest.fn(() => true),
      getPresentedViewOriginX: jest.fn(() => 10),
      getPresentedViewOriginY: jest.fn(() => 20),
      getPresentedViewWidth: jest.fn(() => 300),
      getPresentedViewHeight: jest.fn(() => 600),
    }
    mockRequireNativeModule.mockReturnValue(nativeModule)
    const bridge = loadModule()

    expect(bridge.startNativeBookTransition({ direction: "open", frame })).toBe(
      true,
    )
    expect(bridge.isNativeReduceMotionEnabled()).toBe(true)
    expect(bridge.getNativePresentedViewFrame()).toEqual({
      x: 10,
      y: 20,
      width: 300,
      height: 600,
    })
    expect(nativeModule.startTransition).toHaveBeenCalledWith({
      direction: "open",
      frame,
    })
  })

  test("should use safe defaults when native module is unavailable", () => {
    mockRequireNativeModule.mockImplementation(() => {
      throw new Error("missing native module")
    })
    const bridge = loadModule()

    expect(
      bridge.startNativeBookTransition({ direction: "close", frame }),
    ).toBe(false)
    expect(bridge.isNativeReduceMotionEnabled()).toBe(false)
    expect(bridge.getNativePresentedViewFrame()).toBeNull()
    expect(mockRequireNativeModule).toHaveBeenCalledTimes(1)
  })

  test("should return null when native presented origin is incomplete", () => {
    mockRequireNativeModule.mockReturnValue({
      startTransition: jest.fn(() => false),
      getPresentedViewOriginX: jest.fn(() => 10),
    })
    const bridge = loadModule()

    expect(bridge.getNativePresentedViewFrame()).toBeNull()
  })

  test("should default presented size when native size is missing", () => {
    mockRequireNativeModule.mockReturnValue({
      startTransition: jest.fn(() => false),
      getPresentedViewOriginX: jest.fn(() => 10),
      getPresentedViewOriginY: jest.fn(() => 20),
    })
    const bridge = loadModule()

    expect(bridge.getNativePresentedViewFrame()).toEqual({
      x: 10,
      y: 20,
      width: 0,
      height: 0,
    })
  })
})
