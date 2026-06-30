import { resolveLibraryScreenVariant } from "./resolve-library-screen-variant"

describe("resolveLibraryScreenVariant", () => {
  it("should return loading when store is not ready and library id is pending", () => {
    expect(
      resolveLibraryScreenVariant({
        storeReady: false,
        effectiveLibraryId: "lib-1",
        hasSelectedLibrary: false,
        librariesCount: 2,
      }),
    ).toBe("loading")
  })

  it("should return invalid when selected library id is missing after store ready", () => {
    expect(
      resolveLibraryScreenVariant({
        storeReady: true,
        effectiveLibraryId: "missing-lib",
        hasSelectedLibrary: false,
        librariesCount: 2,
      }),
    ).toBe("invalid")
  })

  it("should return empty when there are no libraries", () => {
    expect(
      resolveLibraryScreenVariant({
        storeReady: true,
        effectiveLibraryId: undefined,
        hasSelectedLibrary: false,
        librariesCount: 0,
      }),
    ).toBe("empty")
  })

  it("should return unselected when libraries exist but none is selected", () => {
    expect(
      resolveLibraryScreenVariant({
        storeReady: true,
        effectiveLibraryId: undefined,
        hasSelectedLibrary: false,
        librariesCount: 2,
      }),
    ).toBe("unselected")
  })

  it("should return loaded when a library is selected", () => {
    expect(
      resolveLibraryScreenVariant({
        storeReady: true,
        effectiveLibraryId: "lib-1",
        hasSelectedLibrary: true,
        librariesCount: 2,
      }),
    ).toBe("loaded")
  })
})
