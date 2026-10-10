import { afterEach, describe, expect, it, vi } from "vitest"
import { isWindowsPlatform } from "../platform"

describe("isWindowsPlatform", () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    ["Win32", "", true],
    ["", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", true],
    ["MacIntel", "Mozilla/5.0 (Macintosh; Intel Mac OS X)", false],
    ["Linux x86_64", "Mozilla/5.0 (X11; Linux x86_64)", false],
  ])("should detect platform %s without confusing other desktop platforms", (platform, userAgent, expected) => {
    vi.stubGlobal("navigator", { platform, userAgent })
    expect(isWindowsPlatform()).toBe(expected)
  })

  it("should return false when there is no browser navigator", () => {
    vi.stubGlobal("navigator", undefined)
    expect(isWindowsPlatform()).toBe(false)
  })
})
