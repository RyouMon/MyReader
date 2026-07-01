jest.mock("expo-image-manipulator", () => ({
  ImageManipulator: {
    manipulate: jest.fn(),
  },
  SaveFormat: {
    JPEG: "jpeg",
  },
}))

jest.mock("expo-file-system", () => {
  const createdDirectories: MockDirectory[] = []
  const movedFiles: Array<{ from: string; to: string; options?: unknown }> = []
  const downloadedFiles: Array<{
    url: string
    destination: string
    options?: unknown
  }> = []
  const existingFiles = new Map<string, { size: number }>()

  function join(...parts: unknown[]) {
    const normalized = parts.map((part) =>
      typeof part === "string" ? part : (part as { uri: string }).uri,
    )
    const [head = "", ...tail] = normalized
    return [
      head.replace(/\/+$/, ""),
      ...tail.map((part) => part.replace(/^\/+|\/+$/g, "")),
    ]
      .filter(Boolean)
      .join("/")
  }

  class MockDirectory {
    uri: string
    exists = true
    create = jest.fn(() => {
      this.exists = true
      createdDirectories.push(this)
    })

    constructor(...parts: unknown[]) {
      this.uri = join(...parts)
    }

    delete = jest.fn()
  }

  class MockFile {
    uri: string
    exists: boolean
    size: number

    constructor(...parts: unknown[]) {
      this.uri = join(...parts)
      const file = existingFiles.get(this.uri)
      this.exists = !!file
      this.size = file?.size ?? 0
    }

    move = jest.fn(async (destination: MockFile, options?: unknown) => {
      movedFiles.push({ from: this.uri, to: destination.uri, options })
      existingFiles.set(destination.uri, { size: 123 })
    })

    delete = jest.fn(() => {
      existingFiles.delete(this.uri)
      this.exists = false
    })

    static downloadFileAsync = jest.fn(
      async (url: string, destination: MockFile, options?: unknown) => {
        downloadedFiles.push({ url, destination: destination.uri, options })
        existingFiles.set(destination.uri, { size: 456 })
        return destination
      },
    )
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: {
      cache: { uri: "file:///expo-cache" },
    },
    __mockFileSystem: {
      createdDirectories,
      downloadedFiles,
      existingFiles,
      movedFiles,
    },
  }
})

import { ImageManipulator } from "expo-image-manipulator"

import {
  ensureCoverThumbnailAsync,
  getCachedCoverThumbnailUri,
  getCoverThumbnailCacheFile,
} from "./cover-thumbnail-cache"

const { __mockFileSystem } = jest.requireMock("expo-file-system")

describe("cover thumbnail cache", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    __mockFileSystem.createdDirectories.length = 0
    __mockFileSystem.downloadedFiles.length = 0
    __mockFileSystem.movedFiles.length = 0
    __mockFileSystem.existingFiles.clear()
  })

  it("places thumbnail files under Expo's cache directory", () => {
    const file = getCoverThumbnailCacheFile({
      libraryId: "library/one",
      bookId: "book/42",
      source: "file:///covers/original.jpg",
      coverIdentity: "cover-v1",
      widthPx: 300,
      heightPx: 429,
    })

    expect(file.uri).toMatch(
      /^file:\/\/\/expo-cache\/myreader-cover-thumbnails\/v1\/library_one\/300x429\/book_42-.+\.jpg$/,
    )
  })

  it("returns an existing cached thumbnail without generating it", () => {
    const file = getCoverThumbnailCacheFile({
      libraryId: "lib",
      bookId: "book",
      source: "file:///covers/original.jpg",
      coverIdentity: "cover-v1",
      widthPx: 300,
      heightPx: 429,
    })
    __mockFileSystem.existingFiles.set(file.uri, { size: 12 })

    expect(
      getCachedCoverThumbnailUri({
        libraryId: "lib",
        bookId: "book",
        source: "file:///covers/original.jpg",
        coverIdentity: "cover-v1",
        widthPx: 300,
        heightPx: 429,
      }),
    ).toBe(file.uri)
  })

  it("downloads remote covers with headers before thumbnail generation", async () => {
    const sourceRef = {
      height: 900,
      release: jest.fn(),
      width: 600,
    }
    const saveAsync = jest.fn(async () => ({
      uri: "file:///manipulator/result.jpg",
      width: 300,
      height: 429,
    }))
    const resultRef = {
      release: jest.fn(),
      saveAsync,
    }
    const metadataContext = {
      release: jest.fn(),
      renderAsync: jest.fn().mockResolvedValue(sourceRef),
    }
    const renderAsync = jest.fn().mockResolvedValue(resultRef)
    const resize = jest.fn().mockReturnThis()
    const crop = jest.fn().mockReturnThis()
    const releaseContext = jest.fn()
    jest
      .mocked(ImageManipulator.manipulate)
      .mockReturnValueOnce(metadataContext as never)
      .mockReturnValueOnce({
        renderAsync,
        resize,
        crop,
        release: releaseContext,
      } as never)

    const uri = await ensureCoverThumbnailAsync({
      libraryId: "lib",
      bookId: "book",
      source: {
        uri: "https://example.com/cover.jpg",
        headers: { Authorization: "Bearer token" },
      },
      coverIdentity: "cover-v1",
      widthPx: 300,
      heightPx: 429,
    })

    expect(__mockFileSystem.downloadedFiles[0]).toMatchObject({
      url: "https://example.com/cover.jpg",
      options: {
        headers: { Authorization: "Bearer token" },
        idempotent: true,
      },
    })
    expect(ImageManipulator.manipulate).toHaveBeenCalledTimes(2)
    const preparedSource = jest.mocked(ImageManipulator.manipulate).mock
      .calls[0]?.[0]
    expect(preparedSource).toContain(
      "file:///expo-cache/myreader-cover-thumbnails/tmp/",
    )
    expect(jest.mocked(ImageManipulator.manipulate).mock.calls[1]?.[0]).toBe(
      preparedSource,
    )
    expect(metadataContext.renderAsync).toHaveBeenCalledTimes(1)
    expect(renderAsync).toHaveBeenCalledTimes(1)
    expect(saveAsync).toHaveBeenCalledWith({
      compress: 0.82,
      format: "jpeg",
    })
    expect(sourceRef.release).toHaveBeenCalled()
    expect(resultRef.release).toHaveBeenCalled()
    expect(metadataContext.release).toHaveBeenCalled()
    expect(releaseContext).toHaveBeenCalled()
    expect(resize).toHaveBeenCalledWith({ width: 300 })
    expect(crop).toHaveBeenCalledWith({
      height: 429,
      originX: 0,
      originY: 10,
      width: 300,
    })
    expect(__mockFileSystem.movedFiles[0]).toMatchObject({
      from: "file:///manipulator/result.jpg",
      options: { overwrite: true },
    })
    expect(uri).toContain(
      "file:///expo-cache/myreader-cover-thumbnails/v1/lib/300x429/book-",
    )
  })
})
