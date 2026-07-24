/** @jest-environment node */

import type { Library } from "@my-reader/tools/types/library"
import { drizzle } from "drizzle-orm/sqlite-proxy"
import { getLibraryDatabase } from "@/src/services/db/library-db"
import {
  addOrReviveReaderBookmarkRow,
  getReaderBookmarkRow,
  type ReaderBookmarkUpsert,
  tombstoneReaderBookmarkRow,
  upsertReaderBookmarkIfNewer,
} from "./bookmarks"
import {
  getReadingProgressRow,
  type ReadingProgressUpsert,
  upsertReadingProgress,
  upsertReadingProgressIfNewer,
} from "./reading-progress"

jest.mock("@/src/services/db/library-db", () => ({
  getLibraryDatabase: jest.fn(),
}))

jest.mock("@/src/services/query/invalidate-table", () => ({
  invalidateReadingProgress: jest.fn(),
  invalidateRecentlyReadBooks: jest.fn(),
}))

jest.mock("@/src/utils/common", () => ({
  uuid: jest.fn(() => "generated-id"),
}))

type TestStatement = {
  all(...params: unknown[]): Record<string, unknown>[]
  get(...params: unknown[]): Record<string, unknown> | undefined
  run(...params: unknown[]): unknown
}

type TestDatabase = {
  close(): void
  exec(sql: string): void
  prepare(sql: string): TestStatement
}

const { DatabaseSync } = jest.requireActual<{
  DatabaseSync: new (path: string) => TestDatabase
}>("node:sqlite")

const library = { id: "library-1" } as Library
const bookmarkKey = "v3:00000000000000000000000000000001"
const locatorJson = '{"href":"chapter.xhtml","type":"application/xhtml+xml"}'
const databases: TestDatabase[] = []

function setupEmptyDatabase(): void {
  const sqlite = new DatabaseSync(":memory:")
  databases.push(sqlite)
  sqlite.exec(`
    CREATE TABLE bookmarks (
      id TEXT PRIMARY KEY NOT NULL,
      book_id INTEGER NOT NULL,
      format TEXT NOT NULL,
      locator_key TEXT NOT NULL,
      locator_json TEXT NOT NULL,
      created_at REAL NOT NULL,
      updated_at REAL NOT NULL,
      deleted_at REAL
    );
    CREATE UNIQUE INDEX idx_bookmarks_book_format_locator
      ON bookmarks (book_id, format, locator_key);
    CREATE TABLE reading_progress (
      id TEXT PRIMARY KEY NOT NULL,
      book_id INTEGER NOT NULL,
      format TEXT NOT NULL,
      locator_json TEXT NOT NULL,
      display_progression REAL,
      updated_at REAL NOT NULL,
      sync_clock TEXT
    );
    CREATE UNIQUE INDEX idx_reading_progress_book_format
      ON reading_progress (book_id, format);
  `)

  const db = drizzle(async (query, params, method) => {
    const statement = sqlite.prepare(query)
    if (method === "run") {
      statement.run(...params)
      return { rows: [] }
    }
    if (method === "get") {
      const row = statement.get(...params)
      return { rows: row ? Object.values(row) : [] }
    }
    return {
      rows: statement.all(...params).map((row) => Object.values(row)),
    }
  })

  jest.mocked(getLibraryDatabase).mockResolvedValue({
    raw: {} as never,
    db: db as never,
  })
}

function bookmark(
  overrides: Partial<ReaderBookmarkUpsert> = {},
): ReaderBookmarkUpsert {
  return {
    id: "bookmark-a",
    bookId: 1,
    format: "EPUB",
    locatorKey: bookmarkKey,
    locatorJson,
    createdAt: 10,
    updatedAt: 100,
    deletedAt: null,
    ...overrides,
  }
}

function progress(
  overrides: Partial<ReadingProgressUpsert> = {},
): ReadingProgressUpsert {
  return {
    bookId: 1,
    format: "EPUB",
    locatorJson,
    displayProgression: null,
    updatedAt: 100,
    ...overrides,
  }
}

async function resolveBookmark(
  first: ReaderBookmarkUpsert,
  second: ReaderBookmarkUpsert,
) {
  setupEmptyDatabase()
  await upsertReaderBookmarkIfNewer(library, first)
  const applied = await upsertReaderBookmarkIfNewer(library, second)
  const row = await getReaderBookmarkRow(
    library,
    first.bookId,
    first.format,
    first.locatorKey,
  )
  return { applied, row }
}

async function resolveProgress(
  first: ReadingProgressUpsert,
  second: ReadingProgressUpsert,
) {
  setupEmptyDatabase()
  await upsertReadingProgressIfNewer(library, first)
  const applied = await upsertReadingProgressIfNewer(library, second)
  const row = await getReadingProgressRow(library, first.bookId, first.format)
  return { applied, row }
}

describe("sync repository LWW", () => {
  afterEach(() => {
    for (const database of databases.splice(0)) database.close()
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it("should revive from the statement-current tombstone when a remote revision races a stale read", async () => {
    setupEmptyDatabase()
    await upsertReaderBookmarkIfNewer(
      library,
      bookmark({ id: "initial", updatedAt: 100, deletedAt: 100 }),
    )
    const stale = await getReaderBookmarkRow(library, 1, "EPUB", bookmarkKey)
    expect(stale?.updatedAt).toBe(100)

    await upsertReaderBookmarkIfNewer(
      library,
      bookmark({
        id: "remote",
        locatorJson: '{"href":"remote.xhtml","type":"application/xhtml+xml"}',
        createdAt: 20,
        updatedAt: 300,
        deletedAt: 300,
      }),
    )
    jest.spyOn(Date, "now").mockReturnValue(200)

    const actual = await addOrReviveReaderBookmarkRow(library, {
      id: "stale-local-attempt",
      bookId: 1,
      format: "EPUB",
      locatorKey: bookmarkKey,
      locatorJson,
    })

    expect(actual).toMatchObject({
      id: "remote",
      locatorJson,
      createdAt: 20,
      updatedAt: 301,
      deletedAt: null,
    })
  })

  it("should return the actual active row when a local add races a newer remote bookmark", async () => {
    setupEmptyDatabase()
    const remoteLocatorJson =
      '{"href":"remote.xhtml","type":"application/xhtml+xml"}'
    await upsertReaderBookmarkIfNewer(
      library,
      bookmark({
        id: "remote",
        locatorJson: remoteLocatorJson,
        createdAt: 20,
        updatedAt: 300,
      }),
    )
    jest.spyOn(Date, "now").mockReturnValue(200)

    const actual = await addOrReviveReaderBookmarkRow(library, {
      id: "local-attempt",
      bookId: 1,
      format: "EPUB",
      locatorKey: bookmarkKey,
      locatorJson,
    })

    expect(actual).toMatchObject({
      id: "remote",
      locatorJson: remoteLocatorJson,
      createdAt: 20,
      updatedAt: 300,
      deletedAt: null,
    })
  })

  it("should tombstone from the statement-current row when a remote revision races a stale read", async () => {
    setupEmptyDatabase()
    await upsertReaderBookmarkIfNewer(
      library,
      bookmark({ id: "initial", updatedAt: 100 }),
    )
    const stale = await getReaderBookmarkRow(library, 1, "EPUB", bookmarkKey)
    expect(stale?.updatedAt).toBe(100)

    await upsertReaderBookmarkIfNewer(
      library,
      bookmark({ id: "remote", createdAt: 20, updatedAt: 300 }),
    )
    jest.spyOn(Date, "now").mockReturnValue(200)

    const actual = await tombstoneReaderBookmarkRow(library, {
      bookId: 1,
      format: "EPUB",
      locatorKey: bookmarkKey,
    })

    expect(actual).toMatchObject({
      id: "remote",
      createdAt: 20,
      updatedAt: 301,
      deletedAt: 301,
    })
  })

  it("should save progress from the statement-current row when a remote revision races a stale read", async () => {
    setupEmptyDatabase()
    await upsertReadingProgressIfNewer(
      library,
      progress({ locatorJson: "initial", updatedAt: 100 }),
    )
    const stale = await getReadingProgressRow(library, 1, "EPUB")
    expect(stale?.updatedAt).toBe(100)

    await upsertReadingProgressIfNewer(
      library,
      progress({ locatorJson: "remote", updatedAt: 300 }),
    )
    jest.spyOn(Date, "now").mockReturnValue(200)

    await upsertReadingProgress(
      library,
      {
        bookId: 1,
        format: "EPUB",
        locatorJson: "local",
        displayProgression: 1,
      },
      { invalidate: false },
    )

    const actual = await getReadingProgressRow(library, 1, "EPUB")
    expect(actual).toMatchObject({
      locatorJson: "local",
      displayProgression: 1,
      updatedAt: 301,
    })
  })

  it("should keep newer local bookmark state when an older remote tombstone arrives", async () => {
    const result = await resolveBookmark(
      bookmark({ id: "local", updatedAt: 200 }),
      bookmark({ id: "remote", updatedAt: 100, deletedAt: 100 }),
    )

    expect(result.applied).toBe(false)
    expect(result.row).toMatchObject({
      id: "local",
      updatedAt: 200,
      deletedAt: null,
    })
  })

  it("should keep a newer local tombstone when an older active row arrives", async () => {
    const result = await resolveBookmark(
      bookmark({ id: "local", updatedAt: 200, deletedAt: 200 }),
      bookmark({ id: "remote", updatedAt: 100, deletedAt: null }),
    )

    expect(result.applied).toBe(false)
    expect(result.row).toMatchObject({
      id: "local",
      updatedAt: 200,
      deletedAt: 200,
    })
  })

  it("should replace an older bookmark state when a newer remote row arrives", async () => {
    const result = await resolveBookmark(
      bookmark({ id: "local", updatedAt: 100 }),
      bookmark({ id: "remote", updatedAt: 200, deletedAt: 200 }),
    )

    expect(result.applied).toBe(true)
    expect(result.row).toMatchObject({
      id: "remote",
      updatedAt: 200,
      deletedAt: 200,
    })
  })

  it("should converge symmetrically when equal-time bookmark ids differ", async () => {
    const lower = bookmark({ id: "bookmark-a", updatedAt: 200 })
    const higher = bookmark({ id: "bookmark-b", updatedAt: 200 })

    const lowerThenHigher = await resolveBookmark(lower, higher)
    const higherThenLower = await resolveBookmark(higher, lower)

    expect(lowerThenHigher.applied).toBe(true)
    expect(higherThenLower.applied).toBe(false)
    expect(lowerThenHigher.row?.id).toBe("bookmark-b")
    expect(higherThenLower.row?.id).toBe("bookmark-b")
  })

  it("should converge on a tombstone when equal-time bookmark states differ", async () => {
    const active = bookmark({ id: "bookmark-z", updatedAt: 200 })
    const tombstone = bookmark({
      id: "bookmark-a",
      updatedAt: 200,
      deletedAt: 200,
    })

    const activeThenDeleted = await resolveBookmark(active, tombstone)
    const deletedThenActive = await resolveBookmark(tombstone, active)

    expect(activeThenDeleted.applied).toBe(true)
    expect(deletedThenActive.applied).toBe(false)
    expect(activeThenDeleted.row?.deletedAt).toBe(200)
    expect(deletedThenActive.row?.deletedAt).toBe(200)
  })

  it("should apply newer reading progress and reject an older revision", async () => {
    const newer = progress({ locatorJson: "z", updatedAt: 200 })
    const older = progress({ locatorJson: "a", updatedAt: 100 })

    const olderThenNewer = await resolveProgress(older, newer)
    const newerThenOlder = await resolveProgress(newer, older)

    expect(olderThenNewer.applied).toBe(true)
    expect(newerThenOlder.applied).toBe(false)
    expect(olderThenNewer.row?.locatorJson).toBe("z")
    expect(newerThenOlder.row?.locatorJson).toBe("z")
  })

  it("should converge reading progress by BINARY locator order when times match", async () => {
    const lower = progress({ locatorJson: "a", updatedAt: 200 })
    const higher = progress({ locatorJson: "中", updatedAt: 200 })

    const lowerThenHigher = await resolveProgress(lower, higher)
    const higherThenLower = await resolveProgress(higher, lower)

    expect(lowerThenHigher.applied).toBe(true)
    expect(higherThenLower.applied).toBe(false)
    expect(lowerThenHigher.row?.locatorJson).toBe("中")
    expect(higherThenLower.row?.locatorJson).toBe("中")
  })

  it("should converge on display progression when time and locator match", async () => {
    const legacy = progress({ displayProgression: null, updatedAt: 200 })
    const current = progress({ displayProgression: 1, updatedAt: 200 })

    const legacyThenCurrent = await resolveProgress(legacy, current)
    const currentThenLegacy = await resolveProgress(current, legacy)

    expect(legacyThenCurrent.applied).toBe(true)
    expect(currentThenLegacy.applied).toBe(false)
    expect(legacyThenCurrent.row?.displayProgression).toBe(1)
    expect(currentThenLegacy.row?.displayProgression).toBe(1)
  })
})
