import type { BookItem } from "@/src/domain/types"
import { startNativeBookTransition } from "@my-reader/book-transition"
import { Dimensions, Platform, PixelRatio, View as RNView } from "react-native"

export const READER_BOOK_TRANSITION_MS = 780

export type ReaderOpenTransition = {
  direction: "open" | "close"
  bookId: string
  coverUri: BookItem["coverUri"]
  coverImageUri: string | null
  coverHeaders?: Record<string, string> | null
  title: string
  frame: {
    x: number
    y: number
    width: number
    height: number
  }
  screenWidth?: number
  screenHeight?: number
  createdAt: number
  nativeStarted?: boolean
  onFinished?: () => void
}

let pendingTransition: ReaderOpenTransition | null = null
let activeTransition: ReaderOpenTransition | null = null
const recentTransitions = new Map<string, ReaderOpenTransition>()
const listeners = new Set<() => void>()
let transitionRootNode: RNView | null = null

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
  }
}

export function setReaderTransitionRootNode(node: RNView | null) {
  transitionRootNode = node
}

export function measureReaderTransitionFrame(
  node: RNView,
  callback: (result: {
    frame: ReaderOpenTransition["frame"]
    screenWidth?: number
    screenHeight?: number
  }) => void,
) {
  const rootNode = transitionRootNode
  if (!rootNode) {
    node.measureInWindow((x, y, width, height) => {
      callback({ frame: { x, y, width, height }, ...getScreenMetrics() })
    })
    return
  }

  rootNode.measureInWindow((rootX, rootY, rootWidth, rootHeight) => {
    node.measureInWindow((x, y, width, height) => {
      callback({
        frame: { x: x - rootX, y: y - rootY, width, height },
        screenWidth: rootWidth,
        screenHeight: rootHeight,
      })
    })
  })
}

export function setReaderOpenTransition(
  transition: Omit<
    ReaderOpenTransition,
    "createdAt" | "coverImageUri" | "direction" | "onFinished"
  >,
) {
  const coverImageUri =
    typeof transition.coverUri === "string"
      ? transition.coverUri
      : (transition.coverUri?.uri ?? null)
  const coverHeaders =
    typeof transition.coverUri === "string"
      ? null
      : (transition.coverUri?.headers ?? null)
  const nextTransition: ReaderOpenTransition = {
    ...transition,
    direction: "open" as const,
    coverImageUri,
    coverHeaders,
    createdAt: Date.now(),
  }
  const nativeStarted = startNativeBookTransition({
    direction: "open",
    bookId: nextTransition.bookId,
    frame: nextTransition.frame,
    ...getTransitionMetrics(nextTransition),
    coverImageUri: nextTransition.coverImageUri,
    coverHeaders: nextTransition.coverHeaders,
    title: nextTransition.title,
    durationMs: READER_BOOK_TRANSITION_MS,
  })
  nextTransition.nativeStarted = nativeStarted
  if (__DEV__) {
    console.info("[ReaderBookTransition] open", {
      nativeStarted,
      platform: Platform.OS,
      pixelRatio: PixelRatio.get(),
      frame: nextTransition.frame,
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
    createdAt: Date.now(),
    onFinished,
  }
  const nativeStarted = startNativeBookTransition({
    direction: "close",
    bookId: nextTransition.bookId,
    frame: nextTransition.frame,
    ...getTransitionMetrics(nextTransition),
    coverImageUri: nextTransition.coverImageUri,
    coverHeaders: nextTransition.coverHeaders,
    title: nextTransition.title,
    durationMs: READER_BOOK_TRANSITION_MS,
  })
  nextTransition.nativeStarted = nativeStarted
  if (__DEV__) {
    console.info("[ReaderBookTransition] close", {
      nativeStarted,
      platform: Platform.OS,
      pixelRatio: PixelRatio.get(),
      frame: nextTransition.frame,
      ...getTransitionMetrics(nextTransition),
    })
  }
  activeTransition = nativeStarted ? null : nextTransition
  emitChange()
  return nextTransition
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
