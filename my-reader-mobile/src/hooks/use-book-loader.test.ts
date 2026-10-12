import { renderHook, waitFor } from "@testing-library/react-native"
import {
  readBookDetailFromMetadata,
  resolveBookFileForRead,
} from "@/src/domain/library/catalog"
import { getReadingProgress } from "@/src/domain/library/reading-progress"
import { listReadingPositionCandidates } from "@/src/services/core/reading"
import { useAppStore } from "@/src/store/app-store"
import { useBookLoader } from "./use-book-loader"

jest.mock("@/src/domain/library/catalog", () => ({
  libraryQueryKeys: { books: (id: string) => ["books", id] },
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
  const { result } = renderHook(() => useBookLoader("4", format, "library"))
  await waitFor(() => expect(result.current.loadState.status).toBe("ready"))
  expect(result.current.loadState).toMatchObject({
    bookId: 4,
    format,
    initialLocator: locator,
  })
})
