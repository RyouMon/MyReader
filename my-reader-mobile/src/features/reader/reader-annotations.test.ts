import type { Locator } from "@my-reader/readium"
import { canonicalizeReaderAnnotationLocator } from "@my-reader/tools/reader-annotations"
import type { Library } from "@/src/domain/types"
import {
  addReaderAnnotation as addCoreReaderAnnotation,
  listReaderAnnotations as listCoreReaderAnnotations,
  removeReaderAnnotation as removeCoreReaderAnnotation,
  updateReaderAnnotation as updateCoreReaderAnnotation,
} from "@/src/services/core/reading"
import {
  addReaderAnnotation,
  listReaderAnnotations,
  type ReaderAnnotation,
  removeReaderAnnotation,
  updateReaderAnnotation,
} from "./reader-annotations"

jest.mock("@/src/services/core/reading", () => ({
  addReaderAnnotation: jest.fn(),
  listReaderAnnotations: jest.fn(),
  removeReaderAnnotation: jest.fn(),
  updateReaderAnnotation: jest.fn(),
}))

const library = { id: "library-1" } as Library
const locator: Locator = {
  href: "OPS/chapter.xhtml#section",
  type: "application/xhtml+xml",
  locations: { progression: 0.2, position: 3 },
  text: { highlight: "Selected text" },
}

function row(overrides: Partial<ReaderAnnotation> = {}): ReaderAnnotation {
  return {
    id: "annotation-id",
    bookId: 7,
    format: "EPUB",
    kind: "highlight",
    locator: canonicalizeReaderAnnotationLocator(locator),
    color: "yellow",
    note: null,
    createdAt: 10,
    updatedAt: 20,
    ...overrides,
  }
}

describe("reader annotations", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should persist selected EPUB text as a canonical local annotation", async () => {
    jest
      .mocked(addCoreReaderAnnotation)
      .mockImplementation(
        async (_library, bookId, format, value, color, note) => ({
          id: "annotation-id",
          bookId,
          format,
          kind: "highlight",
          locator: value,
          color,
          note: note?.trim() || null,
          createdAt: 10,
          updatedAt: 10,
        }),
      )

    const annotation = await addReaderAnnotation(
      library,
      7,
      "epub",
      locator,
      "yellow",
      "  A note  ",
    )

    expect(annotation).toMatchObject({
      id: "annotation-id",
      format: "EPUB",
      note: "A note",
      locator: { href: "OPS/chapter.xhtml" },
    })
    expect(addCoreReaderAnnotation).toHaveBeenCalledWith(
      library,
      7,
      "EPUB",
      expect.objectContaining({
        href: "OPS/chapter.xhtml",
      }),
      "yellow",
      "  A note  ",
    )
  })

  it("should preserve the locator while updating color and note", async () => {
    jest.mocked(updateCoreReaderAnnotation).mockResolvedValue(
      row({
        color: "green",
        note: "Updated",
        updatedAt: 21,
      }),
    )
    jest.mocked(listCoreReaderAnnotations).mockResolvedValue([row()])
    const [annotation] = await listReaderAnnotations(library, 7, "EPUB")

    const updated = await updateReaderAnnotation(
      library,
      annotation!,
      "green",
      "Updated",
    )

    expect(updated.locator).toEqual(annotation?.locator)
    expect(updated).toMatchObject({ color: "green", note: "Updated" })
  })

  it("should tombstone an annotation when removing it", async () => {
    jest.mocked(removeCoreReaderAnnotation).mockResolvedValue(undefined)
    const annotation = row()

    await removeReaderAnnotation(library, annotation)

    expect(removeCoreReaderAnnotation).toHaveBeenCalledWith(
      library,
      7,
      "EPUB",
      "annotation-id",
    )
  })
})
