jest.mock("expo-file-system", () => ({
  File: jest.fn(() => ({ uri: "file:///documents/device-registry.json" })),
  Paths: { document: "file:///documents" },
}))
jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: () => "/documents/device-registry.json",
}))

import MyReaderRustComponents from "@/modules/myreader-rust-components"
import {
  initializeDeviceRegistry,
  registerDeviceLibrary,
  validateDeviceDataSource,
} from "./device-registry"

describe("device registry", () => {
  const mockInitializeDeviceRegistry = jest.spyOn(
    MyReaderRustComponents,
    "initializeDeviceRegistry",
  )
  const mockRegisterDeviceLibrary = jest.spyOn(
    MyReaderRustComponents,
    "registerDeviceLibrary",
  )
  const mockValidateDeviceDataSource = jest.spyOn(
    MyReaderRustComponents,
    "validateDeviceDataSource",
  )

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should pass legacy registry to core when registry is initialized", async () => {
    mockInitializeDeviceRegistry.mockResolvedValue(
      JSON.stringify({
        schemaVersion: 1,
        dataSources: [],
        libraries: [],
        activeLibraryId: null,
      }),
    )

    await initializeDeviceRegistry({
      dataSources: [],
      libraries: [],
      activeLibraryId: null,
    })

    expect(mockInitializeDeviceRegistry).toHaveBeenCalledWith(
      "/documents/device-registry.json",
      JSON.stringify({
        schemaVersion: 1,
        dataSources: [],
        libraries: [],
        activeLibraryId: null,
      }),
    )
  })

  it("should return core snapshot when library is registered", async () => {
    const library = {
      id: "library",
      name: "Library",
      path: "file:///library",
      bookCount: 1,
    }
    mockRegisterDeviceLibrary.mockResolvedValue(
      JSON.stringify({
        schemaVersion: 1,
        dataSources: [],
        libraries: [library],
        activeLibraryId: "library",
      }),
    )

    const registry = await registerDeviceLibrary(library)

    expect(mockRegisterDeviceLibrary).toHaveBeenCalledWith(
      "/documents/device-registry.json",
      JSON.stringify(library),
    )
    expect(registry.activeLibraryId).toBe("library")
  })

  it("should validate source through core before platform credentials are written", async () => {
    mockValidateDeviceDataSource.mockResolvedValue()
    const source = {
      id: "source",
      type: "webdav" as const,
      name: "WebDAV",
      enabled: true,
      endpoint: "https://example.com",
      username: "reader",
      hasPassword: true,
    }

    await validateDeviceDataSource(source)

    expect(mockValidateDeviceDataSource).toHaveBeenCalledWith(
      "/documents/device-registry.json",
      JSON.stringify(source),
    )
  })
})
