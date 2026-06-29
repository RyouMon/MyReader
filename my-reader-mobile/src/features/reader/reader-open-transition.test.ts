import {
  clearActiveReaderOpenTransition,
  getActiveReaderOpenTransition,
  setReaderCloseTransition,
  setReaderOpenTransition,
  takeReaderOpenTransition,
} from "./reader-open-transition"

describe("reader open transition", () => {
  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(1000)
    clearActiveReaderOpenTransition()
    takeReaderOpenTransition("unused")
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("returns a matching transition once", () => {
    setReaderOpenTransition({
      bookId: "1",
      coverUri: "file:///cover.jpg",
      title: "Book",
      frame: { x: 10, y: 20, width: 100, height: 140 },
    })

    expect(takeReaderOpenTransition("1")).toMatchObject({
      bookId: "1",
      title: "Book",
      frame: { x: 10, y: 20, width: 100, height: 140 },
    })
    expect(takeReaderOpenTransition("1")).toBeNull()
  })

  it("ignores stale transitions", () => {
    setReaderOpenTransition({
      bookId: "1",
      coverUri: undefined,
      title: "Book",
      frame: { x: 10, y: 20, width: 100, height: 140 },
    })

    jest.mocked(Date.now).mockReturnValue(2601)

    expect(takeReaderOpenTransition("1")).toBeNull()
  })

  it("creates a close transition from the latest open target", () => {
    setReaderOpenTransition({
      bookId: "1",
      coverUri: "file:///cover.jpg",
      title: "Book",
      frame: { x: 10, y: 20, width: 100, height: 140 },
    })

    expect(setReaderCloseTransition("1")).toMatchObject({
      direction: "close",
      bookId: "1",
    })
    expect(getActiveReaderOpenTransition()).toMatchObject({
      direction: "close",
      bookId: "1",
      title: "Book",
      frame: { x: 10, y: 20, width: 100, height: 140 },
    })
  })

  it("does not create a close transition without an open target", () => {
    expect(setReaderCloseTransition("missing")).toBeNull()
    expect(getActiveReaderOpenTransition()).toBeNull()
  })
})
