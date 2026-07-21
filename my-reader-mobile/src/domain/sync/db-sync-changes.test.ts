import {
  advanceDbPushCursor,
  allocateDbChangeSequence,
  buildDbChangeRows,
  type DbChangeRow,
  dbChangeRevisionFingerprint,
  dbSyncLastExternalMirrorSeqKey,
  dbSyncLastLocalSequenceKey,
  dbSyncLastPullCursorKey,
  dbSyncLastPushCursorKey,
  parseDbChangeRow,
  parseDbPushCursor,
  parseReaderBookmarkChange,
  parseReadingProgressChange,
  selectPendingDbChanges,
  serializeDbPushCursor,
} from "./db-sync-changes"

const BOOKMARK_KEY = "v3:00000000000000000000000000000003"
const VALID_LOCATOR_JSON =
  '{"href":"chapter.xhtml","type":"application/xhtml+xml"}'

function bookmarkChange(
  id: string,
  locatorJson: string,
  updatedAt = 100,
): DbChangeRow {
  return {
    t: "bookmarks",
    k: { book_id: 1, format: "EPUB", locator_key: BOOKMARK_KEY },
    v: {
      id,
      locator_json: locatorJson,
      created_at: 10,
      updated_at: updatedAt,
      deleted_at: null,
    },
  }
}

describe("db sync changes", () => {
  it("should encode progress and bookmark tombstones when building changes", () => {
    const changes = buildDbChangeRows(
      [
        {
          bookId: 1,
          format: "epub",
          locatorJson: '{"href":"chapter.xhtml"}',
          updatedAt: 20,
        },
      ],
      [
        {
          id: "bookmark-1",
          bookId: 1,
          format: "pdf",
          locatorKey: BOOKMARK_KEY,
          locatorJson: '{"href":"book.pdf"}',
          createdAt: 10,
          updatedAt: 30,
          deletedAt: 30,
        },
      ],
    )

    expect(changes).toEqual([
      {
        t: "reading_progress",
        k: { book_id: 1, format: "EPUB" },
        v: {
          locator_json: '{"href":"chapter.xhtml"}',
          updated_at: 20,
        },
      },
      {
        t: "bookmarks",
        k: {
          book_id: 1,
          format: "PDF",
          locator_key: BOOKMARK_KEY,
        },
        v: {
          id: "bookmark-1",
          locator_json: '{"href":"book.pdf"}',
          created_at: 10,
          updated_at: 30,
          deleted_at: 30,
        },
      },
    ])
  })

  it("should parse a bookmark change when all sync fields are valid", () => {
    const change = parseDbChangeRow({
      t: "bookmarks",
      k: {
        book_id: 4,
        format: "epub",
        locator_key: BOOKMARK_KEY,
      },
      v: {
        id: "bookmark-7",
        locator_json: VALID_LOCATOR_JSON,
        created_at: 10,
        updated_at: 20,
        deleted_at: null,
      },
    })

    expect(change && parseReaderBookmarkChange(change)).toEqual({
      id: "bookmark-7",
      bookId: 4,
      format: "EPUB",
      locatorKey: BOOKMARK_KEY,
      locatorJson: VALID_LOCATOR_JSON,
      createdAt: 10,
      updatedAt: 20,
      deletedAt: null,
    })
  })

  it("should reject a bookmark change when deleted_at is missing", () => {
    const change = parseDbChangeRow({
      t: "bookmarks",
      k: { book_id: 4, format: "EPUB", locator_key: BOOKMARK_KEY },
      v: {
        id: "bookmark-7",
        locator_json: VALID_LOCATOR_JSON,
        created_at: 10,
        updated_at: 20,
      },
    })

    expect(change && parseReaderBookmarkChange(change)).toBeNull()
  })

  it.each([
    "not-json",
    '{"href":"chapter.xhtml"}',
    '{"href":"chapter.xhtml","type":"application/xhtml+xml","locations":[]}',
  ])("should reject a bookmark change when locator JSON is malformed", (locatorJson) => {
    const change = bookmarkChange("bookmark", locatorJson)

    expect(parseReaderBookmarkChange(change)).toBeNull()
  })

  it("should parse reading progress when the change is valid", () => {
    const change = parseDbChangeRow({
      t: "reading_progress",
      k: { book_id: 2, format: "pdf" },
      v: { locator_json: '{"href":"book.pdf"}', updated_at: 20 },
    })

    expect(change && parseReadingProgressChange(change)).toEqual({
      bookId: 2,
      format: "PDF",
      locatorJson: '{"href":"book.pdf"}',
      updatedAt: 20,
    })
  })

  it("should ignore an unknown table when parsing known providers", () => {
    const change = parseDbChangeRow({
      t: "future_table",
      k: { id: 1 },
      v: { updated_at: 20 },
    })

    expect(change && parseReaderBookmarkChange(change)).toBeNull()
    expect(change && parseReadingProgressChange(change)).toBeNull()
  })

  it("should reject a malformed envelope when key data is not an object", () => {
    expect(
      parseDbChangeRow({ t: "bookmarks", k: "not-an-object", v: {} }),
    ).toBeNull()
  })

  it("should reject fractional book ids when parsing sync changes", () => {
    const bookmark = bookmarkChange("bookmark", VALID_LOCATOR_JSON)
    bookmark.k.book_id = 4.5
    const progress = parseDbChangeRow({
      t: "reading_progress",
      k: { book_id: 4.5, format: "EPUB" },
      v: { locator_json: VALID_LOCATOR_JSON, updated_at: 20 },
    })

    expect(parseReaderBookmarkChange(bookmark)).toBeNull()
    expect(progress && parseReadingProgressChange(progress)).toBeNull()
  })

  it("should reject an oversized bookmark key when parsing a change", () => {
    const change = bookmarkChange("bookmark", VALID_LOCATOR_JSON)
    change.k.locator_key = "x".repeat(2049)

    expect(parseReaderBookmarkChange(change)).toBeNull()
  })

  it("should trim bookmark natural-key fields when parsing a change", () => {
    const change = bookmarkChange("bookmark", VALID_LOCATOR_JSON)
    change.k.format = " epub "
    change.k.locator_key = `  ${BOOKMARK_KEY}  `

    expect(parseReaderBookmarkChange(change)).toMatchObject({
      format: "EPUB",
      locatorKey: BOOKMARK_KEY,
    })
  })

  it("should trim progress format when parsing a change", () => {
    const change: DbChangeRow = {
      t: "reading_progress",
      k: { book_id: 1, format: " pdf " },
      v: { locator_json: VALID_LOCATOR_JSON, updated_at: 20 },
    }

    expect(parseReadingProgressChange(change)).toMatchObject({ format: "PDF" })
  })

  it("should reject blank bookmark identifiers and natural-key fields", () => {
    const blankId = bookmarkChange("   ", VALID_LOCATOR_JSON)
    const blankFormat = bookmarkChange("bookmark", VALID_LOCATOR_JSON)
    blankFormat.k.format = "   "
    const blankKey = bookmarkChange("bookmark", VALID_LOCATOR_JSON)
    blankKey.k.locator_key = "   "

    expect(parseReaderBookmarkChange(blankId)).toBeNull()
    expect(parseReaderBookmarkChange(blankFormat)).toBeNull()
    expect(parseReaderBookmarkChange(blankKey)).toBeNull()
  })

  it("should use v3 cursors when bookmark-aware sync starts", () => {
    expect(dbSyncLastPushCursorKey("local")).toBe("last_push_cursor_v3::local")
    expect(dbSyncLastExternalMirrorSeqKey("local")).toBe(
      "last_external_mirror_seq_v3::local",
    )
    expect(dbSyncLastPullCursorKey("local", "remote")).toBe(
      "last_pull_cursor_v3::local::remote",
    )
    expect(dbSyncLastLocalSequenceKey("local")).toBe(
      "last_local_change_seq_v3::local",
    )
  })

  it("should canonicalize revision fingerprints when field order differs", () => {
    const first = bookmarkChange("bookmark", '{"href":"chapter.xhtml"}')
    const reordered: DbChangeRow = {
      v: {
        deleted_at: null,
        updated_at: 100,
        created_at: 10,
        locator_json: '{"href":"chapter.xhtml"}',
        id: "bookmark",
      },
      k: { locator_key: BOOKMARK_KEY, format: "EPUB", book_id: 1 },
      t: "bookmarks",
    }

    expect(dbChangeRevisionFingerprint(first)).toBe(
      dbChangeRevisionFingerprint(reordered),
    )
  })

  it("should match the shared cross-platform revision fingerprint", () => {
    const change: DbChangeRow = {
      t: "bookmarks",
      k: {
        book_id: 1,
        format: "EPUB",
        locator_key: "chapter.xhtml@0.5",
      },
      v: {
        id: "bookmark-1",
        locator_json: '{"href":"chapter.xhtml","type":"application/xhtml+xml"}',
        created_at: 100,
        updated_at: 100,
        deleted_at: null,
      },
    }

    expect(dbChangeRevisionFingerprint(change)).toBe(
      "ec2250ea97bbfec70f52eb0ddbb315b3",
    )
  })

  it("should retain unseen same-millisecond revisions when advancing a cursor", () => {
    const first = bookmarkChange("first", '{"href":"first.xhtml"}')
    const legacyCursor = parseDbPushCursor("100")
    const firstPending = selectPendingDbChanges([first], legacyCursor)
    const afterFirst = advanceDbPushCursor(legacyCursor, firstPending)

    expect(firstPending).toEqual([first])
    expect(selectPendingDbChanges([first], afterFirst)).toEqual([])

    const later = bookmarkChange("later", '{"href":"later.xhtml"}')
    expect(selectPendingDbChanges([first, later], afterFirst)).toEqual([later])

    const revised = bookmarkChange("first", '{"href":"revised.xhtml"}')
    expect(selectPendingDbChanges([revised], afterFirst)).toEqual([revised])
  })

  it("should round-trip a JSON push cursor when boundary revisions are seen", () => {
    const cursor = {
      ts: 100,
      seen: ["second", "", "first", "second"],
    }

    expect(parseDbPushCursor(serializeDbPushCursor(cursor))).toEqual({
      ts: 100,
      seen: ["first", "second"],
    })
  })

  it("should allocate distinct sequences when wall time is unchanged", () => {
    const first = allocateDbChangeSequence(0, 1000)
    const second = allocateDbChangeSequence(first, 1000)

    expect(first).toBe(1000)
    expect(second).toBe(1001)
  })
})
