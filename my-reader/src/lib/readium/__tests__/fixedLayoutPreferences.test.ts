import { describe, expect, it } from "vitest"
import {
  normalizeFixedBackground,
  normalizeFixedNavigationMode,
  resolveFixedBackgroundColor,
} from "../fixedLayoutPreferences"

describe("fixedLayoutPreferences", () => {
  it("should fall back to mobile-aligned defaults when persisted values are invalid", () => {
    expect(normalizeFixedBackground("dim")).toBe("auto")
    expect(normalizeFixedNavigationMode("diagonal")).toBe("horizontal")
  })

  it("should follow the app theme when the fixed background is automatic", () => {
    expect(resolveFixedBackgroundColor("auto", "light")).toBe("#FFFFFF")
    expect(resolveFixedBackgroundColor("auto", "dark")).toBe("#000000")
  })

  it("should keep the explicit fixed background when the app theme changes", () => {
    expect(resolveFixedBackgroundColor("black", "light")).toBe("#000000")
    expect(resolveFixedBackgroundColor("white", "dark")).toBe("#FFFFFF")
  })
})
