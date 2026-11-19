import { renderHook, waitFor } from "@testing-library/react-native"
import {
  getBookFormatPaths,
  readBookDetailFromMetadata,
  resolveBookFileForRead,
} from "@/src/domain/library/catalog"
import type { BookItem } from "@/src/domain/types"
import { createRemoteOps } from "@/src/domain/library/remote-library"
import { getReadingProgress } from "@/src/domain/library/reading-progress"
import { listReadingPositionCandidates } from "@/src/services/core/reading"
import { queryClient } from "@/src/services/query/query-client"
import { useAppStore } from "@/src/store/app-store"
import { useBookLoader } from "./use-book-loader"

jest.mock("@/src/domain/library/catalog", () => ({
  libraryQueryKeys: { books: (id: string) => ["books", id] },
  getBookFormatPaths: jest.fn(),
  readBookDetailFromMetadata: jest.fn(),
  resolveBookFileForRead: jest.fn(),
}))
jest.mock("@/src/domain/library/reading-progress", () => ({
  getReadingProgress: jest.fn(),
}))
jest.mock("@/src/domain/library/remote-library", () => ({
  createRemoteOps: jest.fn(),
}))
jest.mock("@/src/services/core/content", () => ({ getFileState: jest.fn() }))
jest.mock("@/src/services/core/reading", () => ({
  listReadingPositionCandidates: jest.fn(),
}))
jest.mock("@/src/services/query/query-client", () => ({
  queryClient: { getQueryData: jest.fn() },
}))
jest.mock("@/src/store/app-store", () => ({
  useAppStore: { getState: jest.fn() },
}))

it.each([
  "EPUB",
  "PDF",
  "CBZ",
])("opens cached %s while remote position lookup is pending", async (format) => {
  jest.mocked(useAppStore.getState).mockReturnValue({
    libraries: [
      { id: "library", sourceType: "local", path: "file:///library" },
    ],
    dataSources: [],
  } as unknown as ReturnType<typeof useAppStore.getState>)
  jest.mocked(readBookDetailFromMetadata).mockResolvedValue({
    title: "Book",
    languages: [],
    readableFormats: [format],
    preferredFormat: format,
  } as unknown as Awaited<ReturnType<typeof readBookDetailFromMetadata>>)
  jest.mocked(resolveBookFileForRead).mockResolvedValue({
    uri: `file:///book.${format.toLowerCase()}`,
    md5: "fingerprint",
  } as unknown as Awaited<ReturnType<typeof resolveBookFileForRead>>)
  const locator = {
    href: "chapter",
    type: "application/xhtml+xml",
    locations: { position: 3, progression: 0 },
  }
  jest.mocked(getReadingProgress).mockResolvedValue(locator)
  jest
    .mocked(listReadingPositionCandidates)
    .mockReturnValue(new Promise(() => {}))
  const { result, unmount } = renderHook(() =>
    useBookLoader("4", format, "library"),
  )
  await waitFor(() => expect(result.current.loadState.status).toBe("ready"))
  expect(result.current.loadState).toMatchObject({
    bookId: 4,
    format,
    initialLocator: locator,
  })
  unmount()
  const syncedLocator = {
    ...locator,
    locations: { position: 8, progression: 0 },
  }
  jest.mocked(getReadingProgress).mockResolvedValue(syncedLocator)
  const reopened = renderHook(() => useBookLoader("4", format, "library"))
  await waitFor(() =>
    expect(reopened.result.current.loadState.status).toBe("ready"),
  )
  expect(reopened.result.current.loadState).toMatchObject({
    initialLocator: syncedLocator,
  })
  reopened.unmount()
})

it("keeps authorization headers on a cached remote cover", async () => {
  const coverUri = {
    uri: "https://www.googleapis.com/drive/v3/files/cover?alt=media",
    headers: { Authorization: "Bearer access-token" },
  }
  const library = {
    id: "library",
    sourceType: "gdrive",
    dataSourceId: "gdrive-source",
    path: "file:///library",
  }
  jest.mocked(useAppStore.getState).mockReturnValue({
    libraries: [library],
    dataSources: [],
  } as unknown as ReturnType<typeof useAppStore.getState>)
  jest.mocked(queryClient.getQueryData).mockReturnValue([
    {
      id: "4",
      title: "Book",
      author: "Author",
      coverUri,
    } as BookItem,
  ] as never)
  jest.mocked(readBookDetailFromMetadata).mockReturnValue(new Promise(() => {}))

  const { result, unmount } = renderHook(() =>
    useBookLoader("4", "EPUB", "library"),
  )

  await waitFor(() => expect(result.current.coverUri).toEqual(coverUri))
  unmount()
})

it("keeps authorization headers when resolving a remote cover", async () => {
  const coverUri = {
    uri: "https://www.googleapis.com/drive/v3/files/cover?alt=media",
    headers: { Authorization: "Bearer access-token" },
  }
  const library = {
    id: "library",
    sourceType: "gdrive",
    dataSourceId: "gdrive-source",
    path: "file:///library",
  }
  jest.mocked(useAppStore.getState).mockReturnValue({
    libraries: [library],
    dataSources: [],
  } as unknown as ReturnType<typeof useAppStore.getState>)
  jest.mocked(queryClient.getQueryData).mockReturnValue([] as never)
  jest.mocked(readBookDetailFromMetadata).mockResolvedValue({
    title: "Book",
    path: "Author/Book",
    hasCover: true,
    languages: [],
    readableFormats: ["EPUB"],
    preferredFormat: "EPUB",
  } as unknown as Awaited<ReturnType<typeof readBookDetailFromMetadata>>)
  jest.mocked(getBookFormatPaths).mockResolvedValue([])
  jest.mocked(createRemoteOps).mockResolvedValue({
    resolveCoverUri: jest.fn().mockResolvedValue(coverUri),
    buildCoverUri: jest.fn(),
  })

  const { result, unmount } = renderHook(() =>
    useBookLoader("4", "EPUB", "library"),
  )

  await waitFor(() => expect(result.current.coverUri).toEqual(coverUri))
  unmount()
})
