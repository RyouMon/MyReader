import type { Locator } from "@my-reader/readium"

import {
  createReaderAnnotationRow,
  listActiveReaderAnnotationRows,
  tombstoneReaderAnnotationRow,
  updateReaderAnnotationRow,
} from "@/src/repos/annotations"
import type { Library } from "@/src/domain/library/types"
import {
  addReaderAnnotation,
  listReaderAnnotations,
  removeReaderAnnotation,
  updateReaderAnnotation,
} from "./reader-annotations"

jest.mock("@/src/repos/annotations", () => ({
  createReaderAnnotationRow: jest.fn(),
  listActiveReaderAnnotationRows: jest.fn(),
  tombstoneReaderAnnotationRow: jest.fn(),
  updateReaderAnnotationRow: jest.fn(),
}))

jest.mock("@/src/utils/common", () => ({
  uuid: jest.fn(() => "annotation-id"),
}))

const library = { id: "library-1" } as Library
const locator: Locator = {
  href: "OPS/chapter.xhtml#section",
  type: "application/xhtml+xml",
  locations: { progression: 0.2, position: 3 },
  text: { highlight: "Selected text" },
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "annotation-id",
    bookId: 7,
    format: "EPUB",
    kind: "highlight",
    locatorJson: JSON.stringify(locator),
    color: "yellow",
    note: null,
    createdAt: 10,
    updatedAt: 20,
    deletedAt: null,
    ...overrides,
  }
}

describe("reader annotations", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should persist selected EPUB text as a canonical local annotation", async () => {
    jest
      .mocked(createReaderAnnotationRow)
      .mockImplementation(async (_library, patch) => ({
        ...patch,
        createdAt: 10,
        updatedAt: 10,
        deletedAt: null,
      }))

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
    expect(createReaderAnnotationRow).toHaveBeenCalledWith(
      library,
      expect.objectContaining({
        id: "annotation-id",
        format: "EPUB",
        note: "A note",
      }),
    )
  })

  it("should reject annotations without selected text", async () => {
    await expect(
      addReaderAnnotation(
        library,
        7,
        "EPUB",
        { ...locator, text: undefined },
        "yellow",
      ),
    ).rejects.toThrow("selected text")
    expect(createReaderAnnotationRow).not.toHaveBeenCalled()
  })

  it("should preserve the locator while updating color and note", async () => {
    jest.mocked(updateReaderAnnotationRow).mockResolvedValue(
      row({
        color: "green",
        note: "Updated",
        updatedAt: 21,
      }),
    )
    jest.mocked(listActiveReaderAnnotationRows).mockResolvedValue([row()])
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
    jest.mocked(tombstoneReaderAnnotationRow).mockResolvedValue(true)

    await removeReaderAnnotation(library, "annotation-id")

    expect(tombstoneReaderAnnotationRow).toHaveBeenCalledWith(
      library,
      "annotation-id",
    )
  })
})
