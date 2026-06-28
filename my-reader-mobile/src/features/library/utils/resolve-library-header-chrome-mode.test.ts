import { resolveLibraryHeaderChromeMode } from "./resolve-library-header-chrome-mode"

describe("resolveLibraryHeaderChromeMode", () => {
  it("should use default chrome for loading and invalid variants", () => {
    expect(resolveLibraryHeaderChromeMode("loading")).toBe("default")
    expect(resolveLibraryHeaderChromeMode("invalid")).toBe("default")
  })

  it("should use toolbar-right chrome for empty and unselected variants", () => {
    expect(resolveLibraryHeaderChromeMode("empty")).toBe("toolbar-right")
    expect(resolveLibraryHeaderChromeMode("unselected")).toBe("toolbar-right")
  })

  it("should use platform-menus chrome when library is loaded", () => {
    expect(resolveLibraryHeaderChromeMode("loaded")).toBe("platform-menus")
  })
})
