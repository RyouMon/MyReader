jest.mock("@my-reader/book-transition", () => ({
  getNativePresentedViewFrame: jest.fn(() => null),
  isNativeReduceMotionEnabled: jest.fn(() => false),
  startNativeBookTransition: jest.fn(() => false),
}))

jest.mock("expo-image", () => ({
  Image: {
    getCachePathAsync: jest.fn(() => Promise.resolve("/tmp/cover-cache.jpg")),
    prefetch: jest.fn(() => Promise.resolve(true)),
  },
}))

import * as BookTransition from "@my-reader/book-transition"
import { Image as ExpoImage } from "expo-image"
import { Appearance, type View as RNView } from "react-native"

import { defaultSettings } from "@/src/store/app-store.constants"
import { READER_THEMES } from "@/src/design/reader-tokens"
import { useAppStore } from "@/src/store/app-store"

import {
  canStartReaderOpenTransition,
  clearActiveReaderOpenTransition,
  getActiveReaderOpenTransition,
  getReaderTransitionPresentedViewFrame,
  measureReaderTransitionFrame,
  primeReaderCoverCache,
  setReaderCloseTransition,
  setReaderOpenTransition,
  setReaderTransitionRootNode,
  subscribeReaderOpenTransition,
  takeReaderOpenTransition,
} from "./reader-open-transition"

async function flushPromises() {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve()
  }
}

function measuredNode(
  x: number,
  y: number,
  width: number,
  height: number,
): RNView {
  return {
    measureInWindow: (
      callback: (x: number, y: number, width: number, height: number) => void,
    ) => callback(x, y, width, height),
  } as unknown as RNView
}

describe("reader open transition", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Date, "now").mockReturnValue(1000)
    jest.spyOn(console, "info").mockImplementation(() => {})
    jest.mocked(BookTransition.startNativeBookTransition).mockReturnValue(false)
    jest
      .mocked(BookTransition.isNativeReduceMotionEnabled)
      .mockReturnValue(false)
    jest
      .mocked(BookTransition.getNativePresentedViewFrame)
      .mockReturnValue(null)
    jest
      .mocked(ExpoImage.getCachePathAsync)
      .mockResolvedValue("/tmp/cover-cache.jpg")
    jest.mocked(ExpoImage.prefetch).mockResolvedValue(true)
    useAppStore.setState({ settings: defaultSettings })
    setReaderTransitionRootNode(null)
    clearActiveReaderOpenTransition()
    takeReaderOpenTransition("unused")
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("should return matching transition once when book id matches", () => {
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

  it("should ignore transition when it is stale", () => {
    setReaderOpenTransition({
      bookId: "1",
      coverUri: undefined,
      title: "Book",
      frame: { x: 10, y: 20, width: 100, height: 140 },
    })

    jest.mocked(Date.now).mockReturnValue(2601)

    expect(takeReaderOpenTransition("1")).toBeNull()
  })

  it("should create close transition when open target exists", () => {
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

  it("should not create close transition when open target is missing", () => {
    expect(setReaderCloseTransition("missing")).toBeNull()
    expect(getActiveReaderOpenTransition()).toBeNull()
  })

  it("should resolve fixed auto background when app theme is forced", () => {
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

  it("should resolve fixed auto background when app theme follows system", () => {
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

  it("should use reflowable theme colors when format is EPUB", () => {
    useAppStore.setState({
      settings: {
        ...defaultSettings,
        reflowable: {
          ...defaultSettings.reflowable,
          theme: "paper",
        },
      },
    })

    setReaderOpenTransition({
      bookId: "epub",
      format: "epub",
      coverUri: undefined,
      title: "Book",
      frame: { x: 10, y: 20, width: 100, height: 140 },
    })

    expect(takeReaderOpenTransition("epub")).toMatchObject({
      readerBackgroundColor: READER_THEMES.paper.bg,
      readerForegroundColor: READER_THEMES.paper.fg,
    })
  })

  it("should keep JS overlay inactive when native transition starts", () => {
    jest.mocked(BookTransition.startNativeBookTransition).mockReturnValue(true)

    setReaderOpenTransition({
      bookId: "native",
      format: "PDF",
      coverUri: "file:///cover.jpg",
      sourceViewTag: 42,
      title: "Native Book",
      frame: { x: 10, y: 20, width: 100, height: 140 },
      screenWidth: 300,
      screenHeight: 600,
      rootX: 2,
      rootY: 4,
    })

    expect(BookTransition.startNativeBookTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: "native",
        direction: "open",
        durationMs: 360,
        rootX: 2,
        rootY: 4,
        screenHeight: 600,
        screenWidth: 300,
        sourceViewTag: 42,
      }),
    )
    expect(getActiveReaderOpenTransition()).toBeNull()
    expect(takeReaderOpenTransition("native")).toMatchObject({
      nativeStarted: true,
    })
  })

  it("should use prefetched cover cache when headers are available", async () => {
    const coverUri = {
      uri: "https://dav.example/cover.jpg",
      headers: { Authorization: "Bearer token" },
    }
    primeReaderCoverCache(coverUri)
    await flushPromises()

    setReaderOpenTransition({
      bookId: "cover",
      coverUri,
      title: "Book",
      frame: { x: 10, y: 20, width: 100, height: 140 },
    })

    expect(ExpoImage.prefetch).toHaveBeenCalledWith(
      "https://dav.example/cover.jpg",
      {
        cachePolicy: "memory-disk",
        headers: { Authorization: "Bearer token" },
      },
    )
    expect(takeReaderOpenTransition("cover")).toMatchObject({
      coverCachePath: "file:///tmp/cover-cache.jpg",
      coverHeaders: { Authorization: "Bearer token" },
      coverImageUri: "https://dav.example/cover.jpg",
    })
  })

  it("should measure relative frames when transition root changes", () => {
    const node = measuredNode(20, 30, 100, 140)
    const screenCallback = jest.fn()
    measureReaderTransitionFrame(node, { borderRadius: 8 }, screenCallback)

    expect(screenCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        frame: { x: 20, y: 30, width: 100, height: 140, borderRadius: 8 },
        rootX: 0,
        rootY: 0,
      }),
    )

    setReaderTransitionRootNode(measuredNode(5, 10, 300, 600))
    const rootCallback = jest.fn()
    measureReaderTransitionFrame(node, rootCallback)

    expect(rootCallback).toHaveBeenCalledWith({
      frame: { x: 15, y: 20, width: 100, height: 140 },
      rootX: 5,
      rootY: 10,
      screenHeight: 600,
      screenWidth: 300,
    })
  })

  it("should reject pending transition when id or frame is invalid", () => {
    setReaderOpenTransition({
      bookId: "invalid",
      coverUri: undefined,
      title: "Book",
      frame: { x: 10, y: 20, width: 0, height: 140 },
    })

    expect(takeReaderOpenTransition("other")).toBeNull()
    expect(takeReaderOpenTransition("invalid")).toBeNull()
  })

  it("should emit active transition changes when subscriber is registered", () => {
    const listener = jest.fn()
    const unsubscribe = subscribeReaderOpenTransition(listener)

    clearActiveReaderOpenTransition()
    unsubscribe()
    clearActiveReaderOpenTransition()

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("should guard reader transition start when download state is not ready", () => {
    expect(canStartReaderOpenTransition("notDownloaded")).toBe(false)
    expect(canStartReaderOpenTransition("downloading")).toBe(false)
    expect(canStartReaderOpenTransition(undefined, true)).toBe(false)
    expect(canStartReaderOpenTransition("downloaded", true)).toBe(true)
    expect(canStartReaderOpenTransition(undefined, false)).toBe(true)
  })

  it("should return native presented frame when bridge has one", () => {
    jest.mocked(BookTransition.getNativePresentedViewFrame).mockReturnValue({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    })

    expect(getReaderTransitionPresentedViewFrame()).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    })
  })
})
