import type { ReaderAnnotationColor } from "@my-reader/tools/reader-annotations"
import {
  canonicalizeReaderAnnotationLocator,
  isReaderAnnotationColor,
  sortReaderAnnotations,
} from "@my-reader/tools/reader-annotations"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"

import { listActiveReaderAnnotationRows } from "@/src/repos/annotations"
import {
  createLocalAnnotation,
  deleteLocalAnnotation,
  updateLocalAnnotation,
} from "@/src/domain/sync/library-sidecar/annotation"
import { uuid } from "@/src/utils/common"
import type { Library } from "@/src/domain/types"

export type ReaderAnnotation = {
  id: string
  bookId: number
  format: string
  kind: "highlight"
  locator: ReaderLocator
  color: ReaderAnnotationColor
  note: string | null
  createdAt: number
  updatedAt: number
}

function parseLocator(locatorJson: string): ReaderLocator | null {
  let value: unknown
  try {
    value = JSON.parse(locatorJson)
  } catch {
    return null
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }
  const locator = value as Partial<ReaderLocator>
  return typeof locator.href === "string" && typeof locator.type === "string"
    ? (locator as ReaderLocator)
    : null
}

function toReaderAnnotation(row: {
  id: string
  bookId: number
  format: string
  kind: string
  locatorJson: string
  color: string
  note: string | null
  createdAt: number
  updatedAt: number
}): ReaderAnnotation | null {
  const locator = parseLocator(row.locatorJson)
  if (
    !locator ||
    row.kind !== "highlight" ||
    !isReaderAnnotationColor(row.color)
  ) {
    return null
  }
  return {
    id: row.id,
    bookId: row.bookId,
    format: row.format,
    kind: row.kind,
    locator: canonicalizeReaderAnnotationLocator(locator),
    color: row.color,
    note: row.note,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  }
}

function normalizedNote(note: string | null | undefined): string | null {
  const value = note?.trim()
  if (value && Array.from(value).length > 4000) {
    throw new Error("Annotation note is too long")
  }
  return value ? value : null
}

export async function listReaderAnnotations(
  library: Library,
  bookId: number,
  format: string,
): Promise<ReaderAnnotation[]> {
  const rows = await listActiveReaderAnnotationRows(library, bookId, format)
  return sortReaderAnnotations(
    rows
      .map(toReaderAnnotation)
      .filter((row): row is ReaderAnnotation => row !== null),
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
  const normalizedFormat = format.toUpperCase()
  if (!["EPUB", "PDF", "CBZ"].includes(normalizedFormat)) {
    throw new Error("Unsupported annotation format")
  }
  const canonicalLocator = canonicalizeReaderAnnotationLocator(locator)
  if (!canonicalLocator.text?.highlight?.trim()) {
    throw new Error("Annotation locator must include selected text")
  }
  const row = await createLocalAnnotation(library, {
    id: uuid(),
    bookId,
    format: normalizedFormat as "EPUB" | "PDF" | "CBZ",
    kind: "highlight",
    locatorJson: JSON.stringify(canonicalLocator),
    color,
    note: normalizedNote(note),
  })
  const annotation = toReaderAnnotation(row)
  if (!annotation) throw new Error("Invalid annotation returned from storage")
  return annotation
}

export async function updateReaderAnnotation(
  library: Library,
  annotation: ReaderAnnotation,
  color: ReaderAnnotationColor,
  note?: string | null,
): Promise<ReaderAnnotation> {
  const row = await updateLocalAnnotation(
    library,
    annotation.id,
    color,
    normalizedNote(note),
  )
  if (!row) throw new Error("Annotation not found")
  const updated = toReaderAnnotation(row)
  if (!updated) throw new Error("Invalid annotation returned from storage")
  return updated
}

export async function removeReaderAnnotation(
  library: Library,
  annotationId: string,
): Promise<void> {
  const removed = await deleteLocalAnnotation(library, annotationId)
  if (!removed) throw new Error("Annotation not found")
}
