import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { Library } from "@my-reader/tools/types/library"

import {
  insertLibrarySidecarOutboxChange,
  readLibrarySidecarBookmark,
  readLibrarySidecarHlcState,
  withLibrarySidecarSyncTransaction,
  writeLibrarySidecarBookmark,
  writeLibrarySidecarHlcState,
  type LibrarySidecarBookmarkRow,
  type LibrarySidecarSyncTransaction,
} from "@/src/repos/library-sidecar-sync"
import { uuid } from "@/src/utils/common"
import type {
  LibrarySidecarBookmarkState,
  LibrarySidecarChange,
  LibrarySidecarSegment,
} from "./contract"
import {
  formatLibrarySidecarHlc,
  nextLibrarySidecarHlc,
  parseLibrarySidecarHlc,
} from "./hlc"
import { ensureLibrarySidecarIdentity } from "./identity"
import { mergeLibrarySidecarState } from "./merge"

function normalizedBookmarkFormat(format: string): string {
  const normalized = format.trim().toUpperCase()
  if (normalized.length === 0) {
    throw new Error("Invalid bookmark.v1 format")
  }
  return normalized
}

function validateBookmarkIdentity(bookId: number, locatorKey: string): void {
  if (!Number.isSafeInteger(bookId) || bookId < 1 || locatorKey.length === 0) {
    throw new Error("Invalid bookmark.v1 identity")
  }
}

function persistedHlcState(
  row: {
    physicalMs: string
    counter: string
  } | null,
): { physicalMs: bigint; counter: bigint } {
  return {
    physicalMs: BigInt(row?.physicalMs ?? "0"),
    counter: BigInt(row?.counter ?? "0"),
  }
}

function bookmarkStateFromRow(
  row: LibrarySidecarBookmarkRow,
): LibrarySidecarBookmarkState | null {
  if (!row.syncClock) return null
  return {
    domain: "bookmark.v1",
    bookId: row.bookId,
    format: row.format,
    locatorKey: row.locatorKey,
    register: {
      clock: row.syncClock,
      value: {
        present: row.deletedAt === null,
        id: row.id,
        locator: JSON.parse(row.locatorJson) as ReaderLocator,
        createdAtMs: row.createdAt,
        deletedAtMs: row.deletedAt,
      },
    },
  }
}

async function writeBookmarkProjection(
  tx: LibrarySidecarSyncTransaction,
  state: LibrarySidecarBookmarkState,
): Promise<LibrarySidecarBookmarkRow> {
  return writeLibrarySidecarBookmark(tx, {
    id: state.register.value.id,
    bookId: state.bookId,
    format: state.format,
    locatorKey: state.locatorKey,
    locatorJson: JSON.stringify(state.register.value.locator),
    createdAt: state.register.value.createdAtMs,
    updatedAt: Number(parseLibrarySidecarHlc(state.register.clock).physicalMs),
    deletedAt: state.register.value.deletedAtMs,
    syncClock: state.register.clock,
  })
}

async function writeLocalBookmark(
  library: Library,
  bookId: number,
  format: string,
  locatorKey: string,
  locator: ReaderLocator | null,
  present: boolean,
  nowMs: number,
): Promise<LibrarySidecarBookmarkRow | null> {
  validateBookmarkIdentity(bookId, locatorKey)
  const normalizedFormat = normalizedBookmarkFormat(format)
  if (locator && (locator.href.length === 0 || locator.type.length === 0)) {
    throw new Error("Invalid bookmark.v1 locator")
  }
  const identity = await ensureLibrarySidecarIdentity(library)
  const result = await withLibrarySidecarSyncTransaction(
    library,
    async (tx) => {
      const current = await readLibrarySidecarBookmark(
        tx,
        bookId,
        normalizedFormat,
        locatorKey,
      )
      const currentIsPresent = current?.deletedAt === null
      if ((present && currentIsPresent) || (!present && !currentIsPresent)) {
        return {
          row: present ? current : null,
          clock: null,
        }
      }

      const persisted = persistedHlcState(await readLibrarySidecarHlcState(tx))
      const next = nextLibrarySidecarHlc(
        persisted,
        BigInt(nowMs),
        identity.replicaId,
      )
      const clock = formatLibrarySidecarHlc(next)
      const state: LibrarySidecarBookmarkState = {
        domain: "bookmark.v1",
        bookId,
        format: normalizedFormat,
        locatorKey,
        register: {
          clock,
          value: {
            present,
            id: current?.id ?? uuid(),
            locator:
              locator ??
              (JSON.parse(current?.locatorJson ?? "") as ReaderLocator),
            createdAtMs: current?.createdAt ?? nowMs,
            deletedAtMs: present ? null : nowMs,
          },
        },
      }
      const row = await writeBookmarkProjection(tx, state)
      await writeLibrarySidecarHlcState(tx, {
        physicalMs: next.physicalMs.toString(),
        counter: next.counter.toString(),
      })
      await insertLibrarySidecarOutboxChange(tx, {
        changeId: uuid(),
        clock,
        domain: state.domain,
        stateJson: JSON.stringify(state),
      })
      return { row, clock }
    },
  )
  if (result.clock) {
    console.info("[reading-sync] bookmark:local-write", {
      libraryId: library.id,
      libraryUuid: identity.libraryUuid,
      replicaId: identity.replicaId,
      bookId,
      format: normalizedFormat,
      locatorKey,
      present,
      clock: result.clock,
    })
  }
  return result.row
}

export async function addLocalBookmark(
  library: Library,
  bookId: number,
  format: string,
  locatorKey: string,
  locator: ReaderLocator,
  nowMs = Date.now(),
): Promise<LibrarySidecarBookmarkRow> {
  const row = await writeLocalBookmark(
    library,
    bookId,
    format,
    locatorKey,
    locator,
    true,
    nowMs,
  )
  if (!row) throw new Error("Bookmark add returned no row")
  return row
}

export async function removeLocalBookmark(
  library: Library,
  bookId: number,
  format: string,
  locatorKey: string,
  nowMs = Date.now(),
): Promise<void> {
  await writeLocalBookmark(
    library,
    bookId,
    format,
    locatorKey,
    null,
    false,
    nowMs,
  )
}

export async function applyBookmarkChange(
  tx: LibrarySidecarSyncTransaction,
  segment: LibrarySidecarSegment,
  change: LibrarySidecarChange,
): Promise<void> {
  if (change.state.domain !== "bookmark.v1") {
    throw new Error(`Unsupported bookmark domain: ${change.state.domain}`)
  }
  const incoming = change.state
  const currentRow = await readLibrarySidecarBookmark(
    tx,
    incoming.bookId,
    incoming.format,
    incoming.locatorKey,
  )
  const current = currentRow ? bookmarkStateFromRow(currentRow) : null
  const merged = current
    ? (mergeLibrarySidecarState(
        current,
        incoming,
      ) as LibrarySidecarBookmarkState)
    : incoming
  await writeBookmarkProjection(tx, merged)
  console.info("[reading-sync] bookmark:merge", {
    sourceReplicaId: segment.replicaId,
    sequence: segment.sequence,
    changeId: change.changeId,
    bookId: incoming.bookId,
    format: incoming.format,
    locatorKey: incoming.locatorKey,
    currentClock: current?.register.clock ?? null,
    incomingClock: incoming.register.clock,
    selectedClock: merged.register.clock,
    selectedSource:
      merged.register.clock === incoming.register.clock ? "remote" : "local",
    present: merged.register.value.present,
  })
}
