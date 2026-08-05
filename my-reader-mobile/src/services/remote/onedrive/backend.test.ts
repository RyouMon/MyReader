/** @jest-environment node */

import { GRAPH_API_BASE } from "@/src/constants/onedrive"
import { NetworkError } from "@/src/errors"
import { clearAuthCache, setCachedAuth } from "@/src/services/remote/auth-cache"
import { OneDriveRemoteBackend } from "./backend"

jest.mock("ky", () => ({
  __esModule: true,
  default: jest.fn(),
}))

type RecordedRequest = {
  url: string
  method: string
  body?: string
}

const libraryRootPath = "/Library/CalibreLibrary"
const documentId = "d25f5daa-1a97-4a68-a9e0-77384c45df5d"
const changeHash = "a".repeat(64)
const documentPrefix = `.myreader/automerge/${documentId}`
const incrementalPrefix = `${documentPrefix}/incremental`
const remotePath = `${incrementalPrefix}/${changeHash}`

function recordRequest(
  requests: RecordedRequest[],
  input: RequestInfo | URL,
  init?: RequestInit,
): RecordedRequest {
  const request = {
    url: String(input),
    method: init?.method ?? "GET",
    body: typeof init?.body === "string" ? init.body : undefined,
  }
  requests.push(request)
  return request
}

describe("OneDriveRemoteBackend", () => {
  beforeEach(() => {
    setCachedAuth(
      "onedrive-source",
      { Authorization: "Bearer test-token" },
      null,
    )
  })

  afterEach(() => {
    jest.restoreAllMocks()
    clearAuthCache()
  })

  it("should create the first sidecar directory under the library root when it is missing", async () => {
    const requests: RecordedRequest[] = []
    jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = recordRequest(requests, input, init)
      if (request.method === "GET") {
        return new Response(null, { status: 404 })
      }
      if (request.method === "POST") {
        return new Response(null, { status: 201 })
      }
      if (request.method === "PUT") {
        return new Response(null, { status: 201 })
      }
      throw new Error(`Unexpected request: ${request.method} ${request.url}`)
    })
    const backend = new OneDriveRemoteBackend(
      "onedrive-source",
      libraryRootPath,
    )

    await backend.writeBytes(remotePath, new Uint8Array([1]))

    const firstCreate = requests.find((request) => request.method === "POST")
    expect(firstCreate).toEqual({
      url: `${GRAPH_API_BASE}/me/drive/root:/Library/CalibreLibrary:/children`,
      method: "POST",
      body: JSON.stringify({
        name: ".myreader",
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    })
    expect(requests).not.toContainEqual(
      expect.objectContaining({
        url: `${GRAPH_API_BASE}/me/drive/root/children`,
        method: "POST",
      }),
    )
  })

  it("should list and read the sidecar tree when a library root is configured", async () => {
    const requests: RecordedRequest[] = []
    jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = recordRequest(requests, input, init)
      if (
        request.url.endsWith(
          `/Library/CalibreLibrary/${documentPrefix}:/children`,
        )
      ) {
        return Response.json({
          value: [{ name: "incremental", folder: {} }],
        })
      }
      if (
        request.url.endsWith(
          `/Library/CalibreLibrary/${incrementalPrefix}:/children`,
        )
      ) {
        return Response.json({
          value: [{ name: changeHash }],
        })
      }
      if (
        request.url.endsWith(`/Library/CalibreLibrary/${remotePath}:/content`)
      ) {
        return new Response("segment")
      }
      return new Response(null, { status: 404 })
    })
    const backend = new OneDriveRemoteBackend(
      "onedrive-source",
      libraryRootPath,
    )

    await expect(backend.listRemote(documentPrefix)).resolves.toEqual([
      "incremental/",
    ])
    await expect(backend.listRemote(incrementalPrefix)).resolves.toEqual([
      changeHash,
    ])
    await expect(backend.readBytes(remotePath)).resolves.toEqual(
      new TextEncoder().encode("segment"),
    )

    expect(requests).toEqual([
      {
        url: `${GRAPH_API_BASE}/me/drive/root:/Library/CalibreLibrary/${documentPrefix}:/children`,
        method: "GET",
        body: undefined,
      },
      {
        url: `${GRAPH_API_BASE}/me/drive/root:/Library/CalibreLibrary/${incrementalPrefix}:/children`,
        method: "GET",
        body: undefined,
      },
      {
        url: `${GRAPH_API_BASE}/me/drive/root:/Library/CalibreLibrary/${remotePath}:/content`,
        method: "GET",
        body: undefined,
      },
    ])
  })

  it("should return a preauthenticated URL when a native download is prepared", async () => {
    const directUrl = "https://download.example/book.epub?temporary=token"
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        id: "book-item",
        "@microsoft.graph.downloadUrl": directUrl,
      }),
    )
    const backend = new OneDriveRemoteBackend(
      "onedrive-source",
      libraryRootPath,
    )

    await expect(
      backend.getDownloadRequest(
        "Books/book-id/book.epub",
        "file:///cache/book.epub.part",
      ),
    ).resolves.toEqual({
      remotePath: "Books/book-id/book.epub",
      localFileUri: "file:///cache/book.epub.part",
      url: directUrl,
      headers: {},
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      `${GRAPH_API_BASE}/me/drive/root:/Library/CalibreLibrary/Books/book-id/book.epub?select=id%2C%40microsoft.graph.downloadUrl`,
      {
        method: "GET",
        headers: { Authorization: "Bearer test-token" },
      },
    )
  })

  it("should explain when OneDrive omits the native download URL", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        id: "book-item",
      }),
    )
    const backend = new OneDriveRemoteBackend(
      "onedrive-source",
      libraryRootPath,
    )

    await expect(
      backend.getDownloadRequest(
        "Books/book-id/book.epub",
        "file:///cache/book.epub.part",
      ),
    ).rejects.toThrow(
      "OneDrive did not return a download URL: Books/book-id/book.epub",
    )
  })

  it("should recheck the exact directory when concurrent creation returns a conflict", async () => {
    const requests: RecordedRequest[] = []
    let directoryChecks = 0
    jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = recordRequest(requests, input, init)
      if (
        request.method === "GET" &&
        request.url.endsWith("/CalibreLibrary/.myreader")
      ) {
        directoryChecks += 1
        return directoryChecks === 1
          ? new Response(null, { status: 404 })
          : Response.json({
              id: "sidecar-directory",
              name: ".myreader",
              folder: {},
            })
      }
      if (request.method === "POST") {
        return new Response(null, { status: 409 })
      }
      if (request.method === "PUT") {
        return new Response(null, { status: 201 })
      }
      throw new Error(`Unexpected request: ${request.method} ${request.url}`)
    })
    const backend = new OneDriveRemoteBackend(
      "onedrive-source",
      libraryRootPath,
    )

    await backend.writeBytes(".myreader/segment.json", new Uint8Array([1]))

    expect(directoryChecks).toBe(2)
    expect(requests.map(({ method }) => method)).toEqual([
      "GET",
      "POST",
      "GET",
      "PUT",
    ])
  })

  it("should preserve a directory lookup failure when OneDrive is unavailable", async () => {
    const requests: RecordedRequest[] = []
    jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = recordRequest(requests, input, init)
      if (request.method === "GET") {
        return new Response(null, { status: 503 })
      }
      if (request.method === "POST" || request.method === "PUT") {
        return new Response(null, { status: 201 })
      }
      throw new Error(`Unexpected request: ${request.method} ${request.url}`)
    })
    const backend = new OneDriveRemoteBackend(
      "onedrive-source",
      libraryRootPath,
    )

    await expect(
      backend.writeBytes(".myreader/segment.json", new Uint8Array([1])),
    ).rejects.toEqual(
      expect.objectContaining<Partial<NetworkError>>({
        statusCode: 503,
      }),
    )
    expect(requests.map(({ method }) => method)).toEqual(["GET"])
  })
})
