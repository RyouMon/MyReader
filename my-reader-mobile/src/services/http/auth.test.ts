import { buildHttpBasicAuthHeader } from "./auth"

describe("buildHttpBasicAuthHeader", () => {
  const originalBtoa = globalThis.btoa

  afterEach(() => {
    Object.defineProperty(globalThis, "btoa", {
      configurable: true,
      value: originalBtoa,
    })
    jest.restoreAllMocks()
  })

  test("should return no header when both credentials are empty", () => {
    expect(buildHttpBasicAuthHeader("  ", "")).toEqual({})
  })

  test("should trim username when encoding credentials", () => {
    const btoa = jest.fn(() => "encoded")
    Object.defineProperty(globalThis, "btoa", {
      configurable: true,
      value: btoa,
    })

    expect(buildHttpBasicAuthHeader(" user ", "pass")).toEqual({
      Authorization: "Basic encoded",
    })
    expect(btoa).toHaveBeenCalledWith("user:pass")
  })

  test("should fall back to base64 package when btoa is unavailable", () => {
    Object.defineProperty(globalThis, "btoa", {
      configurable: true,
      value: undefined,
    })
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})

    expect(buildHttpBasicAuthHeader("user", "pass")).toEqual({
      Authorization: "Basic dXNlcjpwYXNz",
    })
    expect(warnSpy).toHaveBeenCalledWith(
      "[http] globalThis.btoa is unavailable, falling back to base-64 encoding",
    )
  })
})
