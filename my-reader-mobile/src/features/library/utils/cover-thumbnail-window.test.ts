import type { BookItem } from "@/src/domain/types"

import {
  resolveCoverThumbnailBookIds,
  resolveInitialCoverThumbnailBookIds,
} from "./cover-thumbnail-window"

function book(id: string, coverUri = `file:///covers/${id}.jpg`): BookItem {
  return {
    id,
    author: `Author ${id}`,
    formats: [],
    timestamp: null,
    title: `Book ${id}`,
    coverUri,
  }
}

describe("resolveCoverThumbnailBookIds", () => {
  it("queues visible books with covers", () => {
    const visibleBooks = [
      book("0"),
      book("1"),
      { ...book("2"), coverUri: undefined },
      book("3"),
      book("4"),
    ]

    expect(
      Array.from(
        resolveCoverThumbnailBookIds({
          visibleBooks,
          viewableItems: [{ item: visibleBooks[1]!, index: 1 }],
          lookaroundItemCount: 0,
        }),
      ),
    ).toEqual(["1"])
  })

  it("can include nearby books when a caller explicitly asks for lookaround", () => {
    const visibleBooks = [
      book("0"),
      book("1"),
      { ...book("2"), coverUri: undefined },
      book("3"),
      book("4"),
    ]

    expect(
      Array.from(
        resolveCoverThumbnailBookIds({
          visibleBooks,
          viewableItems: [{ item: visibleBooks[2]!, index: 2 }],
          lookaroundItemCount: 1,
        }),
      ),
    ).toEqual(["1", "3"])
  })

  it("ignores non-viewable change tokens", () => {
    const visibleBooks = [book("0"), book("1"), book("2")]

    expect(
      resolveCoverThumbnailBookIds({
        visibleBooks,
        viewableItems: [
          { item: visibleBooks[1]!, index: 1, isViewable: false },
        ],
        lookaroundItemCount: 1,
      }).size,
    ).toBe(0)
  })

  it("falls back to the token item when FlashList does not provide an index", () => {
    const visibleBooks = [book("0"), book("1")]

    expect(
      Array.from(
        resolveCoverThumbnailBookIds({
          visibleBooks,
          viewableItems: [{ item: book("detached"), index: null }],
          lookaroundItemCount: 1,
        }),
      ),
    ).toEqual(["detached"])
  })
})

describe("resolveInitialCoverThumbnailBookIds", () => {
  it("queues only the bounded first screen candidates", () => {
    const visibleBooks = [
      book("0"),
      { ...book("1"), coverUri: undefined },
      book("2"),
      book("3"),
    ]

    expect(
      Array.from(
        resolveInitialCoverThumbnailBookIds({
          visibleBooks,
          itemCount: 3,
        }),
      ),
    ).toEqual(["0", "2"])
  })
})
