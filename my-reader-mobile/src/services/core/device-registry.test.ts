jest.mock("expo-file-system", () => ({
  File: jest.fn(() => ({ uri: "file:///documents/device-registry.json" })),
  Paths: { document: "file:///documents" },
}))
jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: (uri: string) => uri.replace("file://", ""),
}))
jest.mock("my-reader-core", () => ({
  registryAddLocalLibrary: jest.fn(),
  registryInitialize: jest.fn(),
  registryPrepareDataSource: jest.fn(),
  registryRegisterLibrary: jest.fn(),
  registryValidateDataSource: jest.fn(),
}))

import {
  registryAddLocalLibrary,
  registryInitialize,
  registryPrepareDataSource,
  registryRegisterLibrary,
  registryValidateDataSource,
} from "my-reader-core"
import {
  addLocalDeviceLibrary,
  initializeDeviceRegistry,
  prepareDeviceDataSource,
  registerDeviceLibrary,
  validateDeviceDataSource,
} from "./device-registry"

describe("device registry", () => {
  const coreLibrary = {
    id: "library",
    name: "Library",
    path: "file:///library",
    bookCount: 1,
    sourceType: "local",
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should pass legacy registry to core when registry is initialized", async () => {
    jest.mocked(registryInitialize).mockResolvedValue({
      schemaVersion: 1,
      dataSources: [],
      libraries: [],
    })

    await initializeDeviceRegistry({
      dataSources: [],
      libraries: [],
      activeLibraryId: null,
    })

    expect(registryInitialize).toHaveBeenCalledWith(
      "/documents/device-registry.json",
      {
        schemaVersion: 1,
        dataSources: [],
        libraries: [],
        activeLibraryId: undefined,
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
    jest.mocked(registryRegisterLibrary).mockResolvedValue({
      schemaVersion: 1,
      dataSources: [],
      libraries: [coreLibrary],
      activeLibraryId: "library",
    })

    const registry = await registerDeviceLibrary(library)

    expect(registryRegisterLibrary).toHaveBeenCalledWith(
      "/documents/device-registry.json",
      {
        id: "library",
        name: "Library",
        path: "file:///library",
        bookCount: 1,
        metadataUri: undefined,
        addedAt: undefined,
        dataSourceId: undefined,
        sourceType: undefined,
        sourcePath: undefined,
        metadataEtag: undefined,
        securityScopedBookmark: undefined,
      },
    )
    expect(registry.activeLibraryId).toBe("library")
  })

  it("should validate source through core before platform credentials are written", async () => {
    jest.mocked(registryValidateDataSource).mockResolvedValue()
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

    expect(registryValidateDataSource).toHaveBeenCalledWith(
      "/documents/device-registry.json",
      {
        kind: "webdav",
        id: "source",
        name: "WebDAV",
        enabled: true,
        endpoint: "https://example.com",
        username: "reader",
        rootPath: undefined,
        hasPassword: true,
        readonly: undefined,
        createdAt: undefined,
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
    jest.mocked(registryPrepareDataSource).mockResolvedValue({
      kind: "webdav",
      id: "source",
      name: "WebDAV",
      enabled: true,
      endpoint: "https://example.com",
      username: "reader",
      hasPassword: true,
    })

    await expect(prepareDeviceDataSource(source)).resolves.toEqual({
      ...source,
      id: "source",
      endpoint: "https://example.com",
      rootPath: undefined,
      readonly: undefined,
      createdAt: undefined,
    })
  })

  it("should delegate local library creation when a directory is selected", async () => {
    jest.mocked(registryAddLocalLibrary).mockResolvedValue({
      registry: {
        schemaVersion: 1,
        dataSources: [],
        libraries: [coreLibrary],
        activeLibraryId: "library",
      },
      library: coreLibrary,
    })

    const result = await addLocalDeviceLibrary({
      libraryRootUri: "file:///library",
      path: "file:///library",
      sidecarContainerParentUri: "file:///documents/libraries",
      name: "Library",
      metadataUri: "file:///library/metadata.db",
      addedAt: 1,
    })

    expect(registryAddLocalLibrary).toHaveBeenCalledWith(
      "/documents/device-registry.json",
      {
        libraryRootPath: "/library",
        path: "file:///library",
        sidecarContainerParentPath: "/documents/libraries",
        name: "Library",
        metadataUri: "file:///library/metadata.db",
        addedAt: 1,
        securityScopedBookmark: undefined,
      },
    )
    expect(result.library.id).toBe("library")
  })
})
