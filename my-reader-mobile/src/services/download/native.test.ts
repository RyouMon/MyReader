let mockDownloadOptions: Record<string, unknown> | null = null
let mockDownloadTask: {
  start: jest.Mock
  stop: jest.Mock
} | null = null
let mockDownloadBegin: ((payload: { expectedBytes: number }) => void) | null =
  null
let mockDownloadProgress:
  | ((payload: { bytesDownloaded: number; bytesTotal: number }) => void)
  | null = null
let mockDownloadDone:
  | ((payload: { bytesDownloaded: number; bytesTotal: number }) => void)
  | null = null
let mockDownloadError:
  | ((payload: { error: string; errorCode: number }) => void)
  | null = null
let mockUploadOptions: Record<string, unknown> | null = null
let mockUploadTask: {
  start: jest.Mock
  stop: jest.Mock
} | null = null
let mockUploadBegin: ((payload: { expectedBytes: number }) => void) | null =
  null
let mockUploadProgress:
  | ((payload: { bytesUploaded: number; bytesTotal: number }) => void)
  | null = null
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
const mockGetExistingDownloadTasks = jest.fn<Promise<unknown[]>, []>(() =>
  Promise.resolve([]),
)
const mockGetExistingUploadTasks = jest.fn<Promise<unknown[]>, []>(() =>
  Promise.resolve([]),
)

jest.mock("@kesha-antonov/react-native-background-downloader", () => ({
  completeHandler: (taskId: string) => mockCompleteHandler(taskId),
  createDownloadTask: jest.fn((options) => {
    mockDownloadOptions = options
    mockDownloadTask = {
      start: jest.fn(),
      stop: jest.fn(),
    }
    return {
      id: options.id,
      metadata: options.metadata,
      state: "PENDING",
      bytesDownloaded: 0,
      bytesTotal: 0,
      begin: jest.fn(function bindBegin(callback) {
        mockDownloadBegin = callback
        return this
      }),
      progress: jest.fn(function bindProgress(callback) {
        mockDownloadProgress = callback
        return this
      }),
      done: jest.fn(function bindDone(callback) {
        mockDownloadDone = callback
        return this
      }),
      error: jest.fn(function bindError(callback) {
        mockDownloadError = callback
        return this
      }),
      start: mockDownloadTask.start,
      stop: mockDownloadTask.stop,
    }
  }),
  getExistingDownloadTasks: () => mockGetExistingDownloadTasks(),
  createUploadTask: jest.fn((options) => {
    mockUploadOptions = options
    mockUploadTask = {
      start: jest.fn(),
      stop: jest.fn(),
    }
    return {
      id: options.id,
      metadata: options.metadata,
      state: "PENDING",
      bytesUploaded: 0,
      bytesTotal: 0,
      begin: jest.fn(function bindBegin(callback) {
        mockUploadBegin = callback
        return this
      }),
      progress: jest.fn(function bindProgress(callback) {
        mockUploadProgress = callback
        return this
      }),
      done: jest.fn(function bindDone(callback) {
        mockUploadDone = callback
        return this
      }),
      error: jest.fn(function bindError(callback) {
        mockUploadError = callback
        return this
      }),
      start: mockUploadTask.start,
      stop: mockUploadTask.stop,
    }
  }),
  getExistingUploadTasks: () => mockGetExistingUploadTasks(),
}))

import {
  cancelNativeDownload,
  cancelNativeUpload,
  isNativeCancel,
  recoverNativeDownloads,
  recoverNativeUploads,
  startNativeDownload,
  startNativeUpload,
  toNativeDestinationPath,
  toNativeSourcePath,
} from "./native"

describe("native download adapter", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    jest.spyOn(console, "error").mockImplementation(() => {})
    mockDownloadOptions = null
    mockDownloadTask = null
    mockDownloadBegin = null
    mockDownloadProgress = null
    mockDownloadDone = null
    mockDownloadError = null
    mockGetExistingDownloadTasks.mockResolvedValue([])
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it("should convert file uri when building native source and destination paths", () => {
    expect(toNativeDestinationPath("file:///tmp/book.epub")).toBe(
      "/tmp/book.epub",
    )
    expect(toNativeSourcePath("file:///tmp/book.epub")).toBe("/tmp/book.epub")
  })

  it("should create task and resolve bytes when native download completes", async () => {
    const onBegin = jest.fn()
    const onProgress = jest.fn()
    const onNativeTask = jest.fn()

    const promise = startNativeDownload({
      relativePath: "Book/book.epub",
      url: "https://dav.example/books/Book/book.epub",
      destinationUri: "file:///tmp/book.epub",
      headers: { Authorization: "Basic token" },
      onProgress,
      options: {
        taskId: "download-1",
        metadata: { source: "myreader" },
        onBegin,
        onNativeTask,
      },
    })

    expect(mockDownloadOptions).toMatchObject({
      id: "download-1",
      url: "https://dav.example/books/Book/book.epub",
      destination: "/tmp/book.epub",
      headers: { Authorization: "Basic token" },
      metadata: { source: "myreader" },
    })
    expect(onNativeTask).toHaveBeenCalled()
    expect(mockDownloadTask?.start).toHaveBeenCalledTimes(1)

    mockDownloadBegin?.({ expectedBytes: 20 })
    mockDownloadProgress?.({ bytesDownloaded: 10, bytesTotal: 20 })
    mockDownloadDone?.({ bytesDownloaded: 20, bytesTotal: 20 })

    await expect(promise).resolves.toEqual({
      bytesDownloaded: 20,
      bytesTotal: 20,
    })
    expect(onBegin).toHaveBeenCalledWith(20)
    expect(onProgress).toHaveBeenCalledWith(0, 20)
    expect(onProgress).toHaveBeenCalledWith(10, 20)
    expect(onProgress).toHaveBeenCalledWith(20, 20)
    expect(mockCompleteHandler).toHaveBeenCalledWith("download-1")
  })

  it("should mark native cancellation when download error is cancellation", async () => {
    const promise = startNativeDownload({
      relativePath: "Book/book.epub",
      url: "https://dav.example/books/Book/book.epub",
      destinationUri: "file:///tmp/book.epub",
      options: { taskId: "download-2" },
    })

    mockDownloadError?.({ error: "cancelled", errorCode: -999 })

    await expect(promise).rejects.toMatchObject({ name: "AbortError" })
    expect(mockCompleteHandler).not.toHaveBeenCalled()
  })

  it("should stop active task and reject promise when cancelling download", async () => {
    const promise = startNativeDownload({
      relativePath: "Book/book.epub",
      url: "https://dav.example/books/Book/book.epub",
      destinationUri: "file:///tmp/book.epub",
      options: { taskId: "download-3" },
    })

    cancelNativeDownload("download-3")

    await expect(promise).rejects.toMatchObject({ name: "AbortError" })
    expect(mockDownloadTask?.stop).toHaveBeenCalledTimes(1)
  })

  it("should rebind recovered download handlers when recovering native downloads", async () => {
    const recoveredProgress = jest.fn()
    const recoveredDone = jest.fn()
    const recoveredError = jest.fn()
    const stop = jest.fn()
    let progress:
      | ((payload: { bytesDownloaded: number; bytesTotal: number }) => void)
      | undefined
    let done:
      | ((payload: { bytesDownloaded: number; bytesTotal: number }) => void)
      | undefined
    let error:
      | ((payload: { error: string; errorCode: number }) => void)
      | undefined
    mockGetExistingDownloadTasks.mockResolvedValue([
      {
        id: "download-existing",
        metadata: { source: "myreader" },
        state: "RUNNING",
        bytesDownloaded: 3,
        bytesTotal: 9,
        progress: jest.fn(function bindProgress(callback) {
          progress = callback
          return this
        }),
        done: jest.fn(function bindDone(callback) {
          done = callback
          return this
        }),
        error: jest.fn(function bindError(callback) {
          error = callback
          return this
        }),
        stop,
      },
    ])

    const [task] = await recoverNativeDownloads()
    expect(task).toBeDefined()
    const recoveredTask = task!
    recoveredTask.bind({
      onProgress: recoveredProgress,
      onDone: recoveredDone,
      onError: recoveredError,
    })
    progress?.({ bytesDownloaded: 4, bytesTotal: 9 })
    done?.({ bytesDownloaded: 9, bytesTotal: 9 })
    error?.({ error: "failed", errorCode: 500 })
    recoveredTask.stop()

    expect(recoveredTask).toMatchObject({
      id: "download-existing",
      metadata: { source: "myreader" },
      state: "RUNNING",
      bytesDownloaded: 3,
      bytesTotal: 9,
    })
    expect(recoveredProgress).toHaveBeenCalledWith(4, 9)
    expect(recoveredDone).toHaveBeenCalledWith(9, 9)
    expect(recoveredError).toHaveBeenCalledWith("failed", 500)
    expect(stop).toHaveBeenCalledTimes(1)
  })
})

describe("native upload adapter", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    jest.spyOn(console, "error").mockImplementation(() => {})
    mockUploadOptions = null
    mockUploadTask = null
    mockUploadBegin = null
    mockUploadProgress = null
    mockUploadDone = null
    mockUploadError = null
    mockGetExistingUploadTasks.mockResolvedValue([])
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  it("should create task and resolve bytes when native upload completes", async () => {
    const onBegin = jest.fn()
    const onProgress = jest.fn()
    const onNativeTask = jest.fn()

    const promise = startNativeUpload({
      relativePath: "Book/book.epub",
      url: "https://dav.example/books/Book/book.epub",
      sourceUri: "file:///tmp/book.epub",
      method: "PUT",
      headers: {
        Authorization: "Basic token",
        "Content-Type": "application/octet-stream",
      },
      onProgress,
      options: {
        taskId: "upload-1",
        metadata: { source: "myreader" },
        onBegin,
        onNativeTask,
      },
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
    expect(onNativeTask).toHaveBeenCalled()
    expect(mockUploadTask?.start).toHaveBeenCalledTimes(1)

    mockUploadBegin?.({ expectedBytes: 10 })
    mockUploadProgress?.({ bytesUploaded: 5, bytesTotal: 10 })
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
    expect(onBegin).toHaveBeenCalledWith(10)
    expect(onProgress).toHaveBeenCalledWith(0, 10)
    expect(onProgress).toHaveBeenCalledWith(5, 10)
    expect(onProgress).toHaveBeenCalledWith(10, 10)
  })

  it("should reject upload when native response is non-2xx", async () => {
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

  it("should mark native cancellation when upload error is cancellation", async () => {
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

  it("should stop active task and reject promise when cancelling upload", async () => {
    const promise = startNativeUpload({
      relativePath: "Book/book.epub",
      url: "https://dav.example/books/Book/book.epub",
      sourceUri: "file:///tmp/book.epub",
      options: { taskId: "upload-4" },
    })

    cancelNativeUpload("upload-4")

    await expect(promise).rejects.toMatchObject({ name: "AbortError" })
    expect(mockUploadTask?.stop).toHaveBeenCalledTimes(1)
  })

  it("should rebind recovered upload handlers when recovering native uploads", async () => {
    const recoveredProgress = jest.fn()
    const recoveredDone = jest.fn()
    const recoveredError = jest.fn()
    const stop = jest.fn()
    let progress:
      | ((payload: { bytesUploaded: number; bytesTotal: number }) => void)
      | undefined
    let done:
      | ((payload: {
          responseCode: number
          responseBody: string
          bytesUploaded: number
          bytesTotal: number
        }) => void)
      | undefined
    let error:
      | ((payload: { error: string; errorCode: number }) => void)
      | undefined
    mockGetExistingUploadTasks.mockResolvedValue([
      {
        id: "upload-existing",
        metadata: { source: "myreader" },
        state: "RUNNING",
        bytesUploaded: 3,
        bytesTotal: 9,
        progress: jest.fn(function bindProgress(callback) {
          progress = callback
          return this
        }),
        done: jest.fn(function bindDone(callback) {
          done = callback
          return this
        }),
        error: jest.fn(function bindError(callback) {
          error = callback
          return this
        }),
        stop,
      },
    ])

    const [task] = await recoverNativeUploads()
    expect(task).toBeDefined()
    const recoveredTask = task!
    recoveredTask.bind({
      onProgress: recoveredProgress,
      onDone: recoveredDone,
      onError: recoveredError,
    })
    progress?.({ bytesUploaded: 4, bytesTotal: 9 })
    done?.({
      responseCode: 200,
      responseBody: "",
      bytesUploaded: 9,
      bytesTotal: 9,
    })
    error?.({ error: "failed", errorCode: 500 })
    recoveredTask.stop()

    expect(recoveredTask).toMatchObject({
      id: "upload-existing",
      metadata: { source: "myreader" },
      state: "RUNNING",
      bytesUploaded: 3,
      bytesTotal: 9,
    })
    expect(recoveredProgress).toHaveBeenCalledWith(4, 9)
    expect(recoveredDone).toHaveBeenCalledWith(9, 9)
    expect(recoveredError).toHaveBeenCalledWith("failed", 500)
    expect(stop).toHaveBeenCalledTimes(1)
  })
})

describe("native task classification", () => {
  it("should detect cancellation when native code or message means cancelled", () => {
    expect(isNativeCancel("", -999)).toBe(true)
    expect(isNativeCancel("user cancelled", 0)).toBe(true)
  })

  it("should reject cancellation when native error is unrelated", () => {
    expect(isNativeCancel("server failed", 500)).toBe(false)
  })
})
