import type { ReaderAnnotationColor } from "@my-reader/tools/reader-annotations"
import {
  canonicalizeReaderAnnotationLocator,
  sortReaderAnnotations,
} from "@my-reader/tools/reader-annotations"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { Library } from "@/src/domain/types"
import {
  addReaderAnnotation as addCoreReaderAnnotation,
  listReaderAnnotations as listCoreReaderAnnotations,
  type ReaderAnnotation,
  removeReaderAnnotation as removeCoreReaderAnnotation,
  updateReaderAnnotation as updateCoreReaderAnnotation,
} from "@/src/services/core/reading"

export type { ReaderAnnotation } from "@/src/services/core/reading"

export async function listReaderAnnotations(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReaderAnnotation[]> {
  return sortReaderAnnotations(
    (await listCoreReaderAnnotations(library, bookId, format)).map(
      (annotation) => ({
        ...annotation,
        locator: canonicalizeReaderAnnotationLocator(annotation.locator),
      }),
    ),
  )
}

export async function addReaderAnnotation(
  library: Library,
  bookId: number,
  format: string,
  locator: ReaderLocator,
  color: ReaderAnnotationColor,
  note?: string | null,
): Promise<ReaderAnnotation> {
  const canonicalLocator = canonicalizeReaderAnnotationLocator(locator)
  return addCoreReaderAnnotation(
    library,
    bookId,
    format.toUpperCase(),
    canonicalLocator,
    color,
    note ?? null,
  )
}

export async function updateReaderAnnotation(
  library: Library,
  annotation: ReaderAnnotation,
  color: ReaderAnnotationColor,
  note?: string | null,
): Promise<ReaderAnnotation> {
  return updateCoreReaderAnnotation(
    library,
    annotation.bookId,
    annotation.format,
    annotation.id,
    color,
    note ?? null,
  )
}

export async function removeReaderAnnotation(
  library: Library,
  annotation: ReaderAnnotation,
): Promise<void> {
  await removeCoreReaderAnnotation(
    library,
    annotation.bookId,
    annotation.format,
    annotation.id,
  )
}
