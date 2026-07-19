import type { DecorationActivatedEvent } from "@my-reader/readium"

import type { ReaderAnnotation } from "@/src/features/reader/reader-annotations"
import {
  createReaderAnnotationDecorationGroups,
  READER_ANNOTATION_DECORATION_GROUP,
  READER_NOTE_DECORATION_GROUP,
  resolveReaderAnnotationActivation,
} from "./reader-annotation-decorations"

function annotation(note: string | null): ReaderAnnotation {
  return {
    id: "annotation-1",
    bookId: 1,
    format: "EPUB",
    kind: "highlight",
    locator: {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      text: { highlight: "Selected text" },
    },
    color: "green",
    note,
    createdAt: 1,
    updatedAt: 1,
  }
}

function activation(group: string): DecorationActivatedEvent {
  return {
    group,
    decoration: {
      id: "annotation-1",
      locator: annotation("A note").locator,
      style: { type: "highlight" },
    },
  }
}

describe("reader annotation decorations", () => {
  it("should create a note marker only when the annotation has note text", () => {
    const groups = createReaderAnnotationDecorationGroups(
      [annotation("A note"), { ...annotation("  "), id: "annotation-2" }],
      "Open note",
    )

    expect(groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: READER_NOTE_DECORATION_GROUP,
          decorations: [
            expect.objectContaining({
              id: "annotation-1",
              style: expect.objectContaining({
                type: "myreader-note-marker",
                tint: "#5F8468",
              }),
              extras: { accessibilityLabel: "Open note" },
            }),
          ],
        }),
      ]),
    )
  })

  it("should open the normal menu when note-bearing highlight text is tapped", () => {
    expect(
      resolveReaderAnnotationActivation(
        activation(READER_ANNOTATION_DECORATION_GROUP),
        [annotation("A note")],
      ),
    ).toMatchObject({ target: "menu" })
  })

  it("should open the note only when its marker is tapped", () => {
    expect(
      resolveReaderAnnotationActivation(
        activation(READER_NOTE_DECORATION_GROUP),
        [annotation("A note")],
      ),
    ).toMatchObject({ target: "note" })
    expect(
      resolveReaderAnnotationActivation(
        activation(READER_NOTE_DECORATION_GROUP),
        [annotation(null)],
      ),
    ).toBeNull()
  })
})
