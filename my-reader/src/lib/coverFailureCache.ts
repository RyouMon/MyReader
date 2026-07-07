import { resetCoverObjectUrlCache } from "./coverObjectUrlCache"

export type CoverFailureKind = "expected" | "probe"

const brokenCoverKeys = new Set<string>()
const listeners = new Set<() => void>()
let revision = 0

function emitCoverFailureChange() {
  revision += 1
  for (const listener of listeners) {
    listener()
  }
}

export function getCoverFailureKey({
  libraryId,
  bookPath,
  kind,
}: {
  libraryId: string | null
  bookPath: string
  kind: CoverFailureKind
}) {
  return `${libraryId ?? "no-library"}:${bookPath}:${kind}`
}

export function isBrokenCover(key: string) {
  return brokenCoverKeys.has(key)
}

export function markBrokenCover(key: string) {
  if (brokenCoverKeys.has(key)) return
  brokenCoverKeys.add(key)
  emitCoverFailureChange()
}

export function resetBrokenCovers() {
  const didResetObjectUrls = resetCoverObjectUrlCache()
  if (brokenCoverKeys.size === 0 && !didResetObjectUrls) return
  brokenCoverKeys.clear()
  emitCoverFailureChange()
}

export function subscribeCoverFailures(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getCoverFailuresRevision() {
  return revision
}
