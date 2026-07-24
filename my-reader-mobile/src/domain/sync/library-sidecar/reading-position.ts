import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { Library } from "@my-reader/tools/types/library"

import {
  insertLibrarySidecarOutboxChange,
  readLibrarySidecarHlcState,
  readLibrarySidecarReadingPosition,
  withLibrarySidecarSyncTransaction,
  writeLibrarySidecarHlcState,
  writeLibrarySidecarReadingPosition,
  type LibrarySidecarSyncTransaction,
} from "@/src/repos/library-sidecar-sync"
import { uuid } from "@/src/utils/common"
import {
  type LibrarySidecarChange,
  type LibrarySidecarPositionState,
  type LibrarySidecarSegment,
} from "./contract"
import {
  formatLibrarySidecarHlc,
  nextLibrarySidecarHlc,
  parseLibrarySidecarHlc,
} from "./hlc"
import { ensureLibrarySidecarIdentity } from "./identity"
import { mergeLibrarySidecarState } from "./merge"

export type ReadingPositionInput = {
  bookId: number
  format: string
  locator: ReaderLocator
  displayProgression: number | null
}

function validateReadingPositionInput(input: ReadingPositionInput): string {
  if (
    !Number.isSafeInteger(input.bookId) ||
    input.bookId < 1 ||
    input.locator.href.length === 0 ||
    input.locator.type.length === 0 ||
    (input.displayProgression !== null &&
      (!Number.isFinite(input.displayProgression) ||
        input.displayProgression < 0 ||
        input.displayProgression > 1))
  ) {
    throw new Error("Invalid reading_position.v1 value")
  }
  const format = input.format.trim().toUpperCase()
  if (format.length === 0) {
    throw new Error("Invalid reading_position.v1 format")
  }
  return format
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

function positionStateFromRow(
  row: NonNullable<
    Awaited<ReturnType<typeof readLibrarySidecarReadingPosition>>
  >,
): LibrarySidecarPositionState | null {
  if (!row.syncClock) return null
  return {
    domain: "reading_position.v1",
    bookId: row.bookId,
    format: row.format,
    register: {
      clock: row.syncClock,
      value: {
        locator: JSON.parse(row.locatorJson) as ReaderLocator,
        displayProgression: row.displayProgression,
      },
    },
  }
}

async function writePositionProjection(
  tx: LibrarySidecarSyncTransaction,
  state: LibrarySidecarPositionState,
): Promise<void> {
  await writeLibrarySidecarReadingPosition(tx, {
    bookId: state.bookId,
    format: state.format,
    locatorJson: JSON.stringify(state.register.value.locator),
    displayProgression: state.register.value.displayProgression,
    updatedAt: Number(parseLibrarySidecarHlc(state.register.clock).physicalMs),
    syncClock: state.register.clock,
  })
}

export async function writeLocalReadingPosition(
  library: Library,
  input: ReadingPositionInput,
  nowMs = Date.now(),
): Promise<void> {
  const identity = await ensureLibrarySidecarIdentity(library)
  const format = validateReadingPositionInput(input)
  const clock = await withLibrarySidecarSyncTransaction(library, async (tx) => {
    const persisted = persistedHlcState(await readLibrarySidecarHlcState(tx))
    const next = nextLibrarySidecarHlc(
      persisted,
      BigInt(nowMs),
      identity.replicaId,
    )
    const clock = formatLibrarySidecarHlc(next)
    const state: LibrarySidecarPositionState = {
      domain: "reading_position.v1",
      bookId: input.bookId,
      format,
      register: {
        clock,
        value: {
          locator: input.locator,
          displayProgression: input.displayProgression,
        },
      },
    }
    await writePositionProjection(tx, state)
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
  console.info("[reading-sync] progress:local-write", {
    libraryId: library.id,
    libraryUuid: identity.libraryUuid,
    replicaId: identity.replicaId,
    bookId: input.bookId,
    format,
    clock,
    href: input.locator.href,
    position: input.locator.locations?.position ?? null,
    totalProgression: input.locator.locations?.totalProgression ?? null,
    displayProgression: input.displayProgression,
  })
}

export async function applyReadingPositionChange(
  tx: LibrarySidecarSyncTransaction,
  segment: LibrarySidecarSegment,
  change: LibrarySidecarChange,
): Promise<void> {
  if (change.state.domain !== "reading_position.v1") {
    throw new Error(
      `Unsupported reading position domain: ${change.state.domain}`,
    )
  }
  const incoming = change.state
  const currentRow = await readLibrarySidecarReadingPosition(
    tx,
    incoming.bookId,
    incoming.format,
  )
  const current = currentRow ? positionStateFromRow(currentRow) : null
  const merged = current
    ? (mergeLibrarySidecarState(
        current,
        incoming,
      ) as LibrarySidecarPositionState)
    : incoming
  console.info("[reading-sync] projection:merge", {
    sourceReplicaId: segment.replicaId,
    sequence: segment.sequence,
    changeId: change.changeId,
    bookId: incoming.bookId,
    format: incoming.format,
    currentClock: current?.register.clock ?? null,
    incomingClock: incoming.register.clock,
    selectedClock: merged.register.clock,
    selectedSource:
      merged.register.clock === incoming.register.clock ? "remote" : "local",
    href: merged.register.value.locator.href,
    position: merged.register.value.locator.locations?.position ?? null,
    totalProgression:
      merged.register.value.locator.locations?.totalProgression ?? null,
    displayProgression: merged.register.value.displayProgression,
  })
  await writePositionProjection(tx, merged)
}
