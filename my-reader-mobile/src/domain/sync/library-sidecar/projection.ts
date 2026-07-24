import {
  readLibrarySidecarHlcState,
  writeLibrarySidecarHlcState,
  type LibrarySidecarSyncTransaction,
} from "@/src/repos/library-sidecar-sync"
import type { LibrarySidecarChange, LibrarySidecarSegment } from "./contract"
import { applyFavoriteChange } from "./favorite"
import { observeLibrarySidecarHlc, parseLibrarySidecarHlc } from "./hlc"
import { applyReadingPositionChange } from "./reading-position"

function stateClock(change: LibrarySidecarChange): string {
  switch (change.state.domain) {
    case "book_favorite.v1":
    case "reading_position.v1":
      return change.state.register.clock
    default:
      throw new Error(`Unsupported projection domain: ${change.state.domain}`)
  }
}

export async function applyLibrarySidecarSegment(
  tx: LibrarySidecarSyncTransaction,
  segment: LibrarySidecarSegment,
  localReplicaId: string,
  nowMs: number,
): Promise<void> {
  const persisted = await readLibrarySidecarHlcState(tx)
  let localHlc = {
    physicalMs: BigInt(persisted?.physicalMs ?? "0"),
    counter: BigInt(persisted?.counter ?? "0"),
  }

  for (const change of segment.changes) {
    switch (change.state.domain) {
      case "book_favorite.v1":
        await applyFavoriteChange(tx, segment, change)
        break
      case "reading_position.v1":
        await applyReadingPositionChange(tx, segment, change)
        break
      default:
        throw new Error(`Unsupported projection domain: ${change.state.domain}`)
    }

    for (const remoteClock of new Set([change.clock, stateClock(change)])) {
      const observed = observeLibrarySidecarHlc(
        localHlc,
        parseLibrarySidecarHlc(remoteClock),
        BigInt(nowMs),
        localReplicaId,
      )
      localHlc = {
        physicalMs: observed.physicalMs,
        counter: observed.counter,
      }
    }
  }

  await writeLibrarySidecarHlcState(tx, {
    physicalMs: localHlc.physicalMs.toString(),
    counter: localHlc.counter.toString(),
  })
}
