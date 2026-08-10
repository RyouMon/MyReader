import {
  appConfigInitialize,
  appConfigWriteMobile,
  dataSourcePrepareForUpsert,
  libraryCreateLocalMyreader,
  libraryCreateManagedLocalMyreader,
} from "my-reader-core"
import {
  createLocalMyReaderLibrary,
  createManagedLocalMyReaderLibrary,
  initializeAppConfig,
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
  libraryCreateLocalMyreader: jest.fn(),
  libraryCreateManagedLocalMyreader: jest.fn(),
  libraryAddLocal: jest.fn(),
  libraryOpenLocalMyreader: jest.fn(),
  libraryRemove: jest.fn(),
  libraryReplace: jest.fn(),
  librarySwitch: jest.fn(),
  dataSourceRemove: jest.fn(),
  dataSourceUpsert: jest.fn(),
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

  it("should create a managed local MyReader library under the app container", async () => {
    const myreaderLibrary = {
      ...coreLibrary,
      libraryType: "myreader",
      bookCount: 0,
    }
    jest.mocked(libraryCreateManagedLocalMyreader).mockResolvedValue({
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

    const result = await createManagedLocalMyReaderLibrary({
      librariesRootUri: "file:///documents/libraries",
      name: "Library",
      addedAt: 1,
    })

    expect(libraryCreateManagedLocalMyreader).toHaveBeenCalledWith(
      "/documents/config.json",
      {
        librariesRootPath: "/documents/libraries",
        librariesRootUri: "file:///documents/libraries",
        name: "Library",
        addedAt: 1,
      },
      123,
    )
    expect(result.library.libraryType).toBe("myreader")
  })

  it("should pass an iOS external bookmark through the core boundary", async () => {
    const securityScopedBookmark = {
      bookmarkBase64: "bookmark",
      resolvedUri: "file:///external/Library",
      stale: false,
    }
    const myreaderLibrary = {
      ...coreLibrary,
      path: securityScopedBookmark.resolvedUri,
      libraryType: "myreader",
      bookCount: 0,
      securityScopedBookmark,
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
    jest.spyOn(Date, "now").mockReturnValueOnce(456)

    const result = await createLocalMyReaderLibrary({
      libraryRootUri: securityScopedBookmark.resolvedUri,
      path: securityScopedBookmark.resolvedUri,
      sidecarContainerParentUri: "file:///documents/libraries",
      name: "Library",
      addedAt: 1,
      securityScopedBookmark,
    })

    expect(libraryCreateLocalMyreader).toHaveBeenCalledWith(
      "/documents/config.json",
      {
        libraryRootPath: "/external/Library",
        path: "file:///external/Library",
        sourcePath: undefined,
        sidecarContainerParentPath: "/documents/libraries",
        name: "Library",
        metadataUri: undefined,
        addedAt: 1,
        securityScopedBookmark,
      },
      456,
    )
    expect(result.library.securityScopedBookmark).toEqual(
      securityScopedBookmark,
    )
  })
})
