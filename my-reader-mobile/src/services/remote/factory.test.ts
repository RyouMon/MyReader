import type { DataSource } from "@my-reader/tools/types/data-source"
import { CredentialError } from "../../errors"
import { refreshAccessToken } from "../auth/onedrive"
import { resolveRemoteCredential } from "../core/remote-credentials"
import { resolveLibraryStorage } from "../core/sync"
import {
  readOneDriveRefreshToken,
  readWebDavPassword,
} from "../storage/credentials"
import { CoreRemoteBackend } from "./core-backend"
import { OneDriveRemoteBackend } from "./onedrive/backend"
import { WebDavRemoteBackend } from "./webdav/backend"
import { createRemoteBackend, resolveRemoteBackend } from "./factory"

jest.mock("../auth/onedrive", () => ({ refreshAccessToken: jest.fn() }))
jest.mock("../core/remote-credentials", () => ({
  resolveRemoteCredential: jest.fn(),
}))
jest.mock("../core/sync", () => ({ resolveLibraryStorage: jest.fn() }))
jest.mock("../storage/credentials", () => ({
  readOneDriveRefreshToken: jest.fn(),
  readWebDavPassword: jest.fn(),
}))
jest.mock("../core/app-config", () => ({ appConfigPath: "/config.json" }))
jest.mock("../fs/library-paths", () => ({
  libraryRootUri: () => "file:///library",
}))
jest.mock("../fs/path", () => ({ toNativeFilesystemPath: () => "/library" }))
jest.mock("./core-backend")
jest.mock("./onedrive/backend")
jest.mock("./webdav/backend")

const library = {
  id: "library",
  name: "Books",
  path: "file:///library",
  bookCount: 0,
}
const base = { id: "source", name: "Source", enabled: true }
const sources: Extract<DataSource, { type: "gdrive" | "dropbox" | "s3" }>[] = [
  { ...base, type: "gdrive", clientId: "client", hasRefreshToken: true },
  { ...base, type: "dropbox", clientId: "client", hasRefreshToken: true },
  {
    ...base,
    type: "s3",
    endpoint: "https://s3.example",
    bucket: "books",
    region: "us-east-1",
    virtualHostStyle: false,
    hasCredentials: true,
  },
]
describe("remote backend resolution", () => {
  beforeEach(() => jest.resetAllMocks())

  it.each(
    sources,
  )("resolves $type against the Core library root", async (source) => {
    const storage =
      source.type === "s3"
        ? {
            ...source,
            kind: source.type,
            accessKeyId: "key",
            secretAccessKey: "secret",
            root: "/Source/Library",
          }
        : {
            kind: source.type,
            root: "/Source/Library",
            rootFolderId: null,
            accessToken: "token",
          }
    jest
      .mocked(resolveRemoteCredential)
      .mockResolvedValue({ kind: source.type, accessToken: "token" })
    jest.mocked(resolveLibraryStorage).mockReturnValue(storage)
    const result = await resolveRemoteBackend(source, library)
    expect(result?.libraryStorage).toEqual(storage)
    expect(CoreRemoteBackend).toHaveBeenCalledWith(source.id, source, library)
    expect(resolveLibraryStorage).toHaveBeenCalledWith({
      configPath: "/config.json",
      libraryId: "library",
      localRootPath: "/library",
      credential: { kind: source.type, accessToken: "token" },
    })
    await expect(createRemoteBackend(source, library)).resolves.toBeInstanceOf(
      CoreRemoteBackend,
    )
  })

  it("treats missing credentials as disconnected but preserves network failures", async () => {
    jest
      .mocked(resolveRemoteCredential)
      .mockRejectedValueOnce(new CredentialError("missing"))
    await expect(createRemoteBackend(sources[0]!, library)).resolves.toBeNull()
    const offline = new Error("offline")
    jest.mocked(resolveRemoteCredential).mockRejectedValueOnce(offline)
    await expect(resolveRemoteBackend(sources[0]!, library)).rejects.toBe(
      offline,
    )
  })

  it("rejects a mismatched source and resolved storage provider", async () => {
    jest
      .mocked(resolveRemoteCredential)
      .mockResolvedValue({ kind: "gdrive", accessToken: "token" })
    jest
      .mocked(resolveLibraryStorage)
      .mockReturnValue({ kind: "local-direct", root: "/library" })
    await expect(resolveRemoteBackend(sources[0]!, library)).resolves.toBeNull()
    expect(CoreRemoteBackend).not.toHaveBeenCalled()
  })

  it("retains the established OneDrive and WebDAV adapters", async () => {
    const onedrive: DataSource = {
      ...base,
      type: "onedrive",
      clientId: "client",
      hasRefreshToken: true,
    }
    const webdav: DataSource = {
      ...base,
      type: "webdav",
      endpoint: "https://dav.example",
      username: "reader",
      rootPath: "/Source",
      hasPassword: true,
    }
    await expect(resolveRemoteBackend(onedrive, library)).resolves.toBeNull()
    await expect(resolveRemoteBackend(webdav, library)).resolves.toBeNull()
    jest.mocked(readOneDriveRefreshToken).mockResolvedValue("refresh")
    jest
      .mocked(refreshAccessToken)
      .mockResolvedValue({ accessToken: "access", expiresAt: 100 })
    jest.mocked(resolveLibraryStorage).mockReturnValue({
      kind: "onedrive",
      accessToken: "access",
      root: "/Source/Library",
    })
    await resolveRemoteBackend(onedrive, library)
    expect(OneDriveRemoteBackend).toHaveBeenCalledWith(
      "source",
      "/Source/Library",
    )
    jest.mocked(readWebDavPassword).mockResolvedValue("password")
    jest.mocked(resolveLibraryStorage).mockReturnValue({
      kind: "webdav",
      endpoint: webdav.endpoint,
      username: webdav.username,
      password: "password",
      root: "/Source/Library",
    })
    await resolveRemoteBackend(webdav, library)
    expect(WebDavRemoteBackend).toHaveBeenCalledWith(
      { ...webdav, password: "password", rootPath: null },
      "/Source/Library",
    )
  })
})
