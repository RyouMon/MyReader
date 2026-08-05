import {
  appConfigInitialize,
  appConfigWriteMobile,
  dataSourcePrepareForUpsert,
  libraryAddLocal,
  libraryCreateLocalMyreader,
  libraryOpenLocalMyreader,
} from "my-reader-core"
import {
  addLocalAppLibrary,
  createLocalMyReaderLibrary,
  initializeAppConfig,
  openLocalMyReaderLibrary,
  prepareAppDataSourceForUpsert,
  writeMobileAppConfig,
} from "./app-config"

jest.mock("expo-file-system", () => ({
  File: jest.fn(() => ({ uri: "file:///documents/config.json" })),
  Paths: { document: "file:///documents" },
}))
jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: (uri: string) => uri.replace("file://", ""),
}))
jest.mock("my-reader-core", () => ({
  dataSourcePrepareForUpsert: jest.fn(),
  appConfigInitialize: jest.fn(),
  appConfigWriteMobile: jest.fn(),
  libraryAddLocal: jest.fn(),
  libraryCreateLocalMyreader: jest.fn(),
  libraryOpenLocalMyreader: jest.fn(),
}))

describe("app config", () => {
  const coreLibrary = {
    id: "library",
    name: "Library",
    path: "file:///library",
    libraryType: "calibre",
    bookCount: 1,
    sourceType: "local",
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should pass initial config to core when device config is initialized", async () => {
    jest.mocked(appConfigInitialize).mockResolvedValue({
      schemaVersion: 1,
      preferences: {
        theme: "system",
        language: "system",
      },
      dataSources: [],
      libraries: [],
    })

    await initializeAppConfig({
      dataSources: [],
      libraries: [],
      activeLibraryId: null,
    })

    expect(appConfigInitialize).toHaveBeenCalledWith("/documents/config.json", {
      schemaVersion: 1,
      deviceId: undefined,
      preferences: {
        theme: "system",
        language: "system",
      },
      dataSources: [],
      libraries: [],
      activeLibraryId: undefined,
      mobileJson: undefined,
    })
  })

  it("should write mobile state through core when preferences change", async () => {
    jest.mocked(appConfigWriteMobile).mockResolvedValue({
      schemaVersion: 1,
      preferences: {
        theme: "dark",
        language: "zh-CN",
      },
      dataSources: [],
      libraries: [],
      mobileJson: '{"state":{},"version":0}',
    })

    await writeMobileAppConfig(
      {
        theme: "dark",
        language: "zh-CN",
      },
      '{"state":{},"version":0}',
    )

    expect(appConfigWriteMobile).toHaveBeenCalledWith(
      "/documents/config.json",
      {
        theme: "dark",
        language: "zh-CN",
      },
      '{"state":{},"version":0}',
    )
  })

  it("should use normalized source returned by core when source is prepared for upsert", async () => {
    const source = {
      id: "",
      type: "webdav" as const,
      name: "WebDAV",
      enabled: true,
      endpoint: "https://example.com/",
      username: "reader",
      hasPassword: true,
    }
    jest.mocked(dataSourcePrepareForUpsert).mockResolvedValue({
      kind: "webdav",
      id: "source",
      name: "WebDAV",
      enabled: true,
      endpoint: "https://example.com",
      username: "reader",
      hasPassword: true,
    })

    await expect(prepareAppDataSourceForUpsert(source)).resolves.toEqual({
      ...source,
      id: "source",
      endpoint: "https://example.com",
      rootPath: undefined,
      readonly: undefined,
      createdAt: undefined,
    })
    expect(dataSourcePrepareForUpsert).toHaveBeenCalledWith(
      "/documents/config.json",
      {
        kind: "webdav",
        id: "",
        name: "WebDAV",
        enabled: true,
        endpoint: "https://example.com/",
        username: "reader",
        rootPath: undefined,
        hasPassword: true,
        readonly: undefined,
        createdAt: undefined,
      },
    )
  })

  it("should delegate local library creation when a directory is selected", async () => {
    jest.mocked(libraryAddLocal).mockResolvedValue({
      config: {
        schemaVersion: 1,
        preferences: {
          theme: "system",
          language: "system",
        },
        dataSources: [],
        libraries: [coreLibrary],
        activeLibraryId: "library",
      },
      library: coreLibrary,
    })

    const result = await addLocalAppLibrary({
      libraryRootUri: "file:///library",
      path: "file:///library",
      sidecarContainerParentUri: "file:///documents/libraries",
      name: "Library",
      metadataUri: "file:///library/metadata.db",
      addedAt: 1,
    })

    expect(libraryAddLocal).toHaveBeenCalledWith("/documents/config.json", {
      libraryRootPath: "/library",
      path: "file:///library",
      sidecarContainerParentPath: "/documents/libraries",
      name: "Library",
      metadataUri: "file:///library/metadata.db",
      addedAt: 1,
      securityScopedBookmark: undefined,
    })
    expect(result.library.id).toBe("library")
    expect(result.library.libraryType).toBe("calibre")
  })

  it("should create a local MyReader library through core with a container sidecar", async () => {
    const myreaderLibrary = {
      ...coreLibrary,
      libraryType: "myreader",
      bookCount: 0,
    }
    jest.mocked(libraryCreateLocalMyreader).mockResolvedValue({
      config: {
        schemaVersion: 1,
        preferences: { theme: "system", language: "system" },
        dataSources: [],
        libraries: [myreaderLibrary],
        activeLibraryId: "library",
      },
      library: myreaderLibrary,
    })
    jest.spyOn(Date, "now").mockReturnValueOnce(123)

    const result = await createLocalMyReaderLibrary({
      libraryRootUri: "file:///library",
      path: "file:///library",
      sidecarContainerParentUri: "file:///documents/libraries",
      name: "Library",
      addedAt: 1,
    })

    expect(libraryCreateLocalMyreader).toHaveBeenCalledWith(
      "/documents/config.json",
      {
        libraryRootPath: "/library",
        path: "file:///library",
        sidecarContainerParentPath: "/documents/libraries",
        name: "Library",
        metadataUri: undefined,
        addedAt: 1,
        securityScopedBookmark: undefined,
      },
      123,
    )
    expect(result.library.libraryType).toBe("myreader")
  })

  it("should open a local MyReader library through core with a device sidecar", async () => {
    const myreaderLibrary = {
      ...coreLibrary,
      libraryType: "myreader",
      bookCount: 1,
    }
    jest.mocked(libraryOpenLocalMyreader).mockResolvedValue({
      config: {
        schemaVersion: 1,
        preferences: { theme: "system", language: "system" },
        dataSources: [],
        libraries: [myreaderLibrary],
        activeLibraryId: "library",
      },
      library: myreaderLibrary,
    })
    jest.spyOn(Date, "now").mockReturnValueOnce(456)

    const result = await openLocalMyReaderLibrary({
      libraryRootUri: "file:///library",
      path: "file:///library",
      sidecarContainerParentUri: "file:///documents/libraries",
      name: "Library",
      addedAt: 1,
    })

    expect(libraryOpenLocalMyreader).toHaveBeenCalledWith(
      "/documents/config.json",
      {
        libraryRootPath: "/library",
        path: "file:///library",
        sidecarContainerParentPath: "/documents/libraries",
        name: "Library",
        metadataUri: undefined,
        addedAt: 1,
        securityScopedBookmark: undefined,
      },
      456,
    )
    expect(result.library.libraryType).toBe("myreader")
  })
})
