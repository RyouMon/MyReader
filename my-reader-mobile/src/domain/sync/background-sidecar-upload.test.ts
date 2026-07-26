jest.mock("expo-file-system", () => {
  const files: Array<{
    uri: string
    exists: boolean
    bytes: Uint8Array | null
    delete: jest.Mock
  }> = []
  class Directory {
    exists = true
    uri: string

    constructor(_root: unknown, name: string) {
      this.uri = `file:///cache/${name}`
    }

    create() {
      this.exists = true
    }
  }
  class File {
    exists = false
    bytes: Uint8Array | null = null
    delete = jest.fn(() => {
      this.exists = false
    })
    uri: string

    constructor(directoryOrUri: Directory | string, name?: string) {
      this.uri =
        typeof directoryOrUri === "string"
          ? directoryOrUri
          : `${directoryOrUri.uri}/${name}`
      this.exists = typeof directoryOrUri === "string"
      files.push(this)
    }

    create() {
      this.exists = true
    }

    write(bytes: Uint8Array) {
      this.bytes = bytes
    }
  }
  return {
    Directory,
    File,
    Paths: { cache: "file:///cache" },
    __files: files,
  }
})

jest.mock("@/src/services/download/native", () => ({
  completeNativeTask: jest.fn(),
  recoverNativeUploads: jest.fn().mockResolvedValue([]),
  startNativeUpload: jest.fn().mockResolvedValue({
    responseCode: 200,
    responseBody: "",
    bytesUploaded: 3,
    bytesTotal: 3,
  }),
}))

import {
  completeNativeTask,
  recoverNativeUploads,
  startNativeUpload,
} from "@/src/services/download/native"
import type { RemoteBackend } from "@/src/services/remote/backend"
import {
  recoverLibrarySidecarUploads,
  uploadLibrarySidecarObject,
} from "./background-sidecar-upload"

const fileSystem = jest.requireMock("expo-file-system") as {
  __files: Array<{
    uri: string
    exists: boolean
    bytes: Uint8Array
    delete: jest.Mock
  }>
}

describe("background sidecar upload", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fileSystem.__files.length = 0
  })

  it("should run a native background task when the backend supports upload preparation", async () => {
    const backend = {
      kind: "onedrive",
      prepareUpload: jest.fn().mockResolvedValue({
        id: "upload-1",
        remotePath: ".myreader/change.am",
        headers: {},
      }),
      getUploadRequest: jest.fn().mockResolvedValue({
        localFileUri: "file:///cache/upload.am",
        remotePath: ".myreader/change.am",
        headers: { Authorization: "Bearer token" },
      }),
      contentUrl: jest.fn().mockReturnValue("https://example.test/change.am"),
      writeBytes: jest.fn(),
    } as unknown as RemoteBackend
    const bytes = new Uint8Array([1, 2, 3])

    await uploadLibrarySidecarObject(backend, ".myreader/change.am", bytes)

    expect(backend.prepareUpload).toHaveBeenCalledWith(
      expect.stringContaining("change.am"),
      ".myreader/change.am",
    )
    expect(startNativeUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        relativePath: ".myreader/change.am",
        url: "https://example.test/change.am",
        sourceUri: "file:///cache/upload.am",
        headers: { Authorization: "Bearer token" },
        options: {
          metadata: expect.objectContaining({
            purpose: "library-sidecar",
            remotePath: ".myreader/change.am",
            temporaryFileUri: expect.stringContaining("change.am"),
          }),
        },
      }),
    )
    expect(fileSystem.__files[0]!.bytes).toEqual(bytes)
    expect(fileSystem.__files[0]!.delete).toHaveBeenCalled()
  })

  it("should use direct writing when native upload preparation is unavailable", async () => {
    const backend = {
      kind: "webdav",
      writeBytes: jest.fn().mockResolvedValue(undefined),
    } as unknown as RemoteBackend
    const bytes = new Uint8Array([1])

    await uploadLibrarySidecarObject(backend, ".myreader/change.am", bytes)

    expect(backend.writeBytes).toHaveBeenCalledWith(
      ".myreader/change.am",
      bytes,
    )
    expect(startNativeUpload).not.toHaveBeenCalled()
  })

  it("should rebind sidecar tasks when native uploads survive process death", async () => {
    const bind = jest.fn()
    jest.mocked(recoverNativeUploads).mockResolvedValue([
      {
        id: "sidecar-upload",
        metadata: {
          purpose: "library-sidecar",
          temporaryFileUri: "file:///cache/recovered-change.am",
        },
        state: "RUNNING",
        bytesUploaded: 1,
        bytesTotal: 3,
        bind,
        stop: jest.fn(),
      },
      {
        id: "book-upload",
        metadata: { purpose: "book" },
        state: "RUNNING",
        bytesUploaded: 1,
        bytesTotal: 3,
        bind: jest.fn(),
        stop: jest.fn(),
      },
    ] as never)

    await expect(recoverLibrarySidecarUploads()).resolves.toBe(1)

    expect(bind).toHaveBeenCalledTimes(1)
    const handlers = bind.mock.calls[0]![0]
    handlers.onDone(3, 3)
    expect(completeNativeTask).toHaveBeenCalledWith("sidecar-upload")
    expect(fileSystem.__files[0]!.delete).toHaveBeenCalled()
  })

  it("should finalize a completed sidecar upload when recovery observes it", async () => {
    jest.mocked(recoverNativeUploads).mockResolvedValue([
      {
        id: "completed-sidecar-upload",
        metadata: {
          purpose: "library-sidecar",
          temporaryFileUri: "file:///cache/completed-change.am",
        },
        state: "DONE",
        bytesUploaded: 3,
        bytesTotal: 3,
        bind: jest.fn(),
        stop: jest.fn(),
      },
    ] as never)

    await expect(recoverLibrarySidecarUploads()).resolves.toBe(1)

    expect(completeNativeTask).toHaveBeenCalledWith("completed-sidecar-upload")
    expect(fileSystem.__files[0]!.delete).toHaveBeenCalled()
  })
})
