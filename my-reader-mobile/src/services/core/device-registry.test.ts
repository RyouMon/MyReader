jest.mock("expo-file-system", () => ({
  File: jest.fn(() => ({ uri: "file:///documents/device-registry.json" })),
  Paths: { document: "file:///documents" },
}))
jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: (uri: string) => uri.replace("file://", ""),
}))

import MyReaderRustComponents from "@/modules/myreader-rust-components"
import {
  addLocalDeviceLibrary,
  initializeDeviceRegistry,
  prepareDeviceDataSource,
  registerDeviceLibrary,
  validateDeviceDataSource,
} from "./device-registry"

describe("device registry", () => {
  const nativeLibrary = {
    id: "library",
    name: "Library",
    path: "file:///library",
    bookCount: 1,
    metadataUri: null,
    addedAt: null,
    dataSourceId: null,
    sourceType: "local",
    sourcePath: null,
    metadataEtag: null,
    securityScopedBookmark: null,
  }

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
  const mockAddLocalLibrary = jest.spyOn(
    MyReaderRustComponents,
    "addLocalLibrary",
  )
  const mockPrepareDeviceDataSource = jest.spyOn(
    MyReaderRustComponents,
    "prepareDeviceDataSource",
  )

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should pass legacy registry to core when registry is initialized", async () => {
    mockInitializeDeviceRegistry.mockResolvedValue({
      schemaVersion: 1,
      dataSources: [],
      libraries: [],
      activeLibraryId: null,
    })

    await initializeDeviceRegistry({
      dataSources: [],
      libraries: [],
      activeLibraryId: null,
    })

    expect(mockInitializeDeviceRegistry).toHaveBeenCalledWith(
      "/documents/device-registry.json",
      {
        schemaVersion: 1,
        dataSources: [],
        libraries: [],
        activeLibraryId: null,
      },
    )
  })

  it("should return core snapshot when library is registered", async () => {
    const library = {
      id: "library",
      name: "Library",
      path: "file:///library",
      bookCount: 1,
    }
    mockRegisterDeviceLibrary.mockResolvedValue({
      schemaVersion: 1,
      dataSources: [],
      libraries: [nativeLibrary],
      activeLibraryId: "library",
    })

    const registry = await registerDeviceLibrary(library)

    expect(mockRegisterDeviceLibrary).toHaveBeenCalledWith(
      "/documents/device-registry.json",
      {
        ...nativeLibrary,
        sourceType: null,
      },
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
      {
        sourceType: "webdav",
        id: "source",
        name: "WebDAV",
        enabled: true,
        rootPath: null,
        readonly: null,
        createdAt: null,
        endpoint: "https://example.com",
        username: "reader",
        hasPassword: true,
        credentialReference: null,
        clientId: null,
        tenantId: null,
        displayName: null,
        email: null,
        hasRefreshToken: false,
      },
    )
  })

  it("should use normalized source returned by core when source is prepared", async () => {
    const source = {
      id: "",
      type: "webdav" as const,
      name: "WebDAV",
      enabled: true,
      endpoint: "https://example.com/",
      username: "reader",
      hasPassword: true,
    }
    const prepared = {
      ...source,
      id: "source",
      endpoint: "https://example.com",
      rootPath: null,
      readonly: undefined,
      createdAt: undefined,
    }
    mockPrepareDeviceDataSource.mockResolvedValue({
      sourceType: "webdav",
      id: "source",
      name: "WebDAV",
      enabled: true,
      rootPath: null,
      readonly: null,
      createdAt: null,
      endpoint: "https://example.com",
      username: "reader",
      hasPassword: true,
      credentialReference: null,
      clientId: null,
      tenantId: null,
      displayName: null,
      email: null,
      hasRefreshToken: false,
    })

    await expect(prepareDeviceDataSource(source)).resolves.toEqual(prepared)
    expect(mockPrepareDeviceDataSource).toHaveBeenCalledWith({
      sourceType: "webdav",
      id: "",
      name: "WebDAV",
      enabled: true,
      rootPath: null,
      readonly: null,
      createdAt: null,
      endpoint: "https://example.com/",
      username: "reader",
      hasPassword: true,
      credentialReference: null,
      clientId: null,
      tenantId: null,
      displayName: null,
      email: null,
      hasRefreshToken: false,
    })
  })

  it("should delegate local library creation when a directory is selected", async () => {
    const library = {
      id: "library",
      name: "Library",
      path: "file:///library",
      bookCount: 1,
      sourceType: "local",
    }
    mockAddLocalLibrary.mockResolvedValue({
      registry: {
        schemaVersion: 1,
        dataSources: [],
        libraries: [nativeLibrary],
        activeLibraryId: "library",
      },
      library: nativeLibrary,
    })

    const result = await addLocalDeviceLibrary({
      libraryRootUri: "file:///library",
      path: "file:///library",
      sidecarContainerParentUri: "file:///documents/libraries",
      name: "Library",
      metadataUri: "file:///library/metadata.db",
      addedAt: 1,
    })

    expect(mockAddLocalLibrary).toHaveBeenCalledWith(
      "/documents/device-registry.json",
      {
        libraryRootPath: "/library",
        path: "file:///library",
        sidecarContainerParentPath: "/documents/libraries",
        name: "Library",
        metadataUri: "file:///library/metadata.db",
        addedAt: 1,
        securityScopedBookmark: null,
      },
    )
    expect(result.library.id).toBe("library")
  })
})
