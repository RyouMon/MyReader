import { Appearance } from "react-native"

import { defaultSettings } from "@/src/store/app-store.constants"
import { useAppStore } from "@/src/store/app-store"

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
    useAppStore.setState({ settings: defaultSettings })
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

  it("resolves fixed auto background from the forced app theme", () => {
    useAppStore.setState({
      settings: {
        ...defaultSettings,
        themeMode: "dark",
        fixed: { ...defaultSettings.fixed, background: "auto" },
      },
    })

    setReaderOpenTransition({
      bookId: "1",
      format: "PDF",
      coverUri: undefined,
      title: "Book",
      frame: { x: 10, y: 20, width: 100, height: 140 },
    })

    expect(takeReaderOpenTransition("1")).toMatchObject({
      readerBackgroundColor: "#000000",
      readerForegroundColor: "#D4CBC3",
    })
  })

  it("resolves fixed auto background from the system theme", () => {
    jest.spyOn(Appearance, "getColorScheme").mockReturnValue("dark")
    useAppStore.setState({
      settings: {
        ...defaultSettings,
        themeMode: "system",
        fixed: { ...defaultSettings.fixed, background: "auto" },
      },
    })

    setReaderOpenTransition({
      bookId: "1",
      format: "PDF",
      coverUri: undefined,
      title: "Book",
      frame: { x: 10, y: 20, width: 100, height: 140 },
    })

    expect(takeReaderOpenTransition("1")).toMatchObject({
      readerBackgroundColor: "#000000",
      readerForegroundColor: "#D4CBC3",
    })
  })
})
