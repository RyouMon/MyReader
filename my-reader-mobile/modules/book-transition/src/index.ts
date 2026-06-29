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
  format?: string | null
  frame: BookTransitionFrame
  sourceViewTag?: number | null
  screenWidth?: number
  screenHeight?: number
  rootX?: number
  rootY?: number
  coverCachePath?: string | null
  coverImageUri?: string | null
  coverHeaders?: Record<string, string> | null
  readerBackgroundColor?: string | null
  readerForegroundColor?: string | null
  title?: string | null
  durationMs?: number
}

export type BookTransitionPresentedViewFrame = {
  x: number
  y: number
  width: number
  height: number
}

type NativeBookTransitionModule = {
  startTransition(options: BookTransitionOptions): boolean
  isReduceMotionEnabled?(): boolean
  getPresentedViewOriginX?(): number
  getPresentedViewOriginY?(): number
  getPresentedViewWidth?(): number
  getPresentedViewHeight?(): number
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

export function getNativePresentedViewFrame() {
  const module = getNativeModule()
  const x = module?.getPresentedViewOriginX?.()
  const y = module?.getPresentedViewOriginY?.()
  if (x === undefined || y === undefined) return null

  return {
    x,
    y,
    width: module?.getPresentedViewWidth?.() ?? 0,
    height: module?.getPresentedViewHeight?.() ?? 0,
  } satisfies BookTransitionPresentedViewFrame
}
