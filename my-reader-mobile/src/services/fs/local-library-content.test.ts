import type { Library } from "@my-reader/tools/types/library"

import { withLocalLibraryContentRoot } from "./local-library-content"

jest.mock("./library-paths", () => ({
  libraryRootUri: (library: Library) =>
    `file:///current/Documents/libraries/${library.id}`,
  METADATA_DB_RELATIVE: "metadata.db",
}))

jest.mock("./bookmarks", () => ({
  withSecurityScopedLibraryAccess: (
    library: Library,
    operation: (uri: string) => unknown,
  ) => operation(library.securityScopedBookmark?.resolvedUri ?? library.path),
}))

function remoteLibrary(): Library {
  return {
    id: "library-id",
    name: "Remote library",
    path: "file:///stale/Documents/libraries/library-id",
    metadataUri: "file:///stale/Documents/libraries/library-id/metadata.db",
    bookCount: 1,
    addedAt: 1,
    sourceType: "webdav",
  }
}

describe("withLocalLibraryContentRoot", () => {
  it("should use the current app container when a remote library has a stale persisted path", async () => {
    const operation = jest.fn(async (rootUri: string) => rootUri)

    await expect(
      withLocalLibraryContentRoot(remoteLibrary(), operation),
    ).resolves.toBe("file:///current/Documents/libraries/library-id")
    expect(operation).toHaveBeenCalledWith(
      "file:///current/Documents/libraries/library-id",
    )
  })

  it("should use the authorized directory for an iOS external library", async () => {
    const operation = jest.fn(async (rootUri: string) => rootUri)
    const library = {
      ...remoteLibrary(),
      sourceType: "local",
      path: "file:///external/Library",
      securityScopedBookmark: {
        bookmarkBase64: "bookmark",
        resolvedUri: "file:///external/Library",
        stale: false,
      },
    }

    await expect(withLocalLibraryContentRoot(library, operation)).resolves.toBe(
      "file:///external/Library",
    )
    expect(operation).toHaveBeenCalledWith("file:///external/Library")
  })
})
