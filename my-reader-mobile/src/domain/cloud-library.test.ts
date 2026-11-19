import type {
  DataSourceGdrive,
  DataSourceDropbox,
  DataSourceS3,
} from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { CoreRemoteBackend } from "../services/remote/core-backend"
import {
  createRemoteBackend,
  resolveRemoteBackend,
} from "../services/remote/factory"
import { createRemoteOps } from "./library/remote-library"
import { resolveSyncTarget } from "./sync/resolve"

jest.mock("../services/remote/factory", () => ({
  createRemoteBackend: jest.fn(),
  resolveRemoteBackend: jest.fn(),
}))
jest.mock("../services/fs/library-paths", () => ({
  libraryRootUri: () => "file:///cache/library",
  librarySidecarRootUri: () => "file:///cache/library",
  resolveCoverUri: jest.fn(),
}))
jest.mock("../services/core/app-config", () => ({
  appConfigPath: "/config.json",
}))

const sources: (DataSourceGdrive | DataSourceDropbox | DataSourceS3)[] = [
  {
    id: "gdrive",
    type: "gdrive",
    name: "Google",
    enabled: true,
    clientId: "client",
    hasRefreshToken: true,
  },
  {
    id: "dropbox",
    type: "dropbox",
    name: "Dropbox",
    enabled: true,
    clientId: "client",
    hasRefreshToken: true,
  },
  {
    id: "s3",
    type: "s3",
    name: "S3",
    enabled: true,
    endpoint: "https://storage.example",
    bucket: "books",
    region: "us-east-1",
    virtualHostStyle: false,
    hasCredentials: true,
  },
]

describe("cloud library consumers", () => {
  beforeEach(() => jest.clearAllMocks())

  it.each(
    sources,
  )("resolves signed $type cover requests asynchronously and passes the correct storage to sync", async (source) => {
    const library: Library = {
      id: "library",
      name: "Books",
      path: "file:///cache/library",
      bookCount: 1,
      sourceType: source.type,
      dataSourceId: source.id,
    }
    const backend = new CoreRemoteBackend(source.id, source, library)
    const signed = {
      uri: "https://storage.example/signed-cover",
      headers: { Authorization: "Bearer temporary" },
    }
    const content = jest
      .spyOn(backend, "getContentUri")
      .mockResolvedValue(signed)
    jest.mocked(createRemoteBackend).mockResolvedValue(backend)
    const ops = await createRemoteOps(library, sources)
    expect(ops?.buildCoverUri(library, "Author/Book", true)).toBeUndefined()
    await expect(
      ops?.resolveCoverUri?.(library, "Author/Book/", true),
    ).resolves.toEqual(signed)
    expect(content).toHaveBeenCalledWith("Author/Book/cover.jpg")
    await expect(
      ops?.resolveCoverUri?.(library, "Author/Book", false),
    ).resolves.toBeUndefined()
    expect(content).toHaveBeenCalledTimes(1)
    const storage =
      source.type === "s3"
        ? {
            kind: source.type,
            endpoint: source.endpoint,
            bucket: source.bucket,
            region: source.region,
            root: "/Books",
            virtualHostStyle: false,
            accessKeyId: "key",
            secretAccessKey: "secret",
          }
        : {
            kind: source.type,
            root: "/Books",
            rootFolderId: null,
            accessToken: "temporary",
          }
    jest
      .mocked(resolveRemoteBackend)
      .mockResolvedValue({ backend, libraryStorage: storage })
    await expect(resolveSyncTarget(library, sources)).resolves.toEqual({
      backend,
      libraryStorage: storage,
      dataSourceId: source.id,
      libraryId: library.id,
      libraryRootUri: "file:///cache/library",
      librarySidecarRootUri: "file:///cache/library",
    })
    expect(resolveRemoteBackend).toHaveBeenCalledWith(source, library)
  })

  it("fails sync explicitly when the source or its credentials are unavailable", async () => {
    const source = sources[0]!
    const library: Library = {
      id: "library",
      name: "Books",
      path: "file:///cache/library",
      bookCount: 1,
      sourceType: source.type,
      dataSourceId: source.id,
    }
    await expect(createRemoteOps(library, [])).resolves.toBeNull()
    await expect(resolveSyncTarget(library, [])).rejects.toThrow(
      "sync.remoteSourceNotFound",
    )
    jest.mocked(createRemoteBackend).mockResolvedValue(null)
    jest.mocked(resolveRemoteBackend).mockResolvedValue(null)
    await expect(createRemoteOps(library, sources)).resolves.toBeNull()
    await expect(resolveSyncTarget(library, sources)).rejects.toThrow(
      "sync.remoteCredentialsMissing",
    )
  })
})
