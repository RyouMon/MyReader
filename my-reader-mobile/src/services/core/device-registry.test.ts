jest.mock("expo-file-system", () => ({
  File: jest.fn(() => ({ uri: "file:///documents/device-registry.json" })),
  Paths: { document: "file:///documents" },
}))
jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: (uri: string) => uri.replace("file://", ""),
}))
jest.mock("./transport", () => ({
  invokeCoreAsync: jest.fn(),
}))

import {
  addLocalDeviceLibrary,
  initializeDeviceRegistry,
  prepareDeviceDataSource,
  registerDeviceLibrary,
  validateDeviceDataSource,
} from "./device-registry"
import { invokeCoreAsync } from "./transport"

describe("device registry", () => {
  const coreLibrary = {
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

  const mockInvokeCoreAsync = jest.mocked(invokeCoreAsync)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should pass legacy registry to core when registry is initialized", async () => {
    mockInvokeCoreAsync.mockResolvedValue({
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

    expect(mockInvokeCoreAsync).toHaveBeenCalledWith("registry", "initialize", {
      registryPath: "/documents/device-registry.json",
      legacyRegistry: {
        schemaVersion: 1,
        dataSources: [],
        libraries: [],
        activeLibraryId: null,
      },
    })
  })

  it("should return core snapshot when library is registered", async () => {
    const library = {
      id: "library",
      name: "Library",
      path: "file:///library",
      bookCount: 1,
    }
    mockInvokeCoreAsync.mockResolvedValue({
      schemaVersion: 1,
      dataSources: [],
      libraries: [coreLibrary],
      activeLibraryId: "library",
    })

    const registry = await registerDeviceLibrary(library)

    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "registry",
      "registerLibrary",
      {
        registryPath: "/documents/device-registry.json",
        library: {
          ...coreLibrary,
          sourceType: null,
        },
      },
    )
    expect(registry.activeLibraryId).toBe("library")
  })

  it("should validate source through core before platform credentials are written", async () => {
    mockInvokeCoreAsync.mockResolvedValue(undefined)
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

    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "registry",
      "validateDataSource",
      {
        registryPath: "/documents/device-registry.json",
        source: {
          type: "webdav",
          id: "source",
          name: "WebDAV",
          enabled: true,
          endpoint: "https://example.com",
          username: "reader",
          rootPath: null,
          hasPassword: true,
          credentialReference: null,
          readonly: null,
          createdAt: null,
        },
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
    mockInvokeCoreAsync.mockResolvedValue({
      type: "webdav",
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
    })

    await expect(prepareDeviceDataSource(source)).resolves.toEqual(prepared)
    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "registry",
      "prepareDataSource",
      {
        source: {
          type: "webdav",
          id: "",
          name: "WebDAV",
          enabled: true,
          endpoint: "https://example.com/",
          username: "reader",
          rootPath: null,
          hasPassword: true,
          credentialReference: null,
          readonly: null,
          createdAt: null,
        },
      },
    )
  })

  it("should delegate local library creation when a directory is selected", async () => {
    const library = {
      id: "library",
      name: "Library",
      path: "file:///library",
      bookCount: 1,
      sourceType: "local",
    }
    mockInvokeCoreAsync.mockResolvedValue({
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

    expect(mockInvokeCoreAsync).toHaveBeenCalledWith(
      "registry",
      "addLocalLibrary",
      {
        registryPath: "/documents/device-registry.json",
        request: {
          libraryRootPath: "/library",
          path: "file:///library",
          sidecarContainerParentPath: "/documents/libraries",
          name: "Library",
          metadataUri: "file:///library/metadata.db",
          addedAt: 1,
          securityScopedBookmark: null,
        },
      },
    )
    expect(result.library.id).toBe("library")
  })
})
