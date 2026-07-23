import type {
  LibrarySidecarAnnotationState,
  LibrarySidecarAnnotationTombstone,
  LibrarySidecarBookmarkState,
  LibrarySidecarFavoriteState,
  LibrarySidecarLww,
  LibrarySidecarPositionState,
  LibrarySidecarReadingCompletionState,
  LibrarySidecarReadingSessionState,
  LibrarySidecarState,
} from "./contract"
import { compareLibrarySidecarHlc, LibrarySidecarContractError } from "./hlc"

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`
  }
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`
}

function assertSameIdentity(
  left: unknown,
  right: unknown,
  domain: string,
): void {
  if (canonicalJson(left) !== canonicalJson(right)) {
    throw new LibrarySidecarContractError(
      `${domain} immutable identity does not match`,
    )
  }
}

export function mergeLibrarySidecarLww<T>(
  left: LibrarySidecarLww<T>,
  right: LibrarySidecarLww<T>,
): LibrarySidecarLww<T> {
  const order = compareLibrarySidecarHlc(left.clock, right.clock)
  if (order < 0) return right
  if (order > 0) return left
  if (canonicalJson(left.value) !== canonicalJson(right.value)) {
    throw new LibrarySidecarContractError(
      "equal HLC values must have identical payloads",
    )
  }
  return left
}

function mergeFavorite(
  left: LibrarySidecarFavoriteState,
  right: LibrarySidecarFavoriteState,
): LibrarySidecarFavoriteState {
  assertSameIdentity(left.bookId, right.bookId, left.domain)
  return {
    ...left,
    register: mergeLibrarySidecarLww(left.register, right.register),
  }
}

function mergePosition(
  left: LibrarySidecarPositionState,
  right: LibrarySidecarPositionState,
): LibrarySidecarPositionState {
  assertSameIdentity(
    [left.bookId, left.format],
    [right.bookId, right.format],
    left.domain,
  )
  return {
    ...left,
    register: mergeLibrarySidecarLww(left.register, right.register),
  }
}

function mergeBookmark(
  left: LibrarySidecarBookmarkState,
  right: LibrarySidecarBookmarkState,
): LibrarySidecarBookmarkState {
  assertSameIdentity(
    [left.bookId, left.format, left.locatorKey],
    [right.bookId, right.format, right.locatorKey],
    left.domain,
  )
  return {
    ...left,
    register: mergeLibrarySidecarLww(left.register, right.register),
  }
}

function mergeTombstone(
  left: LibrarySidecarAnnotationTombstone | null,
  right: LibrarySidecarAnnotationTombstone | null,
): LibrarySidecarAnnotationTombstone | null {
  if (left === null) return right
  if (right === null) return left
  const order = compareLibrarySidecarHlc(left.clock, right.clock)
  if (order < 0) return right
  if (order > 0) return left
  if (left.deletedAtMs !== right.deletedAtMs) {
    throw new LibrarySidecarContractError(
      "equal tombstone HLC values must have identical timestamps",
    )
  }
  return left
}

function mergeAnnotation(
  left: LibrarySidecarAnnotationState,
  right: LibrarySidecarAnnotationState,
): LibrarySidecarAnnotationState {
  assertSameIdentity(
    [left.id, left.header],
    [right.id, right.header],
    left.domain,
  )
  return {
    ...left,
    color: mergeLibrarySidecarLww(left.color, right.color),
    note: mergeLibrarySidecarLww(left.note, right.note),
    tombstone: mergeTombstone(left.tombstone, right.tombstone),
  }
}

function mergeReadingSession(
  left: LibrarySidecarReadingSessionState,
  right: LibrarySidecarReadingSessionState,
): LibrarySidecarReadingSessionState {
  assertSameIdentity(
    [left.id, left.header],
    [right.id, right.header],
    left.domain,
  )
  return {
    ...left,
    durationSeconds: Math.max(left.durationSeconds, right.durationSeconds),
  }
}

function mergeReadingCompletion(
  left: LibrarySidecarReadingCompletionState,
  right: LibrarySidecarReadingCompletionState,
): LibrarySidecarReadingCompletionState {
  assertSameIdentity(left.bookId, right.bookId, left.domain)
  if (left.id === right.id) {
    assertSameIdentity(left, right, left.domain)
    return left
  }
  if (left.completedAtMs !== right.completedAtMs) {
    return left.completedAtMs < right.completedAtMs ? left : right
  }
  return left.id < right.id ? left : right
}

export function mergeLibrarySidecarState(
  left: LibrarySidecarState,
  right: LibrarySidecarState,
): LibrarySidecarState {
  if (left.domain !== right.domain) {
    throw new LibrarySidecarContractError("cannot merge different domains")
  }
  switch (left.domain) {
    case "book_favorite.v1":
      return mergeFavorite(left, right as LibrarySidecarFavoriteState)
    case "reading_position.v1":
      return mergePosition(left, right as LibrarySidecarPositionState)
    case "bookmark.v1":
      return mergeBookmark(left, right as LibrarySidecarBookmarkState)
    case "annotation.v1":
      return mergeAnnotation(left, right as LibrarySidecarAnnotationState)
    case "reading_session.v1":
      return mergeReadingSession(
        left,
        right as LibrarySidecarReadingSessionState,
      )
    case "reading_completion.v1":
      return mergeReadingCompletion(
        left,
        right as LibrarySidecarReadingCompletionState,
      )
  }
}

export function assertLibrarySidecarWriter(
  state: LibrarySidecarState,
  replicaId: string,
): void {
  if (
    state.domain === "reading_session.v1" &&
    state.header.originReplicaId !== replicaId
  ) {
    throw new LibrarySidecarContractError(
      "reading session updates must come from the origin replica",
    )
  }
}
