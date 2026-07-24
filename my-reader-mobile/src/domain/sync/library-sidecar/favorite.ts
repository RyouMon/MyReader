import type { Library } from "@my-reader/tools/types/library"

import {
  insertLibrarySidecarOutboxChange,
  readLibrarySidecarFavorite,
  readLibrarySidecarHlcState,
  withLibrarySidecarSyncTransaction,
  writeLibrarySidecarFavorite,
  writeLibrarySidecarHlcState,
  type LibrarySidecarSyncTransaction,
} from "@/src/repos/library-sidecar-sync"
import { uuid } from "@/src/utils/common"
import type {
  LibrarySidecarChange,
  LibrarySidecarFavoriteState,
  LibrarySidecarSegment,
} from "./contract"
import { formatLibrarySidecarHlc, nextLibrarySidecarHlc } from "./hlc"
import { ensureLibrarySidecarIdentity } from "./identity"
import { mergeLibrarySidecarState } from "./merge"

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

export async function writeLocalFavorite(
  library: Library,
  bookId: number,
  isFavorite: boolean,
  nowMs = Date.now(),
): Promise<void> {
  if (!Number.isSafeInteger(bookId) || bookId < 1) {
    throw new Error("Invalid book_favorite.v1 book ID")
  }
  const identity = await ensureLibrarySidecarIdentity(library)
  const clock = await withLibrarySidecarSyncTransaction(library, async (tx) => {
    const current = await readLibrarySidecarFavorite(tx, bookId)
    if (current?.isFavorite === isFavorite || (!current && !isFavorite)) {
      return null
    }
    const persisted = persistedHlcState(await readLibrarySidecarHlcState(tx))
    const next = nextLibrarySidecarHlc(
      persisted,
      BigInt(nowMs),
      identity.replicaId,
    )
    const clock = formatLibrarySidecarHlc(next)
    const state: LibrarySidecarFavoriteState = {
      domain: "book_favorite.v1",
      bookId,
      register: {
        clock,
        value: {
          isFavorite,
          addedAtMs: isFavorite ? nowMs : null,
        },
      },
    }
    await writeLibrarySidecarFavorite(tx, {
      bookId,
      addedAt: isFavorite ? nowMs : (current?.addedAt ?? 0),
      isFavorite,
      syncClock: clock,
    })
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
    return clock
  })
  if (clock) {
    console.info("[reading-sync] favorite:local-write", {
      libraryId: library.id,
      libraryUuid: identity.libraryUuid,
      replicaId: identity.replicaId,
      bookId,
      isFavorite,
      clock,
    })
  }
}

function favoriteStateFromRow(
  row: NonNullable<Awaited<ReturnType<typeof readLibrarySidecarFavorite>>>,
): LibrarySidecarFavoriteState | null {
  if (!row.syncClock) return null
  return {
    domain: "book_favorite.v1",
    bookId: row.bookId,
    register: {
      clock: row.syncClock,
      value: {
        isFavorite: row.isFavorite,
        addedAtMs: row.isFavorite ? row.addedAt : null,
      },
    },
  }
}

export async function applyFavoriteChange(
  tx: LibrarySidecarSyncTransaction,
  segment: LibrarySidecarSegment,
  change: LibrarySidecarChange,
): Promise<void> {
  if (change.state.domain !== "book_favorite.v1") {
    throw new Error(`Unsupported favorite domain: ${change.state.domain}`)
  }
  const incoming = change.state
  const currentRow = await readLibrarySidecarFavorite(tx, incoming.bookId)
  const current = currentRow ? favoriteStateFromRow(currentRow) : null
  const merged = current
    ? (mergeLibrarySidecarState(
        current,
        incoming,
      ) as LibrarySidecarFavoriteState)
    : incoming
  await writeLibrarySidecarFavorite(tx, {
    bookId: merged.bookId,
    addedAt: merged.register.value.isFavorite
      ? (merged.register.value.addedAtMs ?? 0)
      : (currentRow?.addedAt ?? 0),
    isFavorite: merged.register.value.isFavorite,
    syncClock: merged.register.clock,
  })
  console.info("[reading-sync] favorite:merge", {
    sourceReplicaId: segment.replicaId,
    sequence: segment.sequence,
    changeId: change.changeId,
    bookId: incoming.bookId,
    currentClock: current?.register.clock ?? null,
    incomingClock: incoming.register.clock,
    selectedClock: merged.register.clock,
    selectedSource:
      merged.register.clock === incoming.register.clock ? "remote" : "local",
    isFavorite: merged.register.value.isFavorite,
  })
}
