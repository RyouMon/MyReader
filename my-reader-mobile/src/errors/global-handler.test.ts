type CapturedHandler = (error: Error, isFatal?: boolean) => void

function loadHandler() {
  jest.resetModules()
  return require("./global-handler") as typeof import("./global-handler")
}

function setErrorUtils(value: unknown) {
  Object.defineProperty(globalThis, "ErrorUtils", {
    configurable: true,
    value,
  })
}

describe("setupGlobalErrorHandler", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "ErrorUtils")
    jest.restoreAllMocks()
  })

  test("should skip setup when ErrorUtils is missing", () => {
    Reflect.deleteProperty(globalThis, "ErrorUtils")
    const { setupGlobalErrorHandler } = loadHandler()

    expect(() => setupGlobalErrorHandler()).not.toThrow()
  })

  test("should install only once when setup is called repeatedly", () => {
    const previousHandler = jest.fn()
    const setGlobalHandler = jest.fn()
    setErrorUtils({
      getGlobalHandler: jest.fn(() => previousHandler),
      setGlobalHandler,
    })
    const { setupGlobalErrorHandler } = loadHandler()

    setupGlobalErrorHandler()
    setupGlobalErrorHandler()

    expect(setGlobalHandler).toHaveBeenCalledTimes(1)
  })

  test("should log invariant details when AppInvariantError is captured", () => {
    const previousHandler = jest.fn()
    let capturedHandler: CapturedHandler | undefined
    setErrorUtils({
      getGlobalHandler: jest.fn(() => previousHandler),
      setGlobalHandler: jest.fn((handler: CapturedHandler) => {
        capturedHandler = handler
      }),
    })
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {})
    const { setupGlobalErrorHandler } = loadHandler()
    const { AppInvariantError } =
      require("./app-errors") as typeof import("./app-errors")

    setupGlobalErrorHandler()
    capturedHandler?.(new AppInvariantError("bad state"), true)

    expect(consoleSpy).toHaveBeenCalledWith(
      "[AppError] 内部逻辑错误（请上报 bug）:",
      "bad state",
      "\n",
      expect.any(String),
    )
    expect(previousHandler).toHaveBeenCalledWith(
      expect.any(AppInvariantError),
      true,
    )
  })

  test("should log uncaught errors when previous handler is missing", () => {
    let capturedHandler: CapturedHandler | undefined
    setErrorUtils({
      getGlobalHandler: jest.fn(() => undefined),
      setGlobalHandler: jest.fn((handler: CapturedHandler) => {
        capturedHandler = handler
      }),
    })
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {})
    const { setupGlobalErrorHandler } = loadHandler()
    const error = new Error("boom")

    setupGlobalErrorHandler()
    capturedHandler?.(error, false)

    expect(consoleSpy).toHaveBeenCalledWith(
      "[AppError] 未捕获异常 isFatal=false:",
      error,
    )
  })
})
