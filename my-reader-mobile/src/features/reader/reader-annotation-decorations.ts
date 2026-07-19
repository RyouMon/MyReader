import type {
  DecorationActivatedEvent,
  DecorationGroup,
} from "@my-reader/readium"
import { readerAnnotationTint } from "@my-reader/tools/reader-annotations"

import type { ReaderAnnotation } from "@/src/features/reader/reader-annotations"

export const READER_ANNOTATION_DECORATION_GROUP = "annotations"
export const READER_NOTE_DECORATION_GROUP = "annotation-notes"

export type ReaderAnnotationActivation = {
  annotation: ReaderAnnotation
  target: "menu" | "note"
}

export function readerAnnotationHasNote(
  annotation: Pick<ReaderAnnotation, "note">,
): boolean {
  return Boolean(annotation.note?.trim())
}

export function createReaderAnnotationDecorationGroups(
  annotations: readonly ReaderAnnotation[],
  noteAccessibilityLabel: string,
): DecorationGroup[] {
  return [
    {
      name: READER_ANNOTATION_DECORATION_GROUP,
      decorations: annotations.map((annotation) => ({
        id: annotation.id,
        locator: annotation.locator,
        style: {
          type: "highlight",
          tint: readerAnnotationTint(annotation.color),
          isActive: false,
        },
      })),
    },
    {
      name: READER_NOTE_DECORATION_GROUP,
      decorations: annotations
        .filter(readerAnnotationHasNote)
        .map((annotation) => ({
          id: annotation.id,
          locator: annotation.locator,
          style: {
            type: "myreader-note-marker",
            tint: readerAnnotationTint(annotation.color),
          },
          extras: { accessibilityLabel: noteAccessibilityLabel },
        })),
    },
  ]
}

export function resolveReaderAnnotationActivation(
  event: Pick<DecorationActivatedEvent, "decoration" | "group">,
  annotations: readonly ReaderAnnotation[],
): ReaderAnnotationActivation | null {
  const annotation = annotations.find((item) => item.id === event.decoration.id)
  if (!annotation) return null

  if (event.group === READER_ANNOTATION_DECORATION_GROUP) {
    return { annotation, target: "menu" }
  }
  if (
    event.group === READER_NOTE_DECORATION_GROUP &&
    readerAnnotationHasNote(annotation)
  ) {
    return { annotation, target: "note" }
  }
  return null
}
