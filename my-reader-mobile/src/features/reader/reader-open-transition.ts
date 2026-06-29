import type { BookItem } from "@/src/domain/types"
import {
  getNativePresentedViewFrame,
  isNativeReduceMotionEnabled,
  startNativeBookTransition,
} from "@my-reader/book-transition"
import { Image as ExpoImage } from "expo-image"
import {
  AccessibilityInfo,
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
  coverUri: BookItem["coverUri"]
  coverCachePath?: string | null
  coverImageUri: string | null
  coverHeaders?: Record<string, string> | null
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
const coverCachePaths = new Map<string, string | null>()
let reduceMotionEnabled = isNativeReduceMotionEnabled()

AccessibilityInfo.isReduceMotionEnabled()
  .then((enabled) => {
    reduceMotionEnabled = enabled
  })
  .catch(() => {
    reduceMotionEnabled = false
  })

AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
  reduceMotionEnabled = enabled
})

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

function normalizeCachePath(path: string | null) {
  if (!path) return null
  return path.startsWith("/") ? `file://${path}` : path
}

export function primeReaderCoverCache(coverUri: BookItem["coverUri"]) {
  const uri = getCoverImageUri(coverUri)
  if (!uri || coverCachePaths.has(uri)) return

  coverCachePaths.set(uri, null)
  const headers = getCoverHeaders(coverUri) ?? undefined
  ExpoImage.prefetch(uri, { cachePolicy: "memory-disk", headers })
    .catch(() => false)
    .then(() => ExpoImage.getCachePathAsync(uri))
    .then((path) => {
      coverCachePaths.set(uri, normalizeCachePath(path))
    })
    .catch(() => {
      coverCachePaths.set(uri, null)
    })
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

export function setReaderOpenTransition(
  transition: Omit<
    ReaderOpenTransition,
    | "createdAt"
    | "coverCachePath"
    | "coverImageUri"
    | "direction"
    | "onFinished"
  >,
) {
  const coverImageUri = getCoverImageUri(transition.coverUri)
  const coverHeaders = getCoverHeaders(transition.coverUri)
  const coverCachePath = coverImageUri
    ? (coverCachePaths.get(coverImageUri) ?? null)
    : null
  const nextTransition: ReaderOpenTransition = {
    ...transition,
    direction: "open" as const,
    mode: shouldUseFadeTransition() ? "fade" : "book",
    coverCachePath,
    coverImageUri,
    coverHeaders,
    createdAt: Date.now(),
  }
  primeReaderCoverCache(transition.coverUri)
  const nativeStarted =
    nextTransition.mode === "book"
      ? startNativeBookTransition({
          direction: "open",
          bookId: nextTransition.bookId,
          frame: nextTransition.frame,
          sourceViewTag: nextTransition.sourceViewTag,
          ...getTransitionMetrics(nextTransition),
          coverCachePath: nextTransition.coverCachePath,
          coverImageUri: nextTransition.coverImageUri,
          coverHeaders: nextTransition.coverHeaders,
          title: nextTransition.title,
          durationMs: READER_BOOK_TRANSITION_MS,
        })
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
): ReaderOpenTransition | null {
  const recentTransition = recentTransitions.get(bookId)
  if (!recentTransition) return null

  const nextTransition: ReaderOpenTransition = {
    ...recentTransition,
    direction: "close",
    mode: shouldUseFadeTransition() ? "fade" : recentTransition.mode,
    createdAt: Date.now(),
    onFinished,
  }
  const nativeStarted =
    nextTransition.mode === "book"
      ? startNativeBookTransition({
          direction: "close",
          bookId: nextTransition.bookId,
          frame: nextTransition.frame,
          sourceViewTag: nextTransition.sourceViewTag,
          ...getTransitionMetrics(nextTransition),
          coverCachePath: nextTransition.coverCachePath,
          coverImageUri: nextTransition.coverImageUri,
          coverHeaders: nextTransition.coverHeaders,
          title: nextTransition.title,
          durationMs: READER_BOOK_TRANSITION_MS,
        })
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
  return getNativePresentedViewFrame()
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
