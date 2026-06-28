let mockUploadOptions: Record<string, unknown> | null = null
let mockUploadDone:
  | ((payload: {
      responseCode: number
      responseBody: string
      bytesUploaded: number
      bytesTotal: number
    }) => void)
  | null = null
let mockUploadError:
  | ((payload: { error: string; errorCode: number }) => void)
  | null = null

const mockCompleteHandler = jest.fn()
const mockGetExistingUploadTasks = jest.fn(() => Promise.resolve([]))

jest.mock("@kesha-antonov/react-native-background-downloader", () => ({
  completeHandler: (...args: unknown[]) => mockCompleteHandler(...args),
  createDownloadTask: jest.fn(),
  getExistingDownloadTasks: jest.fn(() => Promise.resolve([])),
  createUploadTask: jest.fn((options) => {
    mockUploadOptions = options
    return {
      id: options.id,
      metadata: options.metadata,
      state: "PENDING",
      bytesUploaded: 0,
      bytesTotal: 0,
      begin: jest.fn().mockReturnThis(),
      progress: jest.fn().mockReturnThis(),
      done: jest.fn(function bindDone(callback) {
        mockUploadDone = callback
        return this
      }),
      error: jest.fn(function bindError(callback) {
        mockUploadError = callback
        return this
      }),
      start: jest.fn(),
      stop: jest.fn(),
    }
  }),
  getExistingUploadTasks: mockGetExistingUploadTasks,
}))

import { startNativeUpload } from "./native"

describe("native upload adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUploadOptions = null
    mockUploadDone = null
    mockUploadError = null
    mockGetExistingUploadTasks.mockResolvedValue([])
  })

  test("creates a PUT upload task with headers and completes once", async () => {
    const promise = startNativeUpload({
      relativePath: "Book/book.epub",
      url: "https://dav.example/books/Book/book.epub",
      sourceUri: "file:///tmp/book.epub",
      method: "PUT",
      headers: {
        Authorization: "Basic token",
        "Content-Type": "application/octet-stream",
      },
      options: { taskId: "upload-1", metadata: { source: "myreader" } },
    })

    expect(mockUploadOptions).toMatchObject({
      id: "upload-1",
      url: "https://dav.example/books/Book/book.epub",
      source: "/tmp/book.epub",
      method: "PUT",
      headers: {
        Authorization: "Basic token",
        "Content-Type": "application/octet-stream",
      },
      metadata: { source: "myreader" },
    })

    mockUploadDone?.({
      responseCode: 201,
      responseBody: "",
      bytesUploaded: 10,
      bytesTotal: 10,
    })

    await expect(promise).resolves.toMatchObject({
      bytesUploaded: 10,
      bytesTotal: 10,
    })
    expect(mockCompleteHandler).toHaveBeenCalledTimes(1)
    expect(mockCompleteHandler).toHaveBeenCalledWith("upload-1")
  })

  test("rejects non-2xx upload responses", async () => {
    const promise = startNativeUpload({
      relativePath: "Book/book.epub",
      url: "https://dav.example/books/Book/book.epub",
      sourceUri: "file:///tmp/book.epub",
      method: "PUT",
      options: { taskId: "upload-2" },
    })

    mockUploadDone?.({
      responseCode: 401,
      responseBody: "Unauthorized",
      bytesUploaded: 10,
      bytesTotal: 10,
    })

    await expect(promise).rejects.toThrow("HTTP 401")
    expect(mockCompleteHandler).not.toHaveBeenCalled()
  })

  test("marks native upload cancellation as AbortError", async () => {
    const promise = startNativeUpload({
      relativePath: "Book/book.epub",
      url: "https://dav.example/books/Book/book.epub",
      sourceUri: "file:///tmp/book.epub",
      method: "PUT",
      options: { taskId: "upload-3" },
    })

    mockUploadError?.({ error: "cancelled", errorCode: -999 })

    await expect(promise).rejects.toMatchObject({ name: "AbortError" })
  })
})
