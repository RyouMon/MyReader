const mockSetLibraries = jest.fn()
const mockStoreState = {
  libraries: [
    {
      id: "library-1",
      name: "Library",
      path: "file:///library",
      bookCount: 1,
    },
  ],
  setLibraries: mockSetLibraries,
}

jest.mock("@/src/store/app-store", () => ({
  useAppStore: {
    getState: jest.fn(() => mockStoreState),
  },
}))

jest.mock("@/src/services/core/app-config", () => ({
  replaceAppLibrary: jest.fn(() =>
    Promise.resolve({ libraries: mockStoreState.libraries }),
  ),
}))

jest.mock("@/src/services/query/query-client", () => ({
  queryClient: {
    invalidateQueries: jest.fn(() => Promise.resolve()),
    setQueryData: jest.fn(),
  },
}))

import { replaceAppLibrary } from "@/src/services/core/app-config"
import { queryClient } from "@/src/services/query/query-client"
import type { LibrarySyncReport } from "../types"
import { applySyncReport } from "./apply-sync-report"

const report: LibrarySyncReport = {
  libraryId: "library-1",
  libraryName: "Library",
  durationMs: 10,
  calibre: {
    skipped: false,
    changed: true,
    library: {
      id: "library-1",
      name: "Library",
      path: "file:///library",
      bookCount: 2,
    },
  },
  myreader: {
    skipped: false,
    mode: "full",
    providers: {},
  },
}

describe("applySyncReport", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should refresh UI state without persisting business data when Core already synced", async () => {
    await applySyncReport(report, { trigger: "scheduled" })

    expect(mockSetLibraries).toHaveBeenCalledWith([
      expect.objectContaining({ id: "library-1", bookCount: 2 }),
    ])
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["books", "library-1"],
    })
    expect(replaceAppLibrary).not.toHaveBeenCalled()
  })
})
