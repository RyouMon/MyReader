import {
  cancelIdleWork,
  describeError,
  scheduleIdleWork,
  uuid,
  yieldToEventLoop,
} from "./common"

jest.mock("expo-crypto", () => ({
  randomUUID: () => "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
}))

describe("uuid", () => {
  it("should return 32-char hex string when uuid contains hyphens", () => {
    const id = uuid()
    expect(id).toBe("a1b2c3d4e5f67890abcdef1234567890")
    expect(id).toHaveLength(32)
    expect(id).not.toContain("-")
  })
})

describe("describeError", () => {
  it("should return message when value is an Error", () => {
    expect(describeError(new Error("broken"))).toBe("broken")
  })

  it("should return string unchanged when value is a string", () => {
    expect(describeError("plain")).toBe("plain")
  })

  it("should stringify value when JSON serialization succeeds", () => {
    expect(describeError({ code: "E_FAIL" })).toBe('{"code":"E_FAIL"}')
  })

  it("should coerce value when JSON serialization fails", () => {
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic

    expect(describeError(cyclic)).toBe("[object Object]")
  })
})

describe("event loop helpers", () => {
  afterEach(() => {
    jest.useRealTimers()
    delete (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback
    delete (globalThis as { cancelIdleCallback?: unknown }).cancelIdleCallback
  })

  it("should resolve after a timeout when yielding to the event loop", async () => {
    jest.useFakeTimers()
    const yielded = yieldToEventLoop()

    jest.runOnlyPendingTimers()

    await expect(yielded).resolves.toBeUndefined()
  })

  it("should schedule and cancel idle callback when idle APIs exist", () => {
    const requestIdleCallback = jest.fn(() => 123)
    const cancelIdleCallback = jest.fn()
    globalThis.requestIdleCallback = requestIdleCallback as never
    globalThis.cancelIdleCallback = cancelIdleCallback as never
    const callback = jest.fn()

    const handle = scheduleIdleWork(callback)
    cancelIdleWork(handle)

    expect(handle).toBe(123)
    expect(requestIdleCallback).toHaveBeenCalledWith(callback)
    expect(cancelIdleCallback).toHaveBeenCalledWith(123)
  })

  it("should schedule and cancel timeout when idle APIs do not exist", () => {
    jest.useFakeTimers()
    const callback = jest.fn()

    const handle = scheduleIdleWork(callback)
    cancelIdleWork(handle)
    jest.runOnlyPendingTimers()

    expect(callback).not.toHaveBeenCalled()
  })
})
