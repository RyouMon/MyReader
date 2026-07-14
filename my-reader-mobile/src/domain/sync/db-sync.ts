import {
  ensureLibrarySidecarDirectory,
  librarySidecarRootUri,
  usesIosContainerSidecar,
} from "@/src/services/fs/library-paths"
import {
  listReaderBookmarksAtOrAfter,
  upsertReaderBookmarkIfNewer,
} from "../../repos/bookmarks"
import {
  listReadingProgressAtOrAfter,
  upsertReadingProgressIfNewer,
} from "../../repos/reading-progress"
import { getSyncMeta, setSyncMeta } from "../../repos/sync_meta"
import { withSecurityScopedLibraryAccess } from "../../services/fs/bookmarks"
import {
  invalidateReaderBookmarks,
  invalidateReadingProgress,
  invalidateRecentlyReadBooks,
} from "../../services/query/invalidate-table"
import type { Library } from "../types"
import {
  advanceDbPushCursor,
  allocateDbChangeSequence,
  buildDbChangeRows,
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
import { getOrCreateDeviceId } from "./device"
import { LocalDirectBackend } from "./local"
import {
  isLocalDirect,
  type ResolvedSyncTarget,
  type SyncBackend,
} from "./resolve"

const dbPushTails = new Map<string, Promise<void>>()

async function withSerializedDbPush<T>(
  scope: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = dbPushTails.get(scope) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => gate)
  dbPushTails.set(scope, tail)

  await previous
  try {
    return await operation()
  } finally {
    release()
    if (dbPushTails.get(scope) === tail) dbPushTails.delete(scope)
  }
}

async function pushDbChanges(
  backend: SyncBackend,
  library: Library,
  deviceId: string,
): Promise<number> {
  return withSerializedDbPush(`${library.id}\u0000${deviceId}`, () =>
    pushDbChangesSerialized(backend, library, deviceId),
  )
}

async function pushDbChangesSerialized(
  backend: SyncBackend,
  library: Library,
  deviceId: string,
): Promise<number> {
  const cursorKey = dbSyncLastPushCursorKey(deviceId)
  const sequenceKey = dbSyncLastLocalSequenceKey(deviceId)
  const [cursorStr, sequenceStr] = await Promise.all([
    getSyncMeta(library, cursorKey),
    getSyncMeta(library, sequenceKey),
  ])
  const cursor = parseDbPushCursor(cursorStr)

  const [readingProgressRows, bookmarkRows] = await Promise.all([
    listReadingProgressAtOrAfter(library, cursor.ts),
    listReaderBookmarksAtOrAfter(library, cursor.ts),
  ])
  const changes = selectPendingDbChanges(
    buildDbChangeRows(readingProgressRows, bookmarkRows),
    cursor,
  )

  if (changes.length === 0) return 0

  const payload = `${changes.map((change) => JSON.stringify(change)).join("\n")}\n`
  const persistedSequence = Number(sequenceStr)
  const seq = allocateDbChangeSequence(
    Number.isFinite(persistedSequence) ? persistedSequence : 0,
  )
  const objectPath = `.myreader/changes/${deviceId}/${seq}.jsonl`

  await backend.writeBytes(objectPath, new TextEncoder().encode(payload))
  await setSyncMeta(library, sequenceKey, String(seq))
  await setSyncMeta(
    library,
    cursorKey,
    serializeDbPushCursor(advanceDbPushCursor(cursor, changes)),
  )

  return changes.length
}

async function mirrorChangesToExternal(
  sidecarBackend: LocalDirectBackend,
  externalBackend: LocalDirectBackend,
  library: Library,
  deviceId: string,
): Promise<number> {
  const mirrorKey = dbSyncLastExternalMirrorSeqKey(deviceId)
  const lastSeqStr = await getSyncMeta(library, mirrorKey)
  const lastSeq = lastSeqStr ? parseInt(lastSeqStr, 10) : 0

  let files: string[]
  try {
    files = await sidecarBackend.listRemote(`.myreader/changes/${deviceId}/`)
  } catch {
    return 0
  }

  const pending = files
    .filter((f) => f.endsWith(".jsonl"))
    .map((name) => ({ name, seq: parseInt(name.replace(/\.jsonl$/, ""), 10) }))
    .filter((f) => f.seq > 0 && f.seq > lastSeq)
    .sort((a, b) => a.seq - b.seq)

  let mirrored = 0
  for (const { name, seq } of pending) {
    const objectPath = `.myreader/changes/${deviceId}/${name}`
    const bytes = await sidecarBackend.readBytes(objectPath)
    await externalBackend.writeBytes(objectPath, bytes)
    await setSyncMeta(library, mirrorKey, String(seq))
    mirrored++
  }

  return mirrored
}

async function pullDbChanges(
  backend: SyncBackend,
  library: Library,
  deviceId: string,
): Promise<number> {
  const deviceDirs = await backend.listRemote(".myreader/changes/")
  if (deviceDirs.length === 0) return 0

  let applied = 0
  let bookmarksChanged = false
  let readingProgressChanged = false

  for (const dir of deviceDirs) {
    const remoteDevice = dir.replace(/\/$/, "")
    if (!remoteDevice || remoteDevice === deviceId) continue

    let files: string[]
    try {
      files = await backend.listRemote(`.myreader/changes/${remoteDevice}/`)
    } catch (err) {
      console.warn(
        `[db-sync] pull: cannot list .myreader/changes/${remoteDevice}/:`,
        err,
      )
      continue
    }

    const pullKey = dbSyncLastPullCursorKey(deviceId, remoteDevice)
    const lastSeqStr = await getSyncMeta(library, pullKey)
    const lastSeq = lastSeqStr ? parseInt(lastSeqStr, 10) : 0

    const sortedFiles = files
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => ({ name: f, seq: parseInt(f.replace(/\.jsonl$/, ""), 10) }))
      .filter((f) => f.seq > 0 && f.seq > lastSeq)
      .sort((a, b) => a.seq - b.seq)

    for (const { name: fileName, seq } of sortedFiles) {
      const filePath = `.myreader/changes/${remoteDevice}/${fileName}`
      const bytes = await backend.readBytes(filePath)
      const text = new TextDecoder().decode(bytes)

      for (const line of text.split("\n")) {
        const trimmed = line.trim()
        if (!trimmed) continue
        let value: unknown
        try {
          value = JSON.parse(trimmed) as unknown
        } catch {
          console.warn(`[db-sync] pull: malformed line in ${filePath}`)
          continue
        }
        const change = parseDbChangeRow(value)
        if (!change) continue

        const progress = parseReadingProgressChange(change)
        if (progress) {
          const appliedProgress = await upsertReadingProgressIfNewer(
            library,
            progress,
          )
          if (!appliedProgress) continue
          readingProgressChanged = true
          applied++
          continue
        }

        const bookmark = parseReaderBookmarkChange(change)
        if (!bookmark) continue

        const appliedBookmark = await upsertReaderBookmarkIfNewer(
          library,
          bookmark,
        )
        if (!appliedBookmark) continue
        bookmarksChanged = true
        applied++
      }

      await setSyncMeta(library, pullKey, String(seq))
    }
  }

  if (bookmarksChanged) {
    await invalidateReaderBookmarks(library.id)
  }
  if (readingProgressChanged) {
    await Promise.all([
      invalidateReadingProgress(library.id),
      invalidateRecentlyReadBooks(library.id),
    ])
  }

  return applied
}

export type DbSyncReport = {
  pushed: number
  pulled: number
}

async function syncDbWithSingleBackend(
  backend: SyncBackend,
  library: Library,
  mode: "push_only" | "pull_only" | "full",
): Promise<DbSyncReport> {
  const deviceId = await getOrCreateDeviceId(library)
  const pushed =
    mode === "pull_only" ? 0 : await pushDbChanges(backend, library, deviceId)
  const pulled =
    mode === "push_only" ? 0 : await pullDbChanges(backend, library, deviceId)
  return { pushed, pulled }
}

async function syncDbIosContainerSidecar(
  library: Library,
  mode: "push_only" | "pull_only" | "full",
): Promise<DbSyncReport> {
  ensureLibrarySidecarDirectory(library)
  const sidecarBackend = new LocalDirectBackend(librarySidecarRootUri(library))
  const deviceId = await getOrCreateDeviceId(library)

  const pushedLocal =
    mode === "pull_only"
      ? 0
      : await pushDbChanges(sidecarBackend, library, deviceId)

  const { result } = await withSecurityScopedLibraryAccess(
    library,
    async (contentRootUri) => {
      const externalBackend = new LocalDirectBackend(contentRootUri)
      const pushedExternal =
        mode === "pull_only"
          ? 0
          : await mirrorChangesToExternal(
              sidecarBackend,
              externalBackend,
              library,
              deviceId,
            )
      const pulled =
        mode === "push_only"
          ? 0
          : await pullDbChanges(externalBackend, library, deviceId)
      return { pushed: pushedLocal + pushedExternal, pulled }
    },
  )

  return result
}

export async function syncDbFromContext(
  library: Library,
  ctx: ResolvedSyncTarget,
  options?: { mode?: "push_only" | "pull_only" | "full" },
): Promise<DbSyncReport> {
  const mode = options?.mode ?? "full"

  if (isLocalDirect(ctx.backend) && usesIosContainerSidecar(library)) {
    return syncDbIosContainerSidecar(library, mode)
  }

  if (isLocalDirect(ctx.backend)) {
    if (!library.securityScopedBookmark) {
      const backend = new LocalDirectBackend(ctx.librarySidecarRootUri)
      return syncDbWithSingleBackend(backend, library, mode)
    }

    const { result } = await withSecurityScopedLibraryAccess(
      library,
      async (resolvedUri) => {
        const backend = new LocalDirectBackend(resolvedUri)
        return syncDbWithSingleBackend(backend, library, mode)
      },
    )

    return result
  }

  return syncDbWithSingleBackend(ctx.backend, library, mode)
}
