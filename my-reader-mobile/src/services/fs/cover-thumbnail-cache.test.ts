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

jest.mock("react-native", () => {
  return {
    Image: {
      getSize: jest.fn(),
    },
    Platform: {
      OS: "ios",
      select: jest.fn((values: Record<string, unknown>) => values.ios),
    },
  }
})

import { ImageManipulator } from "expo-image-manipulator"
import { Image as ReactNativeImage } from "react-native"

import {
  ensureCoverThumbnailAsync,
  ensureCoverThumbnailFilesAsync,
  getCachedCoverThumbnailUri,
  getCoverThumbnailCacheFile,
} from "./cover-thumbnail-cache"

const { __mockFileSystem } = jest.requireMock("expo-file-system")
const mockGetImageSize =
  ReactNativeImage.getSize as unknown as jest.MockedFunction<
    (uri: string) => Promise<{ height: number; width: number }>
  >

describe("cover thumbnail cache", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    __mockFileSystem.createdDirectories.length = 0
    __mockFileSystem.downloadedFiles.length = 0
    __mockFileSystem.movedFiles.length = 0
    __mockFileSystem.existingFiles.clear()
    mockGetImageSize.mockResolvedValue({
      height: 900,
      width: 600,
    })
  })

  it("should place thumbnail files under Expo's cache directory when building the cover thumbnail cache", () => {
    const file = getCoverThumbnailCacheFile({
      libraryId: "library/one",
      bookId: "book/42",
      source: "file:///covers/original.jpg",
      coverIdentity: "cover-v1",
      widthPx: 300,
      heightPx: 429,
    })

    expect(file.uri).toMatch(
      /^file:\/\/\/expo-cache\/myreader-cover-thumbnails\/v3\/library_one\/300x429\/book_42-.+\.jpg$/,
    )
  })

  it("should return an existing cached thumbnail without generating it when building the cover thumbnail cache", () => {
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

  it("should download remote covers with headers before thumbnail generation when building the cover thumbnail cache", async () => {
    const saveAsync = jest.fn(async () => ({
      uri: "file:///manipulator/result.jpg",
      width: 300,
      height: 429,
    }))
    const resultRef = {
      release: jest.fn(),
      saveAsync,
    }
    const renderAsync = jest.fn().mockResolvedValue(resultRef)
    const resize = jest.fn().mockReturnThis()
    const crop = jest.fn().mockReturnThis()
    const releaseContext = jest.fn()
    jest.mocked(ImageManipulator.manipulate).mockReturnValueOnce({
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
    expect(mockGetImageSize).toHaveBeenCalledTimes(1)
    expect(ImageManipulator.manipulate).toHaveBeenCalledTimes(1)
    const preparedSource = jest.mocked(ImageManipulator.manipulate).mock
      .calls[0]?.[0]
    expect(preparedSource).toContain(
      "file:///expo-cache/myreader-cover-thumbnails/tmp/",
    )
    expect(renderAsync).toHaveBeenCalledTimes(1)
    expect(saveAsync).toHaveBeenCalledWith({
      compress: 0.82,
      format: "jpeg",
    })
    expect(resultRef.release).toHaveBeenCalled()
    expect(releaseContext).toHaveBeenCalled()
    expect(resize).toHaveBeenCalledWith({ height: 429 })
    expect(crop).not.toHaveBeenCalled()
    expect(__mockFileSystem.movedFiles[0]).toMatchObject({
      from: "file:///manipulator/result.jpg",
      options: { overwrite: true },
    })
    expect(uri).toContain(
      "file:///expo-cache/myreader-cover-thumbnails/v3/lib/300x429/book-",
    )
  })

  it("should prepare one source image while generating multiple thumbnail sizes when building the cover thumbnail cache", async () => {
    const firstSaveAsync = jest.fn(async () => ({
      uri: "file:///manipulator/first.jpg",
      width: 300,
      height: 429,
    }))
    const secondSaveAsync = jest.fn(async () => ({
      uri: "file:///manipulator/second.jpg",
      width: 420,
      height: 600,
    }))
    const firstResultRef = {
      release: jest.fn(),
      saveAsync: firstSaveAsync,
    }
    const secondResultRef = {
      release: jest.fn(),
      saveAsync: secondSaveAsync,
    }
    const firstRenderAsync = jest.fn().mockResolvedValue(firstResultRef)
    const secondRenderAsync = jest.fn().mockResolvedValue(secondResultRef)
    const firstResize = jest.fn().mockReturnThis()
    const secondResize = jest.fn().mockReturnThis()
    jest
      .mocked(ImageManipulator.manipulate)
      .mockReturnValueOnce({
        crop: jest.fn().mockReturnThis(),
        release: jest.fn(),
        renderAsync: firstRenderAsync,
        resize: firstResize,
      } as never)
      .mockReturnValueOnce({
        crop: jest.fn().mockReturnThis(),
        release: jest.fn(),
        renderAsync: secondRenderAsync,
        resize: secondResize,
      } as never)

    const onFile = jest.fn()
    const files = await ensureCoverThumbnailFilesAsync(
      [
        {
          libraryId: "lib",
          bookId: "book",
          source: {
            uri: "https://example.com/cover.jpg",
            headers: { Authorization: "Bearer token" },
          },
          coverIdentity: "cover-v1",
          widthPx: 300,
          heightPx: 429,
        },
        {
          libraryId: "lib",
          bookId: "book",
          source: {
            uri: "https://example.com/cover.jpg",
            headers: { Authorization: "Bearer token" },
          },
          coverIdentity: "cover-v1",
          widthPx: 420,
          heightPx: 600,
        },
      ],
      onFile,
    )

    expect(__mockFileSystem.downloadedFiles).toHaveLength(1)
    expect(ImageManipulator.manipulate).toHaveBeenCalledTimes(2)
    expect(firstResize).toHaveBeenCalledWith({ height: 429 })
    expect(secondResize).toHaveBeenCalledWith({ height: 600 })
    expect(files).toHaveLength(2)
    expect(onFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ uri: expect.stringContaining("/300x429/") }),
      0,
      expect.objectContaining({ widthPx: 300, heightPx: 429 }),
    )
    expect(onFile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ uri: expect.stringContaining("/420x600/") }),
      1,
      expect.objectContaining({ widthPx: 420, heightPx: 600 }),
    )
  })

  it("should omit headers when remote cover generation has no headers", async () => {
    const saveAsync = jest.fn(async () => ({
      uri: "file:///manipulator/result.jpg",
      width: 300,
      height: 429,
    }))
    const resultRef = {
      release: jest.fn(),
      saveAsync,
    }
    jest.mocked(ImageManipulator.manipulate).mockReturnValueOnce({
      crop: jest.fn().mockReturnThis(),
      release: jest.fn(),
      renderAsync: jest.fn().mockResolvedValue(resultRef),
      resize: jest.fn().mockReturnThis(),
    } as never)

    await ensureCoverThumbnailAsync({
      libraryId: "lib",
      bookId: "book",
      source: "https://example.com/cover.jpg",
      coverIdentity: "cover-v1",
      widthPx: 300,
      heightPx: 429,
    })

    expect(__mockFileSystem.downloadedFiles[0]).toMatchObject({
      url: "https://example.com/cover.jpg",
      options: { idempotent: true },
    })
    expect(__mockFileSystem.downloadedFiles[0]?.options).not.toHaveProperty(
      "headers",
    )
  })

  it("should fall back to ImageManipulator metadata when image size lookup fails", async () => {
    mockGetImageSize.mockRejectedValueOnce(new Error("size unavailable"))
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

    await ensureCoverThumbnailAsync({
      libraryId: "lib",
      bookId: "book",
      source: "file:///covers/original.jpg",
      coverIdentity: "cover-v1",
      widthPx: 300,
      heightPx: 429,
    })

    expect(ImageManipulator.manipulate).toHaveBeenCalledTimes(2)
    expect(metadataContext.renderAsync).toHaveBeenCalledTimes(1)
    expect(sourceRef.release).toHaveBeenCalled()
    expect(metadataContext.release).toHaveBeenCalled()
    expect(renderAsync).toHaveBeenCalledTimes(1)
    expect(resultRef.release).toHaveBeenCalled()
    expect(releaseContext).toHaveBeenCalled()
  })
})
