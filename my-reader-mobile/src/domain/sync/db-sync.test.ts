import { listReaderBookmarksAtOrAfter } from "../../repos/bookmarks"
import { listReadingProgressAtOrAfter } from "../../repos/reading-progress"
import { getSyncMeta, setSyncMeta } from "../../repos/sync_meta"
import type { Library } from "../types"
import { syncDbFromContext } from "./db-sync"
import { getOrCreateDeviceId } from "./device"
import type { ResolvedSyncTarget } from "./resolve"

jest.mock("@/src/services/fs/library-paths", () => ({
  ensureLibrarySidecarDirectory: jest.fn(),
  librarySidecarRootUri: jest.fn(() => "file:///sidecar"),
  usesIosContainerSidecar: jest.fn(() => false),
}))

jest.mock("../../repos/reading-progress", () => ({
  listReadingProgressAtOrAfter: jest.fn(),
  upsertReadingProgressIfNewer: jest.fn(),
}))

jest.mock("../../repos/bookmarks", () => ({
  listReaderBookmarksAtOrAfter: jest.fn(),
  upsertReaderBookmarkIfNewer: jest.fn(),
}))

jest.mock("../../repos/sync_meta", () => ({
  getSyncMeta: jest.fn(),
  setSyncMeta: jest.fn(),
}))

jest.mock("../../services/fs/bookmarks", () => ({
  withSecurityScopedLibraryAccess: jest.fn(),
}))

jest.mock("../../services/query/invalidate-table", () => ({
  invalidateReaderBookmarks: jest.fn(),
  invalidateReadingProgress: jest.fn(),
  invalidateRecentlyReadBooks: jest.fn(),
}))

jest.mock("./device", () => ({
  getOrCreateDeviceId: jest.fn(),
}))

jest.mock("./local", () => ({
  LocalDirectBackend: jest.fn(),
}))

jest.mock("./resolve", () => ({
  isLocalDirect: jest.fn(() => false),
}))

const library: Library = {
  id: "library-1",
  name: "Test Library",
  path: "/library",
  bookCount: 2,
  sourceType: "webdav",
}

const firstBookmark = {
  id: "bookmark-a",
  bookId: 1,
  format: "EPUB",
  locatorKey: "v2:00000000000000000000000000000001",
  locatorJson: '{"href":"a.xhtml","type":"application/xhtml+xml"}',
  createdAt: 10,
  updatedAt: 100,
  deletedAt: null,
}

const secondBookmark = {
  id: "bookmark-b",
  bookId: 1,
  format: "EPUB",
  locatorKey: "v2:00000000000000000000000000000002",
  locatorJson: '{"href":"b.xhtml","type":"application/xhtml+xml"}',
  createdAt: 11,
  updatedAt: 100,
  deletedAt: null,
}

describe("database sync push", () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it("should serialize concurrent pushes without losing a same-time revision", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1_000)
    jest.mocked(getOrCreateDeviceId).mockResolvedValue("device-a")
    jest.mocked(listReadingProgressAtOrAfter).mockResolvedValue([])
    jest
      .mocked(listReaderBookmarksAtOrAfter)
      .mockResolvedValueOnce([firstBookmark])
      .mockResolvedValueOnce([firstBookmark, secondBookmark])

    const metadata = new Map<string, string>()
    jest.mocked(getSyncMeta).mockImplementation(async (_library, key) => {
      return metadata.get(key) ?? null
    })
    jest
      .mocked(setSyncMeta)
      .mockImplementation(async (_library, key, value) => {
        if (value === null) metadata.delete(key)
        else metadata.set(key, value)
      })

    const paths: string[] = []
    const payloads: string[] = []
    let activeWrites = 0
    let maxActiveWrites = 0
    const writeBytes = jest.fn(async (path: string, bytes: Uint8Array) => {
      activeWrites++
      maxActiveWrites = Math.max(maxActiveWrites, activeWrites)
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      paths.push(path)
      payloads.push(new TextDecoder().decode(bytes))
      activeWrites--
    })
    const ctx = {
      backend: { kind: "webdav", writeBytes },
      dataSourceId: "source-1",
      libraryId: library.id,
      libraryRootUri: "webdav:///library",
      librarySidecarRootUri: "webdav:///library/.myreader",
    } as unknown as ResolvedSyncTarget

    const reports = await Promise.all([
      syncDbFromContext(library, ctx, { mode: "push_only" }),
      syncDbFromContext(library, ctx, { mode: "push_only" }),
    ])

    expect(reports).toEqual([
      { pushed: 1, pulled: 0 },
      { pushed: 1, pulled: 0 },
    ])
    expect(paths).toEqual([
      ".myreader/changes/device-a/1000.jsonl",
      ".myreader/changes/device-a/1001.jsonl",
    ])
    expect(maxActiveWrites).toBe(1)
    expect(payloads[0]).toContain('"id":"bookmark-a"')
    expect(payloads[1]).not.toContain('"id":"bookmark-a"')
    expect(payloads[1]).toContain('"id":"bookmark-b"')
  })
})
