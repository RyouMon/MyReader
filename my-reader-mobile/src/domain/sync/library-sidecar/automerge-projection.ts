import {
  writeLibrarySidecarAnnotation,
  writeLibrarySidecarBookmark,
  writeLibrarySidecarFavorite,
  writeLibrarySidecarReadingCompletion,
  writeLibrarySidecarReadingSession,
  type LibrarySidecarSyncTransaction,
} from "@/src/repos/library-sidecar-sync"
import {
  librarySidecarAnnotationProjections,
  librarySidecarBookmarkProjections,
  librarySidecarFavoriteProjections,
  librarySidecarReadingCompletionProjections,
  librarySidecarReadingSessionProjections,
  type LibrarySidecarDocument,
} from "./automerge-document"
import { projectLibrarySidecarReadingPositions } from "./reading-position"

export async function projectLibrarySidecarAutomergeDocument(
  tx: LibrarySidecarSyncTransaction,
  document: LibrarySidecarDocument,
): Promise<void> {
  await projectLibrarySidecarReadingPositions(tx, document)
  for (const projection of librarySidecarFavoriteProjections(document)) {
    await writeLibrarySidecarFavorite(tx, {
      bookId: projection.bookId,
      addedAt: projection.value.addedAt ?? projection.value.recordedAt,
      isFavorite: projection.value.isFavorite,
    })
  }
  for (const bookmark of librarySidecarBookmarkProjections(document)) {
    await writeLibrarySidecarBookmark(tx, {
      id: bookmark.id,
      bookId: bookmark.bookId,
      format: bookmark.format,
      locatorKey: bookmark.locatorKey,
      locatorJson: bookmark.locatorJson,
      createdAt: bookmark.createdAt,
      updatedAt: bookmark.recordedAt,
      deletedAt: bookmark.deletedAt,
    })
  }
  for (const annotation of librarySidecarAnnotationProjections(document)) {
    await writeLibrarySidecarAnnotation(tx, {
      id: annotation.id,
      bookId: annotation.bookId,
      format: annotation.format,
      kind: annotation.kind,
      locatorJson: annotation.locatorJson,
      color: annotation.color,
      note: annotation.note,
      createdAt: annotation.createdAt,
      updatedAt: annotation.updatedAt,
      deletedAt: annotation.deletedAt,
    })
  }
  for (const session of librarySidecarReadingSessionProjections(document)) {
    await writeLibrarySidecarReadingSession(tx, session)
  }
  for (const completion of librarySidecarReadingCompletionProjections(
    document,
  )) {
    await writeLibrarySidecarReadingCompletion(tx, completion)
  }
}
