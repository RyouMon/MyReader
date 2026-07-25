const mockInstallRustCrate = jest.fn()
const mockInitialize = jest.fn()

function loadNativeAutomergeModule(): void {
  jest.isolateModules(() => {
    jest.doMock("./NativeAutomergeGenerated", () => ({
      __esModule: true,
      default: { installRustCrate: mockInstallRustCrate },
    }))
    jest.doMock("./generated/automerge", () => ({
      __esModule: true,
      default: { initialize: mockInitialize },
    }))
    jest.doMock("./useapi-adapter", () => ({
      nativeApi: {},
      NativeAutomerge: class {},
      NativeSyncState: class {},
      Automerge: {},
    }))
    require("./index")
  })
}

describe("native Automerge module", () => {
  beforeEach(() => {
    mockInstallRustCrate.mockReset()
    mockInitialize.mockReset()
    delete globalThis.__MYREADER_AUTOMERGE_RUST_INSTALLED__
    delete globalThis.__MYREADER_AUTOMERGE_BINDINGS_INITIALIZED__
  })

  afterEach(() => {
    jest.dontMock("./NativeAutomergeGenerated")
    jest.dontMock("./generated/automerge")
    jest.dontMock("./useapi-adapter")
  })

  it("should install native bindings once when the module reloads", () => {
    loadNativeAutomergeModule()
    loadNativeAutomergeModule()

    expect(mockInstallRustCrate).toHaveBeenCalledTimes(1)
    expect(mockInitialize).toHaveBeenCalledTimes(1)
  })
})
