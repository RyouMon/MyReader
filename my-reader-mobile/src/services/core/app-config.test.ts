import {
  appConfigInitialize,
  appConfigWriteMobile,
  dataSourcePrepare,
  dataSourceValidate,
  libraryAddLocal,
} from "my-reader-core"
import {
  addLocalAppLibrary,
  initializeAppConfig,
  prepareAppDataSource,
  validateAppDataSource,
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
  dataSourcePrepare: jest.fn(),
  dataSourceValidate: jest.fn(),
  appConfigInitialize: jest.fn(),
  appConfigWriteMobile: jest.fn(),
  libraryAddLocal: jest.fn(),
}))

describe("app config", () => {
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

  it("should validate source through core before platform credentials are written", async () => {
    jest.mocked(dataSourceValidate).mockResolvedValue()
    const source = {
      id: "source",
      type: "webdav" as const,
      name: "WebDAV",
      enabled: true,
      endpoint: "https://example.com",
      username: "reader",
      hasPassword: true,
    }

    await validateAppDataSource(source)

    expect(dataSourceValidate).toHaveBeenCalledWith("/documents/config.json", {
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
    jest.mocked(dataSourcePrepare).mockResolvedValue({
      kind: "webdav",
      id: "source",
      name: "WebDAV",
      enabled: true,
      endpoint: "https://example.com",
      username: "reader",
      hasPassword: true,
    })

    await expect(prepareAppDataSource(source)).resolves.toEqual({
      ...source,
      id: "source",
      endpoint: "https://example.com",
      rootPath: undefined,
      readonly: undefined,
      createdAt: undefined,
    })
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
  })
})
