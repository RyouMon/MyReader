import type { Library } from "@my-reader/tools/types/library"

import { withLocalLibraryContentRoot } from "./local-library-content"

jest.mock("./bookmarks", () => ({
  withSecurityScopedLibraryAccess: jest.fn(),
}))

jest.mock("./library-paths", () => ({
  libraryLocalRootUri: (library: Library) => library.path,
  libraryRootUri: (library: Library) =>
    `file:///current/Documents/libraries/${library.id}`,
  METADATA_DB_RELATIVE: "metadata.db",
  usesIosContainerSidecar: () => false,
}))

jest.mock("expo-file-system", () => ({
  File: class {
    exists = true
    size = 1
  },
}))

const mockWithSecurityScopedLibraryAccess = jest.mocked(
  jest.requireMock("./bookmarks").withSecurityScopedLibraryAccess,
)

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
    expect(mockWithSecurityScopedLibraryAccess).not.toHaveBeenCalled()
  })
})
