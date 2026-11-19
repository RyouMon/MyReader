import { CoreRemoteBackend } from "./core-backend"
import { CredentialError, NetworkError } from "../../errors"
import { storageDelete, storageList, storageWrite } from "my-reader-core"
import { File } from "expo-file-system"
import { invalidateCloudAccessToken } from "../auth/cloud"

const mockStorageRead = jest.fn()
const mockStorageStat = jest.fn()
const mockStorageDownloadRequest = jest.fn()
const mockResolveRemoteCredential = jest.fn()
const mockResolveLibraryStorage = jest.fn()
const mockCreateDirectory = jest.fn()
const mockDeleteFile = jest.fn()

jest.mock("expo-file-system", () => ({
  Directory: jest.fn(() => ({ exists: false, create: mockCreateDirectory })),
  File: Object.assign(
    jest.fn((uri: string) => ({ uri, exists: true, delete: mockDeleteFile })),
    { downloadFileAsync: jest.fn() },
  ),
}))
jest.mock("../auth/cloud", () => ({ invalidateCloudAccessToken: jest.fn() }))

jest.mock("my-reader-core", () => ({
  storageRead: (...args: unknown[]) => mockStorageRead(...args),
  storageStat: (...args: unknown[]) => mockStorageStat(...args),
  storageDownloadRequest: (...args: unknown[]) =>
    mockStorageDownloadRequest(...args),
  storageDelete: jest.fn(),
  storageList: jest.fn(),
  storageWrite: jest.fn(),
}))

jest.mock("../core/remote-credentials", () => ({
  resolveRemoteCredential: (...args: unknown[]) =>
    mockResolveRemoteCredential(...args),
}))
jest.mock("../core/sync", () => ({
  toCoreLibraryStorage: (value: unknown) => value,
  resolveLibraryStorage: (...args: unknown[]) =>
    mockResolveLibraryStorage(...args),
}))
jest.mock("../core/app-config", () => ({ appConfigPath: "/config.json" }))
jest.mock("../fs/library-paths", () => ({
  libraryRootUri: () => "file:///documents/library",
}))
jest.mock("../fs/path", () => ({
  parentDirectoryUriForFileUri: () => "file:///downloads",
  toNativeFilesystemPath: (uri: string) => uri,
}))

const storage = {
  kind: "s3" as const,
  endpoint: "https://s3.example.com",
  bucket: "books",
  region: "us-east-1",
  root: "/library",
  virtualHostStyle: false,
  accessKeyId: "key",
  secretAccessKey: "secret",
}
const source = {
  id: "s3-source",
  type: "s3" as const,
  name: "S3",
  enabled: true,
  endpoint: storage.endpoint,
  bucket: storage.bucket,
  region: storage.region,
  virtualHostStyle: storage.virtualHostStyle,
  hasCredentials: true,
}
const library = {
  id: "library-1",
  name: "Library",
  path: "file:///documents/library",
  bookCount: 0,
}

describe("CoreRemoteBackend", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockResolveRemoteCredential.mockResolvedValue({
      kind: "s3",
      accessKeyId: "key",
      secretAccessKey: "secret",
    })
    mockResolveLibraryStorage.mockReturnValue(storage)
  })

  it("writes only the selected byte range, lists objects, and deletes through Core", async () => {
    const backend = new CoreRemoteBackend("s3-source", source, library)
    const bytes = new Uint8Array([99, 1, 2, 99]).subarray(1, 3)
    jest.mocked(storageList).mockResolvedValue(["books/a.epub"])
    await backend.writeBytes("books/a.epub", bytes)
    expect(storageWrite).toHaveBeenCalledWith(
      storage,
      "books/a.epub",
      new Uint8Array([1, 2]).buffer,
    )
    await expect(backend.listRemote("books/")).resolves.toEqual([
      "books/a.epub",
    ])
    expect(storageList).toHaveBeenCalledWith(storage, "books/")
    await backend.deleteRemote("books/a.epub")
    expect(storageDelete).toHaveBeenCalledWith(storage, "books/a.epub")
    mockStorageStat.mockResolvedValue(null)
    await expect(backend.statRemoteFile("missing.epub")).resolves.toBeNull()
  })

  it.each([
    "gdrive",
    "dropbox",
  ] as const)("resolves fresh %s authorization headers and invalidates on demand", async (type) => {
    mockResolveLibraryStorage.mockReturnValue({
      kind: type,
      accessToken: "current",
    })
    const backend = new CoreRemoteBackend(
      "oauth",
      {
        id: "oauth",
        type,
        name: "Cloud",
        enabled: true,
        clientId: "client",
        hasRefreshToken: true,
      },
      library,
    )
    await expect(backend.getAuthHeaders()).resolves.toEqual({
      Authorization: "Bearer current",
    })
    expect(backend.getCachedAuthHeaders()).toBeNull()
    await backend.invalidateAuth()
    expect(invalidateCloudAccessToken).toHaveBeenCalledWith("oauth")
  })

  it("uses signed S3 requests without bearer headers and prepares local download storage", async () => {
    const backend = new CoreRemoteBackend("s3-source", source, library)
    await expect(backend.getAuthHeaders()).resolves.toEqual({})
    await backend.invalidateAuth()
    expect(invalidateCloudAccessToken).not.toHaveBeenCalled()
    mockStorageDownloadRequest.mockResolvedValue({
      url: "https://signed.example/file",
      headers: new Map([["x-amz-date", "today"]]),
    })
    await expect(
      backend.downloadToUri("book.epub", "file:///downloads/book.epub"),
    ).resolves.toEqual(
      expect.objectContaining({ uri: "file:///downloads/book.epub" }),
    )
    expect(mockCreateDirectory).toHaveBeenCalledWith({
      idempotent: true,
      intermediates: true,
    })
    expect(mockDeleteFile).toHaveBeenCalledTimes(1)
    expect(File.downloadFileAsync).toHaveBeenCalledWith(
      "https://signed.example/file",
      expect.objectContaining({ uri: "file:///downloads/book.epub" }),
      { headers: { "x-amz-date": "today" }, idempotent: true },
    )
    await expect(backend.getContentUri("cover.jpg")).resolves.toEqual({
      uri: "https://signed.example/file",
      headers: { "x-amz-date": "today" },
    })
    expect(backend.contentUrl()).toBe("")
    await expect(backend.getUploadRequest()).rejects.toThrow(
      "NATIVE_UPLOAD_REQUEST_UNSUPPORTED",
    )
  })

  it.each([
    "read",
    "stat",
    "write",
    "delete",
    "list",
    "download",
  ])("preserves credential errors and adds context to unclassified %s errors", async (operation) => {
    const backend = new CoreRemoteBackend("s3-source", source, library)
    const run = () =>
      ({
        read: () => backend.readBytes("book"),
        stat: () => backend.statRemoteFile("book"),
        write: () => backend.writeBytes("book", new Uint8Array()),
        delete: () => backend.deleteRemote("book"),
        list: () => backend.listRemote("book"),
        download: () => backend.getDownloadRequest("book", "file:///book"),
      })[operation]!()
    const credentialError = new CredentialError("expired")
    mockResolveRemoteCredential.mockRejectedValueOnce(credentialError)
    await expect(run()).rejects.toBe(credentialError)
    mockResolveRemoteCredential.mockRejectedValueOnce(new Error("offline"))
    await expect(run()).rejects.toEqual(
      expect.objectContaining({
        message: `Remote ${operation} failed: book: offline`,
      }),
    )
    const networkError = new NetworkError("network")
    mockResolveRemoteCredential.mockRejectedValueOnce(networkError)
    await expect(run()).rejects.toBe(networkError)
  })

  it("delegates provider operations through the generated Core transport", async () => {
    mockStorageRead.mockResolvedValue(new Uint8Array([1, 2]).buffer)
    mockStorageStat.mockResolvedValue({ etag: "etag", size: 2, mtimeMs: 3 })

    mockResolveRemoteCredential.mockResolvedValue({
      kind: "s3",
      accessKeyId: "key",
      secretAccessKey: "secret",
    })
    mockResolveLibraryStorage.mockReturnValue(storage)
    const backend = new CoreRemoteBackend("s3-source", source, library)

    await expect(backend.readBytes("books/a.epub")).resolves.toEqual(
      new Uint8Array([1, 2]),
    )
    await expect(backend.statRemoteFile("books/a.epub")).resolves.toEqual({
      etag: "etag",
      size: 2,
      mtimeMs: 3,
    })
    expect(mockStorageRead).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "s3", accessKeyId: "key" }),
      "books/a.epub",
    )
  })

  it("converts Core map headers into native downloader headers", async () => {
    mockStorageDownloadRequest.mockResolvedValue({
      url: "https://signed.example/cover.jpg",
      headers: new Map([["x-amz-date", "today"]]),
    })
    mockResolveRemoteCredential.mockResolvedValue({
      kind: "s3",
      accessKeyId: "key",
      secretAccessKey: "secret",
    })
    mockResolveLibraryStorage.mockReturnValue(storage)
    const backend = new CoreRemoteBackend("s3-source", source, library)

    await expect(
      backend.getDownloadRequest("cover.jpg", "file:///cover.jpg"),
    ).resolves.toEqual({
      remotePath: "cover.jpg",
      localFileUri: "file:///cover.jpg",
      url: "https://signed.example/cover.jpg",
      headers: { "x-amz-date": "today" },
    })
  })

  it("resolves storage on every operation so rotated credentials are used", async () => {
    const firstStorage = { ...storage, accessKeyId: "first" }
    const secondStorage = { ...storage, accessKeyId: "second" }
    mockResolveRemoteCredential
      .mockResolvedValueOnce({
        kind: "s3",
        accessKeyId: "first",
        secretAccessKey: "secret",
      })
      .mockResolvedValueOnce({
        kind: "s3",
        accessKeyId: "second",
        secretAccessKey: "secret",
      })
    mockResolveLibraryStorage
      .mockReturnValueOnce(firstStorage)
      .mockReturnValueOnce(secondStorage)
    mockStorageRead.mockResolvedValue(new Uint8Array([1]).buffer)
    const backend = new CoreRemoteBackend("s3-source", source, library)

    await backend.readBytes("one")
    await backend.readBytes("two")

    expect(mockStorageRead.mock.calls[0]?.[0].accessKeyId).toBe("first")
    expect(mockStorageRead.mock.calls[1]?.[0].accessKeyId).toBe("second")
  })
})
