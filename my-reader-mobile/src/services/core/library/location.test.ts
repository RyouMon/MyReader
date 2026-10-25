import { libraryLocation, libraryRelocate } from "my-reader-core"
import { readLibraryLocation, relocateLibraryLocation } from "./location"
import { credentialFor } from "../remote"
import { CredentialError, NetworkError } from "@/src/errors"
import { withSecurityScopedLibraryAccess } from "../../fs/bookmarks"

jest.mock("my-reader-core", () => ({
  libraryLocation: jest.fn(),
  libraryRelocate: jest.fn(),
}))
jest.mock("../app-config", () => ({
  appConfigPath: "/app/config.json",
  appConfigFromCore: (config: unknown) => config,
}))
jest.mock("../remote", () => ({ credentialFor: jest.fn() }))
jest.mock("../../fs/path", () => ({
  toNativeFilesystemPath: (uri: string) => uri.replace("file://", ""),
}))
jest.mock("../../fs/library-paths", () => ({
  libraryRootUri: (library: { path: string }) => library.path,
  librarySidecarRootUri: () => "file:///app/libraries/lib",
}))
jest.mock("../../fs/bookmarks", () => ({
  withSecurityScopedLibraryAccess: jest.fn((library, run) => run(library.path)),
}))
const library = { id: "lib", name: "Books", path: "file:///old", bookCount: 1 }
const source = {
  id: "dav",
  type: "webdav" as const,
  name: "Server",
  enabled: true,
  endpoint: "https://example.test/dav",
  username: "reader",
  hasPassword: true,
}
const location = {
  libraryId: "lib",
  libraryName: "Books",
  sourceRoot: "",
  path: "/old",
  effectivePath: "/old",
  canRelocate: true,
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(libraryLocation).mockResolvedValue(location)
  jest
    .mocked(credentialFor)
    .mockResolvedValue({ kind: "webdav", password: "test-only" })
})
it("describes without credentials or opening the directory, even when offline", async () => {
  expect(await readLibraryLocation(library, source)).toEqual(location)
  expect(credentialFor).not.toHaveBeenCalled()
  expect(withSecurityScopedLibraryAccess).not.toHaveBeenCalled()
  expect(libraryLocation).toHaveBeenCalledWith(
    "/app/config.json",
    "lib",
    "/old",
    undefined,
    false,
  )
})
it("diagnoses while persistent directory access is held", async () => {
  await readLibraryLocation(library, undefined, true)
  expect(withSecurityScopedLibraryAccess).toHaveBeenCalledWith(
    library,
    expect.any(Function),
  )
  expect(libraryLocation).toHaveBeenCalledWith(
    "/app/config.json",
    "lib",
    "/old",
    undefined,
    true,
  )
})
it.each([
  [new CredentialError("expired"), "credential"],
  [new NetworkError("offline"), "connectivity"],
])("keeps path context when credential resolution fails (%s)", async (error, problem) => {
  jest.mocked(credentialFor).mockRejectedValueOnce(error)
  expect(await readLibraryLocation(library, source, true)).toEqual({
    ...location,
    problem,
    detail: String(error),
  })
})
it("persists a new bookmark and keeps the original sidecar container", async () => {
  const bookmark = {
    bookmarkBase64: "new-bookmark",
    resolvedUri: "file:///new",
    stale: false,
  }
  jest
    .mocked(libraryRelocate)
    .mockResolvedValue({ location, config: undefined })
  const result = await relocateLibraryLocation(library, {
    targetPath: "file:///new",
    targetUri: "file:///new",
    securityScopedBookmark: bookmark,
  })
  expect(withSecurityScopedLibraryAccess).toHaveBeenCalledWith(
    expect.objectContaining({
      path: "file:///new",
      securityScopedBookmark: bookmark,
    }),
    expect.any(Function),
  )
  expect(libraryRelocate).toHaveBeenCalledWith(
    "/app/config.json",
    "lib",
    "/app/libraries/lib",
    {
      targetPath: "/new",
      targetUri: "file:///new",
      securityScopedBookmark: bookmark,
    },
    undefined,
  )
  expect(result.config).toBeUndefined()
})
it("passes a remote source-relative path and short-lived credentials", async () => {
  jest
    .mocked(libraryRelocate)
    .mockResolvedValue({ location, config: { libraries: [] } } as never)
  const result = await relocateLibraryLocation(
    library,
    { targetPath: "/new" },
    source,
  )
  expect(libraryRelocate).toHaveBeenCalledWith(
    "/app/config.json",
    "lib",
    "/app/libraries/lib",
    {
      targetPath: "/new",
      targetUri: undefined,
      securityScopedBookmark: undefined,
    },
    { kind: "webdav", password: "test-only" },
  )
  expect(result.config).toEqual({ libraries: [] })
})
