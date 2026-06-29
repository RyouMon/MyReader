import { requireNativeModule } from "expo"

export type BookTransitionDirection = "open" | "close"

export type BookTransitionFrame = {
  x: number
  y: number
  width: number
  height: number
  borderRadius?: number
}

export type BookTransitionOptions = {
  direction: BookTransitionDirection
  bookId?: string | null
  frame: BookTransitionFrame
  screenWidth?: number
  screenHeight?: number
  rootX?: number
  rootY?: number
  coverCachePath?: string | null
  coverImageUri?: string | null
  coverHeaders?: Record<string, string> | null
  title?: string | null
  durationMs?: number
}

type NativeBookTransitionModule = {
  startTransition(options: BookTransitionOptions): boolean
  isReduceMotionEnabled?(): boolean
}

let nativeModule: NativeBookTransitionModule | null | undefined

function getNativeModule() {
  if (nativeModule !== undefined) return nativeModule
  try {
    nativeModule = requireNativeModule<NativeBookTransitionModule>(
      "MyReaderBookTransition",
    )
  } catch {
    nativeModule = null
  }
  return nativeModule
}

export function startNativeBookTransition(options: BookTransitionOptions) {
  return getNativeModule()?.startTransition(options) ?? false
}

export function isNativeReduceMotionEnabled() {
  return getNativeModule()?.isReduceMotionEnabled?.() ?? false
}
