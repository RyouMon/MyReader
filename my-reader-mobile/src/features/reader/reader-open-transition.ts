import type { BookItem } from "@/src/domain/types"
import { READER_THEMES } from "@/src/design/reader-tokens"
import { useAppStore } from "@/src/store/app-store"
import type { FixedBackground } from "@/src/store/app-store.types"
import * as BookTransition from "@my-reader/book-transition"
import { Image as ExpoImage } from "expo-image"
import {
  AccessibilityInfo,
  Appearance,
  Dimensions,
  PixelRatio,
  Platform,
  View as RNView,
} from "react-native"

export const READER_BOOK_TRANSITION_MS = 360
export const READER_FADE_TRANSITION_MS = 180

export type ReaderTransitionDownloadStatus =
  | "downloaded"
  | "notDownloaded"
  | "downloading"

export type ReaderOpenTransition = {
  direction: "open" | "close"
  mode?: "book" | "fade"
  bookId: string
  format?: string | null
  coverUri: BookItem["coverUri"]
  coverCachePath?: string | null
  coverImageUri: string | null
  coverHeaders?: Record<string, string> | null
  readerBackgroundColor?: string | null
  readerForegroundColor?: string | null
  title: string
  frame: {
    x: number
    y: number
    width: number
    height: number
    borderRadius?: number
  }
  sourceViewTag?: number | null
  screenWidth?: number
  screenHeight?: number
  rootX?: number
  rootY?: number
  createdAt: number
  nativeStarted?: boolean
  onFinished?: () => void
}

let pendingTransition: ReaderOpenTransition | null = null
let activeTransition: ReaderOpenTransition | null = null
const recentTransitions = new Map<string, ReaderOpenTransition>()
const listeners = new Set<() => void>()
let transitionRootNode: RNView | null = null
let reduceMotionEnabled = false
let didInitializeReduceMotion = false

type CoverUriObject = Exclude<BookItem["coverUri"], string | undefined> & {
  cacheKey?: string
}

type ReaderOpenTransitionInput = Omit<
  ReaderOpenTransition,
  "createdAt" | "coverImageUri" | "direction" | "nativeStarted" | "onFinished"
>

type ReaderOpenTransitionStartInput = Omit<
  ReaderOpenTransitionInput,
  "coverCachePath"
>

function readNativeReduceMotionEnabled() {
  try {
    return BookTransition.isNativeReduceMotionEnabled?.() ?? false
  } catch {
    return false
  }
}

function initializeReduceMotionListener() {
  if (didInitializeReduceMotion) return
  didInitializeReduceMotion = true
  reduceMotionEnabled = readNativeReduceMotionEnabled()

  AccessibilityInfo.isReduceMotionEnabled()
    .then((enabled) => {
      reduceMotionEnabled = enabled
    })
    .catch(() => {
      reduceMotionEnabled = readNativeReduceMotionEnabled()
    })

  AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
    reduceMotionEnabled = enabled
  })
}

function emitChange() {
  listeners.forEach((listener) => listener())
}

function getScreenMetrics() {
  const window = Dimensions.get("window")
  return {
    screenWidth: window.width,
    screenHeight: window.height,
  }
}

function getTransitionMetrics(transition: ReaderOpenTransition) {
  return {
    screenWidth: transition.screenWidth ?? getScreenMetrics().screenWidth,
    screenHeight: transition.screenHeight ?? getScreenMetrics().screenHeight,
    rootX: transition.rootX ?? 0,
    rootY: transition.rootY ?? 0,
  }
}

function getCoverImageUri(coverUri: BookItem["coverUri"]) {
  return typeof coverUri === "string" ? coverUri : (coverUri?.uri ?? null)
}

function getCoverHeaders(coverUri: BookItem["coverUri"]) {
  return typeof coverUri === "string" ? null : (coverUri?.headers ?? null)
}

function getCoverCacheKey(coverUri: BookItem["coverUri"]) {
  if (typeof coverUri === "string") return coverUri
  const source = coverUri as CoverUriObject | undefined
  return source?.cacheKey ?? source?.uri ?? null
}

function normalizeCachePath(path: string | null) {
  if (!path) return null
  return path.startsWith("/") ? `file://${path}` : path
}

function resolveCurrentAppColorScheme() {
  const themeMode = useAppStore.getState().settings.themeMode
  if (themeMode === "dark" || themeMode === "light") return themeMode

  return Appearance.getColorScheme() === "dark" ? "dark" : "light"
}

function resolveFixedReaderVisual(fixedBackground: FixedBackground) {
  const appColorScheme = resolveCurrentAppColorScheme()
  const backgroundColor =
    fixedBackground === "black"
      ? "#000000"
      : fixedBackground === "white"
        ? "#FFFFFF"
        : appColorScheme === "dark"
          ? "#000000"
          : "#FFFFFF"

  return {
    readerBackgroundColor: backgroundColor,
    readerForegroundColor:
      backgroundColor === "#000000" ? "#D4CBC3" : "#2C2420",
  }
}

function resolveReaderVisual(format?: string | null) {
  const settings = useAppStore.getState().settings
  const normalizedFormat = format?.toUpperCase() ?? null
  if (normalizedFormat === "EPUB") {
    const theme = settings.reflowable.theme
    const colors = READER_THEMES[theme] ?? READER_THEMES.neutral
    return {
      readerBackgroundColor: colors.bg,
      readerForegroundColor: colors.fg,
    }
  }

  const fixedBackground = settings.fixed.background
  return resolveFixedReaderVisual(fixedBackground)
}

export async function resolveReaderCoverCachePath(
  coverUri: BookItem["coverUri"],
) {
  const uri = getCoverImageUri(coverUri)
  if (!uri || uri.startsWith("file://")) return null

  try {
    return normalizeCachePath(
      await ExpoImage.getCachePathAsync(getCoverCacheKey(coverUri) ?? uri),
    )
  } catch {
    return null
  }
}

export async function startReaderOpenTransition(
  transition: ReaderOpenTransitionStartInput,
) {
  const coverCachePath = await resolveReaderCoverCachePath(transition.coverUri)
  setReaderOpenTransition({ ...transition, coverCachePath })
}

export function setReaderTransitionRootNode(node: RNView | null) {
  transitionRootNode = node
}

export function measureReaderTransitionFrame(
  node: RNView,
  optionsOrCallback:
    | { borderRadius?: number }
    | ((result: {
        frame: ReaderOpenTransition["frame"]
        screenWidth?: number
        screenHeight?: number
        rootX?: number
        rootY?: number
      }) => void),
  callback: (result: {
    frame: ReaderOpenTransition["frame"]
    screenWidth?: number
    screenHeight?: number
    rootX?: number
    rootY?: number
  }) => void = typeof optionsOrCallback === "function"
    ? optionsOrCallback
    : () => {},
) {
  const options =
    typeof optionsOrCallback === "function" ? undefined : optionsOrCallback
  const rootNode = transitionRootNode
  if (!rootNode) {
    node.measureInWindow((x, y, width, height) => {
      callback({
        frame: { x, y, width, height, borderRadius: options?.borderRadius },
        ...getScreenMetrics(),
        rootX: 0,
        rootY: 0,
      })
    })
    return
  }

  rootNode.measureInWindow((rootX, rootY, rootWidth, rootHeight) => {
    node.measureInWindow((x, y, width, height) => {
      callback({
        frame: {
          x: x - rootX,
          y: y - rootY,
          width,
          height,
          borderRadius: options?.borderRadius,
        },
        screenWidth: rootWidth,
        screenHeight: rootHeight,
        rootX,
        rootY,
      })
    })
  })
}

export function setReaderOpenTransition(transition: ReaderOpenTransitionInput) {
  const coverImageUri = getCoverImageUri(transition.coverUri)
  const coverHeaders = getCoverHeaders(transition.coverUri)
  const coverCachePath = transition.coverCachePath ?? null
  const readerVisual = resolveReaderVisual(transition.format)
  const nextTransition: ReaderOpenTransition = {
    ...transition,
    direction: "open" as const,
    mode: shouldUseFadeTransition() ? "fade" : "book",
    coverCachePath,
    coverImageUri,
    coverHeaders,
    ...readerVisual,
    createdAt: Date.now(),
  }
  const nativeStarted =
    nextTransition.mode === "book"
      ? (BookTransition.startNativeBookTransition?.({
          direction: "open",
          bookId: nextTransition.bookId,
          format: nextTransition.format,
          frame: nextTransition.frame,
          sourceViewTag: nextTransition.sourceViewTag,
          ...getTransitionMetrics(nextTransition),
          coverCachePath: nextTransition.coverCachePath,
          coverImageUri: nextTransition.coverImageUri,
          coverHeaders: nextTransition.coverHeaders,
          readerBackgroundColor: nextTransition.readerBackgroundColor,
          readerForegroundColor: nextTransition.readerForegroundColor,
          title: nextTransition.title,
          durationMs: READER_BOOK_TRANSITION_MS,
        }) ?? false)
      : false
  nextTransition.nativeStarted = nativeStarted
  if (__DEV__) {
    console.info("[ReaderBookTransition] open", {
      nativeStarted,
      platform: Platform.OS,
      pixelRatio: PixelRatio.get(),
      frame: nextTransition.frame,
      sourceViewTag: nextTransition.sourceViewTag,
      ...getTransitionMetrics(nextTransition),
    })
  }
  pendingTransition = nextTransition
  activeTransition = nativeStarted ? null : nextTransition
  recentTransitions.set(nextTransition.bookId, nextTransition)
  emitChange()
}

export function setReaderCloseTransition(
  bookId: string,
  onFinished?: () => void,
  options?: { format?: string | null },
): ReaderOpenTransition | null {
  const recentTransition = recentTransitions.get(bookId)
  if (!recentTransition) return null

  const format = options?.format ?? recentTransition.format
  const readerVisual = resolveReaderVisual(format)
  const nextTransition: ReaderOpenTransition = {
    ...recentTransition,
    direction: "close",
    mode: shouldUseFadeTransition() ? "fade" : recentTransition.mode,
    format,
    ...readerVisual,
    createdAt: Date.now(),
    onFinished,
  }
  const nativeStarted =
    nextTransition.mode === "book"
      ? (BookTransition.startNativeBookTransition?.({
          direction: "close",
          bookId: nextTransition.bookId,
          format: nextTransition.format,
          frame: nextTransition.frame,
          sourceViewTag: nextTransition.sourceViewTag,
          ...getTransitionMetrics(nextTransition),
          coverCachePath: nextTransition.coverCachePath,
          coverImageUri: nextTransition.coverImageUri,
          coverHeaders: nextTransition.coverHeaders,
          readerBackgroundColor: nextTransition.readerBackgroundColor,
          readerForegroundColor: nextTransition.readerForegroundColor,
          title: nextTransition.title,
          durationMs: READER_BOOK_TRANSITION_MS,
        }) ?? false)
      : false
  nextTransition.nativeStarted = nativeStarted
  if (__DEV__) {
    console.info("[ReaderBookTransition] close", {
      nativeStarted,
      platform: Platform.OS,
      pixelRatio: PixelRatio.get(),
      frame: nextTransition.frame,
      sourceViewTag: nextTransition.sourceViewTag,
      ...getTransitionMetrics(nextTransition),
    })
  }
  activeTransition = nativeStarted ? null : nextTransition
  emitChange()
  return nextTransition
}

function shouldUseFadeTransition() {
  initializeReduceMotionListener()
  return reduceMotionEnabled
}

export function canStartReaderOpenTransition(
  downloadStatus?: ReaderTransitionDownloadStatus,
  isRemote = false,
) {
  if (downloadStatus === "notDownloaded" || downloadStatus === "downloading") {
    return false
  }
  return !isRemote || downloadStatus === "downloaded"
}

export function getReaderTransitionPresentedViewFrame() {
  return BookTransition.getNativePresentedViewFrame?.() ?? null
}

export function takeReaderOpenTransition(bookId: string) {
  if (!pendingTransition || pendingTransition.bookId !== bookId) return null

  const transition = pendingTransition
  pendingTransition = null

  if (Date.now() - transition.createdAt > 1500) return null
  if (transition.frame.width <= 0 || transition.frame.height <= 0) return null

  return transition
}

export function getActiveReaderOpenTransition() {
  return activeTransition
}

export function clearActiveReaderOpenTransition() {
  activeTransition = null
  emitChange()
}

export function subscribeReaderOpenTransition(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
