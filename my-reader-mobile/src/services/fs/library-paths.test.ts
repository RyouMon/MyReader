import type { Library } from "@my-reader/tools/types/library"

jest.mock("@/src/services/fs/path", () => ({
  ensureDocumentSubdirUri: (...segments: string[]) =>
    `file:///documents/${segments.join("/")}`,
  fileUriFor: (base: string, rel: string) =>
    `${base.replace(/\/$/, "")}/${rel}`,
  joinRelativePath: (left: string, right: string) => `${left}/${right}`,
  canonicalRelativePath: (path: string) => path,
}))

jest.mock("expo-file-system", () => {
  let lastDirectory: MockDirectory | undefined

  class MockDirectory {
    static nextExists = true
    exists = MockDirectory.nextExists
    uri: string
    create = jest.fn()

    constructor(mockUri: string) {
      this.uri = mockUri
      lastDirectory = this
    }
  }

  class MockFile {
    static nextExists = true
    static nextSize: number | null = 100
    exists = MockFile.nextExists
    size = MockFile.nextSize
    uri: string
    constructor(mockUri: string) {
      this.uri = mockUri
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    __mockFileSystem: {
      Directory: MockDirectory,
      File: MockFile,
      getLastDirectory: () => lastDirectory,
    },
  }
})

const platformOs = { current: "ios" as "ios" | "android" }
jest.mock("react-native", () => ({
  Platform: {
    get OS() {
      return platformOs.current
    },
  },
}))

import type { RemoteBackend } from "@/src/services/remote/backend"

import {
  libraryBookFileUri,
  libraryContainerRootUri,
  ensureLibrarySidecarDirectory,
  libraryLocalRootUri,
  libraryMetadataUri,
  libraryMyReaderDirUri,
  libraryRootUri,
  librarySidecarRootUri,
  resolveCoverUri,
  usesIosContainerSidecar,
} from "./library-paths"

const { __mockFileSystem } = jest.requireMock("expo-file-system")

function localLibrary(overrides: Partial<Library> = {}): Library {
  return {
    id: "lib-1",
    name: "Local",
    path: "file:///external/Calibre",
    metadataUri: "",
    bookCount: 0,
    addedAt: 0,
    sourceType: "local",
    ...overrides,
  }
}

describe("library path helpers", () => {
  beforeEach(() => {
    platformOs.current = "ios"
    __mockFileSystem.Directory.nextExists = true
    __mockFileSystem.File.nextExists = true
    __mockFileSystem.File.nextSize = 100
  })

  test("should use app container when library source is remote", () => {
    const library = localLibrary({ sourceType: "webdav", path: "/remote/lib" })
    expect(libraryRootUri(library)).toBe("file:///documents/libraries/lib-1")
    expect(librarySidecarRootUri(library)).toBe(
      "file:///documents/libraries/lib-1",
    )
    expect(libraryMetadataUri(library)).toBe(
      "file:///documents/libraries/lib-1/metadata.db",
    )
    expect(libraryMyReaderDirUri(library)).toBe(
      "file:///documents/libraries/lib-1/.myreader",
    )
  })

  test("should split roots when iOS local library uses security bookmark", () => {
    const library = localLibrary({
      securityScopedBookmark: {
        bookmarkBase64: "bookmark-data",
        resolvedUri: "file:///external/Calibre",
        stale: false,
      },
    })

    expect(usesIosContainerSidecar(library)).toBe(true)
    expect(libraryLocalRootUri(library)).toBe("file:///external/Calibre")
    expect(libraryRootUri(library)).toBe("file:///external/Calibre")
    expect(librarySidecarRootUri(library)).toBe(
      "file:///documents/libraries/lib-1",
    )
    expect(libraryMetadataUri(library)).toBe(
      "file:///external/Calibre/metadata.db",
    )
    expect(libraryMyReaderDirUri(library)).toBe(
      "file:///documents/libraries/lib-1/.myreader",
    )
    expect(libraryBookFileUri(library, "Author/Title (1)/book.epub")).toBe(
      "file:///external/Calibre/Author/Title (1)/book.epub",
    )
  })

  test("should use same local root when platform is not iOS", () => {
    platformOs.current = "android"
    const library = localLibrary({
      path: "file:///sdcard/Calibre",
      securityScopedBookmark: {
        bookmarkBase64: "unused",
        resolvedUri: "file:///sdcard/Calibre",
        stale: false,
      },
    })

    expect(usesIosContainerSidecar(library)).toBe(false)
    expect(libraryLocalRootUri(library)).toBe("file:///sdcard/Calibre")
    expect(libraryRootUri(library)).toBe("file:///sdcard/Calibre")
    expect(librarySidecarRootUri(library)).toBe("file:///sdcard/Calibre")
    expect(libraryMetadataUri(library)).toBe(
      "file:///sdcard/Calibre/metadata.db",
    )
    expect(libraryMyReaderDirUri(library)).toBe(
      "file:///sdcard/Calibre/.myreader",
    )
  })

  test("should create predictable document path when building library container root", () => {
    expect(libraryContainerRootUri("abc")).toBe(
      "file:///documents/libraries/abc",
    )
  })

  test("should create sidecar directory when container sidecar is missing", () => {
    __mockFileSystem.Directory.nextExists = false
    const library = localLibrary({
      sourceType: "webdav",
      path: "https://example.com/lib",
    })

    expect(ensureLibrarySidecarDirectory(library)).toBe(
      "file:///documents/libraries/lib-1/.myreader",
    )
    expect(__mockFileSystem.getLastDirectory().create).toHaveBeenCalledWith({
      idempotent: true,
      intermediates: true,
    })
  })

  test("should leave sidecar directory alone when local sidecar exists", () => {
    const library = localLibrary({ path: "file:///external/Calibre" })

    expect(ensureLibrarySidecarDirectory(library)).toBe(
      "file:///external/Calibre/.myreader",
    )
    expect(__mockFileSystem.getLastDirectory().create).not.toHaveBeenCalled()
  })
})

describe("resolveCoverUri", () => {
  test("should use backend cover URL when library source is remote", () => {
    const library = localLibrary({
      sourceType: "webdav",
      path: "https://example.com/lib",
    })
    const backend = {
      contentUrl: (relative: string) => `https://example.com/lib/${relative}`,
      getCachedAuthHeaders: () => ({ Authorization: "Bearer token" }),
    } as Pick<
      RemoteBackend,
      "contentUrl" | "getCachedAuthHeaders"
    > as RemoteBackend

    expect(resolveCoverUri(library, "Author/Book", true, backend)).toEqual({
      uri: "https://example.com/lib/Author/Book/cover.jpg",
      headers: { Authorization: "Bearer token" },
    })
  })

  test("should prefer on-disk cover when local cover exists", () => {
    const library = localLibrary({ path: "file:///external/Calibre" })
    expect(resolveCoverUri(library, "Author/Book", true)).toBe(
      "file:///external/Calibre/Author/Book/cover.jpg",
    )
  })

  test("should return undefined when cover metadata or backend is missing", () => {
    const library = localLibrary({ path: "file:///external/Calibre" })
    __mockFileSystem.File.nextExists = false

    expect(resolveCoverUri(library, null, true)).toBeUndefined()
    expect(resolveCoverUri(library, "Author/Book", false)).toBeUndefined()
    expect(resolveCoverUri(library, "Author/Book", true)).toBeUndefined()
  })

  test("should ignore local cover when file is empty", () => {
    const library = localLibrary({ path: "file:///external/Calibre" })
    __mockFileSystem.File.nextSize = 0

    expect(resolveCoverUri(library, "Author/Book", true)).toBeUndefined()
  })

  test("should omit remote headers when backend has none cached", () => {
    const library = localLibrary({
      sourceType: "onedrive",
      path: "https://example.com/lib",
    })
    const backend = {
      contentUrl: (relative: string) => `https://example.com/lib/${relative}`,
      getCachedAuthHeaders: () => null,
    } as Pick<
      RemoteBackend,
      "contentUrl" | "getCachedAuthHeaders"
    > as RemoteBackend

    expect(resolveCoverUri(library, "Author/Book", true, backend)).toBe(
      "https://example.com/lib/Author/Book/cover.jpg",
    )
  })
})
