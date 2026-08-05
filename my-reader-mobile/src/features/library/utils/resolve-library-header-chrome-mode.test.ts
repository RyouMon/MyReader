import { resolveLibraryHeaderChromeMode } from "./resolve-library-header-chrome-mode"

describe("resolveLibraryHeaderChromeMode", () => {
  it("should use default chrome when no header actions are available", () => {
    expect(resolveLibraryHeaderChromeMode("empty")).toBe("default")
    expect(resolveLibraryHeaderChromeMode("loading")).toBe("default")
    expect(resolveLibraryHeaderChromeMode("invalid")).toBe("default")
  })

  it("should use toolbar-right chrome for the unselected variant", () => {
    expect(resolveLibraryHeaderChromeMode("unselected")).toBe("toolbar-right")
  })

  it("should use platform-menus chrome when library is loaded", () => {
    expect(resolveLibraryHeaderChromeMode("loaded")).toBe("platform-menus")
  })
})
